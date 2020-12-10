const { accounts, web3 } = require('hardhat');
const { ether, time, expectEvent } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { BN, toBN } = web3.utils;

const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
const { buyCover } = require('../utils/buyCover');
const { hex } = require('../utils').helpers;

const [
  /* owner */,
  member1, member2, member3,
  staker1, staker2, staker3, staker4, staker5, staker6, staker7, staker8, staker9, staker10,
  coverHolder,
] = accounts;

const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const stakers = [staker1, staker2, staker3, staker4, staker5, staker6, staker7, staker8, staker9, staker10];
const tokensLockedForVoting = ether('200');

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
  assert.equal(actualVoteTokensDiff, expectedVoteTokensDiff);

  const allVotes = await cd.getAllVotesForClaim(claimId);
  const expectedVotes = allVotes[1].length;
  assert.equal(voters.length, expectedVotes);

  const isBooked = await td.isCATokensBooked(member1);
  assert.isTrue(isBooked);
}

async function closeClaim ({ cl, cd, master, now, expectedClaimStatusNumber }) {

  const claimId = (await cd.actualClaimLength()) - 1;
  const minVotingTime = await cd.minVotingTime();
  const minTime = new BN(minVotingTime.toString()).add(
    new BN(now.toString()),
  );

  await time.increaseTo(
    new BN(minTime.toString()).add(new BN('2')),
  );

  const actualVoteClosingBefore = await cl.checkVoteClosing(claimId);
  assert.equal(actualVoteClosingBefore.toString(), '1');

  await master.closeClaim(claimId); // trigger changeClaimStatus
  const newCStatus = await cd.getClaimStatusNumber(claimId);
  assert.equal(newCStatus[1].toString(), expectedClaimStatusNumber);

  const actualVoteClosingAfter = await cl.checkVoteClosing(claimId);
  assert.equal(actualVoteClosingAfter.toString(), '-1');
}

describe('burns', function () {

  beforeEach(async function () {
    const members = [member1, member2, member3, ...stakers, coverHolder];
    await enrollMember(this.contracts, members);
    await enrollClaimAssessor(this.contracts, members, { lockTokens: tokensLockedForVoting });
  });

  it.only('claim is accepted for contract whose staker that staked on multiple contracts', async function () {

    const { ps, tk, td, qd, cl, tc, p1 } = this.contracts;

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

    await buyCover({ ...this.contracts, cover, coverHolder });
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
    await submitMemberVotes({ ...this.contracts, voteValue: 1 });

    const balanceBefore = await tk.balanceOf(ps.address);
    await closeClaim({ ...this.contracts, now, expectedClaimStatusNumber: '14' });

    assert(await ps.hasPendingActions());
    await ps.processPendingActions('100');
    const balanceAfter = await tk.balanceOf(ps.address);

    const totalBurn = balanceBefore.sub(balanceAfter);
    const tokenPrice = await p1.getTokenPrice(ETH);
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
    const { ps, tk, td, qd, cl, p1, tc } = this.contracts;

    for (const staker of stakers) {
      await tk.approve(tc.address, stakeTokens, {
        from: staker,
      });
      await ps.depositAndStake(stakeTokens, [cover.contractAddress], [stakeTokens], {
        from: staker,
      });
    }

    await buyCover({ ...this.contracts, cover, coverHolder });
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
      .div(new BN(100)).div(new BN(stakers.length));

    assert.equal(rewardValue.toString(), expectedRewardPerStaker.toString());

    const coverID = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverID[0], { from: coverHolder });

    const now = await time.latest();
    await submitMemberVotes({ ...this.contracts, voteValue: 1 });

    const balanceBefore = await tk.balanceOf(ps.address);
    await closeClaim({ ...this.contracts, now, expectedClaimStatusNumber: '14' });
    await ps.processPendingActions('100');
    const balanceAfter = await tk.balanceOf(ps.address);

    const tokenPrice = await p1.getTokenPrice(ETH);
    const sumAssured = new BN(ether(cover.amount.toString()));
    const actualBurn = balanceBefore.sub(balanceAfter);

    const pushedBurnAmount = sumAssured.mul(ether('1')).div(tokenPrice);
    const stakedOnContract = await ps.contractStake(cover.contractAddress);
    let expectedBurnedNXMAmount = ether('0');

    for (const staker of stakers) {
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

    const { ps, tk, qd, cl, tc } = this.contracts;
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

    await buyCover({ ...this.contracts, cover, coverHolder });
    await time.increase(await ps.REWARD_ROUND_DURATION());
    await ps.pushRewards([cover.contractAddress]);

    assert(await ps.hasPendingActions());
    await ps.processPendingActions('100');

    const coverID = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverID[0], { from: coverHolder });

    const now = await time.latest();
    await submitMemberVotes({ ...this.contracts, voteValue: -1 });

    const balanceBefore = await tk.balanceOf(ps.address);
    await closeClaim({ ...this.contracts, now, expectedClaimStatusNumber: '6' });

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

    const { p1, ps, tk, qd, cl, tc } = this.contracts;
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

    await buyCover({ ...this.contracts, cover, coverHolder });
    await time.increase(await ps.REWARD_ROUND_DURATION());
    await ps.pushRewards([cover.contractAddress]);

    assert(await ps.hasPendingActions());
    await ps.processPendingActions('100');

    const coverID = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverID[0], { from: coverHolder });

    const now = await time.latest();
    await submitMemberVotes({ ...this.contracts, voteValue: 1 });
    const balanceBefore = await tk.balanceOf(ps.address);
    await closeClaim({ ...this.contracts, now, expectedClaimStatusNumber: '14' });

    assert(await ps.hasPendingActions());
    await ps.processPendingActions('100');
    assert.isFalse(await ps.hasPendingActions());

    const tokenPrice = await p1.getTokenPrice(ETH);
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

    const { ps, tk, cd, qd, cl, p1, tc } = this.contracts;
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

    await buyCover({ ...this.contracts, cover, coverHolder });
    await time.increase(await ps.REWARD_ROUND_DURATION());
    await ps.pushRewards([cover.contractAddress]);

    assert(await ps.hasPendingActions());
    await ps.processPendingActions('100');

    const coverID = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverID[0], { from: coverHolder });

    const minVotingTime = await cd.minVotingTime();
    await time.increase(minVotingTime.addn(1));

    const balanceBefore = await tk.balanceOf(ps.address);
    await submitMemberVotes({ ...this.contracts, voteValue: 1, maxVotingMembers: 1 });

    assert(await ps.hasPendingActions());
    await ps.processPendingActions('100');
    const balanceAfter = await tk.balanceOf(ps.address);

    const claimId = (await cd.actualClaimLength()) - 1;
    const actualVoteClosing = await cl.checkVoteClosing(claimId);
    assert.equal(actualVoteClosing.toString(), '-1');

    const claimStatus = await cd.getClaimStatusNumber(claimId);
    assert.equal(claimStatus.statno.toString(), '14');

    const tokenPrice = await p1.getTokenPrice(ETH);
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

    const { ps, tk, qd, cl, qt, p1 } = this.contracts;
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
    await submitMemberVotes({ ...this.contracts, voteValue: 1 });

    const balanceBefore = await tk.balanceOf(ps.address);
    await closeClaim({ ...this.contracts, now, expectedClaimStatusNumber: '14' });

    assert(await ps.hasPendingActions());
    await ps.processPendingActions('100');
    const balanceAfter = await tk.balanceOf(ps.address);

    const totalBurn = balanceBefore.sub(balanceAfter);
    assert.equal(totalBurn.toString(), '0');
  });

});
