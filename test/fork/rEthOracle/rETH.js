const { ethers, network, nexus, tracer } = require('hardhat');
const { expect } = require('chai');
const { abis, addresses } = require('@nexusmutual/deployments');
const { setBalance, takeSnapshot, time } = require('@nomicfoundation/hardhat-network-helpers');
const { revertToSnapshot, Addresses, createSafeExecutor, getFundedSigner } = require('../utils');
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

    const [proposer] = this.abMembers;
    await this.governor.connect(proposer).propose(transactions, 'Upgrade Pool contracts and change rETH oracle');
    const proposalId = await this.governor.proposalCount();

    for (const voter of this.abMembers.slice(0, 3)) {
      await this.governor.connect(voter).vote(proposalId, nexus.constants.Choice.For);
    }

    const VOTING_PERIOD = await this.governor.VOTING_PERIOD();
    const TIMELOCK_PERIOD = await this.governor.TIMELOCK_PERIOD();
    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD);

    // Snapshot pool state before upgrade
    const oldAssets = await this.pool.getAssets();
    const oldMcr = await this.pool.getMCR();
    const oldRate = await this.pool.getEthForAsset(this.rEth.target, parseEther('1'));
    const oldEthPoolValue = await this.pool.getPoolValueInEth();
    const rEthBalance = await this.rEth.balanceOf(this.pool.target);
    const oldRethEthValue = await this.pool.getEthForAsset(this.rEth.target, rEthBalance);

    // Execute the governance proposal (applies upgrade + oracle change)
    await this.governor.connect(proposer).execute(proposalId);
    this.pool = await ethers.getContractAt('Pool', this.pool.target);

    // Fetch new values after upgrade
    const newRate = await this.pool.getEthForAsset(this.rEth.target, parseEther('1'));
    const newRethEthValue = await this.pool.getEthForAsset(this.rEth.target, rEthBalance);
    const newEthPoolValue = await this.pool.getPoolValueInEth();
    const newMcrRatio = await this.pool.getMCRRatio();

    // Assets array should be unchanged
    expect(await this.pool.getAssets()).to.deep.equal(oldAssets);

    // Oracle should point to the new aggregator
    const rEthOracle = await this.pool.oracles(this.rEth.target);
    expect(rEthOracle.aggregator).to.equal(this.rETHAggregator.target);

    // MCR should be unchanged
    expect(await this.pool.getMCR()).to.equal(oldMcr);

    // New rate should be within 0.1% of old rate
    const rateDiff = oldRate > newRate ? oldRate - newRate : newRate - oldRate;
    expect(rateDiff * 10000n).to.be.lte(
      oldRate * 10n,
      `Rate divergence exceeds 0.1%: old=${formatEther(oldRate)}, new=${formatEther(newRate)}`,
    );

    // ethPoolValue diff should match the rETH valuation change
    const expectedEthPoolValue = oldEthPoolValue - oldRethEthValue + newRethEthValue;
    expect(newEthPoolValue).to.equal(expectedEthPoolValue);

    // mcrRatio should reflect the new pool value
    const expectedMcrRatio = (expectedEthPoolValue * 10n ** 4n) / oldMcr;
    expect(newMcrRatio).to.equal(expectedMcrRatio);
  });

  require('../basic-functionality-tests');
});
