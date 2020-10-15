const { accounts, web3 } = require('@openzeppelin/test-environment');
const { ether, time, expectEvent } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { BN, toBN } = web3.utils;

const { buyCover } = require('../utils/buyCover');
const { hex } = require('../utils').helpers;
const snapshot = require('../utils').snapshot;
const setup = require('../setup');

const [
  member1, member2, member3,
  staker1, staker2, staker3, staker4, staker5, staker6, staker7, staker8, staker9, staker10,
  coverHolder,
] = accounts;

const tokensLockedForVoting = ether('200');
const validity = 360 * 24 * 60 * 60; // 360 days
const UNLIMITED_ALLOWANCE = toBN('2').pow(toBN('256')).subn(1);
const initialMemberFunds = ether('2500');

async function initMembers () {

  const { mr, tk, tc } = this;

  this.allStakers = [staker1, staker2, staker3, staker4, staker5, staker6, staker7, staker8, staker9, staker10];
  const members = [member1, member2, member3, ...this.allStakers, coverHolder];

  for (const member of members) {
    await mr.payJoiningFee(member, { from: member, value: ether('0.002') });
    await mr.kycVerdict(member, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member });
    await tk.transfer(member, initialMemberFunds);
  }

  for (const member of members) {
    await tc.lock(hex('CLA'), tokensLockedForVoting, validity, { from: member });
  }

  this.allMembers = members;
}

async function submitMemberVotes ({ cd, td, cl, voteValue, maxVotingMembers }) {

  const claimId = (await cd.actualClaimLength()) - 1;
  const initialCAVoteTokens = await cd.getCaClaimVotesToken(claimId);
  const baseMembers = [member1, member2, member3];
  const voters = maxVotingMembers ? baseMembers.slice(0, maxVotingMembers) : baseMembers;

  for (const member of voters) {
    await cl.submitCAVote(claimId, voteValue, { from: member });
  }

  const finalCAVoteTokens = await cd.getCaClaimVotesToken(claimId);
  const actualVoteTokensDiff = finalCAVoteTokens[1] - initialCAVoteTokens[1];
  const expectedVoteTokensDiff = tokensLockedForVoting * voters.length;
  assert.equal(expectedVoteTokensDiff, actualVoteTokensDiff);

  const allVotes = await cd.getAllVotesForClaim(claimId);
  const expectedVotes = allVotes[1].length;
  assert.equal(voters.length, expectedVotes);

  const isBooked = await td.isCATokensBooked(member1);
  assert.isTrue(isBooked);
}

async function concludeClaimWithOraclize ({ cl, pd, cd, p1, now, expectedClaimStatusNumber }) {

  const claimId = (await cd.actualClaimLength()) - 1;
  const minVotingTime = await cd.minVotingTime();
  const minTime = new BN(minVotingTime.toString()).add(
    new BN(now.toString()),
  );

  await time.increaseTo(
    new BN(minTime.toString()).add(new BN('2')),
  );

  const expectedVoteClosingBefore = await cl.checkVoteClosing(claimId);
  assert.equal(expectedVoteClosingBefore.toString(), '1');

  const APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
  await p1.__callback(APIID, '');
  const newCStatus = await cd.getClaimStatusNumber(claimId);
  assert.equal(newCStatus[1].toString(), expectedClaimStatusNumber);

  const expectedVoteClosingAfter = await cl.checkVoteClosing(claimId);
  assert.equal(expectedVoteClosingAfter.toString(), '-1');
}

describe('burns', function () {

  this.timeout(0);
  this.slow(5000);

  before(setup);
  before(initMembers);

  beforeEach(async function () {
    this.snapshotId = await snapshot.takeSnapshot();
  });

  afterEach(async function () {
    await snapshot.revertToSnapshot(this.snapshotId);
  });

  it('claim is accepted for contract whose staker that staked on multiple contracts', async function () {

    const { ps, tk, td, qd, cl, mcr, tc } = this;

    const currency = hex('ETH');
    const cover = {
      amount: 1,
      price: '3362445813369838',
      priceNXM: '744892736679184',
      expireTime: '7972408607',
      generationTime: '7972408607001',
      currency,
      period: 61,
      contractAddress: '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf',
    };

    const secondCoveredAddress = '0xd01236c54dbc68db5db3a091b171a77407ff7234';
    const stakeTokens = ether('20');

    await tk.approve(tc.address, stakeTokens, { from: staker1 });
    await ps.depositAndStake(
      stakeTokens, [cover.contractAddress, secondCoveredAddress], [stakeTokens, stakeTokens], { from: staker1 },
    );

    await buyCover({ ...this, cover, coverHolder });
    await time.increase(await ps.REWARD_ROUND_DURATION());
    await ps.pushRewards([cover.contractAddress]);
    assert(await ps.hasPendingActions());

    const stakerRewardPreProcessing = await ps.stakerReward(staker1);
    await ps.processPendingActions('100');
    const stakerRewardPostProcessing = await ps.stakerReward(staker1);

    const rewardValue = new BN(stakerRewardPostProcessing).sub(new BN(stakerRewardPreProcessing));
    const stakerRewardPercentage = await td.stakerCommissionPer();
    const coverPrice = new BN(cover.priceNXM);

    const expectedTotalReward = coverPrice
      .mul(new BN(stakerRewardPercentage))
      .div(new BN(100));

    assert.equal(rewardValue.toString(), expectedTotalReward.toString());

    const staked = await ps.contractStake('0xd0a6E6C54DbC68Db5db3A091B171A77407Ff7ccf');
    const coverID = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverID[0], { from: coverHolder });

    const now = await time.latest();
    await submitMemberVotes({ ...this, voteValue: 1 });

    const balanceBefore = await tk.balanceOf(ps.address);
    await concludeClaimWithOraclize({ ...this, now, expectedClaimStatusNumber: '7' });

    assert(await ps.hasPendingActions());
    await ps.processPendingActions('100');
    const balanceAfter = await tk.balanceOf(ps.address);

    const totalBurn = balanceBefore.sub(balanceAfter);
    const tokenPrice = await mcr.calculateTokenPrice(currency);
    const sumAssured = ether(cover.amount.toString());
    const sumAssuredInNxm = sumAssured.mul(ether('1')).div(new BN(tokenPrice));
    const expectedBurnedNXMAmount = staked.lt(sumAssuredInNxm) ? staked : sumAssuredInNxm;

    assert.equal(
      totalBurn.toString(),
      expectedBurnedNXMAmount.toString(),
      `Total burn: ${totalBurn}, expected: ${expectedBurnedNXMAmount}`,
    );
  });

  it('claim is accepted for 10 stakers', async function () {

    const currency = hex('ETH');

    const cover = {
      amount: 1,
      price: '3362445813369838',
      priceNXM: '744892736679184',
      expireTime: '7972408607',
      generationTime: '7972408607001',
      currency,
      period: 61,
      contractAddress: '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf',
    };

    const stakeTokens = ether('20');
    const { ps, tk, td, qd, cl, mcr, tc } = this;

    for (const staker of this.allStakers) {
      await tk.approve(tc.address, stakeTokens, {
        from: staker,
      });
      await ps.depositAndStake(stakeTokens, [cover.contractAddress], [stakeTokens], {
        from: staker,
      });
    }

    await buyCover({ ...this, cover, coverHolder });
    await time.increase(await ps.REWARD_ROUND_DURATION());
    await ps.pushRewards([cover.contractAddress]);

    const stakerRewardPreProcessing = await ps.stakerReward(staker1);
    await ps.processPendingActions('100');
    const stakerRewardPostProcessing = await ps.stakerReward(staker1);

    const rewardValue = new BN(stakerRewardPostProcessing).sub(new BN(stakerRewardPreProcessing));
    const stakerRewardPercentage = await td.stakerCommissionPer();
    const coverPrice = new BN(cover.priceNXM);
    const expectedRewardPerStaker = coverPrice
      .mul(new BN(stakerRewardPercentage))
      .div(new BN(100)).div(new BN(this.allStakers.length));

    assert.equal(rewardValue.toString(), expectedRewardPerStaker.toString());

    const coverID = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverID[0], { from: coverHolder });

    const now = await time.latest();
    await submitMemberVotes({ ...this, voteValue: 1 });

    const balanceBefore = await tk.balanceOf(ps.address);
    await concludeClaimWithOraclize({ ...this, now, expectedClaimStatusNumber: '7' });
    await ps.processPendingActions('100');
    const balanceAfter = await tk.balanceOf(ps.address);

    const tokenPrice = await mcr.calculateTokenPrice(currency);
    const sumAssured = new BN(ether(cover.amount.toString()));
    const actualBurn = balanceBefore.sub(balanceAfter);

    const pushedBurnAmount = sumAssured.mul(ether('1')).div(tokenPrice);
    const stakedOnContract = await ps.contractStake(cover.contractAddress);
    let expectedBurnedNXMAmount = ether('0');

    for (const staker of this.allStakers) {
      const stakerStake = await ps.stakerContractStake(staker, cover.contractAddress);
      const stakerBurn = stakerStake.mul(pushedBurnAmount).div(stakedOnContract);
      expectedBurnedNXMAmount = expectedBurnedNXMAmount.add(stakerBurn);
    }

    assert.equal(
      actualBurn.toString(),
      expectedBurnedNXMAmount.toString(),
      `Total burn: ${actualBurn}, expected: ${expectedBurnedNXMAmount}`,
    );
  });

  it('claim is rejected', async function () {

    const { ps, tk, qd, cl, tc } = this;
    const currency = hex('ETH');

    const cover = {
      amount: 1,
      price: '3362445813369838',
      priceNXM: '744892736679184',
      expireTime: '7972408607',
      generationTime: '7972408607001',
      currency,
      period: 61,
      contractAddress: '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf',
    };

    const stakeTokens = ether('20');

    await tk.approve(tc.address, stakeTokens, { from: staker1 });
    await ps.depositAndStake(stakeTokens, [cover.contractAddress], [stakeTokens], { from: staker1 });

    await buyCover({ ...this, cover, coverHolder });
    await time.increase(await ps.REWARD_ROUND_DURATION());
    await ps.pushRewards([cover.contractAddress]);

    assert(await ps.hasPendingActions());
    await ps.processPendingActions('100');

    const coverID = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverID[0], { from: coverHolder });

    const now = await time.latest();
    await submitMemberVotes({ ...this, voteValue: -1 });

    const balanceBefore = await tk.balanceOf(ps.address);
    await concludeClaimWithOraclize({ ...this, now, expectedClaimStatusNumber: '6' });

    await ps.processPendingActions('100');
    const balanceAfter = await tk.balanceOf(ps.address);
    await ps.processPendingActions('100');

    const totalBurn = balanceBefore.sub(balanceAfter);

    assert.equal(
      totalBurn.toString(),
      '0',
      `Total burn: ${totalBurn}, expected: ${0}`,
    );
  });

  it('claim is accepted and burn happens after an unprocessed unstake request by staker', async function () {

    const { mcr, ps, tk, qd, cl, tc } = this;
    const currency = hex('ETH');

    const cover = {
      amount: 1,
      price: '3362445813369838',
      priceNXM: '744892736679184',
      expireTime: '7972408607',
      generationTime: '7972408607001',
      currency,
      period: 61,
      contractAddress: '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf',
    };

    const stakeTokens = ether('20');
    await tk.approve(tc.address, stakeTokens, { from: staker1 });
    await ps.depositAndStake(stakeTokens, [cover.contractAddress], [stakeTokens], { from: staker1 });

    await buyCover({ ...this, cover, coverHolder });
    await time.increase(await ps.REWARD_ROUND_DURATION());
    await ps.pushRewards([cover.contractAddress]);

    assert(await ps.hasPendingActions());
    await ps.processPendingActions('100');

    const coverID = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverID[0], { from: coverHolder });

    const now = await time.latest();
    await submitMemberVotes({ ...this, voteValue: 1 });
    const balanceBefore = await tk.balanceOf(ps.address);
    await concludeClaimWithOraclize({ ...this, now, expectedClaimStatusNumber: '7' });

    assert(await ps.hasPendingActions());
    await ps.processPendingActions('100');
    assert.isFalse(await ps.hasPendingActions());

    const tokenPrice = await mcr.calculateTokenPrice(currency);
    const sumAssured = new BN(ether(cover.amount.toString()));
    const expectedBurnedNXMAmount = sumAssured.mul(new BN(ether('1'))).div(new BN(tokenPrice));

    const balanceAfter = await tk.balanceOf(ps.address);
    const totalBurn = balanceBefore.sub(balanceAfter);

    assert.equal(
      totalBurn.toString(),
      expectedBurnedNXMAmount.toString(),
      `Total burn: ${totalBurn}, expected: ${expectedBurnedNXMAmount}`,
    );
  });

  it('claim is accepted and burn happens when the final vote is submitted', async function () {

    const { ps, tk, cd, qd, cl, mcr, tc } = this;
    const currency = hex('ETH');

    const cover = {
      amount: 1,
      price: '3362445813369838',
      priceNXM: '744892736679184',
      expireTime: '7972408607',
      generationTime: '7972408607001',
      currency,
      period: 120,
      contractAddress: '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf',
    };

    const stakeTokens = ether('20');
    await tk.approve(tc.address, stakeTokens, { from: staker1 });
    await ps.depositAndStake(stakeTokens, [cover.contractAddress], [stakeTokens], { from: staker1 });

    await buyCover({ ...this, cover, coverHolder });
    await time.increase(await ps.REWARD_ROUND_DURATION());
    await ps.pushRewards([cover.contractAddress]);

    assert(await ps.hasPendingActions());
    await ps.processPendingActions('100');

    const coverID = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverID[0], { from: coverHolder });

    const minVotingTime = await cd.minVotingTime();
    await time.increase(minVotingTime.addn(1));

    const balanceBefore = await tk.balanceOf(ps.address);
    await submitMemberVotes({ ...this, voteValue: 1, maxVotingMembers: 1 });

    assert(await ps.hasPendingActions());
    await ps.processPendingActions('100');
    const balanceAfter = await tk.balanceOf(ps.address);

    const claimId = (await cd.actualClaimLength()) - 1;
    const expectedVoteClosing = await cl.checkVoteClosing(claimId);
    assert.equal(expectedVoteClosing.toString(), '-1');

    const claimStatus = await cd.getClaimStatusNumber(claimId);
    assert.equal(claimStatus.statno.toString(), '7');

    const tokenPrice = await mcr.calculateTokenPrice(currency);
    const sumAssured = new BN(ether(cover.amount.toString()));
    const expectedBurnedNXMAmount = sumAssured.mul(new BN(ether('1'))).div(new BN(tokenPrice));

    const totalBurn = balanceBefore.sub(balanceAfter);

    assert.equal(
      totalBurn.toString(),
      expectedBurnedNXMAmount.toString(),
      `Total burn: ${totalBurn}, expected: ${expectedBurnedNXMAmount}`,
    );
  });

  it('claim is accepted and burn happens after an unstake request by staker is processed', async function () {

    const { ps, tk, qd, cl, qt, p1 } = this;
    const currency = hex('ETH');

    const cover = {
      amount: 1,
      price: '3362445813369838',
      priceNXM: '744892736679184',
      expireTime: '7972408607',
      generationTime: '7972408607001',
      currency,
      period: 120,
      contractAddress: '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf',
    };
    const stakeTokens = ether('20');

    await tk.approve(ps.address, stakeTokens, { from: staker1 });
    await ps.depositAndStake(stakeTokens, [cover.contractAddress], [stakeTokens], { from: staker1 });

    await buyCover({ cover, coverHolder, qt, p1 });
    await time.increase(await ps.REWARD_ROUND_DURATION());
    await ps.pushRewards([cover.contractAddress]);

    assert(await ps.hasPendingActions());
    await ps.processPendingActions('100');

    const unstakeRequest = await ps.requestUnstake([cover.contractAddress], [stakeTokens], 0, { from: staker1 });
    const { timestamp: unstakeRequestedAt } = await web3.eth.getBlock(unstakeRequest.receipt.blockNumber);

    const unstakeLockTime = await ps.UNSTAKE_LOCK_TIME();
    const expectedUnstakeTime = toBN(unstakeRequestedAt).add(unstakeLockTime);

    expectEvent(unstakeRequest, 'UnstakeRequested', {
      staker: staker1,
      amount: stakeTokens,
      unstakeAt: expectedUnstakeTime,
    });

    await time.increase(unstakeLockTime.addn(24 * 60 * 60).toString());

    assert(await ps.hasPendingActions());
    await ps.processPendingActions('100');

    const hasPendingRequests = await ps.hasPendingUnstakeRequests();
    assert.isFalse(hasPendingRequests);

    const currentTotalStake = await ps.contractStake(cover.contractAddress);
    assert.equal(currentTotalStake.toString(), '0');

    const coverID = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverID[0], { from: coverHolder });

    const now = await time.latest();
    await submitMemberVotes({ ...this, voteValue: 1 });

    const balanceBefore = await tk.balanceOf(ps.address);
    await concludeClaimWithOraclize({ ...this, now, expectedClaimStatusNumber: '7' });

    assert(await ps.hasPendingActions());
    await ps.processPendingActions('100');
    const balanceAfter = await tk.balanceOf(ps.address);

    const totalBurn = balanceBefore.sub(balanceAfter);
    assert.equal(totalBurn.toString(), '0');
  });

});
