const { ethers } = require('hardhat');
const { assert } = require('chai');
const expectRevert = require('@openzeppelin/test-helpers/src/expectRevert');

const { getDurationByTokenWeight, getDurationByConsensus, daysToSeconds } = require('./helpers');

const { parseEther } = ethers.utils;
const { Zero, One } = ethers.constants;

const expectPollEndDate = ({ contracts, config }) => async (poll, expectedPayout, expected) => {
  const { assessmentVoteLibTest } = contracts;
  const pollEnd = await assessmentVoteLibTest._calculatePollEndDate(config, poll, expectedPayout);
  assert(
    pollEnd === expected,
    `Expected pollEnd to be ${expected} (${new Date(expected * 1000).toUTCString()}) but got ${pollEnd} (${new Date(
      pollEnd * 1000,
    ).toUTCString()})`,
  );
};

describe('_calculatePollEndDate', function () {
  it('reverts when given a poll with no votes', async function () {
    const { assessmentVoteLibTest } = this.contracts;
    const expectedPayout = parseEther('100');
    const poll = {
      accepted: 0,
      denied: 0,
      start: 0,
      end: 0,
    };

    await expectRevert.unspecified(assessmentVoteLibTest._calculatePollEndDate(this.config, poll, expectedPayout));
  });

  it('returns the maximum between consensus-driven end and token-driven end', async function () {
    const expectPollEnd = expectPollEndDate(this);
    const durationByTokenWeight = getDurationByTokenWeight(this);
    const durationByConsensus = getDurationByConsensus(this);

    const expectedPayout = parseEther('100');

    const poll = {
      accepted: expectedPayout,
      denied: Zero,
      start: 0,
      end: 0,
    };

    {
      const totalTokens = poll.accepted.add(poll.denied);
      await expectPollEnd(
        poll,
        expectedPayout,
        poll.start + Math.max(durationByConsensus(poll), durationByTokenWeight(totalTokens, expectedPayout)),
      );
    }

    const voters = [
      ['DENIED', expectedPayout],
      ['DENIED', expectedPayout.mul(2)],
      ['DENIED', expectedPayout],
      ['DENIED', expectedPayout.mul(3)],
      ['ACCEPTED', expectedPayout.mul(3)],
      ['ACCEPTED', expectedPayout.mul(10)],
      ['DENIED', expectedPayout.mul(10)],
      ['ACCEPTED', expectedPayout.mul(10)],
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
        expectedPayout,
        poll.start + Math.max(durationByConsensus(poll), durationByTokenWeight(totalTokens, expectedPayout)),
      );
    }
  });

  describe('if poll result is either 100% accept or 100% deny', () => {
    it('decreases from maxVotingPeriodDays to minVotingPeriodDays as more tokens are used to vote', async function () {
      const expectPollEnd = expectPollEndDate(this);
      const durationByTokenWeight = getDurationByTokenWeight(this);
      const expectDecrease = (prev, curr) => {
        assert(prev > curr, `Expected current duration ${curr} to be less than the previous one ${prev}`);
      };

      const expectedPayout = parseEther('100');

      const poll = {
        accepted: expectedPayout,
        denied: Zero,
        start: 0,
        end: 0,
      };
      const totalTokens = poll.accepted.add(poll.denied);
      await expectPollEnd(poll, expectedPayout, poll.start + durationByTokenWeight(totalTokens, expectedPayout));
      let prev = durationByTokenWeight(totalTokens, expectedPayout);

      const voters = [
        ['ACCEPTED', expectedPayout.div(4)], // 1.25x
        ['ACCEPTED', expectedPayout.div(4)], // 1.50x
        ['ACCEPTED', expectedPayout.div(2)], // 2.00x
        ['ACCEPTED', expectedPayout], // 3.00x
        ['ACCEPTED', expectedPayout], // 4.00x
        ['ACCEPTED', expectedPayout], // 5.00x
        ['ACCEPTED', expectedPayout.mul(15).div(10)], // 6.50x
        ['ACCEPTED', expectedPayout.mul(15).div(10)], // 8.00x
        ['ACCEPTED', expectedPayout.mul(2)], // 10.00x
      ];

      for (const voter of voters) {
        const [vote, tokenWeight] = voter;
        if (vote === 'ACCEPTED') {
          poll.accepted = poll.accepted.add(tokenWeight);
        } else {
          poll.denied = poll.denied.add(tokenWeight);
        }
        const totalTokens = poll.accepted.add(poll.denied);
        const curr = durationByTokenWeight(totalTokens, expectedPayout);
        await expectPollEnd(poll, expectedPayout, poll.start + durationByTokenWeight(totalTokens, expectedPayout));
        expectDecrease(prev, curr);
        prev = curr;
      }
    });

    it('ends after minVotingPeriodDays no matter how many more tokens beyond 10x expected payout have been used to vote', async function () {
      const expectPollEnd = expectPollEndDate(this);

      const expectedPayout = parseEther('100');
      const poll = {
        accepted: expectedPayout.mul('20'),
        denied: Zero,
        start: 0,
        end: 0,
      };

      await expectPollEnd(poll, expectedPayout, poll.start + daysToSeconds(this.config.minVotingPeriodDays));
    });
  });

  describe('if tokens used for voting >= 10x expected payout', () => {
    it('ends after minVotingPeriodDays when poll result is 100% accept', async function () {
      const expectPollEnd = expectPollEndDate(this);

      const expectedPayout = parseEther('100');
      const poll = {
        accepted: expectedPayout.mul('10'),
        denied: Zero,
        start: 0,
        end: 0,
      };

      await expectPollEnd(poll, expectedPayout, poll.start + daysToSeconds(this.config.minVotingPeriodDays));

      poll.accepted = poll.accepted.add(expectedPayout.mul('10'));
      await expectPollEnd(poll, expectedPayout, poll.start + daysToSeconds(this.config.minVotingPeriodDays));
    });

    it('ends after minVotingPeriodDays when poll result is 100% deny', async function () {
      const expectPollEnd = expectPollEndDate(this);

      // 1 wei accept, 10 x payout amount deny
      const expectedPayout = parseEther('100');
      const poll = {
        accepted: One,
        denied: expectedPayout.mul('10'),
        start: 0,
        end: 0,
      };
      await expectPollEnd(poll, expectedPayout, poll.start + daysToSeconds(this.config.minVotingPeriodDays));
    });

    it('ends after maxVotingPeriodDays when poll result is 50% deny, 50% accept', async function () {
      const expectPollEnd = expectPollEndDate(this);

      const expectedPayout = parseEther('100');
      const poll = {
        accepted: expectedPayout.mul('10'),
        denied: expectedPayout.mul('10'),
        start: 0,
        end: 0,
      };
      await expectPollEnd(poll, expectedPayout, poll.start + daysToSeconds(this.config.maxVotingPeriodDays));
    });

    it('increases from minVotingPeriodDays to maxVotingPeriodDays as the poll result gets closer to 50%-50%', async function () {
      const expectPollEnd = expectPollEndDate(this);
      const durationByConsensus = getDurationByConsensus(this);
      const expectIncrease = (prev, curr) => {
        assert(prev < curr, `Expected current duration ${curr} to be grater than the previous one ${prev}`);
      };

      {
        // From 100% accept to 50%-50%
        const expectedPayout = parseEther('100');
        const poll = {
          accepted: Zero,
          denied: Zero,
          start: 0,
          end: 0,
        };

        const voters = [
          ['ACCEPTED', expectedPayout.mul(10)], // 100 - 0
          ['DENIED', expectedPayout], // 90.90 - 9.09
          ['DENIED', expectedPayout], // 83.33 - 16.66
          ['DENIED', expectedPayout], // 76.92 - 23.08
          ['DENIED', expectedPayout], // 71.42 - 28.75
          ['DENIED', expectedPayout], // 66.66 - 33.33
          ['DENIED', expectedPayout.mul(5)], // 50 - 50
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
          await expectPollEnd(poll, expectedPayout, poll.start + curr);
          expectIncrease(prev, curr);
          prev = curr;
        }
      }

      {
        // From 100% accept to 50%-50%
        const expectedPayout = parseEther('100');
        const poll = {
          accepted: One,
          denied: Zero,
          start: 0,
          end: 0,
        };

        const voters = [
          ['DENIED', expectedPayout.mul(10)], // 100 - 0
          ['ACCEPTED', expectedPayout], // 90.90 - 9.09
          ['ACCEPTED', expectedPayout], // 83.33 - 16.66
          ['ACCEPTED', expectedPayout], // 76.92 - 23.08
          ['ACCEPTED', expectedPayout], // 71.42 - 28.75
          ['ACCEPTED', expectedPayout], // 66.66 - 33.33
          ['ACCEPTED', expectedPayout.mul(5)], // 50 - 50
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
          await expectPollEnd(poll, expectedPayout, poll.start + curr);
          expectIncrease(prev, curr);
          prev = curr;
        }
      }
    });
  });
});
