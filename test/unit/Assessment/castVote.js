const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { submitClaim, EVENT_TYPE, daysToSeconds } = require('./helpers');

describe('castVote', function () {
  it('reverts if proof is invalid', async function () {
    assert(false, '[todo]');
  });
});
