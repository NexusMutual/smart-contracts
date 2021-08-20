const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');

const { assert } = require('chai');

const { submitClaim, submitFraud, burnFraud, EVENT_TYPE, daysToSeconds } = require('./helpers');
const { BigNumber } = require('ethers');

const { parseEther } = ethers.utils;

const expectPollEndDate = (assessment, assessmentVoteLibTest) => async (poll, payoutImpact, expected) => {
  const CONFIG = await assessment.CONFIG();
  const pollEnd = await assessmentVoteLibTest._calculatePollEndDate(CONFIG, poll, payoutImpact);
  assert(
    pollEnd === expected,
    `Expected pollEnd to be ${expected} (${new Date(expected * 1000).toUTCString()}) but got ${pollEnd} (${new Date(
      pollEnd * 1000,
    ).toUTCString()})`,
  );
};

const getDurationByTokenWeight = (MIN_VOTING_PERIOD_DAYS, MAX_VOTING_PERIOD_DAYS) => (tokens, payoutImpact) => {
  const MULTIPLIER = '10'; // 10x the cover amount
  let tokenDrivenStrength = tokens.mul(parseEther('1')).div(payoutImpact.mul(MULTIPLIER));
  // tokenDrivenStrength is capped at 1 i.e. 100%
  tokenDrivenStrength = tokenDrivenStrength.gt(parseEther('1')) ? parseEther('1') : tokenDrivenStrength;
  return BigNumber.from(daysToSeconds(MIN_VOTING_PERIOD_DAYS).toString())
    .add(
      BigNumber.from(daysToSeconds(MAX_VOTING_PERIOD_DAYS - MIN_VOTING_PERIOD_DAYS).toString())
        .mul(parseEther('1').sub(tokenDrivenStrength))
        .div(parseEther('1')),
    )
    .toNumber();
};

const getDurationByConsensus = (MIN_VOTING_PERIOD_DAYS, MAX_VOTING_PERIOD_DAYS) => (accepted, denied) => {
  if (accepted.isZero()) return daysToSeconds(MAX_VOTING_PERIOD_DAYS);
  const consensusStrength = accepted
    .mul(parseEther('2'))
    .div(accepted.add(denied))
    .sub(parseEther('1'))
    .abs();
  return parseEther(daysToSeconds(MIN_VOTING_PERIOD_DAYS).toString())
    .add(
      parseEther(daysToSeconds(MAX_VOTING_PERIOD_DAYS - MIN_VOTING_PERIOD_DAYS).toString())
        .mul(parseEther('1').sub(consensusStrength))
        .div(parseEther('1')),
    )
    .div(parseEther('1'))
    .toNumber();
};

const stakeAndVoteOnEventType = (eventType, assessment, accounts) => async (userIndex, amount, id, accepted) => {
  const assessor = accounts[userIndex];
  await assessment.connect(assessor).depositStake(amount);
  await assessment.connect(assessor).castVote(eventType, id, accepted);
  if (eventType === EVENT_TYPE.CLAIM) {
    const claim = await assessment.claims(id);
    const { accepted, denied } = claim.poll;
    return { accepted, denied, totalTokens: accepted.add(denied) };
  }
  if (eventType === EVENT_TYPE.INCIDENT) {
    const incident = await assessment.incidents(id);
    const { accepted, denied } = incident.poll;
    return { accepted, denied, totalTokens: accepted.add(denied) };
  }
};

describe('_calculatePollEndDate', function () {
  it('should end after MIN_VOTING_PERIOD_DAYS if if no votes are cast', async function () {
    const { assessment, assessmentVoteLibTest } = this.contracts;
    const expectPollEnd = expectPollEndDate(assessment, assessmentVoteLibTest);
    const timestamp = await time.latest();

    const payoutImpact = parseEther('100');
    const poll = {
      accepted: 0,
      denied: 0,
      start: timestamp.toNumber(),
    };
    await expectPollEnd(poll, payoutImpact, poll.start + daysToSeconds(this.MIN_VOTING_PERIOD_DAYS));
  });

  // it('should return the maximum between consensus-driven duration and token-driven duration', async function () {
  // const { assessment } = this.contracts;
  // const expectPollEndDate = expectPollEndDate(assessment);
  // const durationByTokenWeight = getDurationByTokenWeight(this.MIN_VOTING_PERIOD_DAYS, this.MAX_VOTING_PERIOD_DAYS);
  // const stakeAndVote = stakeAndVoteOnEventType(EVENT_TYPE.CLAIM, assessment, this.accounts);
  // const durationByConsensus = getDurationByConsensus(this.MIN_VOTING_PERIOD_DAYS, this.MAX_VOTING_PERIOD_DAYS);

  // await submitClaim(assessment)(0, parseEther('100'));
  // const payoutImpact = await assessment.getPayoutImpact(0);

  // const { accepted, denied, totalTokens } = await stakeAndVote(1, payoutImpact, 0, true);
  // const { poll } = await assessment.claims(0);
  // const { start } = poll;
  // await expectPollEndDate(
  // 0,
  // start + Math.max(durationByConsensus(accepted, denied), durationByTokenWeight(totalTokens, payoutImpact)),
  // );

  // {
  // const { accepted, denied, totalTokens } = await stakeAndVote(2, payoutImpact, 0, false);
  // await expectPollEndDate(
  // 0,
  // start + Math.max(durationByConsensus(accepted, denied), durationByTokenWeight(totalTokens, payoutImpact)),
  // );
  // }

  // {
  // const { accepted, denied, totalTokens } = await stakeAndVote(3, payoutImpact.mul(2), 0, false);
  // await expectPollEndDate(
  // 0,
  // start + Math.max(durationByConsensus(accepted, denied), durationByTokenWeight(totalTokens, payoutImpact)),
  // );
  // }

  // {
  // const { accepted, denied, totalTokens } = await stakeAndVote(4, payoutImpact, 0, false);
  // await expectPollEndDate(
  // 0,
  // start + Math.max(durationByConsensus(accepted, denied), durationByTokenWeight(totalTokens, payoutImpact)),
  // );
  // }

  // {
  // const { accepted, denied, totalTokens } = await stakeAndVote(5, payoutImpact.mul(3), 0, true);
  // await expectPollEndDate(
  // 0,
  // start + Math.max(durationByConsensus(accepted, denied), durationByTokenWeight(totalTokens, payoutImpact)),
  // );
  // }
  // });

  // describe('if poll result is either 100% either accept or 100% deny', () => {
  // it('should decrease from MAX_VOTING_PERIOD_DAYS to MIN_VOTING_PERIOD_DAYS as more tokens are used to vote', async function () {
  // const { assessment } = this.contracts;
  // const expectPollEndDate = expectPollEndDate(assessment);
  // const durationByTokenWeight = getDurationByTokenWeight(this.MIN_VOTING_PERIOD_DAYS, this.MAX_VOTING_PERIOD_DAYS);
  // const stakeAndVote = stakeAndVoteOnEventType(EVENT_TYPE.CLAIM, assessment, this.accounts);
  // const expectDecrease = (prev, curr) => {
  // assert(prev > curr, `Expected current duration ${curr} to be less than the previous one ${prev}`);
  // };

  // await submitClaim(assessment)(0, parseEther('100'));
  // const payoutImpact = await assessment.getPayoutImpact(0);

  // const { totalTokens } = await stakeAndVote(1, payoutImpact, 0, true);
  // const { poll } = await assessment.claims(0);
  // const { start } = poll;
  // await expectPollEndDate(0, start + durationByTokenWeight(totalTokens, payoutImpact));
  // let previousDuration = durationByTokenWeight(totalTokens, payoutImpact);

  // {
  // const { totalTokens } = await stakeAndVote(2, payoutImpact.div(4), 0, true);
  // const currenDuration = durationByTokenWeight(totalTokens, payoutImpact);
  // await expectPollEndDate(0, start + currenDuration);
  // expectDecrease(previousDuration, currenDuration);
  // previousDuration = currenDuration;
  // }

  // {
  // const { totalTokens } = await stakeAndVote(3, payoutImpact.div(4), 0, true);
  // const currenDuration = durationByTokenWeight(totalTokens, payoutImpact);
  // await expectPollEndDate(0, start + currenDuration);
  // expectDecrease(previousDuration, currenDuration);
  // previousDuration = currenDuration;
  // }

  // {
  // const { totalTokens } = await stakeAndVote(4, payoutImpact.div(2), 0, true);
  // const currenDuration = durationByTokenWeight(totalTokens, payoutImpact);
  // await expectPollEndDate(0, start + currenDuration);
  // expectDecrease(previousDuration, currenDuration);
  // previousDuration = currenDuration;
  // }

  // {
  // const { totalTokens } = await stakeAndVote(5, payoutImpact, 0, true);
  // const currenDuration = durationByTokenWeight(totalTokens, payoutImpact);
  // await expectPollEndDate(0, start + currenDuration);
  // expectDecrease(previousDuration, currenDuration);
  // previousDuration = currenDuration;
  // }

  // {
  // const { totalTokens } = await stakeAndVote(6, payoutImpact, 0, true);
  // const currenDuration = durationByTokenWeight(totalTokens, payoutImpact);
  // await expectPollEndDate(0, start + currenDuration);
  // expectDecrease(previousDuration, currenDuration);
  // previousDuration = currenDuration;
  // }

  // {
  // const { totalTokens } = await stakeAndVote(7, payoutImpact.mul(15).div(10), 0, true);
  // const currenDuration = durationByTokenWeight(totalTokens, payoutImpact);
  // await expectPollEndDate(0, start + currenDuration);
  // expectDecrease(previousDuration, currenDuration);
  // previousDuration = currenDuration;
  // }

  // {
  // const { totalTokens } = await stakeAndVote(8, payoutImpact.mul(15).div(10), 0, true);
  // const currenDuration = durationByTokenWeight(totalTokens, payoutImpact);
  // await expectPollEndDate(0, start + currenDuration);
  // expectDecrease(previousDuration, currenDuration);
  // previousDuration = currenDuration;
  // }

  // {
  // const { totalTokens } = await stakeAndVote(9, payoutImpact.mul(3), 0, true);
  // await expectPollEndDate(0, start + durationByTokenWeight(totalTokens, payoutImpact));
  // }
  // });

  // it('should not decrease below MIN_VOTING_PERIOD_DAYS after an amount of tokens >= 10x payout impact have been used to vote', async function () {
  // const { assessment } = this.contracts;
  // const expectPollEndDate = expectPollEndDate(assessment);
  // const stakeAndVote = stakeAndVoteOnEventType(EVENT_TYPE.CLAIM, assessment, this.accounts);

  // await submitClaim(assessment)(0, parseEther('10'));
  // const payoutImpact = await assessment.getPayoutImpact(0);

  // await stakeAndVote(1, payoutImpact.mul('20'), 0, true);
  // const { poll } = await assessment.claims(0);
  // const { start } = poll;
  // await expectPollEndDate(0, start + daysToSeconds(this.MIN_VOTING_PERIOD_DAYS));
  // });
  // });

  // describe('if tokens used for voting >= 10x payout impact', () => {
  // it('should end after MIN_VOTING_PERIOD_DAYS when poll result is 100% accept', async function () {
  // const { assessment } = this.contracts;
  // const expectPollEndDate = expectPollEndDate(assessment);
  // const stakeAndVote = stakeAndVoteOnEventType(EVENT_TYPE.CLAIM, assessment, this.accounts);

  // await submitClaim(assessment)(0, parseEther('10'));
  // const payoutImpact = await assessment.getPayoutImpact(0);

  // await stakeAndVote(1, payoutImpact.mul(10), 0, true);
  // const { poll } = await assessment.claims(0);
  // const { start } = poll;
  // await expectPollEndDate(0, start + daysToSeconds(this.MIN_VOTING_PERIOD_DAYS));

  // await stakeAndVote(2, payoutImpact.mul(10), 0, true);
  // await expectPollEndDate(0, start + daysToSeconds(this.MIN_VOTING_PERIOD_DAYS));
  // });

  // it('should end after MIN_VOTING_PERIOD_DAYS when poll result is 100% deny', async function () {
  // const { assessment } = this.contracts;
  // const expectPollEndDate = expectPollEndDate(assessment);
  // const stakeAndVote = stakeAndVoteOnEventType(EVENT_TYPE.CLAIM, assessment, this.accounts);

  // await submitClaim(assessment)(0, parseEther('10'));

  /// / 1 wei accept
  // await stakeAndVote(1, '1', 0, true);

  // const payoutImpact = await assessment.getPayoutImpact(0);
  // const { poll } = await assessment.claims(0);
  // const { start } = poll;

  /// / 10x payout impact deny
  // await stakeAndVote(2, payoutImpact.mul(10), 0, true);
  // await expectPollEndDate(0, start + daysToSeconds(this.MIN_VOTING_PERIOD_DAYS));
  // });

  // it('should end after MAX_VOTING_PERIOD_DAYS when poll result is 50% deny, 50% accept', async function () {
  // const { assessment } = this.contracts;
  // const expectPollEndDate = expectPollEndDate(assessment);
  // const stakeAndVote = stakeAndVoteOnEventType(EVENT_TYPE.CLAIM, assessment, this.accounts);

  // await submitClaim(assessment)(0, parseEther('10'));
  // const payoutImpact = await assessment.getPayoutImpact(0);

  // await stakeAndVote(1, payoutImpact.mul(10), 0, true);
  // const { poll } = await assessment.claims(0);
  // const { start } = poll;
  // await stakeAndVote(2, payoutImpact.mul(10), 0, false);
  // await expectPollEndDate(0, start + daysToSeconds(this.MAX_VOTING_PERIOD_DAYS));
  // });

  // it('should increase from MIN_VOTING_PERIOD_DAYS to MAX_VOTING_PERIOD_DAYS as the poll result gets closer to 50%-50%', async function () {
  // const { assessment } = this.contracts;
  // const expectPollEndDate = expectPollEndDate(assessment);
  // const durationByConsensus = getDurationByConsensus(this.MIN_VOTING_PERIOD_DAYS, this.MAX_VOTING_PERIOD_DAYS);
  // const stakeAndVote = stakeAndVoteOnEventType(EVENT_TYPE.CLAIM, assessment, this.accounts);

  // const expectIncrease = (prev, curr) => {
  // assert(prev < curr, `Expected current duration ${curr} to be grater than the previous one ${prev}`);
  // };

  /// / From 100% accept to 50%-50%
  // await submitClaim(assessment)(0, parseEther('10'));
  // let payoutImpact = await assessment.getPayoutImpact(0);

  /// / 100 - 0
  // await stakeAndVote(1, payoutImpact.mul(10), 0, true);
  // const { poll } = await assessment.claims(0);
  // let { start } = poll;
  // await expectPollEndDate(0, start + daysToSeconds(this.MIN_VOTING_PERIOD_DAYS));
  // let previousDuration = daysToSeconds(this.MIN_VOTING_PERIOD_DAYS);

  // {
  /// / 90.90 - 9.09
  // const { accepted, denied } = await stakeAndVote(2, payoutImpact, 0, false);
  // const currentDuration = durationByConsensus(accepted, denied);
  // await expectPollEndDate(0, start + currentDuration);
  // expectIncrease(previousDuration, currentDuration);
  // previousDuration = currentDuration;
  // }

  // {
  /// / 83.33 - 16.66
  // const { accepted, denied } = await stakeAndVote(3, payoutImpact, 0, false);
  // const currentDuration = durationByConsensus(accepted, denied);
  // await expectPollEndDate(0, start + currentDuration);
  // expectIncrease(previousDuration, currentDuration);
  // previousDuration = currentDuration;
  // }

  // {
  /// / 76.92 - 23.08
  // const { accepted, denied } = await stakeAndVote(4, payoutImpact, 0, false);
  // const currentDuration = durationByConsensus(accepted, denied);
  // await expectPollEndDate(0, start + currentDuration);
  // expectIncrease(previousDuration, currentDuration);
  // previousDuration = currentDuration;
  // }

  // {
  /// / 71.42 - 28.75
  // const { accepted, denied } = await stakeAndVote(5, payoutImpact, 0, false);
  // const currentDuration = durationByConsensus(accepted, denied);
  // await expectPollEndDate(0, start + currentDuration);
  // expectIncrease(previousDuration, currentDuration);
  // previousDuration = currentDuration;
  // }

  // {
  /// / 66.66 - 33.33
  // const { accepted, denied } = await stakeAndVote(6, payoutImpact, 0, false);
  // const currentDuration = durationByConsensus(accepted, denied);
  // await expectPollEndDate(0, start + currentDuration);
  // expectIncrease(previousDuration, currentDuration);
  // previousDuration = currentDuration;
  // }

  // {
  /// / 50 - 50
  // await stakeAndVote(7, payoutImpact.mul(5), 0, false);
  // const currentDuration = daysToSeconds(this.MAX_VOTING_PERIOD_DAYS);
  // await expectPollEndDate(0, start + currentDuration);
  // expectIncrease(previousDuration, currentDuration);
  // previousDuration = currentDuration;
  // }

  /// / 2nd claim, from 100% deny to 50%-50%
  // await submitClaim(assessment)(1, parseEther('10'));
  // payoutImpact = await assessment.getPayoutImpact(0);

  /// / 1 wei accept vote to allow deny votes
  // await stakeAndVote(0, '1', 1, true);

  /// / 100 - 0
  // await stakeAndVote(1, payoutImpact.mul(10), 1, false);
  // const secondClaim = await assessment.claims(1);
  // start = secondClaim.poll.start;
  // await expectPollEndDate(1, start + daysToSeconds(this.MIN_VOTING_PERIOD_DAYS));
  // previousDuration = daysToSeconds(this.MIN_VOTING_PERIOD_DAYS);

  // {
  /// / 90.90 - 9.09
  // const { accepted, denied } = await stakeAndVote(2, payoutImpact, 1, true);
  // const currentDuration = durationByConsensus(accepted, denied);
  // await expectPollEndDate(1, start + currentDuration);
  // expectIncrease(previousDuration, currentDuration);
  // previousDuration = currentDuration;
  // }

  // {
  /// / 83.33 - 16.66
  // const { accepted, denied } = await stakeAndVote(3, payoutImpact, 1, true);
  // const currentDuration = durationByConsensus(accepted, denied);
  // await expectPollEndDate(1, start + currentDuration);
  // expectIncrease(previousDuration, currentDuration);
  // previousDuration = currentDuration;
  // }

  // {
  /// / 76.92 - 23.08
  // const { accepted, denied } = await stakeAndVote(4, payoutImpact, 1, true);
  // const currentDuration = durationByConsensus(accepted, denied);
  // await expectPollEndDate(1, start + currentDuration);
  // expectIncrease(previousDuration, currentDuration);
  // previousDuration = currentDuration;
  // }

  // {
  /// / 71.42 - 28.75
  // const { accepted, denied } = await stakeAndVote(5, payoutImpact, 1, true);
  // const currentDuration = durationByConsensus(accepted, denied);
  // await expectPollEndDate(1, start + currentDuration);
  // expectIncrease(previousDuration, currentDuration);
  // previousDuration = currentDuration;
  // }

  // {
  /// / 66.66 - 33.33
  // const { accepted, denied } = await stakeAndVote(6, payoutImpact, 1, true);
  // const currentDuration = durationByConsensus(accepted, denied);
  // await expectPollEndDate(1, start + currentDuration);
  // expectIncrease(previousDuration, currentDuration);
  // previousDuration = currentDuration;
  // }

  // {
  /// / 50 - 50
  // await stakeAndVote(7, payoutImpact.mul(5), 1, true);
  // const currentDuration = daysToSeconds(this.MAX_VOTING_PERIOD_DAYS);
  // await expectPollEndDate(1, start + currentDuration);
  // expectIncrease(previousDuration, currentDuration);
  // }
  // });
  // });
});
