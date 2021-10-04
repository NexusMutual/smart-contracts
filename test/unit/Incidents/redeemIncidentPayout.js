const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { assert, expect } = require('chai');

const { submitClaim, daysToSeconds, ASSET, setTime } = require('./helpers');

const { parseEther, formatEther } = ethers.utils;

describe.only('redeemIncidentPayout', function () {
  it('reverts if the incident is not accepted', async function () {
    const { incidents, assessment } = this.contracts;
    const [member1, member2] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;

    {
      const productId = 2;
      const currentTime = await time.latest();
      await incidents.connect(advisoryBoard).submitIncident(productId, parseEther('1.1'), currentTime.toNumber());
    }

    await expect(incidents.connect(member1).redeemIncidentPayout(0, 0, parseEther('1'))).to.be.revertedWith(
      'The incident must be accepted',
    );

    await assessment.connect(member1).castVote(0, true, parseEther('100'));
    await assessment.connect(member2).castVote(0, false, parseEther('100'));

    {
      const currentTime = await time.latest();
      await setTime(currentTime.toNumber() + daysToSeconds(1));
    }

    await expect(incidents.connect(member1).redeemIncidentPayout(0, 0, parseEther('1'))).to.be.revertedWith(
      'The incident must be accepted',
    );

    {
      const currentTime = await time.latest();
      await setTime(currentTime.toNumber() + daysToSeconds(10));
    }

    await expect(incidents.connect(member1).redeemIncidentPayout(0, 0, parseEther('1'))).to.be.revertedWith(
      'The incident must be accepted',
    );
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
