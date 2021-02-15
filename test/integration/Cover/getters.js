const { accounts, web3 } = require('hardhat');
const { assert } = require('chai');
const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
const { hex } = require('../utils').helpers;
const { buyCover, ethCoverTemplate, getBuyCoverDataParameter, voteOnClaim } = require('./utils');
const { Assets: { ETH } } = require('../utils').constants;

const [, member1, member2] = accounts;

const EMPTY_DATA = web3.eth.abi.encodeParameters([], []);

describe('getters', function () {

  beforeEach(async function () {
    await enrollMember(this.contracts, [member1, member2]);
    await enrollClaimAssessor(this.contracts, [member2]);
  });

  describe('getCoverPrice', function () {

    it('retrieves the signed quote price', async function () {
      const { cover } = this.contracts;
      const coverData = { ...ethCoverTemplate };

      // encoded data and signature uses unit price.
      const data = await getBuyCoverDataParameter({ ...this.contracts, coverData });

      const retrievedPrice = await cover.getCoverPrice(
        coverData.contractAddress,
        coverData.asset,
        coverData.amount,
        coverData.period,
        coverData.type,
        data,
      );

      assert.equal(retrievedPrice.toString(), coverData.price);
    });
  });

  describe('getPayoutOutcome', function () {

    it('returns the payout outcome for a cover with a newly opened claim', async function () {
      const { cover } = this.contracts;
      const member = member1;
      const coverData = { ...ethCoverTemplate };

      await buyCover({ ...this.contracts, coverData, coverHolder: member });
      const expectedCoverId = 1;
      await cover.submitClaim(expectedCoverId, EMPTY_DATA, { from: member1 });
      const expectedClaimId = 1;

      const { completed, amountPaid, coverAsset } = await cover.getPayoutOutcome(expectedClaimId);
      assert.equal(completed, false);
      assert.equal(amountPaid.toString(), '0');
      assert.equal(coverAsset, ETH);
    });

    it('returns the payout outcome for an expired claim', async function () {
      const { cover } = this.contracts;
      const member = member1;
      const coverData = { ...ethCoverTemplate };

      await buyCover({ ...this.contracts, coverData, coverHolder: member });
      const expectedCoverId = 1;
      await cover.submitClaim(expectedCoverId, EMPTY_DATA, { from: member1 });
      const expectedClaimId = 1;

      const { completed, amountPaid, coverAsset } = await cover.getPayoutOutcome(expectedClaimId);
      assert.equal(completed, false);
      assert.equal(amountPaid.toString(), '0');
      assert.equal(coverAsset, ETH);
    });

    it('returns the payout outcome for an accepted claim', async function () {
      const { cover } = this.contracts;
      const member = member1;
      const coverData = { ...ethCoverTemplate };

      await buyCover({ ...this.contracts, coverData, coverHolder: member });
      const expectedCoverId = 1;
      await cover.submitClaim(expectedCoverId, EMPTY_DATA, { from: member1 });
      const expectedClaimId = 1;
      await voteOnClaim({ ...this.contracts, claimId: expectedClaimId, verdict: '1', voter: member2 });

      const { completed, amountPaid, coverAsset } = await cover.getPayoutOutcome(expectedClaimId);
      assert.equal(completed, true);
      assert.equal(amountPaid.toString(), coverData.amount.toString());
      assert.equal(coverAsset, ETH);
    });

    it('returns the payout outcome for a rejected claim', async function () {
      const { cover } = this.contracts;
      const member = member1;
      const coverData = { ...ethCoverTemplate };

      await buyCover({ ...this.contracts, coverData, coverHolder: member });
      const expectedCoverId = 1;
      await cover.submitClaim(expectedCoverId, EMPTY_DATA, { from: member1 });
      const expectedClaimId = 1;
      await voteOnClaim({ ...this.contracts, claimId: expectedClaimId, verdict: '-1', voter: member2 });

      const { completed, amountPaid, coverAsset } = await cover.getPayoutOutcome(expectedClaimId);
      assert.equal(completed, false);
      assert.equal(amountPaid.toString(), '0');
      assert.equal(coverAsset, ETH);
    });
  });

  describe('getCover', async function () {
    it('returns cover data', async function () {
      const { cover } = this.contracts;
      const member = member1;
      const coverData = { ...ethCoverTemplate };

      await buyCover({ ...this.contracts, coverData, coverHolder: member });
      const expectedCoverId = 1;

      const stored = await cover.getCover(expectedCoverId);
      assert.equal(stored.sumAssured.toString(), coverData.amount.toString());
      assert.equal(stored.coverPeriod.toString(), coverData.period);
      assert.equal(stored.contractAddress, coverData.contractAddress);
      assert.equal(stored.coverAsset, coverData.asset);
      assert.equal(stored.premiumInNXM.toString(), coverData.priceNXM);
      assert.equal(stored.memberAddress, member);
      assert.equal(stored.status.toString(), '0');
    });
  });
});
