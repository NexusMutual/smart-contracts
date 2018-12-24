const Pool1 = artifacts.require('Pool1');
const PoolData = artifacts.require('PoolData');
const NXMToken = artifacts.require('NXMToken');
const TokenController = artifacts.require('TokenController');
const TokenFunctions = artifacts.require('TokenFunctions');
const TokenData = artifacts.require('TokenData');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const Quotation = artifacts.require('Quotation');
const MCR = artifacts.require('MCR');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');

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

let P1;
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
    tc = await TokenController.deployed();
    td = await TokenData.deployed();
    cr = await ClaimsReward.deployed();
    cl = await Claims.deployed();
    cd = await ClaimsData.deployed();
    qd = await QuotationDataMock.deployed();
    P1 = await Pool1.deployed();
    pd = await PoolData.deployed();
    qt = await Quotation.deployed();
    mcr = await MCR.deployed();
    await tf.payJoiningFee(member1, { from: member1, value: fee });
    await tf.kycVerdict(member1, true);
    await tf.payJoiningFee(member2, { from: member2, value: fee });
    await tf.kycVerdict(member2, true);
    await tf.payJoiningFee(member3, { from: member3, value: fee });
    await tf.kycVerdict(member3, true);
    await tf.payJoiningFee(staker1, { from: staker1, value: fee });
    await tf.kycVerdict(staker1, true);
    await tf.payJoiningFee(staker2, { from: staker2, value: fee });
    await tf.kycVerdict(staker2, true);
    await tf.payJoiningFee(coverHolder, { from: coverHolder, value: fee });
    await tf.kycVerdict(coverHolder, true);
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
            await cl.getCATokensLockedAgainstClaim(member1, 1, {
              from: owner
            });
            claimId = (await cd.actualClaimLength()) - 1;
          });
          it('voting should be open', async function() {
            (await cl.checkVoteClosing(claimId)).should.be.bignumber.equal(0);
          });
          it('should let claim assessors to vote for claim assessment', async function() {
            await cl.submitCAVote(claimId, -1, { from: member1 });
            await cl.submitCAVote(claimId, -1, { from: member2 });
            await cl.submitCAVote(claimId, -1, { from: member3 });
            await cd.getAllVotesForClaim(claimId);
          });
          it('should close voting after min time', async function() {
            await increaseTimeTo(minTime.plus(2));
            (await cl.checkVoteClosing(claimId)).should.be.bignumber.equal(1);
          });
          it('should be able change claim status', async function() {
            await cr.changeClaimStatus(claimId);
            const newCStatus = await cd.getClaimStatusNumber(claimId);
            newCStatus[1].should.be.bignumber.equal(6);
          });
          it('voting should be closed', async function() {
            (await cl.checkVoteClosing(claimId)).should.be.bignumber.equal(-1);
          });
        });

        describe('All CAs accept claim', function() {
          before(async function() {
            const now = await latestTime();
            await increaseTimeTo(BOOK_TIME.plus(now));
            coverID = await qd.getAllCoversOfUser(coverHolder);
            await cl.submitClaim(coverID[1], { from: coverHolder });
            claimId = (await cd.actualClaimLength()) - 1;
          });

          it('should let claim assessor to vote for claim assessment', async function() {
            await cl.submitCAVote(claimId, 1, { from: member1 });
            await cl.submitCAVote(claimId, 1, { from: member2 });
            await cl.submitCAVote(claimId, 1, { from: member3 });
            await cl.getClaimFromNewStart(0, { from: member1 });
            await cl.getClaimFromNewStart(1, { from: member1 });
            await cd.getVoteToken(claimId, 0, 1);
            await cd.getVoteVoter(claimId, 1, 1);
            await cd.setpendingClaimStart(1);
            await assertRevert(cd.setpendingClaimStart(0));
          });
          it('should be able change claim status', async function() {
            await cd.getCaClaimVotesToken(claimId);
            await cd.getVoteVerdict(claimId, 1, 1);
            const now = await latestTime();
            const maxVotingTime = await cd.maxVotingTime();
            closingTime = maxVotingTime.plus(now);
            await increaseTimeTo(closingTime.plus(6));
            await cr.changeClaimStatus(claimId);
            const newCStatus = await cd.getClaimStatusNumber(claimId);
            newCStatus[1].should.be.bignumber.equal(7);
          });
          it('voting should be closed', async function() {
            (await cl.checkVoteClosing(claimId)).should.be.bignumber.equal(-1);
          });
          it('should burn stakers staked tokens', async function() {
            const initialStakedTokens = await tf.getStakerLockedTokensOnSmartContract(
              staker1,
              smartConAdd,
              0
            );
            const priceinEther = await mcr.calculateTokenPrice(CA_ETH);
            const burnedAmount = 1e18 / priceinEther - 1;
            (await tf.getStakerLockedTokensOnSmartContract(
              staker1,
              smartConAdd,
              0
            )).should.be.bignumber.equal(
              initialStakedTokens.minus(burnedAmount.toFixed(0))
            );
          });
          it('should burns tokens used for fraudulent voting against a claim', async function() {
            const initialTB = await tc.tokensLocked(member1, CLA);
            const initialTS = await tk.totalSupply();
            await assertRevert(tf.burnCAToken(claimId, ether(1), notMember));
            await tf.burnCAToken(claimId, ether(1), member1);
            (await tc.tokensLocked(member1, CLA)).should.be.bignumber.equal(
              initialTB.minus(ether(1))
            );
            (await tk.totalSupply()).should.be.bignumber.equal(
              initialTS.minus(ether(1))
            );
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
        it('should open voting for members after CA voting time expires', async function() {
          await cr.changeClaimStatus(claimId);
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
            it('should close voting ', async function() {
              (await cl.checkVoteClosing(claimId)).should.be.bignumber.equal(1);
            });
            it('should change claim status ', async function() {
              await cr.changeClaimStatus(claimId);
              const newCStatus = await cd.getClaimStatusNumber(claimId);
              newCStatus[1].should.be.bignumber.equal(11);
            });
            it('voting should be closed', async function() {
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
            await cr.changeClaimStatus(claimId);
            await cd.getAllClaimsByAddress(coverHolder);
          });
          it('member should be able to cast vote', async function() {
            await cl.submitMemberVote(claimId, -1, { from: member1 });
            await cl.submitMemberVote(claimId, -1, { from: member2 });
            await cl.submitMemberVote(claimId, -1, { from: member3 });
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
          // it('member should not be able to transfer any tokens', async function() {
          //   await cd.getClaimVoteLength(claimId, 1);
          //   await cd.getClaimLength();
          //   await cd.getClaimVoteLength(claimId, 0);
          //   await cd.getVoteVerdict(claimId, 1, 0);
          //   await cd.getUserClaimCount(coverHolder);
          //   await assertRevert(
          //     tk.transfer(member2, tokens, { from: member1 })
          //   );
          //   await tk.approve(member2, tokens, { from: coverHolder });
          //   await assertRevert(
          //     tk.transferFrom(coverHolder, member3, tokens, {
          //       from: member2
          //     })
          //   );
          // });
          it('should change claim status', async function() {
            const now = await latestTime();
            closingTime = maxVotingTime.plus(now);
            await increaseTimeTo(closingTime.plus(2));
            await cr.changeClaimStatus(claimId);
            const newCStatus = await cd.getClaimStatusNumber(claimId);
            newCStatus[1].should.be.bignumber.equal(9);
            await cd.updateState12Count(claimId, 1);
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
            await cr.changeClaimStatus(claimId);
            await cd.getAllClaimsByAddress(coverHolder);
          });
          it('member should be able to cast vote', async function() {
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
          // it('member should not be able to transfer any tokens', async function() {
          //   await cd.getClaimVoteLength(claimId, 1);
          //   await cd.getClaimLength();
          //   await cd.getClaimVoteLength(claimId, 0);
          //   await cd.getVoteVerdict(claimId, 1, 0);
          //   await cd.getUserClaimCount(coverHolder);
          // });
          it('should change claim status', async function() {
            const now = await latestTime();
            closingTime = maxVotingTime.plus(now);
            await increaseTimeTo(closingTime.plus(2));
            await cr.changeClaimStatus(claimId);
            const newCStatus = await cd.getClaimStatusNumber(claimId);
            newCStatus[1].should.be.bignumber.equal(8);
            await cd.updateState12Count(claimId, 1);
            // await cr.getRewardAndClaimedStatus(0, claimId, { from: member1 });
            // await cr.getRewardToBeDistributedByUser(member1);
          });
        });
      });
    });
  });

  describe('Member not locked tokens for Claim Assessment', function() {
    before(async function() {
      await tf.payJoiningFee(member4, { from: member4, value: fee });
      await tf.kycVerdict(member4, true);
      await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member4 });
      await tk.transfer(member4, ether(250));
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
    it('reverts', async function() {
      claimId = (await cd.actualClaimLength()) - 1;
      await assertRevert(cl.submitCAVote(claimId, -1, { from: member4 }));
      await cd.setClaimTokensMV(coverID[3], 1, 1);
      await cd.setClaimTokensMV(coverID[3], -1, 1);
    });
  });
});
