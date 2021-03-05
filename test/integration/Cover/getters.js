const { accounts, web3, artifacts } = require('hardhat');
const { assert } = require('chai');
const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
const { hex } = require('../utils').helpers;
const { buyCover, ethCoverTemplate, daiCoverTemplate, getBuyCoverDataParameter, voteOnClaim } = require('./utils');
const { ether, time, expectRevert } = require('@openzeppelin/test-helpers');
const { Assets: { ETH } } = require('../utils').constants;
const { toBN } = web3.utils;

const Cover = artifacts.require('Cover');
const EtherRejecter = artifacts.require('EtherRejecter');

const ClaimStatus = {
  IN_PROGRESS: '0',
  ACCEPTED: '1',
  REJECTED: '2'
}

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

      const { status, amountPaid, coverAsset } = await cover.getPayoutOutcome(expectedCoverId, expectedClaimId);
      assert.equal(status.toString(), ClaimStatus.IN_PROGRESS);
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

      const { status, amountPaid, coverAsset } = await cover.getPayoutOutcome(expectedCoverId, expectedClaimId);
      assert.equal(status.toString(), ClaimStatus.IN_PROGRESS);
      assert.equal(amountPaid.toString(), '0');
      assert.equal(coverAsset, ETH);
    });

    it('returns the payout outcome for an accepted ETH claim', async function () {
      const { cover } = this.contracts;
      const member = member1;
      const coverData = { ...ethCoverTemplate };

      await buyCover({ ...this.contracts, coverData, coverHolder: member });
      const expectedCoverId = 1;
      await cover.submitClaim(expectedCoverId, EMPTY_DATA, { from: member1 });
      const expectedClaimId = 1;
      await voteOnClaim({ ...this.contracts, claimId: expectedClaimId, verdict: '1', voter: member2 });

      const { status, amountPaid, coverAsset } = await cover.getPayoutOutcome(expectedCoverId, expectedClaimId);
      assert.equal(status.toString(), ClaimStatus.ACCEPTED);
      assert.equal(amountPaid.toString(), coverData.amount.toString());
      assert.equal(coverAsset, ETH);
    });

    it('returns the payout outcome for an accepted ETH claim and an accepted DAI claim', async function () {
      const { cover, dai, ps } = this.contracts;
      const member = member1;
      const coverData = { ...ethCoverTemplate };

      {
        await buyCover({ ...this.contracts, coverData, coverHolder: member });
        const expectedCoverId = 1;
        await cover.submitClaim(expectedCoverId, EMPTY_DATA, { from: member1 });
        const expectedClaimId = 1;
        await voteOnClaim({ ...this.contracts, claimId: expectedClaimId, verdict: '1', voter: member2 });

        const {status, amountPaid, coverAsset} = await cover.getPayoutOutcome(expectedCoverId, expectedClaimId);
        assert.equal(status.toString(), ClaimStatus.ACCEPTED);
        assert.equal(amountPaid.toString(), coverData.amount.toString());
        assert.equal(coverAsset, ETH);
      }

      await ps.processPendingActions('1000');

      {
        await dai.mint(member, ether('25000'));
        const coverData = { ...daiCoverTemplate, asset: dai.address };
        await buyCover({ ...this.contracts, coverData, coverHolder: member });
        const expectedCoverId = 2;
        await cover.submitClaim(expectedCoverId, EMPTY_DATA, { from: member1 });
        const expectedClaimId = 2;
        await voteOnClaim({ ...this.contracts, claimId: expectedClaimId, verdict: '1', voter: member2 });

        const { status, amountPaid, coverAsset } = await cover.getPayoutOutcome(expectedCoverId, expectedClaimId);
        assert.equal(status.toString(), ClaimStatus.ACCEPTED);
        assert.equal(amountPaid.toString(), coverData.amount.toString());
        assert.equal(coverAsset, dai.address);
      }
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

      const { status, amountPaid, coverAsset } = await cover.getPayoutOutcome(expectedCoverId, expectedClaimId);
      assert.equal(status, ClaimStatus.REJECTED);
      assert.equal(amountPaid.toString(), '0');
      assert.equal(coverAsset, ETH);
    });

    it('returns claim status IN_PROGRESS if voting has been accepted but claim has not been closed', async function () {
      const { cover, cl, cd } = this.contracts;
      const member = member1;
      const coverData = { ...ethCoverTemplate };

      await buyCover({ ...this.contracts, coverData, coverHolder: member });
      const expectedCoverId = 1;
      await cover.submitClaim(expectedCoverId, EMPTY_DATA, { from: member1 });
      const claimId = 1;

      const verdict = '1';
      await cl.submitCAVote(claimId, verdict, { from: member2 });
      const minVotingTime = await cd.minVotingTime();
      await time.increase(minVotingTime.addn(1));

      const voteStatusBefore = await cl.checkVoteClosing(claimId);
      assert.equal(voteStatusBefore.toString(), '1', 'should allow vote closing');

      const { status, amountPaid, coverAsset } = await cover.getPayoutOutcome(expectedCoverId, claimId);
      assert.equal(status, ClaimStatus.IN_PROGRESS);
      assert.equal(amountPaid.toString(), '0');
      assert.equal(coverAsset, ETH);
    });

    it('reverts if cover does not exist', async function () {
      const { cover } = this.contracts;
      const coverId = 1;
      const claimId = 1;
      await expectRevert(cover.getPayoutOutcome(coverId, claimId), 'VM Exception while processing transaction: invalid opcode');
    });

    it('reverts if claim does not exist', async function () {
      const { cover, cl, cd } = this.contracts;
      const member = member1;
      const coverData = { ...ethCoverTemplate };
      await buyCover({ ...this.contracts, coverData, coverHolder: member });
      const coverId = 1;
      const claimId = 1;
      await expectRevert(cover.getPayoutOutcome(coverId, claimId), 'VM Exception while processing transaction: invalid opcode');
    });

    it('reverts if cover and claim id does not match', async function () {
      const { cover, cl, cd } = this.contracts;
      const member = member1;
      const coverData = { ...ethCoverTemplate };
      await buyCover({ ...this.contracts, coverData, coverHolder: member });
      const coverId = 1;
      await cover.submitClaim(coverId, EMPTY_DATA, { from: member1 });
      const claimId = 1;
      await expectRevert(cover.getPayoutOutcome(2, claimId), 'Cover: cover and claim ids don\'t match');
    });

    it('returns claim status ACCEPTED with no payout if all payout attempts failed', async function () {
      const { cd, cl, qd, mr, master, dai, cover } = this.contracts;
      const coverData = { ...ethCoverTemplate };
      const coverHolder = member1;

      const rejecter = await EtherRejecter.new();
      const payoutAddress = rejecter.address;
      await mr.setClaimPayoutAddress(payoutAddress, { from: coverHolder });

      await buyCover({ ...this.contracts, coverData, coverHolder });
      const [coverId] = await qd.getAllCoversOfUser(coverHolder);
      await cl.submitClaim(coverId, { from: coverHolder });
      const claimId = (await cd.actualClaimLength()).subn(1);
      await cl.submitCAVote(claimId, '1', { from: member2 });

      const minVotingTime = await cd.minVotingTime();
      await time.increase(minVotingTime.addn(1));

      await master.closeClaim(claimId);

      const payoutRetryTime = await cd.payoutRetryTime();
      for (let i = 0; i <= 60; i++) {
        await time.increase(payoutRetryTime.addn(1));
        await master.closeClaim(claimId);
      }

      const { statno: finalClaimStatus } = await cd.getClaimStatusNumber(claimId);
      assert.strictEqual(finalClaimStatus.toNumber(), 13, 'claim status should be 13 (Claim Accepted No Payout)');

      const { status, amountPaid, coverAsset } = await cover.getPayoutOutcome(coverId, claimId);
      assert.equal(status, ClaimStatus.ACCEPTED);
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
