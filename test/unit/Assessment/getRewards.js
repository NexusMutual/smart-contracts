const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setTime, daysToSeconds } = require('./helpers');

const { parseEther } = ethers.utils;

describe('getRewards', function () {
  it("returns the pending rewards pro-rated to the user's stake", async function () {
    const { assessment, claims } = this.contracts;
    const [user1, user2] = this.accounts.members;
    const { minVotingPeriodDays, payoutCooldownDays } = await assessment.config();

    await assessment.connect(user1).stake(parseEther('10'));
    await assessment.connect(user2).stake(parseEther('90'));
    await claims.submitClaim(0, parseEther('10'), '');
    await claims.submitClaim(0, parseEther('100'), '');
    await claims.submitClaim(0, parseEther('1000'), '');

    await assessment.connect(user1).castVote(0, true);
    await assessment.connect(user2).castVote(0, true);
    await assessment.connect(user1).castVote(1, true);
    await assessment.connect(user2).castVote(1, true);
    await assessment.connect(user1).castVote(2, true);
    await assessment.connect(user2).castVote(2, true);

    let expectedUser1Reward = ethers.constants.Zero;
    let expectedUser2Reward = ethers.constants.Zero;
    {
      const { totalReward } = await assessment.assessments(0);
      expectedUser1Reward = expectedUser1Reward.add(totalReward.mul(1).div(10));
      expectedUser2Reward = expectedUser2Reward.add(totalReward.mul(9).div(10));
    }
    {
      const { totalReward } = await assessment.assessments(1);
      expectedUser1Reward = expectedUser1Reward.add(totalReward.mul(1).div(10));
      expectedUser2Reward = expectedUser2Reward.add(totalReward.mul(9).div(10));
    }
    {
      const { totalReward } = await assessment.assessments(2);
      expectedUser1Reward = expectedUser1Reward.add(totalReward.mul(1).div(10));
      expectedUser2Reward = expectedUser2Reward.add(totalReward.mul(9).div(10));
    }

    {
      const { totalPendingAmount: user1Total } = await assessment.getRewards(user1.address);
      const { totalPendingAmount: user2Total } = await assessment.getRewards(user2.address);
      expect(user1Total).to.be.equal(expectedUser1Reward);
      expect(user2Total).to.be.equal(expectedUser2Reward);
    }

    const { end } = await assessment.getPoll(2);
    await setTime(end + daysToSeconds(minVotingPeriodDays + payoutCooldownDays));
    await assessment.withdrawRewards(user1.address, 1);

    {
      const { totalPendingAmount: user1Total } = await assessment.getRewards(user1.address);
      const { totalPendingAmount: user2Total } = await assessment.getRewards(user2.address);
      const { totalReward } = await assessment.assessments(0);
      expect(user1Total).to.be.equal(expectedUser1Reward.sub(totalReward.mul(1).div(10)));
      expect(user2Total).to.be.equal(expectedUser2Reward);
    }

    await assessment.withdrawRewards(user2.address, 1);

    {
      const { totalPendingAmount: user1Total } = await assessment.getRewards(user1.address);
      const { totalPendingAmount: user2Total } = await assessment.getRewards(user2.address);
      const { totalReward } = await assessment.assessments(0);
      expect(user1Total).to.be.equal(expectedUser1Reward.sub(totalReward.mul(1).div(10)));
      expect(user2Total).to.be.equal(expectedUser2Reward.sub(totalReward.mul(9).div(10)));
    }

    // Withdraw everything
    await assessment.withdrawRewards(user2.address, 0);
    await assessment.withdrawRewards(user1.address, 0);

    {
      const { totalPendingAmount: user1Total } = await assessment.getRewards(user1.address);
      const { totalPendingAmount: user2Total } = await assessment.getRewards(user2.address);
      expect(user1Total).to.be.equal(0);
      expect(user2Total).to.be.equal(0);
    }
  });

  it('returns the withdrawable reward', async function () {
    const { assessment, claims } = this.contracts;
    const [user] = this.accounts.members;
    const { minVotingPeriodDays, payoutCooldownDays } = await assessment.config();

    await assessment.connect(user).stake(parseEther('10'));
    await claims.submitClaim(0, parseEther('10'), '');
    await claims.submitClaim(0, parseEther('100'), '');

    await assessment.connect(user).castVote(0, true);
    await assessment.connect(user).castVote(1, true);

    let expectedReward = ethers.constants.Zero;

    {
      const { totalReward } = await assessment.assessments(0);
      expectedReward = expectedReward.add(totalReward);
    }

    {
      const { totalReward } = await assessment.assessments(1);
      expectedReward = expectedReward.add(totalReward);
    }

    {
      const { withdrawableAmount } = await assessment.getRewards(user.address);
      expect(withdrawableAmount).to.be.equal(0);
    }

    {
      const { end } = await assessment.getPoll(1);
      await setTime(end + daysToSeconds(minVotingPeriodDays + payoutCooldownDays));
      const { withdrawableAmount } = await assessment.getRewards(user.address);
      expect(withdrawableAmount).to.be.equal(expectedReward);
    }

    {
      await assessment.withdrawRewards(user.address, 1);
      const { totalReward } = await assessment.assessments(0);
      expectedReward = expectedReward.sub(totalReward);
      const { withdrawableAmount } = await assessment.getRewards(user.address);
      expect(withdrawableAmount).to.be.equal(expectedReward);
    }

    {
      await assessment.withdrawRewards(user.address, 2);
      const { withdrawableAmount } = await assessment.getRewards(user.address);
      expect(withdrawableAmount).to.be.equal(0);
    }

    {
      await claims.submitClaim(0, parseEther('1000'), '');
      await assessment.connect(user).castVote(2, true);
      const { withdrawableAmount } = await assessment.getRewards(user.address);
      expect(withdrawableAmount).to.be.equal(0);
    }

    {
      const { end } = await assessment.getPoll(2);
      await setTime(end + daysToSeconds(minVotingPeriodDays + payoutCooldownDays));
      const { totalReward } = await assessment.assessments(2);
      const { withdrawableAmount } = await assessment.getRewards(user.address);
      expect(withdrawableAmount).to.be.equal(totalReward);
    }
  });

  it("returns the index of the first vote on an assessment that hasn't ended or is still in cooldown period", async function () {
    const { assessment, claims } = this.contracts;
    const [user] = this.accounts.members;
    const { minVotingPeriodDays, payoutCooldownDays } = await assessment.config();

    await assessment.connect(user).stake(parseEther('10'));
    await claims.submitClaim(0, parseEther('10'), '');
    await claims.submitClaim(0, parseEther('100'), '');

    await assessment.connect(user).castVote(0, true);
    await assessment.connect(user).castVote(1, true);

    {
      const { withdrawableUntilIndex } = await assessment.getRewards(user.address);
      expect(withdrawableUntilIndex).to.be.equal(0);
    }

    {
      const { end } = await assessment.getPoll(1);
      await setTime(end + daysToSeconds(minVotingPeriodDays + payoutCooldownDays));
      const { withdrawableUntilIndex } = await assessment.getRewards(user.address);
      expect(withdrawableUntilIndex).to.be.equal(2);
    }

    {
      await claims.submitClaim(0, parseEther('1000'), '');
      await assessment.connect(user).castVote(2, true);
      const { withdrawableUntilIndex } = await assessment.getRewards(user.address);
      expect(withdrawableUntilIndex).to.be.equal(2);
    }
    {
      const { end } = await assessment.getPoll(2);
      await setTime(end + daysToSeconds(minVotingPeriodDays + payoutCooldownDays));
      const { withdrawableUntilIndex } = await assessment.getRewards(user.address);
      expect(withdrawableUntilIndex).to.be.equal(3);
    }
  });
});
