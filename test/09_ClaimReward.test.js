const Pool1 = artifacts.require('Pool1');
const NXMToken = artifacts.require('NXMToken');
const TokenController = artifacts.require('TokenController');
const TokenFunctions = artifacts.require('TokenFunctions');
const TokenData = artifacts.require('TokenData');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const Quotation = artifacts.require('Quotation');

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

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('ClaimsReward', function([
  owner,
  member1,
  member2,
  member3,
  coverHolder,
  notMember
]) {
  const P_18 = new BigNumber(1e18);
  const stakeTokens = ether(3);
  const tokens = ether(6);
  const validity = duration.days(30);
  const UNLIMITED_ALLOWANCE = new BigNumber(2).pow(256).minus(1);
  let coverID;
  let closingTime;
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
    qt = await Quotation.deployed();
    await tf.payJoiningFee(member1, { from: member1, value: fee });
    await tf.kycVerdict(member1, true);
    await tf.payJoiningFee(member2, { from: member2, value: fee });
    await tf.kycVerdict(member2, true);
    await tf.payJoiningFee(member3, { from: member3, value: fee });
    await tf.kycVerdict(member3, true);
    await tf.payJoiningFee(coverHolder, { from: coverHolder, value: fee });
    await tf.kycVerdict(coverHolder, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member1 });
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member2 });
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member3 });
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: coverHolder });
    await tk.transfer(member1, ether(250));
    await tk.transfer(member2, ether(250));
    await tk.transfer(member3, ether(250));
    await tk.transfer(coverHolder, ether(250));
    await tf.addStake(smartConAdd, stakeTokens, { from: member1 });
    await tf.addStake(smartConAdd, stakeTokens, { from: member2 });
    maxVotingTime = await cd.maxVotingTime();
  });

  describe('Claim Assesor get rewards after Claim Assessment', function() {
    let rewardToGet;
    let initialBalance;
    let initialTotalSupply;
    before(async function() {
      await tc.lock(CLA, tokens, validity, { from: member1 });
      await tc.lock(CLA, tokens, validity, { from: member2 });
      await tc.lock(CLA, tokens, validity, { from: member3 });
      await P1.makeCoverBegin(
        PID,
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
      claimId = (await cd.actualClaimLength()) - 1;
      const maxVotingTime = await cd.maxVotingTime();
      const now = await latestTime();
      closingTime = maxVotingTime.plus(now);
      initialTotalSupply = await tk.totalSupply();
      await cl.submitCAVote(claimId, -1, { from: member1 });
      await cl.submitCAVote(claimId, -1, { from: member2 });
      await cl.submitCAVote(claimId, -1, { from: member3 });
      await increaseTimeTo(closingTime.plus(2));
      await cr.changeClaimStatus(claimId);
    });
    it('should be able to claim reward', async function() {
      initialBalance = await tk.balanceOf(member1);
      rewardToGet = await cr.getAllPendingRewardOfUser(member1);
      await assertRevert(cr.claimAllPendingReward({ from: notMember }));
      await cr.claimAllPendingReward({ from: member1 });
      (await cr.getAllPendingRewardOfUser(member1)).should.be.bignumber.equal(
        0
      );
    });
    it('should increase balance of member', async function() {
      (await tk.balanceOf(member1)).should.be.bignumber.equal(
        initialBalance.plus(rewardToGet)
      );
    });
    it('should increase total supply', async function() {
      (await tk.totalSupply()).should.be.bignumber.above(initialTotalSupply);
      await cr.getRewardAndClaimedStatus(1, claimId, { from: member1 });
      await cr.getRewardAndClaimedStatus(1, 2, { from: member1 });
      await cr.getRewardAndClaimedStatus(0, claimId, { from: member1 });
      await cr.getRewardAndClaimedStatus(0, 2, { from: member1 });
      await cr.getRewardToBeDistributedByUser(member1);
      await cr.claimAllPendingReward({ from: member1 });
      await cd.getVoteAddressMemberLength(member1);
    });

    describe('Misc', function() {
      it('should not be able change claim status', async function() {
        await assertRevert(cr.changeClaimStatus(claimId, { from: notMember }));
      });

      it('should not be able call upgrade function of this contract', async function() {
        await assertRevert(cr.upgrade(member1, { from: notMember }));
      });

      it('should be able call upgrade function of this contract', async function() {
        await tc.mint(cr.address, tokens);
        await cr.upgrade(member1, { from: owner });
      });
    });
  });
});
