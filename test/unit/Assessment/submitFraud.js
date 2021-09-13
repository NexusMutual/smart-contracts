const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { submitClaim, EVENT_TYPE, daysToSeconds } = require('./helpers');

describe('submitFraud', function () {
  it('can only be called by governance contract', async function () {
    assert(false, '[todo]');
  });

  it('stores a merkle tree root hash used to resolve fraud', async function () {
    assert(false, '[todo]');
  });
});
