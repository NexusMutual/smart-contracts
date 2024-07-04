const { abis, addresses } = require('@nexusmutual/deployments');
const { expect } = require('chai');
const { ethers, network } = require('hardhat');

const evm = require('./evm')();

const { parseEther } = ethers.utils;
const { BigNumber } = ethers;

describe('AssessmentViewer', function () {
  const member = '0x87B2a7559d85f4653f13E6546A14189cd5455d45';

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
    this.assessment = await ethers.getContractAt(abis.Assessment, addresses.Assessment);
    this.nxm = await ethers.getContractAt('NXMToken', addresses.NXMToken);
    this.individualClaims = await ethers.getContractAt(abis.IndividualClaims, addresses.IndividualClaims);
  });

  it('deploy AssessmentViewer', async function () {
    this.assessmentViewer = await ethers.deployContract('AssessmentViewer', [this.master.address, this.nxm.address]);
  });

  it('getManagerPoolsAndRewards should return manager pools and rewards', async function () {
    const assessmentRewards = await this.assessmentViewer.getRewards(member);
    expect(assessmentRewards.totalPendingAmountInNXM).to.be.instanceOf(BigNumber);
    expect(assessmentRewards.withdrawableAmountInNXM).to.be.instanceOf(BigNumber);
    expect(assessmentRewards.withdrawableUntilIndex).to.be.instanceOf(BigNumber);
  });

  it('isStakeLocked should return false if the member has no stake locked for voting', async function () {
    const stakeLocked = await this.assessmentViewer.isStakeLocked(ethers.constants.AddressZero);
    expect(stakeLocked).to.equal(false);
  });
});
