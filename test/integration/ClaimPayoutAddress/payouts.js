const { accounts, web3 } = require('hardhat');
const { ether, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { toBN } = web3.utils;

const { buyCover } = require('../utils/buyCover');
const { hex } = require('../utils').helpers;
const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');

const EtherRejecter = artifacts.require('EtherRejecter');

const [, member1, member2, member3, coverHolder, payoutAddress] = accounts;

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

// CLAIM STATUS:
//  0             CA Vote
//  1             Does not exist (was: CA Vote Denied, Pending Member Vote)
//  2             CA Vote Threshold not Reached Accept, Pending Member Vote
//  3             CA Vote Threshold not Reached Deny, Pending Member Vote
//  4             CA Consensus not reached Accept, Pending Member Vote
//  5             CA Consensus not reached Deny, Pending Member Vote
//  6  final  D1  CA Vote Denied
//  7         A1  CA Vote Accepted
//  8         A2  CA Vote no solution, MV Accepted
//  9  final  D2  CA Vote no solution, MV Denied
// 10         A3  CA Vote no solution (maj: accept), MV Nodecision
// 11  final  D3  CA Vote no solution (maj: denied), MV Nodecision
// 12  final      Claim Accepted Payout Pending
// 13  final      Claim Accepted No Payout
// 14  final      Claim Accepted Payout Done

describe('send claim payout to the payout address', function () {

  beforeEach(async function () {
    await enrollMember(this.contracts, [member1, member2, member3, coverHolder]);
    await enrollClaimAssessor(this.contracts, [member1, member2, member3]);
  });

  it('[A1, status: 0, 7, 14] CA accept, closed with closeClaim()', async function () {

    const { cd, cl, qd, mr, master } = this.contracts;
    const cover = { ...coverTemplate };

    const balanceBefore = toBN(await web3.eth.getBalance(payoutAddress));

    await mr.setClaimPayoutAddress(payoutAddress, { from: coverHolder });
    assert.strictEqual(
      await mr.getClaimPayoutAddress(coverHolder),
      payoutAddress,
      'should have set the claim payout address',
    );

    await buyCover({ ...this.contracts, cover, coverHolder });
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

    const balanceAfter = toBN(await web3.eth.getBalance(payoutAddress));
    const expectedPayout = ether(cover.amount.toString());
    const actualPayout = balanceAfter.sub(balanceBefore);

    assert(actualPayout.eq(expectedPayout), 'should have transfered the cover amount');
  });
  
  it('[A1, status: 0, 7, 14] CA accept, closed on the last vote', async function () {

    const { cd, cl, qd, mr } = this.contracts;
    const cover = { ...coverTemplate };

    const balanceBefore = toBN(await web3.eth.getBalance(payoutAddress));

    await mr.setClaimPayoutAddress(payoutAddress, { from: coverHolder });
    assert.strictEqual(
      await mr.getClaimPayoutAddress(coverHolder),
      payoutAddress,
      'should have set the claim payout address',
    );

    await buyCover({ ...this.contracts, cover, coverHolder });
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

    const balanceAfter = toBN(await web3.eth.getBalance(payoutAddress));
    const expectedPayout = ether(cover.amount.toString());
    const actualPayout = balanceAfter.sub(balanceBefore);

    assert(actualPayout.eq(expectedPayout), 'should have transfered the cover amount');
  });

  it('[A2, status: 0, 4, 8, 14] CA no consensus, MV accept, closed with closeClaim()', async function () {

    const { cd, cl, qd, mr, master } = this.contracts;
    const cover = { ...coverTemplate };

    const balanceBefore = toBN(await web3.eth.getBalance(payoutAddress));

    await mr.setClaimPayoutAddress(payoutAddress, { from: coverHolder });
    assert.strictEqual(
      await mr.getClaimPayoutAddress(coverHolder), payoutAddress,
      'should have set the claim payout address',
    );

    await buyCover({ ...this.contracts, cover, coverHolder });
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

    const balanceAfter = toBN(await web3.eth.getBalance(payoutAddress));
    const expectedPayout = ether(cover.amount.toString());
    const actualPayout = balanceAfter.sub(balanceBefore);

    assert(actualPayout.eq(expectedPayout), 'should have transfered the cover amount');
  });

  it('[A2, status: 0, 4, 8, 14] CA no consensus, MV accept, on the last vote', async function () {

    const { cd, cl, qd, mr, master } = this.contracts;
    const cover = { ...coverTemplate };

    const balanceBefore = toBN(await web3.eth.getBalance(payoutAddress));

    await mr.setClaimPayoutAddress(payoutAddress, { from: coverHolder });
    assert.strictEqual(
      await mr.getClaimPayoutAddress(coverHolder), payoutAddress,
      'should have set the claim payout address',
    );

    await buyCover({ ...this.contracts, cover, coverHolder });
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

    const balanceAfter = toBN(await web3.eth.getBalance(payoutAddress));
    const expectedPayout = ether(cover.amount.toString());
    const actualPayout = balanceAfter.sub(balanceBefore);

    assert(actualPayout.eq(expectedPayout), 'should have transfered the cover amount');
  });

  it('[A3, status: 0, 4, 10, 14] CA no consensus (accept), MV min not reached, use CA result', async function () {

    const { cd, cl, qd, mr, master } = this.contracts;
    const cover = { ...coverTemplate };

    const balanceBefore = toBN(await web3.eth.getBalance(payoutAddress));

    await mr.setClaimPayoutAddress(payoutAddress, { from: coverHolder });
    assert.strictEqual(
      await mr.getClaimPayoutAddress(coverHolder), payoutAddress,
      'should have set the claim payout address',
    );

    await buyCover({ ...this.contracts, cover, coverHolder });
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

    const balanceAfter = toBN(await web3.eth.getBalance(payoutAddress));
    const expectedPayout = ether(cover.amount.toString());
    const actualPayout = balanceAfter.sub(balanceBefore);

    assert(actualPayout.eq(expectedPayout), 'should have transfered the cover amount');
  });

  it('[A1, status: 0, 7, 12, 13] CA accept, closed with closeClaim(), claim payout fails with status 12 and goes to status 13 after 60 retries', async function () {

    const { cd, cl, qd, mr, master, dai } = this.contracts;
    const cover = { ...coverTemplate };

    const rejecter = await EtherRejecter.new();

    const payoutAddress = rejecter.address;
    const balanceBefore = toBN(await web3.eth.getBalance(payoutAddress));

    await mr.setClaimPayoutAddress(payoutAddress, { from: coverHolder });
    assert.strictEqual(
      await mr.getClaimPayoutAddress(coverHolder),
      payoutAddress,
      'should have set the claim payout address',
    );

    await buyCover({ ...this.contracts, cover, coverHolder });
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
    assert.equal(voteStatusAfter.toString(), '0', 'voting should not be closed');

    const { statno: claimStatus } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(claimStatus.toNumber(), 12, 'claim status should be 12 (Claim Accepted Payout Pending)');

    const payoutRetryTime = await cd.payoutRetryTime();
    for (let i = 0; i <= 60; i++) {
      await time.increase(payoutRetryTime.addn(1));
      await master.closeClaim(claimId);
    }

    const { statno: finalClaimStatus } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(finalClaimStatus.toNumber(), 13, 'claim status should be 13 (Claim Accepted No Payout)');
  });
});
