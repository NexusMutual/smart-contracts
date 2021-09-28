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

describe('redeemCoverForDeniedClaim', function () {
  it('reverts if cover was already redeemed', async function () {
    assert(false, '[todo]');
  });

  it('reverts if a payout can still be claimed', async function () {
    assert(false, '[todo]');
  });

  it('reverts if the claim is not denied', async function () {
    assert(false, '[todo]');
  });

  it('reverts if the claim is in cooldown period', async function () {
    assert(false, '[todo]');
  });

  it('reverts if the assessment deposit transfer to pool fails', async function () {
    assert(false, '[todo]');
  });

  it("sets the claim's coverRedeemed property to true", async function () {
    assert(false, '[todo]');
  });

  it('transfers the cover NFT back to the claimant', async function () {
    assert(false, '[todo]');
  });
});
