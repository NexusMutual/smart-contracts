const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { submitClaim, EVENT_TYPE, daysToSeconds } = require('./helpers');

describe('processFraud', function () {
  it('reverts if proof is invalid', async function () {
    assert(false, '[todo]');
  });

  it("cancels the staker's votes from the last vote where the reward was withdrawn until lastFraudulentVoteIndex", async function () {
    assert(false, '[todo]');
  });

  it("cancels the staker's votes in batches", async function () {
    assert(false, '[todo]');
  });

  it('skips polls that are outside the cooldown period', async function () {
    assert(false, '[todo]');
  });

  it('extends the poll voting period by a maximum of 24h if it ends in less than 24h', async function () {
    assert(false, '[todo]');
  });

  it('emits an event for every cancelled vote', async function () {
    assert(false, '[todo]');
  });

  it("burns the fraudulent staker's stake by burnAmount up to the total amount staked", async function () {
    assert(false, '[todo]');
  });

  it("skips burning if the provided fraudCount doesn't match the staker's fraudCount", async function () {
    assert(false, '[todo]');
  });

  it("increases the fraudulent staker's fraudCount", async function () {
    assert(false, '[todo]');
  });

  it('sets rewardsWithdrawnUntilIndex to the last cancelled vote', async function () {
    assert(false, '[todo]');
  });

  it('consumes less gas to process than the summed fees of the fraudulent voting transactions', async function () {
    assert(false, '[todo]');
  });

  it('consumes less gas than the summed fees of the fraudulent voting transactions', async function () {
    assert(false, '[todo]');
  });
});
