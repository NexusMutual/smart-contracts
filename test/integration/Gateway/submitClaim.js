const { accounts, web3 } = require('hardhat');
const { expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
const { hex } = require('../utils').helpers;
const { buyCover, ethCoverTemplate, daiCoverTemplate } = require('./utils');
const { toBN } = Web3.utils;

const [, member1, member2, member3, coverHolder, nonMember1] = accounts;

const EMPTY_DATA = web3.eth.abi.encodeParameters([], []);

async function voteOnClaim ({ verdict, claimId, master, cd, cl, cr }) {

  await cl.submitCAVote(claimId, verdict, { from: member1 });

  const minVotingTime = await cd.minVotingTime();
  await time.increase(minVotingTime.addn(1));

  const voteStatusBefore = await cl.checkVoteClosing(claimId);
  assert.equal(voteStatusBefore.toString(), '1', 'should allow vote closing');

  await cr.closeClaim(claimId);
  const voteStatusAfter = await cl.checkVoteClosing(claimId);
  assert(voteStatusAfter.eqn(-1), 'voting should be closed');
}

describe('submitClaim', function () {

  beforeEach(async function () {
    await enrollMember(this.contracts, [member1, member2, member3, coverHolder]);
  });

  it('reverts for non-existant cover id', async function () {
    const { gateway } = this.contracts;
    const member = member1;

    await expectRevert.assertion(
      gateway.submitClaim(1, EMPTY_DATA, {
        from: member,
      }),
    );
  });

  it('reverts for member that does not own the cover', async function () {
    const { gateway } = this.contracts;
    const coverData = { ...ethCoverTemplate };

    await buyCover({ ...this.contracts, coverData, coverHolder: member1 });

    await expectRevert(
      gateway.submitClaim(1, EMPTY_DATA, {
        from: member2,
      }),
      'Claims: Not cover owner',
    );
  });

  it('reverts for expired cover', async function () {
    const { qt, gateway, tc } = this.contracts;
    const coverData = { ...ethCoverTemplate };

    await buyCover({ ...this.contracts, coverData, coverHolder: member1 });
    const expectedCoverId = 1;
    const claimSubmissionGracePeriod = await tc.claimSubmissionGracePeriod();
    await time.increase((coverData.period + claimSubmissionGracePeriod.toNumber() + 1) * 24 * 3600);

    await qt.expireCover(expectedCoverId);

    await expectRevert(
      gateway.submitClaim(expectedCoverId, EMPTY_DATA, {
        from: member1,
      }),
      'Claims: Grace period has expired',
    );
  });

  it('creates a valid claim for a cover', async function () {
    const { gateway, cd: claimsData } = this.contracts;
    const coverData = { ...ethCoverTemplate };

    await buyCover({ ...this.contracts, coverData, coverHolder: member1 });
    const expectedCoverId = 1;
    const submitTx = await gateway.submitClaim(expectedCoverId, EMPTY_DATA, { from: member1 });

    const expectedClaimId = 1;
    await expectEvent(submitTx, 'ClaimSubmitted', {
      claimId: expectedClaimId.toString(),
      coverId: expectedCoverId.toString(),
      submitter: member1,
      data: null,
    });
    const block = await web3.eth.getBlock(submitTx.receipt.blockNumber);
    const claim = await claimsData.getClaim(expectedClaimId);

    assert.equal(claim.claimId.toString(), expectedClaimId.toString());
    assert.equal(claim.coverId.toString(), expectedCoverId.toString());
    assert.equal(claim.vote.toString(), '0');
    assert.equal(claim.status.toString(), '0');
    assert.equal(claim.dateUpd.toString(), block.timestamp.toString());
    assert.equal(claim.state12Count.toString(), '0');
  });

  it('reverts when another claim is in-progress', async function () {
    const { gateway } = this.contracts;
    const coverData = { ...ethCoverTemplate };

    await buyCover({ ...this.contracts, coverData, coverHolder: member1 });
    const expectedCoverId = 1;
    await gateway.submitClaim(expectedCoverId, EMPTY_DATA, { from: member1 });

    await expectRevert(
      gateway.submitClaim(expectedCoverId, EMPTY_DATA, { from: member1 }),
      'TokenController: Cover already has an open claim',
    );
  });

  it('creates 2 claims for cover and reverts on the 3rd attempt', async function () {
    const { gateway } = this.contracts;

    await enrollClaimAssessor(this.contracts, [member1, member2, member3]);

    const coverData = { ...ethCoverTemplate };

    await buyCover({ ...this.contracts, coverData, coverHolder: coverHolder });
    const expectedCoverId = 1;
    {
      await gateway.submitClaim(expectedCoverId, EMPTY_DATA, { from: coverHolder });
      const claimId = 1;
      await voteOnClaim({ ...this.contracts, claimId, verdict: toBN('-1') });
    }

    {
      await gateway.submitClaim(expectedCoverId, EMPTY_DATA, { from: coverHolder });
      const claimId = 2;
      await voteOnClaim({ ...this.contracts, claimId, verdict: toBN('-1') });
    }

    await expectRevert(
      gateway.submitClaim(expectedCoverId, EMPTY_DATA, { from: coverHolder }),
      'TokenController: Max claim count exceeded',
    );
  });
});
