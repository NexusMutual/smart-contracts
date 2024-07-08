const { abis, addresses } = require('@nexusmutual/deployments');
const { expect } = require('chai');
const { ethers, network } = require('hardhat');

const evm = require('./evm')();

const { parseEther } = ethers.utils;

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
    console.debug('claimableNxm: ', require('util').inspect(claimableNxm, { depth: null }));

    return;

    expect(claimableNxm.aggregateStakingTokens.totalActiveStake).to.equal();
    expect(claimableNxm.aggregateStakingTokens.totalExpiredStake).to.equal();
    expect(claimableNxm.aggregateStakingTokens.totalRewards).to.equal();
    expect(claimableNxm.assessmentRewards.totalPendingAmountInNXM).to.equal();
    expect(claimableNxm.assessmentRewards.withdrawableAmountInNXM).to.equal();
    expect(claimableNxm.assessmentRewards.withdrawableUntilIndex).to.equal();
    expect(claimableNxm.governanceRewards).to.equal();
    expect(claimableNxm.v1CoverNotesAmount).to.equal();

    expect(claimableNxm.legacyPooledStakingTokens.deposit).to.equal();
    expect(claimableNxm.legacyPooledStakingTokens.rewards).to.equal();
    expect(claimableNxm.legacyPooledStakingTokens.stakes).to.equal();
    expect(claimableNxm.legacyPooledStakingTokens.pendingUnstakeRequestsTotal).to.equal();
    expect(claimableNxm.legacyPooledStakingTokens.isInContractStakers).to.equal();

    claimableNxm.legacyPooledStakingTokens.contracts.forEach(contract => {
      //
    });
  });
});
