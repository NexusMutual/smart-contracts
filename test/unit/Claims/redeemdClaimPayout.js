const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { assert, expect } = require('chai');

const { submitClaim, daysToSeconds, ASSET } = require('./helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');

const { parseEther, formatEther } = ethers.utils;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('redeemdClaimPayout', function () {
  it('reverts if the claim is denied', async function () {
    assert(false, '[todo]');
  });

  it('reverts if the claim is in cooldown period', async function () {
    assert(false, '[todo]');
  });

  it('reverts if the redemption period expired', async function () {
    assert(false, '[todo]');
  });

  it('reverts if a payout has already been redeemed', async function () {
    assert(false, '[todo]');
  });

  it('reverts if payout fails', async function () {
    assert(false, '[todo]');
  });

  it("sets the claim's payoutRedeemed property to true", async function () {
    assert(false, '[todo]');
  });
});
