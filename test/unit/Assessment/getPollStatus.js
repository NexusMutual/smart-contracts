const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { setNextBlockTime, mineNextBlock } = require('../../utils/evm');
const { assert } = require('chai');

const { daysToSeconds, getPollStruct, STATUS } = require('./helpers');

const { parseEther } = ethers.utils;

const formatStatus = x =>
  (x === STATUS.PENDING && 'PENDING') || (x === STATUS.ACCEPTED && 'ACCEPTED') || (x === STATUS.DENIED && 'DENIED');

const expectStatus = assessmentVoteLibTest => async (poll, expected) => {
  const status = await assessmentVoteLibTest._getPollStatus(getPollStruct(poll));
  assert(status === expected, `Expected status to be ${formatStatus(expected)} but got ${formatStatus(status)}`);
};

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('_getPollStatus', function () {
  it('should return PENDING when the poll is still open', async function () {
    const { assessmentVoteLibTest } = this.contracts;
    const expect = expectStatus(assessmentVoteLibTest);

    const timestamp = await time.latest();
    const poll = {
      accepted: 0,
      denied: 0,
      start: timestamp.toNumber(),
      end: timestamp.toNumber() + daysToSeconds(3),
    };
    await expect(poll, STATUS.PENDING);

    await setTime(poll.start + daysToSeconds(1));
    await expect(poll, STATUS.PENDING);

    await setTime(poll.start + daysToSeconds(2));
    await expect(poll, STATUS.PENDING);

    await setTime(poll.start + daysToSeconds(3) - 1);
    await expect(poll, STATUS.PENDING);

    poll.accepted = parseEther('10');
    poll.start = timestamp.toNumber();
    poll.end = timestamp.toNumber() + daysToSeconds(7);

    await setTime(poll.start + daysToSeconds(4));
    await expect(poll, STATUS.PENDING);

    await setTime(poll.start + daysToSeconds(5));
    await expect(poll, STATUS.PENDING);

    poll.denied = parseEther('10');

    await setTime(poll.start + daysToSeconds(6));
    await expect(poll, STATUS.PENDING);

    await setTime(poll.start + daysToSeconds(7) - 1);
    await expect(poll, STATUS.PENDING);
  });

  it('should return DENIED when the poll ends with no votes', async function () {
    const { assessmentVoteLibTest } = this.contracts;
    const expect = expectStatus(assessmentVoteLibTest);

    const timestamp = await time.latest();
    const poll = {
      accepted: 0,
      denied: 0,
      start: timestamp.toNumber(),
      end: timestamp.toNumber() + daysToSeconds(3),
    };
    await expect(poll, STATUS.PENDING);

    await setTime(poll.start + daysToSeconds(3));
    await expect(poll, STATUS.DENIED);
  });

  it('should return DENIED when the poll ends with denied >= accepted', async function () {
    const { assessmentVoteLibTest } = this.contracts;
    const expect = expectStatus(assessmentVoteLibTest);

    {
      const timestamp = await time.latest();
      const poll = {
        accepted: parseEther('10'),
        denied: parseEther('100'),
        start: timestamp.toNumber(),
        end: timestamp.toNumber() + daysToSeconds(3),
      };
      await expect(poll, STATUS.PENDING);

      await setTime(poll.start + daysToSeconds(3));
      await expect(poll, STATUS.DENIED);
    }

    {
      const timestamp = await time.latest();
      const poll = {
        accepted: parseEther('50'),
        denied: parseEther('50'),
        start: timestamp.toNumber(),
        end: timestamp.toNumber() + daysToSeconds(3),
      };
      await expect(poll, STATUS.PENDING);

      await setTime(poll.start + daysToSeconds(3));
      await expect(poll, STATUS.DENIED);
    }
  });

  it('should return ACCEPTED when the poll ends with accepted > denied', async function () {
    const { assessmentVoteLibTest } = this.contracts;
    const expect = expectStatus(assessmentVoteLibTest);

    const timestamp = await time.latest();
    const poll = {
      accepted: parseEther('100'),
      denied: parseEther('10'),
      start: timestamp.toNumber(),
      end: timestamp.toNumber() + daysToSeconds(3),
    };
    await expect(poll, STATUS.PENDING);

    await setTime(poll.start + daysToSeconds(3));
    await expect(poll, STATUS.ACCEPTED);
  });
});
