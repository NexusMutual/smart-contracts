const { ethers, network, nexus, tracer } = require('hardhat');
const { expect } = require('chai');
const { abis, addresses } = require('@nexusmutual/deployments');
const { setBalance, takeSnapshot } = require('@nomicfoundation/hardhat-network-helpers');
const {
  revertToSnapshot,
  Addresses,
  createSafeExecutor,
  getFundedSigner,
  executeGovernorProposal,
} = require('../utils');
const rETHAbi = require('./rETHAbi.json');

const { deployContract, parseEther, formatEther } = ethers;
const { ContractIndexes } = nexus.constants;

describe('Pool - rETH oracle change', function () {
  before(async function () {
    // Get or revert snapshot if network is tenderly
    if (network.name === 'tenderly') {
      const { TENDERLY_SNAPSHOT_ID } = process.env;
      if (TENDERLY_SNAPSHOT_ID) {
        await revertToSnapshot(TENDERLY_SNAPSHOT_ID);
        console.info(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
      } else {
        const { snapshotId } = await takeSnapshot();
        console.info('Snapshot ID: ', snapshotId);
      }
    }

    const [deployer] = await ethers.getSigners();
    await setBalance(deployer.address, parseEther('1000'));
  });

  it('load contracts', async function () {
    this.registry = await ethers.getContractAt(abis.Registry, addresses.Registry);
    this.cover = await ethers.getContractAt(abis.Cover, addresses.Cover);
    this.nxm = await ethers.getContractAt(abis.NXMToken, addresses.NXMToken);
    this.master = await ethers.getContractAt(abis.NXMaster, addresses.NXMaster);
    this.coverNFT = await ethers.getContractAt(abis.CoverNFT, addresses.CoverNFT);
    this.coverProducts = await ethers.getContractAt(abis.CoverProducts, addresses.CoverProducts);
    this.pool = await ethers.getContractAt(abis.Pool, addresses.Pool);
    this.safeTracker = await ethers.getContractAt(abis.SafeTracker, addresses.SafeTracker);
    this.assessments = await ethers.getContractAt(abis.Assessments, addresses.Assessments);
    this.claims = await ethers.getContractAt(abis.Claims, addresses.Claims);
    this.stakingNFT = await ethers.getContractAt(abis.StakingNFT, addresses.StakingNFT);
    this.stakingProducts = await ethers.getContractAt(abis.StakingProducts, addresses.StakingProducts);
    this.swapOperator = await ethers.getContractAt(abis.SwapOperator, addresses.SwapOperator);
    this.tokenController = await ethers.getContractAt(abis.TokenController, addresses.TokenController);
    this.individualClaims = await ethers.getContractAt(abis.Claims, addresses.Claims);
    this.stakingPoolFactory = await ethers.getContractAt(abis.StakingPoolFactory, addresses.StakingPoolFactory);
    this.ramm = await ethers.getContractAt(abis.Ramm, addresses.Ramm);
    this.limitOrders = await ethers.getContractAt(abis.LimitOrders, addresses.LimitOrders);
    this.governor = await ethers.getContractAt(abis.Governor, addresses.Governor);
    this.assessmentsViewer = await ethers.getContractAt(abis.Assessments, addresses.Assessments);
    this.coverViewer = await ethers.getContractAt(abis.CoverViewer, addresses.CoverViewer);
    this.stakingViewer = await ethers.getContractAt(abis.StakingViewer, addresses.StakingViewer);

    // External contracts
    this.coverBroker = await ethers.getContractAt(abis.CoverBroker, addresses.CoverBroker);

    // Token Mocks
    this.weth = await ethers.getContractAt('WETH9', Addresses.WETH_ADDRESS);
    this.cbBTC = await ethers.getContractAt('ERC20Mock', Addresses.CBBTC_ADDRESS);
    this.dai = await ethers.getContractAt('ERC20Mock', Addresses.DAI_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Addresses.USDC_ADDRESS);
    this.rEth = await ethers.getContractAt(rETHAbi, Addresses.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Addresses.STETH_ADDRESS);
    this.awEth = await ethers.getContractAt('ERC20Mock', Addresses.AWETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', Addresses.ENZYMEV4_VAULT_PROXY_ADDRESS);

    // safe executor
    this.executeSafeTransaction = await createSafeExecutor(Addresses.ADVISORY_BOARD_MULTISIG);

    Object.entries(addresses).forEach(([k, v]) => (tracer.nameTags[v] = `#[${k}]`));
  });

  it('Impersonate AB members', async function () {
    const boardSeats = await this.registry.ADVISORY_BOARD_SEATS();
    this.abMembers = [];
    for (let i = 1; i <= boardSeats; i++) {
      const address = await this.registry.getMemberAddressBySeat(i);
      this.abMembers.push(await getFundedSigner(address));
    }
  });

  it('Collect storage data before upgrade', async function () {
    this.poolData = {};
    this.poolData.assets = await this.pool.getAssets();
    this.poolData.mcr = await this.pool.getMCR();
    this.poolData.mcrRatio = await this.pool.getMCRRatio();
    this.poolData.rate = await this.pool.getEthForAsset(this.rEth.target, parseEther('1'));
  });

  it('Upgrade Pool contracts and change rETH oracle', async function () {
    this.rETHAggregator = await deployContract('AggregatorRETH', [this.rEth]);
    const pool = await deployContract('Pool', [this.registry.target]);

    const transactions = [
      {
        target: this.registry,
        value: 0n,
        data: this.registry.interface.encodeFunctionData('upgradeContract', [ContractIndexes.C_POOL, pool.target]),
      },
      {
        target: this.pool,
        value: 0n,
        data: pool.interface.encodeFunctionData('setAssetOracle', [
          this.rEth.target,
          this.rETHAggregator.target,
          nexus.constants.AggregatorType.ETH,
        ]),
      },
    ];

    await executeGovernorProposal(this.governor, this.abMembers, transactions);

    this.pool = await ethers.getContractAt('Pool', this.pool.target);

    const assets = await this.pool.getAssets();
    const mcr = await this.pool.getMCR();
    const mcrRatio = await this.pool.getMCRRatio();
    const rEthOracle = await this.pool.oracles(this.rEth.target);
    const rate = await this.pool.getEthForAsset(this.rEth.target, parseEther('1'));

    expect(this.poolData.assets).to.be.deep.equal(assets);
    expect(rEthOracle.aggregator).to.be.deep.equal(this.rETHAggregator.target);
    expect(this.poolData.mcr).to.be.equal(mcr);
    expect(this.poolData.mcrRatio).to.be.closeTo(mcrRatio, 1);

    // Verify the new oracle rate is within 0.1% of the old rate
    const oldRate = this.poolData.rate;
    const newRate = rate;
    const absDiff = oldRate > newRate ? oldRate - newRate : newRate - oldRate;
    const maxDivergenceBps = 10n; // 0.1%
    const basisPrecision = 10000n;
    expect(absDiff * basisPrecision).to.be.lte(
      oldRate * maxDivergenceBps,
      `Rate divergence exceeds 0.1%: old=${formatEther(oldRate)}, new=${formatEther(newRate)}`,
    );

    console.log('===================OLD VALUES=====================');
    console.log('mcr', formatEther(this.poolData.mcr));
    console.log('mcrRatio', formatEther(this.poolData.mcrRatio));
    console.log('rate', formatEther(this.poolData.rate));
    console.log('===================NEW VALUES=====================');
    console.log('mcr', formatEther(mcr));
    console.log('mcrRatio', formatEther(mcrRatio));
    console.log('rate', formatEther(await this.rEth.getExchangeRate()));
  });

  require('../basic-functionality-tests');
});
