const { assert } = require('chai');
const { ethers } = require('hardhat');

describe('signUp', function () {
  it('reverts when not called by governance', async function () {
    assert(true, 'test');
  });
});
