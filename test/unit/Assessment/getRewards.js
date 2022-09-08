const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setTime } = require('./helpers');

const { parseEther } = ethers.utils;
const daysToSeconds = days => days * 24 * 60 * 60;

describe('getRewards', function () {
  it("returns the pending rewards pro-rated to the user's stake", async function () {
    const { assessment, individualClaims } = this.contracts;
    const [user1, user2] = this.accounts.members;
    const { minVotingPeriodInDays, payoutCooldownInDays } = await assessment.config();

    await assessment.connect(user1).stake(parseEther('10'));
    await assessment.connect(user2).stake(parseEther('90'));
    await individualClaims.submitClaim(0, 0, parseEther('10'), '');
    await individualClaims.submitClaim(1, 0, parseEther('100'), '');
    await individualClaims.submitClaim(2, 0, parseEther('1000'), '');

    await assessment.connect(user1).castVotes([0], [true], 0);
    await assessment.connect(user2).castVotes([0], [true], 0);
    await assessment.connect(user1).castVotes([1], [true], 0);
    await assessment.connect(user2).castVotes([1], [true], 0);
    await assessment.connect(user1).castVotes([2], [true], 0);
    await assessment.connect(user2).castVotes([2], [true], 0);

    let expectedUser1Reward = ethers.constants.Zero;
    let expectedUser2Reward = ethers.constants.Zero;
    {
      const { totalRewardInNXM } = await assessment.assessments(0);
      expectedUser1Reward = expectedUser1Reward.add(totalRewardInNXM.mul(1).div(10));
      expectedUser2Reward = expectedUser2Reward.add(totalRewardInNXM.mul(9).div(10));
    }
    {
      const { totalRewardInNXM } = await assessment.assessments(1);
      expectedUser1Reward = expectedUser1Reward.add(totalRewardInNXM.mul(1).div(10));
      expectedUser2Reward = expectedUser2Reward.add(totalRewardInNXM.mul(9).div(10));
    }
    {
      const { totalRewardInNXM } = await assessment.assessments(2);
      expectedUser1Reward = expectedUser1Reward.add(totalRewardInNXM.mul(1).div(10));
      expectedUser2Reward = expectedUser2Reward.add(totalRewardInNXM.mul(9).div(10));
    }

    {
      const { totalPendingAmountInNXM: user1Total } = await assessment.getRewards(user1.address);
      const { totalPendingAmountInNXM: user2Total } = await assessment.getRewards(user2.address);
      expect(user1Total).to.be.equal(expectedUser1Reward);
      expect(user2Total).to.be.equal(expectedUser2Reward);
    }

    const { end } = await assessment.getPoll(2);
    await setTime(end + daysToSeconds(minVotingPeriodInDays + payoutCooldownInDays));
    await assessment.withdrawRewards(user1.address, 1);

    {
      const { totalPendingAmountInNXM: user1Total } = await assessment.getRewards(user1.address);
      const { totalPendingAmountInNXM: user2Total } = await assessment.getRewards(user2.address);
      const { totalRewardInNXM } = await assessment.assessments(0);
      expect(user1Total).to.be.equal(expectedUser1Reward.sub(totalRewardInNXM.mul(1).div(10)));
      expect(user2Total).to.be.equal(expectedUser2Reward);
    }

    await assessment.withdrawRewards(user2.address, 1);

    {
      const { totalPendingAmountInNXM: user1Total } = await assessment.getRewards(user1.address);
      const { totalPendingAmountInNXM: user2Total } = await assessment.getRewards(user2.address);
      const { totalRewardInNXM } = await assessment.assessments(0);
      expect(user1Total).to.be.equal(expectedUser1Reward.sub(totalRewardInNXM.mul(1).div(10)));
      expect(user2Total).to.be.equal(expectedUser2Reward.sub(totalRewardInNXM.mul(9).div(10)));
    }

    // Withdraw everything
    await assessment.withdrawRewards(user2.address, 0);
    await assessment.withdrawRewards(user1.address, 0);

    {
      const { totalPendingAmountInNXM: user1Total } = await assessment.getRewards(user1.address);
      const { totalPendingAmountInNXM: user2Total } = await assessment.getRewards(user2.address);
      expect(user1Total).to.be.equal(0);
      expect(user2Total).to.be.equal(0);
    }
  });

  it('returns the withdrawable reward', async function () {
    const { assessment, individualClaims } = this.contracts;
    const [user] = this.accounts.members;
    const { minVotingPeriodInDays, payoutCooldownInDays } = await assessment.config();

    await assessment.connect(user).stake(parseEther('10'));
    await individualClaims.submitClaim(0, 0, parseEther('10'), '');
    await individualClaims.submitClaim(1, 0, parseEther('100'), '');

    await assessment.connect(user).castVotes([0], [true], 0);
    await assessment.connect(user).castVotes([1], [true], 0);

    let expectedReward = ethers.constants.Zero;

    {
      const { totalRewardInNXM } = await assessment.assessments(0);
      expectedReward = expectedReward.add(totalRewardInNXM);
    }

    {
      const { totalRewardInNXM } = await assessment.assessments(1);
      expectedReward = expectedReward.add(totalRewardInNXM);
    }

    {
      const { withdrawableAmountInNXM } = await assessment.getRewards(user.address);
      expect(withdrawableAmountInNXM).to.be.equal(0);
    }

    {
      const { end } = await assessment.getPoll(1);
      await setTime(end + daysToSeconds(minVotingPeriodInDays + payoutCooldownInDays));
      const { withdrawableAmountInNXM } = await assessment.getRewards(user.address);
      expect(withdrawableAmountInNXM).to.be.equal(expectedReward);
    }

    {
      await assessment.withdrawRewards(user.address, 1);
      const { totalRewardInNXM } = await assessment.assessments(0);
      expectedReward = expectedReward.sub(totalRewardInNXM);
      const { withdrawableAmountInNXM } = await assessment.getRewards(user.address);
      expect(withdrawableAmountInNXM).to.be.equal(expectedReward);
    }

    {
      await assessment.withdrawRewards(user.address, 1);
      const { withdrawableAmountInNXM } = await assessment.getRewards(user.address);
      expect(withdrawableAmountInNXM).to.be.equal(0);
    }

    {
      await individualClaims.submitClaim(0, 0, parseEther('1000'), '');
      await assessment.connect(user).castVotes([2], [true], 0);
      const { withdrawableAmountInNXM } = await assessment.getRewards(user.address);
      expect(withdrawableAmountInNXM).to.be.equal(0);
    }

    {
      const { end } = await assessment.getPoll(2);
      await setTime(end + daysToSeconds(minVotingPeriodInDays + payoutCooldownInDays));
      const { totalRewardInNXM } = await assessment.assessments(2);
      const { withdrawableAmountInNXM } = await assessment.getRewards(user.address);
      expect(withdrawableAmountInNXM).to.be.equal(totalRewardInNXM);
    }
  });

  it('returns the index of the first vote on an assessment that has not ended or still in cooldown', async function () {
    const { assessment, individualClaims } = this.contracts;
    const [user] = this.accounts.members;
    const { minVotingPeriodInDays, payoutCooldownInDays } = await assessment.config();

    await assessment.connect(user).stake(parseEther('10'));
    await individualClaims.submitClaim(0, 0, parseEther('10'), '');
    await individualClaims.submitClaim(0, 1, parseEther('100'), '');

    await assessment.connect(user).castVotes([0], [true], 0);
    await assessment.connect(user).castVotes([1], [true], 0);

    {
      const { withdrawableUntilIndex } = await assessment.getRewards(user.address);
      expect(withdrawableUntilIndex).to.be.equal(0);
    }

    {
      const { end } = await assessment.getPoll(1);
      await setTime(end + daysToSeconds(minVotingPeriodInDays + payoutCooldownInDays));
      const { withdrawableUntilIndex } = await assessment.getRewards(user.address);
      expect(withdrawableUntilIndex).to.be.equal(2);
    }

    {
      await individualClaims.submitClaim(0, 0, parseEther('1000'), '');
      await assessment.connect(user).castVotes([2], [true], 0);
      const { withdrawableUntilIndex } = await assessment.getRewards(user.address);
      expect(withdrawableUntilIndex).to.be.equal(2);
    }
    {
      const { end } = await assessment.getPoll(2);
      await setTime(end + daysToSeconds(minVotingPeriodInDays + payoutCooldownInDays));
      const { withdrawableUntilIndex } = await assessment.getRewards(user.address);
      expect(withdrawableUntilIndex).to.be.equal(3);
    }
  });
});
