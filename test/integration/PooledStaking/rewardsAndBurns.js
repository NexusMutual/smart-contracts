const { accounts, defaultSender, web3 } = require('@openzeppelin/test-environment');
const { expectRevert, ether, time, expectEvent } = require('@openzeppelin/test-helpers');
const { exec } = require('child_process');
require('chai').should();

const { getQuoteValues, getValue } = require('../external');
const { hex, sleep } = require('../utils').helpers;
const setup = require('../setup');

const BN = web3.utils.BN;
const fee = ether('0.002');
const LOCK_REASON_CLAIM = hex('CLA');

function coverToCoverDetailsArray (cover) {
  return [cover.amount, cover.price, cover.priceNXM, cover.expireTime, cover.generationTime];
}

async function debugTx (promise) {
  try {
    await promise;
  } catch (e) {
    if (e.tx) {
      console.error(`Tx ${e.tx} failed. ${e.stack}`);
      const rpc = web3.eth.currentProvider.wrappedProvider.host.replace(/^http:\/\//, '');
      const cmd = `tenderly export ${e.tx} --debug --rpc ${rpc}`;
      console.log(`Executing ${cmd}`);
      exec(cmd);

      await sleep(1000000000);
    } else {
      throw e;
    }
  }
}

describe('burns', function () {

  this.timeout(10000000);
  const owner = defaultSender;
  const [
    member1,
    member2,
    member3,
    staker1,
    staker2,
    staker3,
    staker4,
    staker5,
    staker6,
    staker7,
    staker8,
    staker9,
    staker10,
    coverHolder,
  ] = accounts;

  const tokensLockedForVoting = ether('200');
  const validity = 360 * 24 * 60 * 60; // 360 days
  const UNLIMITED_ALLOWANCE = new BN('2')
    .pow(new BN('256'))
    .sub(new BN('1'));

  const initialMemberFunds = ether('2500');

  async function initMembers () {
    const { mr, mcr, pd, tk, tc, cd } = this;

    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);

    const minimumCapitalRequirementPercentage = await getValue(ether('2'), pd, mcr);
    await mcr.addMCRData(
      minimumCapitalRequirementPercentage,
      ether('100'),
      ether('2'),
      ['0x455448', '0x444149'],
      [100, 65407],
      20181011, {
        from: owner,
      },
    );
    (await pd.capReached()).toString().should.be.equal('1');

    this.allStakers = [staker1, staker2, staker3, staker4, staker5, staker6, staker7, staker8, staker9, staker10];
    const members = [member1, member2, member3];
    members.push(...this.allStakers);
    members.push(coverHolder);

    for (const member of members) {
      await mr.payJoiningFee(member, { from: member, value: fee });
      await mr.kycVerdict(member, true);
      // await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member });
      await tk.transfer(member, initialMemberFunds);
    }

    const maxVotingTime = await cd.maxVotingTime();

    for (const member of members) {
      await tc.lock(LOCK_REASON_CLAIM, tokensLockedForVoting, validity, {
        from: member,
      });
    }

    this.allMembers = members;

    const currency = hex('ETH');
    const tokenPrice = await mcr.calculateTokenPrice(currency);
  }

  async function buyCover (cover, coverHolder) {
    const { qt, p1 } = this;
    const vrsData = await getQuoteValues(
      coverToCoverDetailsArray(cover),
      cover.currency,
      cover.period,
      cover.contractAddress,
      qt.address,
    );
    await p1.makeCoverBegin(
      cover.contractAddress,
      cover.currency,
      coverToCoverDetailsArray(cover),
      cover.period,
      vrsData[0],
      vrsData[1],
      vrsData[2],
      { from: coverHolder, value: cover.price },
    );
  }

  async function submitMemberVotes (voteValue, maxVotingMembers) {
    const { cd, td, cl } = this;
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
    actualVoteTokensDiff.should.be.equal(expectedVoteTokensDiff);

    const allVotes = await cd.getAllVotesForClaim(claimId);
    const expectedVotes = allVotes[1].length;
    expectedVotes.should.be.equal(voters.length);

    const isBooked = await td.isCATokensBooked(member1);
    isBooked.should.be.equal(true);
  }

  async function concludeClaimWithOraclize (now, expectedClaimStatusNumber) {
    const { cl, pd, cd, p1 } = this;

    const claimId = (await cd.actualClaimLength()) - 1;

    const minVotingTime = await cd.minVotingTime();
    const minTime = new BN(minVotingTime.toString()).add(
      new BN(now.toString()),
    );

    await time.increaseTo(
      new BN(minTime.toString()).add(new BN('2')),
    );

    (await cl.checkVoteClosing(claimId))
      .toString()
      .should.be.equal('1');

    const APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
    await p1.__callback(APIID, '');
    const newCStatus = await cd.getClaimStatusNumber(claimId);
    newCStatus[1].toString().should.be.equal(expectedClaimStatusNumber);

    (await cl.checkVoteClosing(claimId))
      .toString()
      .should.be.equal('-1');
  }

  describe('claim is accepted for contract whose staker that staked on multiple contracts', function () {

    before(setup);
    before(initMembers);

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

    it('sets up the arena', async function () {

      const { ps, tc, tk } = this;
      const stakeTokens = ether('20');

      await tk.approve(tc.address, stakeTokens, { from: staker1 });
      await ps.depositAndStake(
        stakeTokens, [cover.contractAddress, secondCoveredAddress], [stakeTokens, stakeTokens], { from: staker1 },
      );
    });

    it('sends rewards to staker on cover purchase', async function () {
      const { ps, td } = this;

      await buyCover.call(this, cover, coverHolder);

      const stakerRewardPreProcessing = await ps.stakerReward(staker1);
      await ps.processPendingActions('100');
      const stakerRewardPostProcessing = await ps.stakerReward(staker1);

      const rewardValue = new BN(stakerRewardPostProcessing).sub(new BN(stakerRewardPreProcessing));
      const stakerRewardPercentage = await td.stakerCommissionPer();
      const coverPrice = new BN(cover.priceNXM);
      const expectedTotalReward = coverPrice
        .mul(new BN(stakerRewardPercentage))
        .div(new BN(100));

      rewardValue.toString().should.be.equal(expectedTotalReward.toString());
    });

    it('triggers burn on claim closing with oraclize call', async function () {
      const { qd, cl, mcr, ps, tk } = this;

      const coverID = await qd.getAllCoversOfUser(coverHolder);
      await cl.submitClaim(coverID[0], { from: coverHolder });

      const now = await time.latest();
      await submitMemberVotes.call(this, 1);

      const balanceBefore = await tk.balanceOf(ps.address);
      await concludeClaimWithOraclize.call(this, now, '7');
      await ps.processPendingActions('100');
      const balanceAfter = await tk.balanceOf(ps.address);

      const tokenPrice = await mcr.calculateTokenPrice(currency);
      const sumAssured = ether(cover.amount.toString());
      const expectedBurnedNXMAmount = sumAssured.mul(ether('1')).div(new BN(tokenPrice));
      const totalBurn = balanceBefore.sub(balanceAfter);

      totalBurn.toString().should.be.equal(
        expectedBurnedNXMAmount.toString(),
        `Total burn: ${totalBurn}, expected: ${expectedBurnedNXMAmount}`,
      );
    });
  });

  describe('claim is accepted for 10 stakers', function () {
    before(setup);
    before(initMembers);

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

    before(async function () {
      const { ps, tc, tk } = this;

      for (const staker of this.allStakers) {
        await tk.approve(tc.address, stakeTokens, {
          from: staker,
        });
        await ps.depositAndStake(stakeTokens, [cover.contractAddress], [stakeTokens], {
          from: staker,
        });
      }
    });

    it('sends rewards to all 10 stakers on cover purchase', async function () {
      const { ps, td } = this;

      await buyCover.call(this, cover, coverHolder);

      const stakerRewardPreProcessing = await ps.stakerReward(staker1);
      await ps.processPendingActions('100');
      const stakerRewardPostProcessing = await ps.stakerReward(staker1);

      const rewardValue = new BN(stakerRewardPostProcessing).sub(new BN(stakerRewardPreProcessing));
      const stakerRewardPercentage = await td.stakerCommissionPer();
      const coverPrice = new BN(cover.priceNXM);
      const expectedRewardPerStaker = coverPrice
        .mul(new BN(stakerRewardPercentage))
        .div(new BN(100)).div(new BN(this.allStakers.length));

      rewardValue.toString().should.be.equal(expectedRewardPerStaker.toString());
    });

    it('triggers burn on claim closing with oraclize call', async function () {
      const { qd, cl, mcr, ps, tk } = this;

      const coverID = await qd.getAllCoversOfUser(coverHolder);
      await cl.submitClaim(coverID[0], { from: coverHolder });

      const now = await time.latest();
      await submitMemberVotes.call(this, 1);

      const balanceBefore = await tk.balanceOf(ps.address);
      await concludeClaimWithOraclize.call(this, now, '7');
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

      actualBurn.toString().should.be.equal(
        expectedBurnedNXMAmount.toString(),
        `Total burn: ${actualBurn}, expected: ${expectedBurnedNXMAmount}`,
      );
    });
  });

  describe('claim is rejected', function () {

    before(setup);
    before(initMembers);

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

    before(async function () {

      const { ps, tc, tk, qd, cl } = this;

      const stakeTokens = ether('20');

      await tk.approve(tc.address, stakeTokens, {
        from: staker1,
      });
      await ps.depositAndStake(stakeTokens, [cover.contractAddress], [stakeTokens], {
        from: staker1,
      });

      await buyCover.call(this, cover, coverHolder);

      await ps.processPendingActions('100');
      const coverID = await qd.getAllCoversOfUser(coverHolder);
      await cl.submitClaim(coverID[0], { from: coverHolder });
    });

    it('does not burn any tokens on claim closing with oraclize call', async function () {
      const { ps, tk } = this;
      const now = await time.latest();
      await submitMemberVotes.call(this, -1);

      const balanceBefore = await tk.balanceOf(ps.address);
      await concludeClaimWithOraclize.call(this, now, '6');
      await ps.processPendingActions('100');
      const balanceAfter = await tk.balanceOf(ps.address);
      await ps.processPendingActions('100');

      const totalBurn = balanceBefore.sub(balanceAfter);
      totalBurn.toString().should.be.equal('0', `Total burn: ${totalBurn}, expected: ${0}`);
    });
  });

  describe('claim is accepted and burn happens after an unprocessed unstake request by staker', function () {
    before(setup);
    before(initMembers);

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

    before(async function () {

      const { ps, tc, tk, qd, cl } = this;

      await tk.approve(tc.address, stakeTokens, {
        from: staker1,
      });
      await ps.depositAndStake(stakeTokens, [cover.contractAddress], [stakeTokens], {
        from: staker1,
      });
      await buyCover.call(this, cover, coverHolder);
      await ps.processPendingActions('100');

      await ps.requestUnstake([cover.contractAddress], [stakeTokens], 0, {
        from: staker1,
      });

      const coverID = await qd.getAllCoversOfUser(coverHolder);
      await cl.submitClaim(coverID[0], { from: coverHolder });
    });

    it('triggers burn on claim closing with oraclize call', async function () {
      const { mcr, ps, tk } = this;

      const now = await time.latest();
      await submitMemberVotes.call(this, 1);
      const balanceBefore = await tk.balanceOf(ps.address);
      await concludeClaimWithOraclize.call(this, now, '7');
      await ps.processPendingActions('100');
      const balanceAfter = await tk.balanceOf(ps.address);

      const tokenPrice = await mcr.calculateTokenPrice(currency);
      const sumAssured = new BN(ether(cover.amount.toString()));
      const expectedBurnedNXMAmount = sumAssured.mul(new BN(ether('1'))).div(new BN(tokenPrice));

      const totalBurn = balanceBefore.sub(balanceAfter);
      totalBurn.toString().should.be.equal(
        expectedBurnedNXMAmount.toString(),
        `Total burn: ${totalBurn}, expected: ${expectedBurnedNXMAmount}`,
      );
    });
  });

  describe('claim is accepted and burn happens when the final vote is submitted', function () {
    before(setup);
    before(initMembers);

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

    before(async function () {

      const { ps, tc, tk, qd, cl } = this;

      await tk.approve(tc.address, stakeTokens, {
        from: staker1,
      });
      await ps.depositAndStake(stakeTokens, [cover.contractAddress], [stakeTokens], {
        from: staker1,
      });
      await buyCover.call(this, cover, coverHolder);
      await ps.processPendingActions('100');
      const coverID = await qd.getAllCoversOfUser(coverHolder);
      await cl.submitClaim(coverID[0], { from: coverHolder });
    });

    it('triggers burn on last vote', async function () {
      const { ps, cl, cd, mcr, tk } = this;

      const now = await time.latest();

      const minVotingTime = await cd.minVotingTime();
      const minTime = new BN(minVotingTime.toString()).add(
        new BN(now.toString()),
      );
      await time.increaseTo(
        new BN(minTime.toString()).add(new BN((2).toString())),
      );

      const balanceBefore = await tk.balanceOf(ps.address);
      await submitMemberVotes.call(this, 1, 1);
      await ps.processPendingActions('100');
      const balanceAfter = await tk.balanceOf(ps.address);

      const claimId = (await cd.actualClaimLength()) - 1;
      (await cl.checkVoteClosing(claimId))
        .toString()
        .should.be.equal('-1');

      const claimStatus = await cd.getClaimStatusNumber(claimId);
      claimStatus.statno.toString().should.be.equal('7');

      const tokenPrice = await mcr.calculateTokenPrice(currency);
      const sumAssured = new BN(ether(cover.amount.toString()));
      const expectedBurnedNXMAmount = sumAssured.mul(new BN(ether('1'))).div(new BN(tokenPrice));

      const totalBurn = balanceBefore.sub(balanceAfter);
      totalBurn.toString().should.be.equal(
        expectedBurnedNXMAmount.toString(),
        `Total burn: ${totalBurn}, expected: ${expectedBurnedNXMAmount}`,
      );
    });
  });

  describe('claim is accepted and burn happens after an unstake request by staker is processed', function () {
    before(setup);
    before(initMembers);

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

    it('sets up the arena', async function () {

      const { ps, tc, tk, qd, cl } = this;

      await tk.approve(tc.address, stakeTokens, {
        from: staker1,
      });
      await ps.depositAndStake(stakeTokens, [cover.contractAddress], [stakeTokens], {
        from: staker1,
      });
      await buyCover.call(this, cover, coverHolder);
      await ps.processPendingActions('100');

      const unstakeRequest = await ps.requestUnstake([cover.contractAddress], [stakeTokens], 0, {
        from: staker1,
      });

      const latestBlockTime = await time.latest();
      const expectedUnstakeTime = latestBlockTime.addn(90 * 24 * 3600);

      expectEvent(unstakeRequest, 'UnstakeRequested', {
        staker: staker1,
        amount: stakeTokens,
        unstakeAt: expectedUnstakeTime,
      });

      const unstakeLockTime = await ps.UNSTAKE_LOCK_TIME();
      await time.increase(unstakeLockTime.addn(24 * 60 * 60).toString());

      await ps.processPendingActions('100');

      const hasPendingRequests = await ps.hasPendingUnstakeRequests();
      hasPendingRequests.should.be.equal(false);

      const currentTotalStake = await ps.contractStake(cover.contractAddress);
      currentTotalStake.toString().should.be.equal('0');

      const coverID = await qd.getAllCoversOfUser(coverHolder);
      await cl.submitClaim(coverID[0], { from: coverHolder });
    });

    it('triggers burn on claim closing with oraclize call', async function () {
      const { ps, tk } = this;

      const now = await time.latest();
      await submitMemberVotes.call(this, 1);

      const balanceBefore = await tk.balanceOf(ps.address);
      await concludeClaimWithOraclize.call(this, now, '7');
      await ps.processPendingActions('100');
      const balanceAfter = await tk.balanceOf(ps.address);

      const totalBurn = balanceBefore.sub(balanceAfter);
      totalBurn.toString().should.be.equal('0');
    });
  });
});
