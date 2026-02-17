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
} = require('./utils');

const { deployContract, parseEther } = ethers;
const { ContractIndexes } = nexus.constants;

describe('Cover - Cover Ri', function () {
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
    this.rEth = await ethers.getContractAt('ERC20Mock', Addresses.RETH_ADDRESS);
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
    this.contractData = {};
    const coverCount = await this.cover.getCoverDataCount();
    this.contractData.coverCount = coverCount;
    this.contractData.poolAllocations = await this.cover.getPoolAllocations(coverCount);
    this.contractData.coverMetadata = await this.cover.getCoverMetadata(coverCount);
    this.contractData.coverData = await this.cover.getCoverData(coverCount);
  });

  it('Upgrade Cover contracts', async function () {
    const stakingPoolImplementation = '0xcafeade1872f14adc0a03Ec7b0088b61D76ec729';
    const cover = await deployContract('Cover', [this.registry.target, stakingPoolImplementation, this.cover]);

    const coverAddress = await cover.getAddress();
    const transactions = [
      {
        target: this.registry,
        value: 0n,
        data: this.registry.interface.encodeFunctionData('upgradeContract', [ContractIndexes.C_COVER, coverAddress]),
      },
    ];

    await executeGovernorProposal(this.governor, this.abMembers, transactions);

    const coverProxy = await ethers.getContractAt('UpgradeableProxy', addresses.Cover);
    expect(await coverProxy.implementation()).to.be.equal(coverAddress);
    this.cover = await ethers.getContractAt('Cover', addresses.Cover);
  });

  it('Compares storage of upgrade Cover contract', async function () {
    const coverCount = await this.cover.getCoverDataCount();
    const poolAllocations = await this.cover.getPoolAllocations(coverCount);
    const coverMetadata = await this.cover.getCoverMetadata(coverCount);
    const coverData = await this.cover.getCoverData(coverCount);

    expect(this.contractData.coverCount).to.be.deep.equal(coverCount);
    expect(this.contractData.poolAllocations).to.be.deep.equal(poolAllocations);
    expect(this.contractData.coverMetadata).to.be.deep.equal(coverMetadata);
    expect(this.contractData.coverData).to.be.deep.equal(coverData);
  });

  require('./basic-functionality-tests');
});
