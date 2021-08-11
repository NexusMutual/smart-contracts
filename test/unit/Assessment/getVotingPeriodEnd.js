const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');

const { assert } = require('chai');

const { submitClaim } = require('./helpers');

const { parseEther } = ethers.utils;
const { Zero } = ethers.constants;

const EVENT_TYPE = {
  CLAIM: 0,
  INCIDENT: 1,
};

const expectVotingPeriodEndOfClaim = assessment => async (id, expected) => {
  const votingPeriodEnd = await assessment.getVotingPeriodEnd(EVENT_TYPE.CLAIM, id);
  assert(
    votingPeriodEnd === expected,
    `Expected votingPeriodEnd to be ${expected} (${new Date(
      expected * 1000,
    ).toUTCString()}) but got ${votingPeriodEnd} (${new Date(votingPeriodEnd * 1000).toUTCString()})`,
  );
};

const days = x => x * 24 * 60 * 60;

const getDurationByTokenWeight = (MIN_VOTING_PERIOD_DAYS, MAX_VOTING_PERIOD_DAYS) => percentage => {
  const MULTIPLIER = '10'; // 10x the cover amount
  return parseEther(days(MIN_VOTING_PERIOD_DAYS).toString())
    .add(
      parseEther(days(MAX_VOTING_PERIOD_DAYS - MIN_VOTING_PERIOD_DAYS).toString())
        .mul(parseEther('1').sub(parseEther(percentage.toString()).div(MULTIPLIER)))
        .div(parseEther('1')),
    )
    .div(parseEther('1'))
    .toNumber();
};

const getDurationByConsensus = (MIN_VOTING_PERIOD_DAYS, MAX_VOTING_PERIOD_DAYS) => (accepted, denied) => {
  const consensusStrength = accepted
    .mul(2)
    .mul(parseEther('1'))
    .div(accepted.add(denied))
    .sub(parseEther('1'))
    .abs();
  return parseEther(days(MIN_VOTING_PERIOD_DAYS).toString())
    .add(
      parseEther(days(MAX_VOTING_PERIOD_DAYS - MIN_VOTING_PERIOD_DAYS).toString())
        .mul(parseEther('1').sub(consensusStrength))
        .div(parseEther('1')),
    )
    .div(parseEther('1'))
    .toNumber();
};

const stakeAndVoteOnEventType = (eventType, assessment, accounts) => async (userIndex, amount, id, accepted) => {
  await assessment.connect(accounts[userIndex]).depositStake(amount);
  await assessment.connect(accounts[userIndex]).castVote(eventType, id, accepted);
};

describe.only('getVotingPeriodEnd', function () {
  it('should end after MIN_VOTING_PERIOD_DAYS days if no votes are cast', async function () {
    const { assessment } = this.contracts;
    const expectVotingPeriodEndOf = expectVotingPeriodEndOfClaim(assessment);

    await submitClaim(assessment)(0, parseEther('100'));
    const { poll } = await assessment.claims(0);
    const { voteStart } = poll;

    await expectVotingPeriodEndOf(0, voteStart + days(this.MIN_VOTING_PERIOD_DAYS));
  });

  it('should return the maximum between the consensus strength-driven duration and token weight-driven duration', async function () {});

  describe('if poll result is either 100% either accept or 100% deny', () => {
    it('should decrease from MAX_VOTING_PERIOD_DAYS to MIN_VOTING_PERIOD_DAYS days as more tokens are used to vote', async function () {
      const { assessment } = this.contracts;
      const expectVotingPeriodEndOf = expectVotingPeriodEndOfClaim(assessment);
      const durationByTokenWeight = getDurationByTokenWeight(this.MIN_VOTING_PERIOD_DAYS, this.MAX_VOTING_PERIOD_DAYS);
      const stakeAndVote = stakeAndVoteOnEventType(EVENT_TYPE.CLAIM, assessment, this.accounts);

      await submitClaim(assessment)(0, parseEther('100'));
      const payoutImpact = await assessment.getPayoutImpactOfClaim(0);

      await stakeAndVote(1, payoutImpact, 0, true);
      const { poll } = await assessment.claims(0);
      const { voteStart } = poll;
      await expectVotingPeriodEndOf(0, voteStart + durationByTokenWeight(1));

      await stakeAndVote(2, payoutImpact.div(4), 0, true);
      await expectVotingPeriodEndOf(0, voteStart + durationByTokenWeight(1.25));

      await stakeAndVote(3, payoutImpact.div(4), 0, true);
      await expectVotingPeriodEndOf(0, voteStart + durationByTokenWeight(1.5));

      await stakeAndVote(4, payoutImpact.div(2), 0, true);
      await expectVotingPeriodEndOf(0, voteStart + durationByTokenWeight(2));

      await stakeAndVote(5, payoutImpact, 0, true);
      await expectVotingPeriodEndOf(0, voteStart + durationByTokenWeight(3));

      await stakeAndVote(6, payoutImpact, 0, true);
      await expectVotingPeriodEndOf(0, voteStart + durationByTokenWeight(4));

      await stakeAndVote(7, payoutImpact.mul(15).div(10), 0, true);
      await expectVotingPeriodEndOf(0, voteStart + durationByTokenWeight(5.5));

      await stakeAndVote(8, payoutImpact.mul(15).div(10), 0, true);
      await expectVotingPeriodEndOf(0, voteStart + durationByTokenWeight(7));

      await stakeAndVote(9, payoutImpact.mul(3), 0, true);
      await expectVotingPeriodEndOf(0, voteStart + durationByTokenWeight(10));
    });
  });

  describe('if tokens used for voting >= 10x payout impact', () => {
    it('should end after MIN_VOTING_PERIOD_DAYS days when poll result is 100% accept', async function () {
      const { assessment } = this.contracts;
      const expectVotingPeriodEndOf = expectVotingPeriodEndOfClaim(assessment);
      const stakeAndVote = stakeAndVoteOnEventType(EVENT_TYPE.CLAIM, assessment, this.accounts);

      await submitClaim(assessment)(0, parseEther('10'));
      const payoutImpact = await assessment.getPayoutImpactOfClaim(0);

      await stakeAndVote(1, payoutImpact.mul(10), 0, true);
      const { poll } = await assessment.claims(0);
      const { voteStart } = poll;
      await expectVotingPeriodEndOf(0, voteStart + days(this.MIN_VOTING_PERIOD_DAYS));

      await stakeAndVote(2, payoutImpact.mul(10), 0, true);
      await expectVotingPeriodEndOf(0, voteStart + days(this.MIN_VOTING_PERIOD_DAYS));
    });

    it('should end after MIN_VOTING_PERIOD_DAYS days when poll result is 100% deny', async function () {
      const { assessment } = this.contracts;
      const expectVotingPeriodEndOf = expectVotingPeriodEndOfClaim(assessment);
      const stakeAndVote = stakeAndVoteOnEventType(EVENT_TYPE.CLAIM, assessment, this.accounts);

      await submitClaim(assessment)(0, parseEther('10'));

      // 1 wei accept
      await stakeAndVote(1, '1', 0, true);

      const payoutImpact = await assessment.getPayoutImpactOfClaim(0);
      const { poll } = await assessment.claims(0);
      const { voteStart } = poll;

      // 10x payout impact deny
      await stakeAndVote(2, payoutImpact.mul(10), 0, true);
      await expectVotingPeriodEndOf(0, voteStart + days(this.MIN_VOTING_PERIOD_DAYS));
    });

    it('should end after MAX_VOTING_PERIOD_DAYS days when poll result is 50% deny, 50% accept', async function () {
      const { assessment } = this.contracts;
      const expectVotingPeriodEndOf = expectVotingPeriodEndOfClaim(assessment);
      const stakeAndVote = stakeAndVoteOnEventType(EVENT_TYPE.CLAIM, assessment, this.accounts);

      await submitClaim(assessment)(0, parseEther('10'));
      const payoutImpact = await assessment.getPayoutImpactOfClaim(0);

      await stakeAndVote(1, payoutImpact.mul(10), 0, true);
      const { poll } = await assessment.claims(0);
      const { voteStart } = poll;
      await stakeAndVote(2, payoutImpact.mul(10), 0, false);
      await expectVotingPeriodEndOf(0, voteStart + days(this.MAX_VOTING_PERIOD_DAYS));
    });

    it('should increase from MIN_VOTING_PERIOD_DAYS to MAX_VOTING_PERIOD_DAYS days as the poll result gets closer to 50%-50%', async function () {
      const { assessment } = this.contracts;
      const expectVotingPeriodEndOf = expectVotingPeriodEndOfClaim(assessment);
      const durationByConsensus = getDurationByConsensus(this.MIN_VOTING_PERIOD_DAYS, this.MAX_VOTING_PERIOD_DAYS);
      const stakeAndVote = stakeAndVoteOnEventType(EVENT_TYPE.CLAIM, assessment, this.accounts);

      await submitClaim(assessment)(0, parseEther('10'));
      const payoutImpact = await assessment.getPayoutImpactOfClaim(0);
      let accepted = Zero;
      let denied = Zero;

      // 100 - 0
      await stakeAndVote(1, payoutImpact.mul(10), 0, true);
      accepted = accepted.add(payoutImpact.mul(10));

      const { poll } = await assessment.claims(0);
      const { voteStart } = poll;

      await expectVotingPeriodEndOf(0, voteStart + days(this.MIN_VOTING_PERIOD_DAYS));

      // 90.90 - 9.09
      await stakeAndVote(2, payoutImpact, 0, false);
      denied = denied.add(payoutImpact);
      await expectVotingPeriodEndOf(0, voteStart + durationByConsensus(accepted, denied));

      // 83.33 - 16.66
      await stakeAndVote(3, payoutImpact, 0, false);
      denied = denied.add(payoutImpact);
      await expectVotingPeriodEndOf(0, voteStart + durationByConsensus(accepted, denied));

      // 76.92 - 23.08
      await stakeAndVote(4, payoutImpact, 0, false);
      denied = denied.add(payoutImpact);
      await expectVotingPeriodEndOf(0, voteStart + durationByConsensus(accepted, denied));

      // 71.42 - 28.75
      await stakeAndVote(5, payoutImpact, 0, false);
      denied = denied.add(payoutImpact);
      await expectVotingPeriodEndOf(0, voteStart + durationByConsensus(accepted, denied));

      // 66.66 - 33.33
      await stakeAndVote(6, payoutImpact, 0, false);
      denied = denied.add(payoutImpact);
      await expectVotingPeriodEndOf(0, voteStart + durationByConsensus(accepted, denied));

      // 50 - 50
      await stakeAndVote(7, payoutImpact.mul(5), 0, false);
      denied = denied.add(payoutImpact.mul(5));
      await expectVotingPeriodEndOf(0, voteStart + days(this.MAX_VOTING_PERIOD_DAYS));
    });
  });
});
