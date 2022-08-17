const { accounts } = require('hardhat');
const { constants, ether, time } = require('@openzeppelin/test-helpers');
const { setNextBlockTime } = require('../../utils/evm');
const { assert } = require('chai');

const { buyCover } = require('../utils').buyCover;
const { hex } = require('../utils').helpers;

const [, coverHolder, claimAssessor] = accounts;

const coverTemplate = {
  amount: 1, // 1 eth
  price: '3000000000000000', // 0.003 eth
  priceNXM: '1000000000000000000', // 1 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('ETH'),
  period: 60,
  contractAddress: '0xc0ffeec0ffeec0ffeec0ffeec0ffeec0ffee0000',
};

describe('locktime reduction', function () {

  const stakeAmount = ether('1000');
  const stakeDuration = 3600 * 24 * 7 * 10; // 10 weeks

  beforeEach(async function () {

    const { mr, tk, cd, cl, cr, qd, tc, ps } = this.contracts;

    // enroll cover holder
    await mr.payJoiningFee(coverHolder, { from: coverHolder, value: ether('0.002') });
    await mr.kycVerdict(coverHolder, true);

    // enroll claim assessor
    await mr.payJoiningFee(claimAssessor, { from: claimAssessor, value: ether('0.002') });
    await mr.kycVerdict(claimAssessor, true);

    // fund and stake for claim assessment
    await tk.transfer(claimAssessor, stakeAmount);
    await tk.approve(tc.address, constants.MAX_UINT256, { from: claimAssessor });
    await tc.lockClaimAssessmentTokens(stakeAmount, stakeDuration, { from: claimAssessor });

    const coverCount = 3;
    const minVotingTime = await cd.minVotingTime();

    for (let i = 0; i < coverCount; i++) {

      // alter the cover to force a different signature
      const cover = { ...coverTemplate, generationTime: coverTemplate.generationTime + i };
      await buyCover({ ...this.contracts, cover, coverHolder });

      const coverIds = await qd.getAllCoversOfUser(coverHolder);
      const coverId = coverIds[coverIds.length - 1];

      // submit claim
      await cl.submitClaim(coverId, { from: coverHolder });
      const claimId = (await cd.actualClaimLength()).subn(1);

      // vote and close claim
      await time.increase(minVotingTime.addn(1));
      await cl.submitCAVote(claimId, '1', { from: claimAssessor });
      await cr.closeClaim(claimId);

      // check vote status
      const voteStatusAfter = await cl.checkVoteClosing(claimId);
      assert(voteStatusAfter.eqn(-1), 'voting should be closed');

      // check claim status. 14 = accepted, payout done
      const { statno: claimStatus } = await cd.getClaimStatusNumber(claimId);
      assert.strictEqual(claimStatus.toNumber(), 14, 'claim status should be 14');

      await ps.processPendingActions(100);
    }
  });

  // now - current time
  // m - min expiration
  // r - reduction
  // i - initial expiration
  // f - final expiration with normal reduction

  //   now       m       f                  i
  // ---|--------|-------|------------------|---------> time
  //                      <---------------->
  //                              r

  it('reduces the locktime normally when minExp < finalExp', async function () {

    const { cr, tc, td } = this.contracts;

    // locktime reduction under normal circumstances
    const lockTimePerVote = await td.lockCADays();
    const normalReduction = lockTimePerVote.muln(3);

    const initialExp = await tc.getLockedTokensValidity(claimAssessor, hex('CLA'));
    const expectedFinalExp = initialExp.sub(normalReduction);

    const targetNow = (await time.latest()).addn(1);
    const minExp = targetNow.add(lockTimePerVote);

    assert(minExp.lt(expectedFinalExp), 'minExp should be less than final expiration');

    await setNextBlockTime(targetNow.toNumber());
    await cr.claimAllPendingReward(100, { from: claimAssessor });

    const actualFinalExp = await tc.getLockedTokensValidity(claimAssessor, hex('CLA'));
    assert.strictEqual(actualFinalExp.toString(), expectedFinalExp.toString());
  });

  //   now      m=f                 i
  // ---|--------|------------------|---------> time
  //              <---------------->
  //                      r

  it('reduces the locktime normally when minExp = finalExp', async function () {

    const { cr, tc, td } = this.contracts;

    // locktime reduction under normal circumstances
    const lockTimePerVote = await td.lockCADays();
    const normalReduction = lockTimePerVote.muln(3);

    const initialExp = await tc.getLockedTokensValidity(claimAssessor, hex('CLA'));
    const expectedFinalExp = initialExp.sub(normalReduction);

    const minExp = expectedFinalExp;
    const targetNow = minExp.sub(lockTimePerVote);

    assert(minExp.eq(expectedFinalExp), 'minExp should be equal to final expiration');

    await setNextBlockTime(targetNow.toNumber());
    await cr.claimAllPendingReward(100, { from: claimAssessor });

    const actualFinalExp = await tc.getLockedTokensValidity(claimAssessor, hex('CLA'));
    assert.strictEqual(actualFinalExp.toString(), expectedFinalExp.toString());
  });

  //   now       f  m               i
  // ---|--------|--|---------------|---------> time
  //                 <------------->
  //                        r

  it('reduces the locktime only down to minExp when finalExp < minExp', async function () {

    const { cr, tc, td } = this.contracts;

    // locktime reduction under normal circumstances
    const lockTimePerVote = await td.lockCADays();
    const normalReduction = lockTimePerVote.muln(3);

    const initialExp = await tc.getLockedTokensValidity(claimAssessor, hex('CLA'));
    const normalFinalExp = initialExp.sub(normalReduction);

    const minExp = normalFinalExp.addn(1);
    const targetNow = minExp.sub(lockTimePerVote);

    assert(minExp.gt(normalFinalExp), 'minExp should be equal to final expiration');

    await setNextBlockTime(targetNow.toNumber());
    await cr.claimAllPendingReward(100, { from: claimAssessor });

    const actualFinalExp = await tc.getLockedTokensValidity(claimAssessor, hex('CLA'));
    assert.strictEqual(actualFinalExp.toString(), minExp.toString());
  });

  //      f     now    i     m
  // -----|------|-----|-----|-----> time
  //                   *
  //                 r = 0

  it('does not reduce the locktime when now < initialExp < minExp', async function () {

    const { cr, tc, td } = this.contracts;

    // locktime reduction under normal circumstances
    const lockTimePerVote = await td.lockCADays();
    const initialExp = await tc.getLockedTokensValidity(claimAssessor, hex('CLA'));

    const targetNow = initialExp.subn(1);
    const minExp = targetNow.add(lockTimePerVote);

    assert(targetNow.lt(initialExp), 'current time should be less than initial expiration');
    assert(initialExp.lt(minExp), 'initial expiration should be less than min expiration');

    await setNextBlockTime(targetNow.toNumber());
    await cr.claimAllPendingReward(100, { from: claimAssessor });

    const actualFinalExp = await tc.getLockedTokensValidity(claimAssessor, hex('CLA'));
    assert.strictEqual(actualFinalExp.toString(), initialExp.toString());
  });

  //      f      i    now    m
  // -----|------|-----|-----|-----> time
  //             *
  //           r = 0

  it('does not reduce the locktime when initialExp < now < minExp', async function () {

    const { cr, tc } = this.contracts;

    // locktime reduction under normal circumstances
    const initialExp = await tc.getLockedTokensValidity(claimAssessor, hex('CLA'));

    const targetNow = initialExp.addn(1);
    assert(targetNow.gt(initialExp), 'current time should be greater than initial expiration');

    await setNextBlockTime(targetNow.toNumber());
    await cr.claimAllPendingReward(100, { from: claimAssessor });

    const actualFinalExp = await tc.getLockedTokensValidity(claimAssessor, hex('CLA'));
    assert.strictEqual(actualFinalExp.toString(), initialExp.toString());
  });

});
