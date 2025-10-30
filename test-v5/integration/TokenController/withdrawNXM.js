const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const { ethers } = require('hardhat');

const { withdrawNXMSetup } = require('./setup');
const { increaseTime, setNextBlockTime, mineNextBlock } = require('../utils').evm;

const ONE_DAY_SECONDS = 24 * 60 * 60;
const TRANCHE_DURATION_SECONDS = 91 * ONE_DAY_SECONDS;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('withdrawNXM', function () {
  it('should withdraw assessment stake if withdrawAssessment.stake is true', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { tk: nxm, as: assessment, tc: tokenController } = fixture.contracts;
    const { stakingPoolDeposits, stakingPoolManagerRewards, batchSize } = fixture;
    const [manager] = fixture.accounts.stakingPoolManagers;

    const balanceBefore = await nxm.balanceOf(manager.address);
    const assessmentStakeBefore = await assessment.stakeOf(manager.address);

    expect(assessmentStakeBefore.amount).to.be.equal(fixture.stakeAmount);

    // adjust time so stake is no longer locked for assessment
    const { timestamp } = await ethers.provider.getBlock('latest');
    const stakeLockupPeriod = (await assessment.getStakeLockupPeriod()).toNumber();
    await setTime(timestamp + stakeLockupPeriod);

    const withdrawAssessment = { stake: true, rewards: false };

    await tokenController
      .connect(manager)
      .withdrawNXM(withdrawAssessment, stakingPoolDeposits, stakingPoolManagerRewards, batchSize, batchSize);

    const balanceAfter = await nxm.balanceOf(manager.address);
    const assessmentStakeAfter = await assessment.stakeOf(manager.address);

    expect(balanceAfter).to.equal(balanceBefore.add(assessmentStakeBefore.amount));
    expect(assessmentStakeAfter.amount).to.be.equal(0);
  });

  it('should withdraw assessment rewards if withdrawAssessment.rewards is true', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { tk: nxm, as: assessment, tc: tokenController } = fixture.contracts;
    const { stakingPoolDeposits, stakingPoolManagerRewards, batchSize } = fixture;
    const [manager] = fixture.accounts.stakingPoolManagers;

    const balanceBefore = await nxm.balanceOf(manager.address);

    // finalize assessment to release rewards
    const withdrawAssessment = { rewards: true, stake: false };
    const { timestamp } = await ethers.provider.getBlock('latest');
    const minVotingPeriod = (await assessment.getMinVotingPeriod()).toNumber();
    const payoutCooldown = (await assessment.getPayoutCooldown()).toNumber();
    await setTime(timestamp + minVotingPeriod + payoutCooldown + 1);

    const assessmentRewardsBefore = await assessment.getRewards(manager.address);
    expect(assessmentRewardsBefore.withdrawableAmountInNXM.toString()).to.not.equal('0');

    await tokenController
      .connect(manager)
      .withdrawNXM(withdrawAssessment, stakingPoolDeposits, stakingPoolManagerRewards, batchSize, batchSize);

    const balanceAfter = await nxm.balanceOf(manager.address);
    const assessmentRewardsAfter = await assessment.getRewards(manager.address);

    expect(balanceAfter).to.equal(balanceBefore.add(assessmentRewardsBefore.withdrawableAmountInNXM));
    expect(assessmentRewardsAfter.withdrawableAmountInNXM).to.equal('0');
  });

  it('should withdraw staking pool stake and rewards if stakingPoolDeposits is not empty', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { stakingPool1, stakingViewer, tk: nxm, tc: tokenController } = fixture.contracts;
    const { stakingPoolManagerRewards, batchSize } = fixture;
    const [manager] = fixture.accounts.stakingPoolManagers;

    const balanceBefore = await nxm.balanceOf(manager.address);
    const [tokenId] = fixture.tokenIds; // StakingPool1 stake tokenId

    await increaseTime(TRANCHE_DURATION_SECONDS * 7);
    await stakingPool1.processExpirations(true);

    const [tokenBefore] = await stakingViewer.getTokens([tokenId]);
    expect(tokenBefore.expiredStake).to.equal(fixture.stakeAmount);
    expect(tokenBefore.rewards.toString()).to.be.greaterThan(ethers.utils.parseEther('0.01'));

    const withdrawAssessment = { stake: false, rewards: false };
    const stakingPoolDeposits = [{ tokenId, trancheIds: [fixture.trancheId] }]; // StakingPool1 deposits

    await tokenController
      .connect(manager)
      .withdrawNXM(withdrawAssessment, stakingPoolDeposits, stakingPoolManagerRewards, batchSize, batchSize);

    const balanceAfter = await nxm.balanceOf(manager.address);
    const [tokenAfter] = await stakingViewer.getTokens([tokenId]);

    expect(balanceAfter).to.equal(balanceBefore.add(tokenBefore.expiredStake).add(tokenBefore.rewards));
    expect(tokenAfter.expiredStake.toString()).to.equal('0');
  });

  it('should withdraw manager rewards if stakingPoolManagerRewards is not empty', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { stakingViewer, stakingPool1, tk: nxm, tc: tokenController } = fixture.contracts;
    const { stakingPoolDeposits, batchSize } = fixture;
    const [manager] = fixture.accounts.stakingPoolManagers;

    const balanceBefore = await nxm.balanceOf(manager.address);

    await increaseTime(TRANCHE_DURATION_SECONDS * 7);
    await stakingPool1.processExpirations(true);

    const withdrawAssessment = { stake: false, rewards: false };
    const managerRewardsBefore = await stakingViewer.getManagerTotalRewards(manager.address);
    const stakingPoolManagerRewards = [
      { poolId: 1, trancheIds: [fixture.trancheId] },
      { poolId: 2, trancheIds: [fixture.trancheId] },
      { poolId: 3, trancheIds: [fixture.trancheId] },
    ];

    await tokenController
      .connect(manager)
      .withdrawNXM(withdrawAssessment, stakingPoolDeposits, stakingPoolManagerRewards, batchSize, batchSize);

    const balanceAfter = await nxm.balanceOf(manager.address);
    const managerRewardsAfter = await stakingViewer.getManagerTotalRewards(manager.address);

    expect(balanceAfter).to.equal(balanceBefore.add(managerRewardsBefore));
    expect(managerRewardsAfter.toString()).to.equal('0');
  });

  it('should withdraw all claimable NXM', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { as: assessment, stakingViewer, stakingPool1, tk: nxm, tc: tokenController } = fixture.contracts;
    const { batchSize } = fixture;
    const [manager] = fixture.accounts.stakingPoolManagers;
    const [tokenId] = fixture.tokenIds; // StakingPool1 stake tokenId

    await increaseTime(TRANCHE_DURATION_SECONDS * 7);
    await stakingPool1.processExpirations(true);

    const balanceBefore = await nxm.balanceOf(manager.address);
    const assessmentStakeBefore = await assessment.stakeOf(manager.address);
    const assessmentRewardsBefore = await assessment.getRewards(manager.address);
    const [tokenBefore] = await stakingViewer.getTokens([tokenId]);
    const managerRewardsBefore = await stakingViewer.getManagerTotalRewards(manager.address);

    const withdrawAssessment = { stake: true, rewards: true };
    const stakingPoolDeposits = [{ tokenId, trancheIds: [fixture.trancheId] }]; // StakingPool1 deposits
    const stakingPoolManagerRewards = [
      { poolId: 1, trancheIds: [fixture.trancheId] },
      { poolId: 2, trancheIds: [fixture.trancheId] },
      { poolId: 3, trancheIds: [fixture.trancheId] },
    ];

    await tokenController
      .connect(manager)
      .withdrawNXM(withdrawAssessment, stakingPoolDeposits, stakingPoolManagerRewards, batchSize, batchSize);

    const balanceAfter = await nxm.balanceOf(manager.address);
    const assessmentRewardsAfter = await assessment.getRewards(manager.address);
    const assessmentStakeAfter = await assessment.stakeOf(manager.address);
    const [tokenAfter] = await stakingViewer.getTokens([tokenId]);
    const managerRewardsAfter = await stakingViewer.getManagerTotalRewards(manager.address);

    expect(balanceAfter).to.equal(
      balanceBefore
        .add(assessmentStakeBefore.amount) // assessment stake
        .add(assessmentRewardsBefore.withdrawableAmountInNXM) // assessment rewards
        .add(tokenBefore.expiredStake) // staking pool stake
        .add(tokenBefore.rewards) // staking pool rewards
        .add(managerRewardsBefore), // staking pool manager rewards
    );
    expect(assessmentStakeAfter.amount.toString()).to.equal('0');
    expect(assessmentRewardsAfter.withdrawableAmountInNXM.toString()).to.equal('0');
    expect(tokenAfter.expiredStake.toString()).to.equal('0');
    expect(tokenAfter.rewards.toString()).to.equal('0');
    expect(managerRewardsAfter.toString()).to.equal('0');
  });
});
