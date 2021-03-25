const { accounts, web3 } = require('hardhat');
const { ether, expectRevert, time } = require('@openzeppelin/test-helpers');

const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');
const { buyCover } = require('../utils/buyCover');
const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
const { hex } = require('../utils').helpers;

const { toBN } = web3.utils;
const [, member1, member2, claimAssessor] = accounts;

const coverTemplate = {
  amount: 1, // 100 ETH
  price: ether('0.01'),
  priceNXM: '10000000000000000000', // 10 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('ETH'),
  period: 35,
  contractAddress: '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000',
};

const claimAndVote = async (contracts, coverId, member, assessor, accept) => {

  const { cl, cd, master } = contracts;

  await cl.submitClaim(coverId, { from: member });
  const claimId = (await cd.actualClaimLength()).subn(1);
  const submittedAt = await cd.getClaimDateUpd(claimId);
  const verdict = accept ? '1' : '-1';
  await cl.submitCAVote(claimId, verdict, { from: assessor });

  const maxVotingTime = await cd.maxVotingTime();
  await setNextBlockTime(submittedAt.add(maxVotingTime).toNumber());
  await master.closeClaim(claimId);

  const { statno: status } = await cd.getClaimStatusNumber(claimId);
  const expectedStatus = accept ? 14 : 6;
  assert(status.eqn(expectedStatus), `expected claim status ${expectedStatus}, got ${status}`);
};

describe('withdrawCoverNote', function () {

  beforeEach(async function () {
    await enrollMember(this.contracts, [member1, member2, claimAssessor]);
    await enrollClaimAssessor(this.contracts, [claimAssessor], { lockTokens: ether('2000') });
  });

  it('allows to withdrawCoverNote after grace period expiration', async function () {

    const { qd, qt, tc, tk, tf } = this.contracts;

    const cover = { ...coverTemplate };
    const balanceBefore = await tk.balanceOf(member1);

    const now = await time.latest();
    const coverPurchaseTime = now.addn(1);

    const coverPeriod = toBN(cover.period * 24 * 3600);
    const expectedCoverExpirationDate = coverPurchaseTime.add(coverPeriod);

    const gracePeriod = await tc.claimSubmissionGracePeriod();
    const expectedGracePeriodExpirationDate = expectedCoverExpirationDate.add(gracePeriod);

    await setNextBlockTime(coverPurchaseTime.toNumber());
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });

    const coverId = '1';
    const expectedCoverNoteAmount = toBN(cover.priceNXM).divn(10);
    const actualCoverNoteAmount = await tf.getUserLockedCNTokens(member1, coverId);
    assert(actualCoverNoteAmount.eq(expectedCoverNoteAmount), 'unexpected cover note amount');

    const lockReason = await tc.lockReason(member1, '0');
    const gracePeriodExpirationDate = await tc.getLockedTokensValidity(member1, lockReason);
    assert(
      gracePeriodExpirationDate.eq(expectedGracePeriodExpirationDate),
      'unexpected grace period expiration date',
    );

    // should not be able to withdraw while cover is active
    await expectRevert(
      qt.withdrawCoverNote(member1, [coverId], ['0']),
      'Quotation: cannot withdraw before grace period expiration',
    );

    const coverExpirationDate = await qd.getValidityOfCover(coverId);
    assert(expectedCoverExpirationDate.eq(coverExpirationDate), 'unexpected cover expiration date');

    await setNextBlockTime(coverExpirationDate.addn(1).toNumber());
    await mineNextBlock();

    // should not be able to withdraw during grace period
    await expectRevert(
      qt.withdrawCoverNote(member1, [coverId], ['0']),
      'Quotation: cannot withdraw before grace period expiration',
    );

    await qt.expireCover(coverId);

    await expectRevert(
      qt.withdrawCoverNote(member1, [coverId], ['0']),
      'Quotation: cannot withdraw before grace period expiration',
    );

    await setNextBlockTime(gracePeriodExpirationDate.toNumber() + 1);
    await mineNextBlock();

    assert(balanceBefore.eq(await tk.balanceOf(member1)), 'member balance has unexpectedly changed');

    await qt.withdrawCoverNote(member1, [coverId], ['0']);
    const balanceAfter = await tk.balanceOf(member1);

    assert(
      balanceBefore.add(expectedCoverNoteAmount).eq(balanceAfter),
      'balanceBefore + coverNote != balanceAfter',
    );
  });

  it('does not allow to withdrawCoverNote with an open claim', async function () {

    const { master, cd, cl, qt, tc, tk } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    const coverId = '1';
    const balanceBefore = await tk.balanceOf(member1);

    const lockReason = await tc.lockReason(member1, '0');
    const gracePeriodExpirationDate = await tc.getLockedTokensValidity(member1, lockReason);

    await setNextBlockTime(gracePeriodExpirationDate.subn(10).toNumber());
    await cl.submitClaim(coverId, { from: member1 });

    // we skip grace period to test for the open claim scenario.
    // when withdrawing the cover validity and grace period are checked first
    await setNextBlockTime(gracePeriodExpirationDate.addn(10).toNumber());
    await mineNextBlock();

    await expectRevert(
      qt.withdrawCoverNote(member1, [coverId], ['0']),
      'TokenController: Cannot withdraw for cover with an open claim',
    );

    const claimId = '1';
    const submittedAt = await cd.getClaimDateUpd(claimId);
    await cl.submitCAVote(claimId, '-1', { from: claimAssessor });

    const maxVotingTime = await cd.maxVotingTime();
    await setNextBlockTime(submittedAt.add(maxVotingTime).toNumber());
    await master.closeClaim(claimId);

    const { statno: status } = await cd.getClaimStatusNumber(claimId);
    assert.equal(status.toString(), '6'); // CA vote denied

    // make sure balance hasn't changed
    assert(balanceBefore.eq(await tk.balanceOf(member1)), 'member balance has unexpectedly changed');

    // should work after the claim was closed
    await qt.withdrawCoverNote(member1, [coverId], ['0']);
    const balanceAfter = await tk.balanceOf(member1);
    const expectedCoverNoteAmount = toBN(cover.priceNXM).muln(5).divn(100);

    // check that half of the initial CN deposit was returned
    assert(
      balanceBefore.add(expectedCoverNoteAmount).eq(balanceAfter),
      'balanceBefore + coverNote != balanceAfter',
    );
  });

  it('does not allow to withdrawCoverNote after two rejected claims', async function () {

    const { qt, tk } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    const coverId = '1';
    const balanceBefore = await tk.balanceOf(member1);

    await claimAndVote(this.contracts, coverId, member1, claimAssessor, false);
    await claimAndVote(this.contracts, coverId, member1, claimAssessor, false);

    await expectRevert(
      qt.withdrawCoverNote(member1, [coverId], ['0']),
      'Quotation: cannot withdraw before grace period expiration',
    );

    // should work after the claim was closed
    const balanceAfter = await tk.balanceOf(member1);

    // check that half of the initial CN deposit was returned
    assert(balanceBefore.eq(balanceAfter), 'balanceBefore != balanceAfter');
  });

  it('does not allow to withdrawCoverNote after an accepted claim', async function () {

    const { qt, tk } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    const coverId = '1';
    const balanceBefore = await tk.balanceOf(member1);

    await claimAndVote(this.contracts, coverId, member1, claimAssessor, true);

    await expectRevert(
      qt.withdrawCoverNote(member1, [coverId], ['0']),
      'Quotation: cannot withdraw before grace period expiration',
    );

    // should work after the claim was closed
    const balanceAfter = await tk.balanceOf(member1);
    const expectedCoverNoteAmount = toBN(cover.priceNXM).muln(10).divn(100);

    // check that half of the initial CN deposit was returned
    assert(
      balanceBefore.add(expectedCoverNoteAmount).eq(balanceAfter),
      'balanceBefore + coverNote != balanceAfter',
    );
  });

  it('does not allow to withdrawCoverNote after one rejected and one an accepted claim', async function () {

    const { qt, tk } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    const coverId = '1';
    const balanceBefore = await tk.balanceOf(member1);

    await claimAndVote(this.contracts, coverId, member1, claimAssessor, false);
    await claimAndVote(this.contracts, coverId, member1, claimAssessor, true);

    await expectRevert(
      qt.withdrawCoverNote(member1, [coverId], ['0']),
      'Quotation: cannot withdraw before grace period expiration',
    );

    // should work after the claim was closed
    const balanceAfter = await tk.balanceOf(member1);
    const expectedCoverNoteAmount = toBN(cover.priceNXM).muln(5).divn(100);

    // check that half of the initial CN deposit was returned
    assert(
      balanceBefore.add(expectedCoverNoteAmount).eq(balanceAfter),
      'balanceBefore + coverNote != balanceAfter',
    );
  });

  it('correctly removes the reasons when withdrawing multiple CNs', async function () {

    const { qd, qt, tk } = this.contracts;

    const cover = { ...coverTemplate };
    const secondCover = { ...coverTemplate, generationTime: cover.generationTime + 1 };

    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    await buyCover({ ...this.contracts, cover: secondCover, coverHolder: member1 });

    const balanceBefore = await tk.balanceOf(member1);
    const expectedCoverNoteTotal = toBN(cover.priceNXM).muln(20).divn(100);

    const coverExpirationDate = await qd.getValidityOfCover('2');
    await setNextBlockTime(coverExpirationDate.addn(1).toNumber());
    await qt.expireCover('1');
    await qt.expireCover('2');

    const gracePeriod = await qd.getValidityOfCover('2');
    const gracePeriodExpirationDate = coverExpirationDate.add(gracePeriod);

    await setNextBlockTime(gracePeriodExpirationDate.addn(1).toNumber());
    await qt.withdrawCoverNote(member1, ['1', '2'], ['0', '1']);
    const balanceAfter = await tk.balanceOf(member1);

    // check that half of the initial CN deposit was returned
    assert(
      balanceBefore.add(expectedCoverNoteTotal).eq(balanceAfter),
      'balanceBefore + coverNote != balanceAfter',
    );
  });

  it('should not allow withdrawal of other members\' CNs', async function () {

    const { qd, qt } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });

    const coverExpirationDate = await qd.getValidityOfCover('1');
    await setNextBlockTime(coverExpirationDate.addn(1).toNumber());
    await qt.expireCover('1');

    const gracePeriod = await qd.getValidityOfCover('1');
    const gracePeriodExpirationDate = coverExpirationDate.add(gracePeriod);

    await setNextBlockTime(gracePeriodExpirationDate.addn(1).toNumber());
    await expectRevert.unspecified(qt.withdrawCoverNote(member2, ['1'], ['0']));
  });
});
