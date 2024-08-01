const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const { ethers } = require('hardhat');

const { withdrawNXMSetup } = require('./setup');
const { increaseTime, setNextBlockTime, mineNextBlock } = require('../utils').evm;

const { parseEther } = ethers.utils;

const ONE_DAY_SECONDS = 24 * 60 * 60;
const TRANCHE_DURATION_SECONDS = 91 * ONE_DAY_SECONDS;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

function setWithdrawNXMOptions(withdrawalOptions) {
  const allFalse = {
    assessmentStake: false,
    stakingPoolStake: false,
    assessmentRewards: false,
    stakingPoolRewards: false,
    governanceRewards: false,
    v1CoverNotes: false,
    v1PooledStakingStake: false,
  };

  if (withdrawalOptions.all === false) {
    return allFalse;
  }

  // set individual options
  return {
    ...allFalse,
    ...withdrawalOptions,
  };
}

describe('withdrawNXM', function () {
  it('should withdraw assessment stake if withdrawNXMOptions.assessmentStake is true', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { tk: nxm, as: assessment, tc: tokenController } = fixture.contracts;
    const { stakingPoolDeposit, v1CoverNotes, batchSize } = fixture.params;
    const [manager] = fixture.accounts.stakingPoolManagers;

    const balanceBefore = await nxm.balanceOf(manager.address);
    const assessmentStakeBefore = await assessment.stakeOf(manager.address);

    expect(assessmentStakeBefore.amount).to.be.equal(fixture.stakeAmount);

    // adjust time to stake is no longer locked for assessment
    const { timestamp } = await ethers.provider.getBlock('latest');
    const { stakeLockupPeriodInDays } = await assessment.config();
    await setTime(timestamp + stakeLockupPeriodInDays * ONE_DAY_SECONDS);

    // set only withdrawNXMOptions.assessmentStake to true
    const withdrawNXMOptions = setWithdrawNXMOptions({ assessmentStake: true });
    await tokenController.connect(manager).withdrawNXM(stakingPoolDeposit, v1CoverNotes, batchSize, withdrawNXMOptions);

    const balanceAfter = await nxm.balanceOf(manager.address);
    const assessmentAfter = await assessment.stakeOf(manager.address);

    expect(balanceAfter).to.equal(balanceBefore.add(fixture.stakeAmount));
    expect(assessmentAfter.amount).to.be.equal(0);
  });

  it('should withdraw assessment rewards if withdrawNXMOptions.assessmentRewards is true', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { tk: nxm, as: assessment, tc: tokenController } = fixture.contracts;
    const { stakingPoolDeposit, v1CoverNotes, batchSize } = fixture.params;
    const [manager] = fixture.accounts.stakingPoolManagers;

    const balanceBefore = await nxm.balanceOf(manager.address);

    // finalize assessment to release rewards
    const { timestamp } = await ethers.provider.getBlock('latest');
    const { minVotingPeriodInDays, payoutCooldownInDays } = await assessment.config();
    await setTime(timestamp + (minVotingPeriodInDays + payoutCooldownInDays) * ONE_DAY_SECONDS + 1);

    const assessmentRewardsBefore = await assessment.getRewards(manager.address);
    console.log('assessmentRewardsBefore: ', assessmentRewardsBefore);
    expect(assessmentRewardsBefore.withdrawableAmountInNXM.toString()).to.not.equal('0');

    // set only withdrawNXMOptions.assessmentStake to true
    const withdrawNXMOptions = setWithdrawNXMOptions({ assessmentRewards: true });
    await tokenController.connect(manager).withdrawNXM(stakingPoolDeposit, v1CoverNotes, batchSize, withdrawNXMOptions);
    console.log('witharw success');

    const balanceAfter = await nxm.balanceOf(manager.address);
    const assessmentRewardsAfter = await assessment.getRewards(manager.address);
    console.log('balanceAfter: ', balanceAfter);
    console.log('assessmentAfter: ', assessmentRewardsAfter);

    expect(balanceAfter).to.equal(balanceBefore.add(assessmentRewardsBefore.withdrawableAmountInNXM));
    expect(assessmentRewardsAfter.withdrawableAmountInNXM).to.equal('0');
  });

  // TODO: stakingPool stake
  // TODO: stakingPool rewards
  // TODO: stakingPool manager rewards
});
