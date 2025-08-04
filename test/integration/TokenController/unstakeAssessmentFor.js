const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const { ethers } = require('hardhat');

const { withdrawNXMSetup } = require('./setup');
const { setNextBlockTime, mineNextBlock } = require('../utils').evm;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('unstakeAssessmentFor', function () {
  it('should unstake all assessment stake for the specified member', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { tk: nxm, as: assessment, tc: tokenController } = fixture.contracts;
    const [manager] = fixture.accounts.stakingPoolManagers;

    const balanceBefore = await nxm.balanceOf(manager.address);
    const assessmentStakeBefore = await assessment.stakeOf(manager.address);

    expect(assessmentStakeBefore.amount).to.be.greaterThan(0);

    // adjust time so stake is no longer locked for assessment
    const { timestamp } = await ethers.provider.getBlock('latest');
    const stakeLockupPeriod = (await assessment.getStakeLockupPeriod()).toNumber();
    await setTime(timestamp + stakeLockupPeriod + 1);

    // unstake assessment
    const [caller] = fixture.accounts.members;
    await tokenController.connect(caller).unstakeAssessmentFor(manager.address);

    const balanceAfter = await nxm.balanceOf(manager.address);
    const assessmentStakeAfter = await assessment.stakeOf(manager.address);

    expect(balanceAfter).to.equal(balanceBefore.add(assessmentStakeBefore.amount));
    expect(assessmentStakeAfter.amount).to.equal(0);
  });

  it('should respect stake lockup period', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { as: assessment, tc: tokenController } = fixture.contracts;
    const [manager] = fixture.accounts.stakingPoolManagers;
    const [caller] = fixture.accounts.members;

    // try to unstake immediately (should fail due to lockup)
    const unstakeAssessmentFor = tokenController.connect(caller).unstakeAssessmentFor(manager.address);
    await expect(unstakeAssessmentFor).to.be.revertedWithCustomError(assessment, 'StakeLockedForAssessment');
  });

  it('should work even if member has no assessment stake', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { tk: nxm, as: assessment, tc: tokenController } = fixture.contracts;
    const [memberWithoutStake] = fixture.accounts.members;
    const [caller] = fixture.accounts.members;

    const balanceBefore = await nxm.balanceOf(memberWithoutStake.address);
    const assessmentStakeBefore = await assessment.stakeOf(memberWithoutStake.address);

    expect(assessmentStakeBefore.amount).to.equal(0);

    // should not revert even with zero stake
    await tokenController.connect(caller).unstakeAssessmentFor(memberWithoutStake.address);

    const balanceAfter = await nxm.balanceOf(memberWithoutStake.address);
    const assessmentStakeAfter = await assessment.stakeOf(memberWithoutStake.address);

    expect(balanceAfter).to.equal(balanceBefore);
    expect(assessmentStakeAfter.amount).to.equal(0);
  });

  it('should allow anyone to help recover tokens', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { tk: nxm, as: assessment, tc: tokenController } = fixture.contracts;
    const [manager] = fixture.accounts.stakingPoolManagers;
    const [helper] = fixture.accounts.members;

    // Get stake amount before any operations
    const assessmentStakeBefore = await assessment.stakeOf(manager.address);
    const stakeAmount = assessmentStakeBefore.amount;

    const balanceBefore = await nxm.balanceOf(manager.address);

    // wait for assessment lockup to expire
    const { timestamp } = await ethers.provider.getBlock('latest');
    const stakeLockupPeriod = (await assessment.getStakeLockupPeriod()).toNumber();
    await setTime(timestamp + stakeLockupPeriod + 1);

    // A different user can help recover tokens for the manager
    await tokenController.connect(helper).unstakeAssessmentFor(manager.address);

    const balanceAfter = await nxm.balanceOf(manager.address);
    const assessmentStakeAfter = await assessment.stakeOf(manager.address);

    expect(balanceAfter).to.equal(balanceBefore.add(stakeAmount));
    expect(assessmentStakeAfter.amount).to.equal(0);
  });
});
