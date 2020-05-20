const { accounts, defaultSender, web3 } = require('@openzeppelin/test-environment');
const { expectRevert, ether, time } = require('@openzeppelin/test-helpers');
require('chai').should();
const { getQuoteValues, getValue } = require('../external');
const { hex } = require('../utils').helpers
const setup = require('../setup');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const BN = web3.utils.BN;

const fee = ether('0.002');

const LOCK_REASON_CLAIM = '0x434c41';


function coverToCoverDetailsArray(cover) {
  return [cover.amount, cover.price, cover.priceNXM, cover.expireTime, cover.generationTime];
}

describe('stake', function () {

  this.timeout(10000);
  const owner = defaultSender;
  const [
    member1,
    member2,
    member3,
    staker1,
    staker2,
    coverHolder
  ] = accounts;

  const tokens = ether('60');
  const validity = 30 * 24 * 60 * 60; // 30 days
  const UNLIMITED_ALLOWANCE = new BN('2')
    .pow(new BN('256'))
    .sub(new BN('1'));

  async function initMembers () {
    const { mr, mcr, pd, tk, tc, cd } = this;

    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);

    const minimumCapitalRequirementPercentage = await getValue(ether('2'), pd, mcr);
    console.log(`mcrP ${minimumCapitalRequirementPercentage}`);
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

    const members = [member1, member2, member3, staker1, staker2, coverHolder];

    for (let member of members) {
      await mr.payJoiningFee(member, { from: member, value: fee });
      await mr.kycVerdict(member, true);
      await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member });
      await tk.transfer(member, ether('250'));
    }

    maxVotingTime = await cd.maxVotingTime();
    await tc.lock(LOCK_REASON_CLAIM, tokens, validity, {
      from: member1,
    });
    await tc.lock(LOCK_REASON_CLAIM, tokens, validity, {
      from: member2,
    });
    await tc.lock(LOCK_REASON_CLAIM, tokens, validity, {
      from: member3,
    });
  }


  describe('claim amount is higher than stake amount', function () {

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
      contractAddress: '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'
    };

    before(async function () {

      const { ps, tk } = this;

      const stakeTokens = ether('20');

      await tk.approve(ps.address, stakeTokens, {
        from: staker1
      });
      await ps.stake(stakeTokens, [cover.contractAddress], [stakeTokens], {
        from: staker1
      });

    });

    it('sends rewards to staker on cover purchase', async function () {
      const { qt, p1, ps, td } = this;

      const vrsData = await getQuoteValues(
        coverToCoverDetailsArray(cover),
        cover.currency,
        cover.period,
        cover.contractAddress,
        qt.address
      );
      await p1.makeCoverBegin(
        cover.contractAddress,
        cover.currency,
        coverToCoverDetailsArray(cover),
        cover.period,
        vrsData[0],
        vrsData[1],
        vrsData[2],
        { from: coverHolder, value: cover.price }
      );

      const stakerRewardPreProcessing = await ps.stakerReward(staker1);
      await ps.processPendingActions();
      const stakerRewardPostProcessing = await ps.stakerReward(staker1);

      const rewardValue = new BN(stakerRewardPostProcessing).sub(new BN(stakerRewardPreProcessing));
      const stakerRewardPercentage = await td.stakerCommissionPer();
      const coverPrice = new BN(cover.priceNXM);
      const expectedTotalReward = coverPrice
        .mul(new BN(stakerRewardPercentage))
        .div(new BN(100));

      rewardValue.toString().should.be.equal(expectedTotalReward.toString());
    });

    it('triggers burn on vote closing by oraclize', async function () {
      const { qd, cl, cd, td, pd, p1, mcr, ps } = this;

      const coverID = await qd.getAllCoversOfUser(coverHolder);
      await cl.submitClaim(coverID[0], {from: coverHolder});
      const minVotingTime = await cd.minVotingTime();
      const now = await time.latest();
      minTime = new BN(minVotingTime.toString()).add(
        new BN(now.toString())
      );
      await cl.getClaimFromNewStart(0, {from: member1});
      await cl.getUserClaimByIndex(0, {from: coverHolder});
      await cl.getClaimbyIndex(1, {from: coverHolder});
      claimId = (await cd.actualClaimLength()) - 1;

      let initialCAVoteTokens = await cd.getCaClaimVotesToken(claimId);
      await cl.submitCAVote(claimId, 1, {from: member1});
      await cl.submitCAVote(claimId, 1, {from: member2});
      await cl.submitCAVote(claimId, 1, {from: member3});
      let finalCAVoteTokens = await cd.getCaClaimVotesToken(claimId);
      (finalCAVoteTokens[1] - initialCAVoteTokens[1]).should.be.equal(
        tokens * 3
      );
      let allVotes = await cd.getAllVotesForClaim(claimId);
      expectedVotes = allVotes[1].length;
      expectedVotes.should.be.equal(3);
      let isBooked = await td.isCATokensBooked(member1);
      isBooked.should.be.equal(true);
      await time.increaseTo(
        new BN(minTime.toString()).add(new BN((2).toString()))
      );
      (await cl.checkVoteClosing(claimId))
        .toString()
        .should.be.equal((1).toString());
      let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await p1.__callback(APIID, '');
      const newCStatus = await cd.getClaimStatusNumber(claimId);
      newCStatus[1].toString().should.be.equal((7).toString());

      (await cl.checkVoteClosing(claimId))
        .toString()
        .should.be.equal((-1).toString());


      const tokenPrice = await mcr.calculateTokenPrice(currency);
      const sumAssured = new BN(ether(cover.amount.toString()));
      const expectedBurnedNXMAmount = sumAssured.mul(new BN(ether('1'))).div( new BN(tokenPrice));

      const storedTotalBurn = await ps.contractBurn(cover.contractAddress);
      storedTotalBurn.toString().should.be.equal(expectedBurnedNXMAmount.toString());
    })
  })
});
