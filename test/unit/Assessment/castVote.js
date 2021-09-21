const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setTime, submitClaim, EVENT_TYPE, daysToSeconds } = require('./helpers');
const { time } = require('@openzeppelin/test-helpers');
const { parseEther } = ethers.utils;

describe('castVote', function () {
  it('reverts if the user has already voted on the same assessment', async function () {
    const { assessment, claims } = this.contracts;
    const user = this.accounts.members[0];
    await assessment.connect(user).stake(parseEther('100'));
    await claims.submitClaim(0, parseEther('100'), false, '');
    await assessment.connect(user).castVote(0, true);
    await expect(assessment.connect(user).castVote(0, true)).to.be.revertedWith('Already voted');
    await expect(assessment.connect(user).castVote(0, false)).to.be.revertedWith('Already voted');
  });

  it('reverts if the user has no stake', async function () {
    const { assessment, claims } = this.contracts;
    const user = this.accounts.members[0];
    await claims.submitClaim(0, parseEther('100'), false, '');
    await expect(assessment.connect(user).castVote(0, true)).to.be.revertedWith('A stake is required to cast votes');
    await expect(assessment.connect(user).castVote(0, false)).to.be.revertedWith('A stake is required to cast votes');
  });

  it('reverts if the voting period has ended', async function () {
    const { assessment, claims } = this.contracts;
    const [user1, user2] = this.accounts.members;
    await assessment.connect(user1).stake(parseEther('100'));
    await assessment.connect(user2).stake(parseEther('100'));
    await claims.submitClaim(0, parseEther('100'), false, '');
    {
      const { poll } = await assessment.assessments(0);
      await setTime(poll.end);
    }
    await expect(assessment.connect(user1).castVote(0, true)).to.be.revertedWith('Voting is closed');
    await expect(assessment.connect(user1).castVote(0, false)).to.be.revertedWith('Voting is closed');

    await claims.submitClaim(1, parseEther('100'), false, '');
    const timestamp = await time.latest();
    await setTime(timestamp.toNumber() + daysToSeconds(1));
    await assessment.connect(user1).castVote(1, true);
    {
      const { poll } = await assessment.assessments(1);
      await setTime(poll.end);
    }
    await expect(assessment.connect(user2).castVote(1, true)).to.be.revertedWith('Voting is closed');
    await expect(assessment.connect(user2).castVote(1, false)).to.be.revertedWith('Voting is closed');
  });

  it('reverts if the first vote is deny', async function () {
    const { assessment, claims } = this.contracts;
    const user = this.accounts.members[0];
    await assessment.connect(user).stake(parseEther('100'));
    await claims.submitClaim(0, parseEther('100'), false, '');
    await expect(assessment.connect(user).castVote(0, false)).to.be.revertedWith(
      'At least one accept vote is required to vote deny',
    );
  });

  it('resets the voting period to minVotingPeriodDays after the first accept vote', async function () {
    const { assessment, claims } = this.contracts;
    const user = this.accounts.members[0];
    await assessment.connect(user).stake(parseEther('100'));
    await claims.submitClaim(0, parseEther('100'), false, '');
    {
      const timestamp = await time.latest();
      await setTime(timestamp.toNumber() + daysToSeconds(1));
    }

    await assessment.connect(user).castVote(0, true);
    let expectedEnd;
    {
      const timestamp = await time.latest();
      const { minVotingPeriodDays } = await assessment.config();
      expectedEnd = timestamp.toNumber() + daysToSeconds(minVotingPeriodDays);
    }

    {
      const { poll } = await assessment.assessments(0);
      expect(poll.end).to.be.equal(expectedEnd);
    }
  });

  it("extends the voting period up to 24h pro-rated by the user's stake when the poll ends in less than 24h", async function () {
    const { assessment, claims } = this.contracts;
    const [user1, user2, user3, user4, user5] = this.accounts.members;
    await claims.submitClaim(0, parseEther('100'), false, '');

    await assessment.connect(user1).stake(parseEther('100'));
    await assessment.connect(user2).stake(parseEther('100'));
    await assessment.connect(user3).stake(parseEther('200'));
    await assessment.connect(user4).stake(parseEther('800'));
    await assessment.connect(user5).stake(parseEther('300'));

    await assessment.connect(user1).castVote(0, true);

    {
      const { poll } = await assessment.assessments(0);
      // Every tx increases the time by 1 second, hence 2 seconds are required to have a block
      // timestamp at 1 second before the poll end when the vote is cast.
      await setTime(poll.end - 2);
    }

    await assessment.connect(user2).castVote(0, true);
    {
      const timestamp = await time.latest();
      const { poll } = await assessment.assessments(0);
      await expect(poll.end).to.be.equal(timestamp.toNumber() + daysToSeconds(1) + 1);
      // Subtract 1 second to allow the next castVote to happen 1 second before the vote period
      // extension ends
      await setTime(timestamp.toNumber() + daysToSeconds(1) - 1);
    }

    await assessment.connect(user3).castVote(0, true);
    {
      const timestamp = await time.latest();
      const { poll } = await assessment.assessments(0);
      await expect(poll.end).to.be.equal(timestamp.toNumber() + daysToSeconds(1) + 1);
      await setTime(timestamp.toNumber() + daysToSeconds(1) - 1);
    }

    await assessment.connect(user4).castVote(0, true);
    {
      const timestamp = await time.latest();
      const { poll } = await assessment.assessments(0);
      await expect(poll.end).to.be.equal(timestamp.toNumber() + daysToSeconds(1) + 1);
      await setTime(timestamp.toNumber() + daysToSeconds(1) - 1);
    }

    await assessment.connect(user5).castVote(0, true);
    {
      const timestamp = await time.latest();
      const { poll } = await assessment.assessments(0);
      // user's stake of 300 NXM out of 1200 NXM total staked represents 1/4 day
      await expect(poll.end).to.be.equal(timestamp.toNumber() + daysToSeconds(0.25) + 1);
      await setTime(timestamp.toNumber() + daysToSeconds(1) - 1);
    }
  });

  it("increases the poll's accepted token count if the user vote is to accept", async function () {
    const { assessment, claims } = this.contracts;
    const [user1, user2, user3] = this.accounts.members;
    await assessment.connect(user1).stake(parseEther('100'));
    await assessment.connect(user2).stake(parseEther('100'));
    await assessment.connect(user3).stake(parseEther('100'));

    await claims.submitClaim(0, parseEther('100'), false, '');

    {
      await assessment.connect(user1).castVote(0, true);
      const { poll } = await assessment.assessments(0);
      await expect(poll.accepted).to.be.equal(parseEther('100'));
    }

    {
      await assessment.connect(user2).castVote(0, false);
      const { poll } = await assessment.assessments(0);
      await expect(poll.accepted).to.be.equal(parseEther('100'));
    }

    {
      await assessment.connect(user3).castVote(0, true);
      const { poll } = await assessment.assessments(0);
      await expect(poll.accepted).to.be.equal(parseEther('200'));
    }
  });

  it("increases the poll's denied token count if the user vote is to deny", async function () {
    const { assessment, claims } = this.contracts;
    const [user1, user2, user3, user4] = this.accounts.members;
    await assessment.connect(user1).stake(parseEther('100'));
    await assessment.connect(user2).stake(parseEther('100'));
    await assessment.connect(user3).stake(parseEther('100'));
    await assessment.connect(user4).stake(parseEther('100'));

    await claims.submitClaim(0, parseEther('100'), false, '');

    {
      await assessment.connect(user1).castVote(0, true);
      const { poll } = await assessment.assessments(0);
      await expect(poll.denied).to.be.equal(parseEther('0'));
    }

    {
      await assessment.connect(user2).castVote(0, false);
      const { poll } = await assessment.assessments(0);
      await expect(poll.denied).to.be.equal(parseEther('100'));
    }

    {
      await assessment.connect(user3).castVote(0, true);
      const { poll } = await assessment.assessments(0);
      await expect(poll.denied).to.be.equal(parseEther('100'));
    }

    {
      await assessment.connect(user4).castVote(0, false);
      const { poll } = await assessment.assessments(0);
      await expect(poll.denied).to.be.equal(parseEther('200'));
    }
  });

  it("pushes the vote details to the user's array votes", async function () {
    const { assessment, claims } = this.contracts;
    const [user1, user2, user3, user4] = this.accounts.members;
    await assessment.connect(user1).stake(parseEther('100'));
    await assessment.connect(user2).stake(parseEther('1000'));

    await claims.submitClaim(0, parseEther('100'), false, '');
    await claims.submitClaim(1, parseEther('100'), false, '');

    {
      await assessment.connect(user1).castVote(0, true);
      const timestampAtVoteTime = await time.latest();
      const { assessmentId, accepted, timestamp, stakedAmount } = await assessment.votesOf(user1.address, 0);
      await expect(assessmentId).to.be.equal(0);
      await expect(accepted).to.be.equal(true);
      await expect(timestamp).to.be.equal(timestampAtVoteTime.toNumber());
      await expect(stakedAmount).to.be.equal(parseEther('100'));
    }

    {
      await assessment.connect(user1).castVote(1, true);
      const timestampAtVoteTime = await time.latest();
      const { assessmentId, accepted, timestamp, stakedAmount } = await assessment.votesOf(user1.address, 1);
      await expect(assessmentId).to.be.equal(1);
      await expect(accepted).to.be.equal(true);
      await expect(timestamp).to.be.equal(timestampAtVoteTime.toNumber());
      await expect(stakedAmount).to.be.equal(parseEther('100'));
    }

    {
      await assessment.connect(user2).castVote(0, false);
      const timestampAtVoteTime = await time.latest();
      const { assessmentId, accepted, timestamp, stakedAmount } = await assessment.votesOf(user2.address, 0);
      await expect(assessmentId).to.be.equal(0);
      await expect(accepted).to.be.equal(false);
      await expect(timestamp).to.be.equal(timestampAtVoteTime.toNumber());
      await expect(stakedAmount).to.be.equal(parseEther('1000'));
    }

    {
      await assessment.connect(user2).castVote(1, false);
      const timestampAtVoteTime = await time.latest();
      const { assessmentId, accepted, timestamp, stakedAmount } = await assessment.votesOf(user2.address, 1);
      await expect(assessmentId).to.be.equal(1);
      await expect(accepted).to.be.equal(false);
      await expect(timestamp).to.be.equal(timestampAtVoteTime.toNumber());
      await expect(stakedAmount).to.be.equal(parseEther('1000'));
    }
  });
});
