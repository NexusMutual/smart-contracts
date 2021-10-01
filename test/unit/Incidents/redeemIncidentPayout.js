const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { assert, expect } = require('chai');

const { submitClaim, daysToSeconds, ASSET } = require('./helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');

const { parseEther, formatEther } = ethers.utils;

describe.only('redeemIncidentPayout', function () {
  it.only('reverts if the incident is not accepted', async function () {
    const { incidents } = this.contracts;
    const [member] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;

    {
      const productId = 0;
      const currentTime = await time.latest();
      incidents.connect(advisoryBoard).submitIncident(productId, parseEther('1.1'), currentTime.toNumber());
    }

    {
      await expect(incidents.connect(member).redeemIncidentPayout(0, 0, parseEther('1'))).to.be.revertedWith(
        'The incident must be accepted',
      );
    }
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
