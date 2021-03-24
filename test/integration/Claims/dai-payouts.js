const { accounts, web3 } = require('hardhat');
const { ether, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { toBN } = web3.utils;

const { buyCoverWithDai, buyCover } = require('../utils/buyCover');
const { hex } = require('../utils').helpers;
const { CoverStatus } = require('../utils').constants;
const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');

const [, member1, member2, member3, coverHolder, payoutAddress] = accounts;

const daiCoverTemplate = {
  amount: 1000, // 1000 dai
  price: 1e19.toString(), // 10 dai
  priceNXM: '10000000000000000000', // 10 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('DAI'),
  period: 60,
  contractAddress: '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000',
};

describe('DAI cover claim payouts', function () {

  beforeEach(async function () {
    const { dai } = this.contracts;
    await enrollMember(this.contracts, [member1, member2, member3, coverHolder]);
    await enrollClaimAssessor(this.contracts, [member1, member2, member3]);

    for (const daiHolder of [coverHolder]) {
      await dai.mint(daiHolder, ether('10000000'));
    }
  });

  it('[A1, status: 0, 7, 14] CA accept, closed with closeClaim()', async function () {

    const { cd, cl, qd, mr, master, dai } = this.contracts;
    const cover = { ...daiCoverTemplate };

    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    const balanceBefore = toBN(await dai.balanceOf(coverHolder));
    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverId, { from: coverHolder });
    const claimId = (await cd.actualClaimLength()).subn(1);
    await cl.submitCAVote(claimId, '1', { from: member1 });

    const minVotingTime = await cd.minVotingTime();
    await time.increase(minVotingTime.addn(1));

    const voteStatusBefore = await cl.checkVoteClosing(claimId);
    assert.equal(voteStatusBefore.toString(), '1', 'should allow vote closing');

    await master.closeClaim(claimId);
    const voteStatusAfter = await cl.checkVoteClosing(claimId);
    assert(voteStatusAfter.eqn(-1), 'voting should be closed');

    const { statno: claimStatus } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(claimStatus.toNumber(), 14, 'claim status should be 14 (accepted, payout done)');

    const balanceAfter = toBN(await dai.balanceOf(coverHolder));
    const expectedPayout = ether(cover.amount.toString());
    const actualPayout = balanceAfter.sub(balanceBefore);

    assert(actualPayout.eq(expectedPayout), 'should have transfered the cover amount');
  });

  it('[A1, status: 0, 7, 14] CA accept, closed on the last vote', async function () {

    const { cd, cl, qd, mr, dai } = this.contracts;
    const cover = { ...daiCoverTemplate };

    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    const balanceBefore = toBN(await dai.balanceOf(coverHolder));
    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverId, { from: coverHolder });
    const claimId = (await cd.actualClaimLength()).subn(1);

    const minVotingTime = await cd.minVotingTime();
    await time.increase(minVotingTime.addn(1));
    await cl.submitCAVote(claimId, '1', { from: member1 });

    const voteStatusAfter = await cl.checkVoteClosing(claimId);
    assert(voteStatusAfter.eqn(-1), 'voting should be closed');

    const { statno: claimStatus } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(claimStatus.toNumber(), 14, 'claim status should be 14 (accepted, payout done)');

    const balanceAfter = toBN(await dai.balanceOf(coverHolder));
    const expectedPayout = ether(cover.amount.toString());
    const actualPayout = balanceAfter.sub(balanceBefore);

    assert(actualPayout.eq(expectedPayout), 'should have transfered the cover amount');
  });

  it('[A2, status: 0, 4, 8, 14] CA no consensus, MV accept, closed with closeClaim()', async function () {

    const { cd, cl, qd, mr, master, dai } = this.contracts;
    const cover = { ...daiCoverTemplate };

    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    const balanceBefore = toBN(await dai.balanceOf(coverHolder));
    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverId, { from: coverHolder });
    const claimId = (await cd.actualClaimLength()).subn(1);

    // create a consensus not reached situation, 66% accept vs 33% deny
    await cl.submitCAVote(claimId, '1', { from: member1 });
    await cl.submitCAVote(claimId, '-1', { from: member2 });
    await cl.submitCAVote(claimId, '1', { from: member3 });

    const maxVotingTime = await cd.maxVotingTime();
    await time.increase(maxVotingTime.addn(1));

    await master.closeClaim(claimId); // trigger changeClaimStatus
    const voteStatusAfter = await cl.checkVoteClosing(claimId);
    assert(voteStatusAfter.eqn(0), 'voting should not be closed');

    const { statno: claimStatusCA } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(
      claimStatusCA.toNumber(), 4,
      'claim status should be 4 (ca consensus not reached, pending mv)',
    );

    await cl.submitMemberVote(claimId, '1', { from: member1 });
    await time.increase(maxVotingTime.addn(1));
    await master.closeClaim(claimId);

    const { statno: claimStatusMV } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(
      claimStatusMV.toNumber(), 14,
      'claim status should be 14 (ca consensus not reached, pending mv)',
    );

    const balanceAfter = toBN(await dai.balanceOf(coverHolder));
    const expectedPayout = ether(cover.amount.toString());
    const actualPayout = balanceAfter.sub(balanceBefore);

    assert(actualPayout.eq(expectedPayout), 'should have transfered the cover amount');
  });

  it('[A2, status: 0, 4, 8, 14] CA no consensus, MV accept, on the last vote', async function () {

    const { cd, cl, qd, mr, master, dai } = this.contracts;
    const cover = { ...daiCoverTemplate };

    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    const balanceBefore = toBN(await dai.balanceOf(coverHolder));
    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverId, { from: coverHolder });
    const claimId = (await cd.actualClaimLength()).subn(1);

    // create a consensus not reached situation, 66% accept vs 33% deny
    await cl.submitCAVote(claimId, '1', { from: member1 });
    await cl.submitCAVote(claimId, '-1', { from: member2 });
    await cl.submitCAVote(claimId, '1', { from: member3 });

    const maxVotingTime = await cd.maxVotingTime();
    await time.increase(maxVotingTime.addn(1));

    await master.closeClaim(claimId); // trigger changeClaimStatus
    const voteStatusAfter = await cl.checkVoteClosing(claimId);
    assert(voteStatusAfter.eqn(0), 'voting should not be closed');

    const { statno: claimStatusCA } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(
      claimStatusCA.toNumber(), 4,
      'claim status should be 4 (ca consensus not reached, pending mv)',
    );

    const minVotingTime = await cd.minVotingTime();
    await time.increase(minVotingTime.addn(1));
    await cl.submitMemberVote(claimId, '1', { from: member1 });

    const { statno: claimStatusMV } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(
      claimStatusMV.toNumber(), 14,
      'claim status should be 14 (ca consensus not reached, pending mv)',
    );

    const balanceAfter = toBN(await dai.balanceOf(coverHolder));
    const expectedPayout = ether(cover.amount.toString());
    const actualPayout = balanceAfter.sub(balanceBefore);

    assert(actualPayout.eq(expectedPayout), 'should have transfered the cover amount');
  });

  it('[A3, status: 0, 4, 10, 14] CA no consensus (accept), MV min not reached, use CA result', async function () {

    const { cd, cl, qd, mr, master, dai } = this.contracts;
    const cover = { ...daiCoverTemplate };

    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });
    const balanceBefore = toBN(await dai.balanceOf(coverHolder));

    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverId, { from: coverHolder });
    const claimId = (await cd.actualClaimLength()).subn(1);

    // create a consensus not reached situation, 66% accept vs 33% deny
    await cl.submitCAVote(claimId, '1', { from: member1 });
    await cl.submitCAVote(claimId, '-1', { from: member2 });
    await cl.submitCAVote(claimId, '1', { from: member3 });

    const maxVotingTime = await cd.maxVotingTime();
    await time.increase(maxVotingTime.addn(1));

    await master.closeClaim(claimId); // trigger changeClaimStatus
    const voteStatusAfter = await cl.checkVoteClosing(claimId);
    assert(voteStatusAfter.eqn(0), 'voting should not be closed');

    const { statno: claimStatusCA } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(
      claimStatusCA.toNumber(), 4,
      'claim status should be 4 (ca consensus not reached, pending mv)',
    );

    await time.increase(maxVotingTime.addn(1));
    await master.closeClaim(claimId); // trigger changeClaimStatus

    const { statno: claimStatusMV } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(
      claimStatusMV.toNumber(), 14,
      'claim status should be 14 (payout done)',
    );

    const balanceAfter = toBN(await dai.balanceOf(coverHolder));
    const expectedPayout = ether(cover.amount.toString());
    const actualPayout = balanceAfter.sub(balanceBefore);

    assert(actualPayout.eq(expectedPayout), 'should have transfered the cover amount');
  });

  it('[A1, status: 0, 7, 12, 13] CA accept, closed with closeClaim(), claim payout fails with status 12 and goes to status 13 after 60 retries', async function () {

    const { cd, cl, qd, master, dai, p1: pool } = this.contracts;

    const cover = { ...daiCoverTemplate };
    await buyCoverWithDai({ ...this.contracts, cover, coverHolder });

    // blacklist coverHolder so it cannot receive the payout and fail the transfer
    await dai.blacklist(coverHolder);

    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverId, { from: coverHolder });
    const claimId = (await cd.actualClaimLength()).subn(1);
    await cl.submitCAVote(claimId, '1', { from: member1 });

    const minVotingTime = await cd.minVotingTime();
    await time.increase(minVotingTime.addn(1));

    const voteStatusBefore = await cl.checkVoteClosing(claimId);
    assert.equal(voteStatusBefore.toString(), '1', 'should allow vote closing');

    await master.closeClaim(claimId);
    const voteStatusAfter = await cl.checkVoteClosing(claimId);
    assert.equal(voteStatusAfter.toString(), '0', 'voting should be closed');

    const { statno: claimStatus } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(claimStatus.toNumber(), 12, 'claim status should be 12 (Claim Accepted Payout Pending)');

    const coverStatus = await qd.getCoverStatusNo(coverId);
    assert.equal(coverStatus.toString(), CoverStatus.ClaimAccepted);

    const payoutRetryTime = await cd.payoutRetryTime();
    for (let i = 0; i <= 60; i++) {
      await time.increase(payoutRetryTime.addn(1));
      await master.closeClaim(claimId);
    }

    const { statno: finalClaimStatus } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(finalClaimStatus.toNumber(), 13, 'claim status should be 13 (Claim Accepted No Payout)');
  });

});
