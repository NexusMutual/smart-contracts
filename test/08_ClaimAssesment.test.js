const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolData');
const NXMToken = artifacts.require('NXMToken');
const TokenController = artifacts.require('TokenController');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenData = artifacts.require('TokenDataMock');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const Quotation = artifacts.require('Quotation');
const MCR = artifacts.require('MCR');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const Governance = artifacts.require('GovernanceMock');
const DAI = artifacts.require('MockDAI');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');
const gvProp = require('./utils/gvProposal.js').gvProposal;
const encode = require('./utils/encoder.js').encode;

const CA_ETH = '0x45544800';
const CLA = '0x434c41';
const fee = ether(0.002);
const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133';
const PID = 0;
const smartConAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const coverPeriod = 61;
const coverDetails = [1, 3362445813369838, 744892736679184, 7972408607];
const v = 28;
const r = '0x66049184fb1cf394862cca6c3b2a0c462401a671d0f2b20597d121e56768f90a';
const s = '0x4c28c8f8ff0548dd3a41d7c75621940eb4adbac13696a2796e98a59691bf53ff';

const coverDetailsDai = [5, 16812229066849188, 5694231991898, 7972408607];
const vrs_dai = [
  27,
  '0xdcaa177410672d90890f1c0a42a965b3af9026c04caedbce9731cb43827e8556',
  '0x2b9f34e81cbb79f9af4b8908a7ef8fdb5875dedf5a69f84cd6a80d2a4cc8efff'
];

let P1;
let p2;
let tk;
let tf;
let tc;
let td;
let cr;
let cl;
let qd;
let qt;
let cad;
let mcr;
let nxms;
let mr;
let pd;
let gv;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('Claim: Assessment', function([
  owner,
  member1,
  member2,
  member3,
  member4,
  member5,
  staker1,
  staker2,
  coverHolder,
  notMember
]) {
  const P_18 = new BigNumber(1e18);
  const stakeTokens = ether(5);
  const tokens = ether(60);
  const validity = duration.days(30);
  const UNLIMITED_ALLOWANCE = new BigNumber(2).pow(256).minus(1);
  const BOOK_TIME = new BigNumber(duration.hours(13));
  let coverID;
  let closingTime;
  let minTime;
  let maxVotingTime;
  let claimId;

  before(async function() {
    await advanceBlock();
    tk = await NXMToken.deployed();
    tf = await TokenFunctions.deployed();
    td = await TokenData.deployed();
    cr = await ClaimsReward.deployed();
    cl = await Claims.deployed();
    cd = await ClaimsData.deployed();
    qd = await QuotationDataMock.deployed();
    P1 = await Pool1.deployed();
    pd = await PoolData.deployed();
    qt = await Quotation.deployed();
    mcr = await MCR.deployed();
    nxms = await NXMaster.deployed();
    tc = await TokenController.at(await nxms.getLatestAddress('TC'));
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    gv = await Governance.at(await nxms.getLatestAddress('GV'));
    p2 = await Pool2.deployed();
    cad = await DAI.deployed();
    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);
    await mcr.addMCRData(
      18000,
      100 * 1e18,
      2 * 1e18,
      ['0x455448', '0x444149'],
      [100, 65407],
      20181011
    );
    (await pd.capReached()).should.be.bignumber.equal(1);
    // await mr.payJoiningFee(owner, { from: owner, value: fee });
    // await mr.kycVerdict(owner, true);
    await mr.payJoiningFee(member1, { from: member1, value: fee });
    await mr.kycVerdict(member1, true);
    await mr.payJoiningFee(member2, { from: member2, value: fee });
    await mr.kycVerdict(member2, true);
    await mr.payJoiningFee(member3, { from: member3, value: fee });
    await mr.kycVerdict(member3, true);
    await mr.payJoiningFee(staker1, { from: staker1, value: fee });
    await mr.kycVerdict(staker1, true);
    await mr.payJoiningFee(staker2, { from: staker2, value: fee });
    await mr.kycVerdict(staker2, true);
    await mr.payJoiningFee(coverHolder, { from: coverHolder, value: fee });
    await mr.kycVerdict(coverHolder, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member1 });
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member2 });
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member3 });
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: staker1 });
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: staker2 });
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: coverHolder });

    await tk.transfer(member1, ether(250));
    await tk.transfer(member2, ether(250));
    await tk.transfer(member3, ether(250));
    await tk.transfer(coverHolder, ether(250));
    await tk.transfer(staker1, ether(250));
    await tk.transfer(staker2, ether(250));
    await tf.addStake(smartConAdd, stakeTokens, { from: staker1 });
    await tf.addStake(smartConAdd, stakeTokens, { from: staker2 });
    maxVotingTime = await cd.maxVotingTime();
  });

  describe('Member locked Tokens for Claim Assessment', function() {
    describe('Voting is not closed yet', function() {
      describe('CA not voted yet', function() {
        describe('All CAs rejects claim', function() {
          before(async function() {
            await tc.lock(CLA, tokens, validity, {
              from: member1
            });
            await tc.lock(CLA, tokens, validity, {
              from: member2
            });
            await tc.lock(CLA, tokens, validity, {
              from: member3
            });
            await P1.makeCoverBegin(
              smartConAdd,
              'ETH',
              coverDetails,
              coverPeriod,
              v,
              r,
              s,
              { from: coverHolder, value: coverDetails[1] }
            );
            await P1.makeCoverBegin(
              smartConAdd,
              'ETH',
              coverDetails,
              coverPeriod,
              v,
              r,
              s,
              { from: coverHolder, value: coverDetails[1] }
            );
            coverID = await qd.getAllCoversOfUser(coverHolder);
            await cl.submitClaim(coverID[0], { from: coverHolder });
            const minVotingTime = await cd.minVotingTime();
            const now = await latestTime();
            minTime = minVotingTime.plus(now);
            await cl.getClaimFromNewStart(0, { from: member1 });
            await cl.getUserClaimByIndex(0, { from: coverHolder });
            await cl.getClaimbyIndex(1, { from: coverHolder });
            claimId = (await cd.actualClaimLength()) - 1;
          });
          it('8.1 voting should be open', async function() {
            (await cl.checkVoteClosing(claimId)).should.be.bignumber.equal(0);
          });
          it('8.2 should let claim assessors to vote for claim assessment', async function() {
            let initialCAVoteTokens = await cd.getCaClaimVotesToken(claimId);
            await cl.submitCAVote(claimId, -1, { from: member1 });
            await cl.submitCAVote(claimId, -1, { from: member2 });
            await cl.submitCAVote(claimId, -1, { from: member3 });
            let finalCAVoteTokens = await cd.getCaClaimVotesToken(claimId);
            (finalCAVoteTokens[1] - initialCAVoteTokens[1]).should.be.equal(
              tokens * 3
            );
            let all_votes = await cd.getAllVotesForClaim(claimId);
            expectedVotes = all_votes[1].length;
            expectedVotes.should.be.equal(3);
            let isBooked = await td.isCATokensBooked(member1);
            isBooked.should.be.equal(true);
          });
          it('8.3 should not let claim assessors to vote for 2nd time in same claim id', async function() {
            await assertRevert(cl.submitCAVote(claimId, -1, { from: member2 }));
          });
          it('8.4 should not let member to vote for CA', async function() {
            await assertRevert(
              cl.submitMemberVote(claimId, -1, { from: member1 })
            );
          });
          it('8.5 should close voting after min time', async function() {
            await increaseTimeTo(minTime.plus(2));
            (await cl.checkVoteClosing(claimId)).should.be.bignumber.equal(1);
          });
          it('8.6 should not able to vote after voting close', async function() {
            await assertRevert(cl.submitCAVote(claimId, 1, { member1 }));
          });
          it('8.7 should be able to change claim status', async function() {
            let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

            APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
            await P1.__callback(APIID, '');
            const newCStatus = await cd.getClaimStatusNumber(claimId);
            newCStatus[1].should.be.bignumber.equal(6);
          });
          it('8.8 voting should be closed', async function() {
            (await cl.checkVoteClosing(claimId)).should.be.bignumber.equal(-1);
          });
        });

        describe('All CAs accept claim', function() {
          let initialStakedTokens1;
          let initialStakedTokens2;
          let priceinEther;
          before(async function() {
            const now = await latestTime();
            await increaseTimeTo(BOOK_TIME.plus(now));
            coverID = await qd.getAllCoversOfUser(coverHolder);
            await cl.submitClaim(coverID[1], { from: coverHolder });
            claimId = (await cd.actualClaimLength()) - 1;
            initialStakedTokens1 = await tf.getStakerLockedTokensOnSmartContract(
              staker1,
              smartConAdd,
              0
            );
            initialStakedTokens2 = await tf.getStakerLockedTokensOnSmartContract(
              staker2,
              smartConAdd,
              1
            );
          });

          it('8.9 should let claim assessor to vote for claim assessment', async function() {
            await cl.submitCAVote(claimId, 1, { from: member1 });
            await cl.submitCAVote(claimId, 1, { from: member2 });
            await cl.submitCAVote(claimId, 1, { from: member3 });
            await cl.getClaimFromNewStart(0, { from: member1 });
            await cl.getClaimFromNewStart(1, { from: member1 });
            await cd.getVoteToken(claimId, 0, 1);
            await cd.getVoteVoter(claimId, 1, 1);
            let verdict = await cd.getVoteVerdict(claimId, 1, 1);
            parseFloat(verdict).should.be.equal(1);
          });
          it('8.10 should not able to vote after voting closed', async function() {
            const now = await latestTime();
            const maxVotingTime = await cd.maxVotingTime();
            closingTime = maxVotingTime.plus(now);
            await increaseTimeTo(closingTime.plus(6));
            await assertRevert(cl.submitCAVote(claimId, 1, { from: member1 }));
          });
          it('8.11 orcalise call should be able to change claim status', async function() {
            let apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
            priceinEther = await mcr.calculateTokenPrice(CA_ETH);
            await P1.__callback(apiid, '');
            const newCStatus = await cd.getClaimStatusNumber(claimId);
            newCStatus[1].should.be.bignumber.equal(7);
          });
          it('8.12 voting should be closed', async function() {
            (await cl.checkVoteClosing(claimId)).should.be.bignumber.equal(-1);
          });
        });
      });
      describe('CA not voted', function() {
        before(async function() {
          coverID = await qd.getAllCoversOfUser(coverHolder);
          await cl.submitClaim(coverID[0], { from: coverHolder });
          claimId = (await cd.actualClaimLength()) - 1;
          const now = await latestTime();
          closingTime = maxVotingTime.plus(now);
          await increaseTimeTo(closingTime.plus(2));
        });
        it('8.14 oracalise call should open voting for members after CA voting time expires', async function() {
          let apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
          await P1.__callback(apiid, '');
          const newCStatus = await cd.getClaimStatusNumber(claimId);
          newCStatus[1].should.be.bignumber.equal(3);
        });
        describe('Member not voted', function() {
          before(async function() {
            const now = await latestTime();
            closingTime = maxVotingTime.plus(now);
            await increaseTimeTo(closingTime.plus(2));
            claimId = (await cd.actualClaimLength()) - 1;
          });
          describe('After Member vote closing time', function() {
            it('8.15 should close voting ', async function() {
              (await cl.checkVoteClosing(claimId)).should.be.bignumber.equal(1);
            });
            it('8.16 oracalise call should change claim status ', async function() {
              let apiid = await pd.allAPIcall(
                (await pd.getApilCallLength()) - 1
              );
              await P1.__callback(apiid, '');
              const newCStatus = await cd.getClaimStatusNumber(claimId);
              newCStatus[1].should.be.bignumber.equal(11);
            });
            it('8.17 voting should be closed', async function() {
              (await cl.checkVoteClosing(claimId)).should.be.bignumber.equal(
                -1
              );
            });
          });
        });

        describe('Member rejects claim', function() {
          before(async function() {
            await P1.makeCoverBegin(
              smartConAdd,
              'ETH',
              coverDetails,
              coverPeriod,
              v,
              r,
              s,
              { from: coverHolder, value: coverDetails[1] }
            );
            coverID = await qd.getAllCoversOfUser(coverHolder);
            await cl.submitClaim(coverID[2], { from: coverHolder });
            claimId = (await cd.actualClaimLength()) - 1;
            const now = await latestTime();
            closingTime = maxVotingTime.plus(now);
            await increaseTimeTo(closingTime.plus(2));
            let apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
            await P1.__callback(apiid, '');
            await cd.getAllClaimsByAddress(coverHolder);
          });
          it('8.18 member should be able to cast vote', async function() {
            await cl.submitMemberVote(claimId, -1, { from: member1 });
            await cl.submitMemberVote(claimId, -1, { from: member2 });
            await cl.submitMemberVote(claimId, -1, { from: member3 });
            let apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
            await P1.__callback(apiid, '');
            let claimed = await cr.getRewardAndClaimedStatus(0, claimId, {
              from: member1
            });
            let claimed1 = await cr.getRewardAndClaimedStatus(0, 0, {
              from: member1
            });
            await cr.claimAllPendingReward([], { from: member1 });
            claimed[1].should.be.equal(false);
            await cl.getClaimFromNewStart(0, { from: member1 });
            await cl.getClaimFromNewStart(1, { from: member1 });
            await cd.getVoteToken(claimId, 0, 0);
            await cd.getVoteVoter(claimId, 0, 0);
            await cd.getMemberClaimVotesToken(claimId);
            await cd.getVoterVote(1);
            await cd.getClaimState12Count(claimId);
            await cd.getVoteAddressMember(member1, 0);
            // await cr.claimAllPendingReward({ from: member1 });
            await cd.getVoteAddressMemberLength(member1);
            // await cr.getRewardToBeDistributedByUser(member1);
          });
          it('8.19 should not be able to cast vote by CA in member voting', async function() {
            await assertRevert(cl.submitCAVote(claimId, 1, { from: member1 }));
          });

          it('8.20 should not let member to vote for 2nd time in same claim id', async function() {
            await assertRevert(
              cl.submitMemberVote(claimId, -1, { from: member1 })
            );
          });
          it('8.21 member should not be able to transfer any tokens', async function() {
            let claimCALen = await cd.getClaimVoteLength(claimId, 1);
            let claimMemLen = await cd.getClaimVoteLength(claimId, 0);
            let verdict = await cd.getVoteVerdict(claimId, 1, 0);
            parseFloat(verdict).should.be.equal(-1);
            let userClaimCount = await cd.getUserClaimCount(coverHolder);
            await assertRevert(tk.transfer(member2, tokens, { from: member1 }));
            await tk.approve(member2, tokens, { from: coverHolder });
          });
          it('8.22 should not able to vote after voting closed', async function() {
            const now = await latestTime();
            closingTime = maxVotingTime.plus(now);
            await increaseTimeTo(closingTime.plus(2));
            await assertRevert(
              cl.submitMemberVote(claimId, -1, { from: member1 })
            );
          });
          it('8.23 should change claim status', async function() {
            let apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
            await P1.__callback(apiid, '');
            const newCStatus = await cd.getClaimStatusNumber(claimId);
            newCStatus[1].should.be.bignumber.equal(9);
            // await cd.updateState12Count(claimId, 1);
            // await cr.getRewardAndClaimedStatus(0, claimId, { from: member1 });
            // await cr.getRewardToBeDistributedByUser(member1);
          });
        });

        describe('Member accept claims', function() {
          before(async function() {
            await cl.submitClaim(coverID[2], { from: coverHolder });
            claimId = (await cd.actualClaimLength()) - 1;
            let now = await latestTime();
            closingTime = maxVotingTime.plus(now);
            await increaseTimeTo(closingTime.plus(2));
            let apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
            await P1.__callback(apiid, '');
            // await cd.getAllClaimsByAddress(coverHolder);
          });
          it('8.24 member should be able to cast vote', async function() {
            await cl.submitMemberVote(claimId, 1, { from: member1 });
            await cl.submitMemberVote(claimId, 1, { from: member2 });
            await cl.submitMemberVote(claimId, 1, { from: member3 });
            await cl.getClaimFromNewStart(0, { from: member1 });
            await cl.getClaimFromNewStart(1, { from: member1 });
            await cd.getVoteToken(claimId, 0, 0);
            await cd.getVoteVoter(claimId, 0, 0);
            await cd.getMemberClaimVotesToken(claimId);
            await cd.getVoterVote(1);
            await cd.getClaimState12Count(claimId);
            await cd.getVoteAddressMember(member1, 0);
            await cd.getVoteAddressMemberLength(member1);
          });

          it('8.25 should change claim status', async function() {
            const now = await latestTime();
            closingTime = maxVotingTime.plus(now);
            await increaseTimeTo(closingTime.plus(2));
            let apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
            await P1.__callback(apiid, '');
            const newCStatus = await cd.getClaimStatusNumber(claimId);
            newCStatus[1].should.be.bignumber.equal(8);
            // await cd.updateState12Count(claimId, 1);
            // await cr.getRewardAndClaimedStatus(0, claimId, { from: member1 });
            // await cr.getRewardToBeDistributedByUser(member1);
          });
        });
      });
    });
  });

  describe('Member not locked tokens for Claim Assessment', function() {
    before(async function() {
      await P1.makeCoverBegin(
        smartConAdd,
        'ETH',
        coverDetails,
        coverPeriod,
        v,
        r,
        s,
        { from: coverHolder, value: coverDetails[1] }
      );
      coverID = await qd.getAllCoversOfUser(coverHolder);
      await cl.submitClaim(coverID[3], { from: coverHolder });
    });
  });
  describe('Expire Cover', function() {
    it('8.27 CSA should not change while ExpireCover if cover status is 1', async function() {
      const now = await latestTime();
      await increaseTimeTo(now + 62 * 24 * 3600);
      let CSA = await qd.getTotalSumAssured('ETH');
      await qt.expireCover(coverID[1]);
      CSA.should.be.bignumber.equal(await qd.getTotalSumAssured('ETH'));
    });
  });

  describe('CA Pool have insuffecient funds for payout', function() {
    before(async function() {
      await mr.payJoiningFee(member4, { from: member4, value: fee });
      await mr.kycVerdict(member4, true);
      await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member4 });
      await tk.transfer(member4, ether(400));
      await P1.makeCoverBegin(
        smartConAdd,
        'ETH',
        coverDetails,
        coverPeriod,
        v,
        r,
        s,
        { from: coverHolder, value: coverDetails[1] }
      );
      coverID = await qd.getAllCoversOfUser(coverHolder);
      let now = await latestTime();
      await increaseTimeTo(BOOK_TIME.plus(now));
      await cl.submitClaim(coverID[coverID.length - 1], { from: coverHolder });
      let clid = (await cd.actualClaimLength()) - 1;
      await tc.lock(CLA, ether(400), duration.days(300), {
        from: member4
      });
      await cl.submitCAVote(clid, 1, { from: member4 });
      now = await latestTime();
      let maxVoteTime = await cd.maxVotingTime();
      await increaseTimeTo(now / 1 + maxVoteTime / 1 + 10);
    });
    it('8.28 Payout fails', async function() {
      await tf.upgradeCapitalPool(member2);
      let clid = (await cd.actualClaimLength()) - 1;
      let apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await P1.__callback(apiid, '');
      let cStatus = await cd.getClaimStatusNumber(clid);
      (12).should.be.equal(parseFloat(cStatus[1]));
    });
    it('8.29 Retry Payout 60 times and should not take action from 61st attempt', async function() {
      await tf.upgradeCapitalPool(member2);
      let apiid;
      let clid = (await cd.actualClaimLength()) - 1;
      let payOutRetry = await cd.payoutRetryTime();
      for (var i = 0; i < 61; i++) {
        // console.log(i);
        let now = await latestTime();
        await increaseTimeTo(payOutRetry / 1 + now / 1 + 10);
        check = await cl.checkVoteClosing(clid);
        let cStatus = await cd.getClaimStatusNumber(clid);
        // console.log(parseFloat(cStatus[1]));
        if (i != 60) parseFloat(check).should.be.equal(1);

        apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 2);
        await P1.__callback(apiid, '');
      }
      check = await cl.checkVoteClosing(clid);
      parseFloat(check).should.be.equal(-1);
      let cStatus = await cd.getClaimStatusNumber(clid);
      (13).should.be.equal(parseFloat(cStatus[1]));
      await P1.sendTransaction({ from: owner, value: 10 * 1e18 });
      console.log(await pd.getApiIdTypeOf(apiid));
      await P1.__callback(apiid, '');
      cStatus = await cd.getClaimStatusNumber(clid);
      coverID = await qd.getAllCoversOfUser(coverHolder);
      let coveStatus = await qd.getCoverStatusNo(coverID[coverID.length - 1]);
      (2).should.be.equal(parseFloat(coveStatus));
      (13).should.be.equal(parseFloat(cStatus[1]));
    });
    it('8.30 Payout fails for 1st time and later complete', async function() {
      await cad.transfer(coverHolder, 20 * 1e18);
      await cad.approve(P1.address, coverDetailsDai[1], {
        from: coverHolder
      });
      await P1.makeCoverUsingCA(
        smartConAdd,
        'DAI',
        coverDetailsDai,
        coverPeriod,
        vrs_dai[0],
        vrs_dai[1],
        vrs_dai[2],
        { from: coverHolder }
      );
      coverID = await qd.getAllCoversOfUser(coverHolder);
      await cl.submitClaim(coverID[coverID.length - 1], { from: coverHolder });
      let clid = (await cd.actualClaimLength()) - 1;
      await cl.submitCAVote(clid, 1, { from: member4 });
      let now = await latestTime();
      let maxVoteTime = await cd.maxVotingTime();
      await increaseTimeTo(now / 1 + maxVoteTime / 1 + 100);
      cStatus = await cd.getClaimStatusNumber(clid);
      let apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await P1.__callback(apiid, '');
      cStatus = await cd.getClaimStatusNumber(clid);
      (12).should.be.equal(parseFloat(cStatus[1]));
      await cad.transfer(P1.address, 20 * 1e18);
      apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await P1.__callback(apiid, '');
      cStatus = await cd.getClaimStatusNumber(clid);
      (14).should.be.equal(parseFloat(cStatus[1]));
    });
  });
  describe('More basic test cases', function() {
    before(async function() {
      // let now = await latestTime();
      // await increaseTimeTo(BOOK_TIME.plus(now));
      await mr.payJoiningFee(member5, { from: member5, value: fee });
      await mr.kycVerdict(member5, true);
      await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member5 });
      await tk.transfer(member5, ether(250));
      await tc.lock(CLA, ether(200), duration.days(300), {
        from: member5
      });
      await P1.makeCoverBegin(
        smartConAdd,
        'ETH',
        coverDetails,
        coverPeriod,
        v,
        r,
        s,
        { from: coverHolder, value: coverDetails[1] }
      );
      coverID = await qd.getAllCoversOfUser(coverHolder);
      await cl.submitClaim(coverID[coverID.length - 1], { from: coverHolder });
    });
    it('8.31 should not allow to cast CA vote if not locked under CA', async function() {
      let clid = (await cd.actualClaimLength()) - 1;
      await assertRevert(cl.submitCAVote(clid, -1, { from: staker1 }));
    });
    it('8.32 should not be able to CAs right to cast CA vote for 3 days', async function() {
      await assertRevert(cd.setUserClaimVotePausedOn(member1));
    });
    it('8.33 should not be able to update uint parameter directly', async function() {
      await assertRevert(cd.updateUintParameters('A', 12));
    });
    it('8.34 should get 0 for wrong code', async function() {
      let val = await cd.getUintParameters('EPTIME');
      (val[1] / 1).should.be.equal(0);
    });
    it('8.35 even if passed by governance should not trigger action for wrong code', async function() {
      actionHash = encode('updateUintParameters(bytes8,uint)', 'asd', 12);
      await gvProp(24, actionHash, mr, gv, 2);
    });
    it('8.36 should able to propose to block CAs right to cast CA vote for 3 days', async function() {
      let val = await cd.userClaimVotePausedOn(member1);
      (val / 1).should.be.equal(0);
      actionHash = encode('setUserClaimVotePausedOn(address)', member1);
      await gvProp(9, actionHash, mr, gv, 1);
      val = await cd.userClaimVotePausedOn(member1);
      (val / 1).should.not.be.equal(0);
    });
    it('8.37 should not able to vote as CA if blocked', async function() {
      let clid = (await cd.actualClaimLength()) - 1;
      await assertRevert(cl.submitCAVote(clid, -1, { from: member1 }));
    });
    it('8.38 should close voting during casting vote as CA', async function() {
      now = await latestTime();
      let minVoteTime = await cd.minVotingTime();
      await increaseTimeTo(now / 1 + minVoteTime / 1 + 10);
      let clid = (await cd.actualClaimLength()) - 1;
      await cl.submitCAVote(clid, -1, { from: member5 });
      tokenVoted = await cd.getTokensClaim(member5, clid);
      parseFloat(tokenVoted[1]).should.be.equal(parseFloat(ether(200)));
      (await cl.checkVoteClosing(clid)).should.be.bignumber.equal(-1);
    });

    it('8.39 should close voting during casting vote as Member', async function() {
      coverID = await qd.getAllCoversOfUser(coverHolder);
      await cl.submitClaim(coverID[coverID.length - 1], { from: coverHolder });
      let clid = (await cd.actualClaimLength()) - 1;
      let now = await latestTime();
      let maxVoteTime = await cd.maxVotingTime();
      await increaseTimeTo(now / 1 + maxVoteTime / 1 + 10);
      let apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await P1.__callback(apiid, '');
      now = await latestTime();
      let minVoteTime = await cd.minVotingTime();
      await increaseTimeTo(now / 1 + minVoteTime / 1 + 10);
      await cl.submitMemberVote(clid, -1, { from: member5 });
      (await cl.checkVoteClosing(clid)).should.be.bignumber.equal(-1);
    });
    it('8.40 should revert while selling NXMs', async function() {
      await assertRevert(P1.sellNXMTokens(2 * 1e18, { from: member5 }));
    });
    it('8.41 should handle if commissionToBePaid is 0', async function() {
      await P1.updateStakerCommissions(smartConAdd, 0);
    });
    it('8.41 should handle if burnNXMAmount is 0', async function() {
      await P1.burnStakerLockedToken(1, 'ETH', 0);
    });
  });
});
