const { ethers } = require('hardhat');
const { assert } = require('chai');
const expectRevert = require('@openzeppelin/test-helpers/src/expectRevert');

const { getDurationByTokenWeight, getDurationByConsensus, daysToSeconds } = require('./helpers');

const { parseEther } = ethers.utils;
const { Zero, One } = ethers.constants;

const expectPollEndDate = ({ assessment, assessmentVoteLibTest }) => async (poll, payoutImpact, expected) => {
  const CONFIG = await assessment.config();
  const pollEnd = await assessmentVoteLibTest._calculatePollEndDate(CONFIG, poll, payoutImpact);
  assert(
    pollEnd === expected,
    `Expected pollEnd to be ${expected} (${new Date(expected * 1000).toUTCString()}) but got ${pollEnd} (${new Date(
      pollEnd * 1000,
    ).toUTCString()})`,
  );
};

describe('_calculatePollEndDate', function () {
  it('should revert when given a poll with no votes', async function () {
    const { assessment, assessmentVoteLibTest } = this.contracts;
    const CONFIG = await assessment.config();
    const payoutImpact = parseEther('100');
    const poll = {
      accepted: 0,
      denied: 0,
      start: 0,
      end: 0,
    };

    await expectRevert.unspecified(assessmentVoteLibTest._calculatePollEndDate(CONFIG, poll, payoutImpact));
  });

  it('should return the maximum between consensus-driven end and token-driven end', async function () {
    const expectPollEnd = expectPollEndDate(this.contracts);
    const durationByTokenWeight = getDurationByTokenWeight(this.MIN_VOTING_PERIOD_DAYS, this.MAX_VOTING_PERIOD_DAYS);
    const durationByConsensus = getDurationByConsensus(this.MIN_VOTING_PERIOD_DAYS, this.MAX_VOTING_PERIOD_DAYS);

    const payoutImpact = parseEther('100');

    const poll = {
      accepted: payoutImpact,
      denied: Zero,
      start: 0,
      end: 0,
    };

    {
      const totalTokens = poll.accepted.add(poll.denied);
      await expectPollEnd(
        poll,
        payoutImpact,
        poll.start + Math.max(durationByConsensus(poll), durationByTokenWeight(totalTokens, payoutImpact)),
      );
    }

    const voters = [
      ['DENIED', payoutImpact],
      ['DENIED', payoutImpact.mul(2)],
      ['DENIED', payoutImpact],
      ['DENIED', payoutImpact.mul(3)],
      ['ACCEPTED', payoutImpact.mul(3)],
      ['ACCEPTED', payoutImpact.mul(10)],
      ['DENIED', payoutImpact.mul(10)],
      ['ACCEPTED', payoutImpact.mul(10)],
    ];

    for (const voter of voters) {
      const [vote, tokenWeight] = voter;
      if (vote === 'ACCEPTED') {
        poll.accepted = poll.accepted.add(tokenWeight);
      } else {
        poll.denied = poll.denied.add(tokenWeight);
      }
      const totalTokens = poll.accepted.add(poll.denied);
      await expectPollEnd(
        poll,
        payoutImpact,
        poll.start + Math.max(durationByConsensus(poll), durationByTokenWeight(totalTokens, payoutImpact)),
      );
    }
  });

  describe('if poll result is either 100% accept or 100% deny', () => {
    it('should decrease from MAX_VOTING_PERIOD_DAYS to MIN_VOTING_PERIOD_DAYS as more tokens are used to vote', async function () {
      const expectPollEnd = expectPollEndDate(this.contracts);
      const durationByTokenWeight = getDurationByTokenWeight(this.MIN_VOTING_PERIOD_DAYS, this.MAX_VOTING_PERIOD_DAYS);
      const expectDecrease = (prev, curr) => {
        assert(prev > curr, `Expected current duration ${curr} to be less than the previous one ${prev}`);
      };

      const payoutImpact = parseEther('100');

      const poll = {
        accepted: payoutImpact,
        denied: Zero,
        start: 0,
        end: 0,
      };
      const totalTokens = poll.accepted.add(poll.denied);
      await expectPollEnd(poll, payoutImpact, poll.start + durationByTokenWeight(totalTokens, payoutImpact));
      let prev = durationByTokenWeight(totalTokens, payoutImpact);

      const voters = [
        ['ACCEPTED', payoutImpact.div(4)],
        ['ACCEPTED', payoutImpact.div(4)],
        ['ACCEPTED', payoutImpact.div(2)],
        ['ACCEPTED', payoutImpact],
        ['ACCEPTED', payoutImpact],
        ['ACCEPTED', payoutImpact],
        ['ACCEPTED', payoutImpact.mul(15).div(10)],
        ['ACCEPTED', payoutImpact.mul(15).div(10)],
        ['ACCEPTED', payoutImpact.mul(3)],
      ];

      for (const voter of voters) {
        const [vote, tokenWeight] = voter;
        if (vote === 'ACCEPTED') {
          poll.accepted = poll.accepted.add(tokenWeight);
        } else {
          poll.denied = poll.denied.add(tokenWeight);
        }
        const totalTokens = poll.accepted.add(poll.denied);
        const curr = durationByTokenWeight(totalTokens, payoutImpact);
        await expectPollEnd(poll, payoutImpact, poll.start + durationByTokenWeight(totalTokens, payoutImpact));
        expectDecrease(prev, curr);
        prev = curr;
      }
    });

    it('should not end in less than MIN_VOTING_PERIOD_DAYS when the amount of tokens used to vote >= 10x payout impact', async function () {
      const expectPollEnd = expectPollEndDate(this.contracts);

      const payoutImpact = parseEther('100');
      const poll = {
        accepted: payoutImpact.mul('20'),
        denied: Zero,
        start: 0,
        end: 0,
      };

      await expectPollEnd(poll, payoutImpact, poll.start + daysToSeconds(this.MIN_VOTING_PERIOD_DAYS));
    });
  });

  describe('if tokens used for voting >= 10x payout impact', () => {
    it('should end after MIN_VOTING_PERIOD_DAYS when poll result is 100% accept', async function () {
      const expectPollEnd = expectPollEndDate(this.contracts);

      const payoutImpact = parseEther('100');
      const poll = {
        accepted: payoutImpact.mul('10'),
        denied: Zero,
        start: 0,
        end: 0,
      };

      await expectPollEnd(poll, payoutImpact, poll.start + daysToSeconds(this.MIN_VOTING_PERIOD_DAYS));

      poll.accepted = poll.accepted.add(payoutImpact.mul('10'));
      await expectPollEnd(poll, payoutImpact, poll.start + daysToSeconds(this.MIN_VOTING_PERIOD_DAYS));
    });

    it('should end after MIN_VOTING_PERIOD_DAYS when poll result is 100% deny', async function () {
      const expectPollEnd = expectPollEndDate(this.contracts);

      // 1 wei accept, 10 x payout amount deny
      const payoutImpact = parseEther('100');
      const poll = {
        accepted: One,
        denied: payoutImpact.mul('10'),
        start: 0,
        end: 0,
      };
      await expectPollEnd(poll, payoutImpact, poll.start + daysToSeconds(this.MIN_VOTING_PERIOD_DAYS));
    });

    it('should end after MAX_VOTING_PERIOD_DAYS when poll result is 50% deny, 50% accept', async function () {
      const expectPollEnd = expectPollEndDate(this.contracts);

      const payoutImpact = parseEther('100');
      const poll = {
        accepted: payoutImpact.mul('10'),
        denied: payoutImpact.mul('10'),
        start: 0,
        end: 0,
      };
      await expectPollEnd(poll, payoutImpact, poll.start + daysToSeconds(this.MAX_VOTING_PERIOD_DAYS));
    });

    it('should increase from MIN_VOTING_PERIOD_DAYS to MAX_VOTING_PERIOD_DAYS as the poll result gets closer to 50%-50%', async function () {
      const expectPollEnd = expectPollEndDate(this.contracts);
      const durationByConsensus = getDurationByConsensus(this.MIN_VOTING_PERIOD_DAYS, this.MAX_VOTING_PERIOD_DAYS);
      const expectIncrease = (prev, curr) => {
        assert(prev < curr, `Expected current duration ${curr} to be grater than the previous one ${prev}`);
      };

      {
        // From 100% accept to 50%-50%
        const payoutImpact = parseEther('100');
        const poll = {
          accepted: Zero,
          denied: Zero,
          start: 0,
          end: 0,
        };

        const voters = [
          ['ACCEPTED', payoutImpact.mul(10)], // 100 - 0
          ['DENIED', payoutImpact], // 90.90 - 9.09
          ['DENIED', payoutImpact], // 83.33 - 16.66
          ['DENIED', payoutImpact], // 76.92 - 23.08
          ['DENIED', payoutImpact], // 71.42 - 28.75
          ['DENIED', payoutImpact], // 66.66 - 33.33
          ['DENIED', payoutImpact.mul(5)], // 50 - 50
        ];

        let prev = poll.end;
        for (const voter of voters) {
          const [vote, tokenWeight] = voter;
          if (vote === 'ACCEPTED') {
            poll.accepted = poll.accepted.add(tokenWeight);
          } else {
            poll.denied = poll.denied.add(tokenWeight);
          }
          const curr = durationByConsensus(poll);
          await expectPollEnd(poll, payoutImpact, poll.start + curr);
          expectIncrease(prev, curr);
          prev = curr;
        }
      }

      {
        // From 100% accept to 50%-50%
        const payoutImpact = parseEther('100');
        const poll = {
          accepted: One,
          denied: Zero,
          start: 0,
          end: 0,
        };

        const voters = [
          ['DENIED', payoutImpact.mul(10)], // 100 - 0
          ['ACCEPTED', payoutImpact], // 90.90 - 9.09
          ['ACCEPTED', payoutImpact], // 83.33 - 16.66
          ['ACCEPTED', payoutImpact], // 76.92 - 23.08
          ['ACCEPTED', payoutImpact], // 71.42 - 28.75
          ['ACCEPTED', payoutImpact], // 66.66 - 33.33
          ['ACCEPTED', payoutImpact.mul(5)], // 50 - 50
        ];

        let prev = poll.end;
        for (const voter of voters) {
          const [vote, tokenWeight] = voter;
          if (vote === 'ACCEPTED') {
            poll.accepted = poll.accepted.add(tokenWeight);
          } else {
            poll.denied = poll.denied.add(tokenWeight);
          }
          const curr = durationByConsensus(poll);
          await expectPollEnd(poll, payoutImpact, poll.start + curr);
          expectIncrease(prev, curr);
          prev = curr;
        }
      }
    });
  });
});
