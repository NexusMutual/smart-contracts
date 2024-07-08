const { abis, addresses } = require('@nexusmutual/deployments');
const { expect } = require('chai');
const { ethers, network } = require('hardhat');

const evm = require('./evm')();

const { parseEther } = ethers.utils;
const { BigNumber } = ethers;

describe('NexusViewer', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);

    // Get or revert snapshot if network is tenderly
    if (network.name === 'tenderly') {
      const { TENDERLY_SNAPSHOT_ID } = process.env;
      if (TENDERLY_SNAPSHOT_ID) {
        await evm.revert(TENDERLY_SNAPSHOT_ID);
        console.info(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
      } else {
        console.info('Snapshot ID: ', await evm.snapshot());
      }
    }
    const [deployer] = await ethers.getSigners();
    await evm.setBalance(deployer.address, parseEther('1000'));
  });

  it('load contracts', async function () {
    this.master = await ethers.getContractAt(abis.NXMaster, addresses.NXMaster);
    this.nxm = await ethers.getContractAt(abis.NXMToken, addresses.NXMToken);
    this.stakingViewer = await ethers.getContractAt(abis.StakingViewer, addresses.StakingViewer);
    this.assessmentViewer = await ethers.deployContract('AssessmentViewer', [this.master.address, this.nxm.address]);
  });

  it('deploy NexusViewer', async function () {
    this.nexusViewer = await ethers.deployContract('NexusViewer', [
      this.master.address,
      this.stakingViewer.address,
      this.assessmentViewer.address,
    ]);
  });

  it('getClaimableNxm should return manager all claimable NXM data', async function () {
    const member = '0x87B2a7559d85f4653f13E6546A14189cd5455d45';
    const tokenIds = [2, 31, 38, 86];
    const claimableNxm = await this.nexusViewer.getClaimableNxm(member, tokenIds);

    expect(claimableNxm.governanceRewards).to.be.instanceOf(BigNumber);
    expect(claimableNxm.aggregateStakingTokens.totalActiveStake).to.be.instanceOf(BigNumber);
    expect(claimableNxm.aggregateStakingTokens.totalExpiredStake).to.be.instanceOf(BigNumber);
    expect(claimableNxm.aggregateStakingTokens.totalRewards).to.be.instanceOf(BigNumber);
    expect(claimableNxm.assessmentRewards.totalPendingAmountInNXM).to.be.instanceOf(BigNumber);
    expect(claimableNxm.assessmentRewards.withdrawableAmountInNXM).to.be.instanceOf(BigNumber);
    expect(claimableNxm.assessmentRewards.withdrawableUntilIndex).to.be.instanceOf(BigNumber);
    expect(claimableNxm.legacyPooledStake.deposit).to.be.instanceOf(BigNumber);
    expect(claimableNxm.legacyPooledStake.reward).to.be.instanceOf(BigNumber);
    expect(claimableNxm.v1CoverNotesAmount).to.be.instanceOf(BigNumber);
  });
});
