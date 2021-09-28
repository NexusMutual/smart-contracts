const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { assert, expect } = require('chai');

const { submitClaim, daysToSeconds, ASSET } = require('./helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');

const { parseEther, formatEther } = ethers.utils;

describe('redeemIncidentPayout', function () {
  it('reverts if the incident is not accepted', async function () {
    assert(false, '[todo]');
  });

  it("reverts if the voting and cooldown period haven't ended", async function () {
    assert(false, '[todo]');
  });

  it('reverts if the redemption period expired', async function () {
    assert(false, '[todo]');
  });

  it('reverts if the amount exceeds the sum assured', async function () {
    assert(false, '[todo]');
  });

  it('reverts if the payout exceeds the covered amount', async function () {
    assert(false, '[todo]');
  });

  it('reverts if the cover ends before the incident occured', async function () {
    assert(false, '[todo]');
  });

  it('reverts if the cover starts after or when the incident occured', async function () {
    assert(false, '[todo]');
  });

  it('reverts if the cover is outside the grave period', async function () {
    assert(false, '[todo]');
  });

  it("reverts if the cover's productId mismatches the incident's productId", async function () {
    assert(false, '[todo]');
  });

  it("reverts if the cover's productId mismatches the incident's productId", async function () {
    assert(false, '[todo]');
  });

  it('reverts if the payout fails', async function () {
    assert(false, '[todo]');
  });

  it('transfers the deductible amount of the payout asset to the cover owner, according to the sent amount and priceBefore', async function () {
    assert(false, '[todo]');
  });
});
