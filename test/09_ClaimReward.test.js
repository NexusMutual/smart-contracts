const Pool1 = artifacts.require('Pool1Mock');
const NXMToken = artifacts.require('NXMToken');
const TokenController = artifacts.require('TokenController');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const PoolData = artifacts.require('PoolData');
const TokenData = artifacts.require('TokenDataMock');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const Quotation = artifacts.require('Quotation');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const MCR = artifacts.require('MCR');
const Governance = artifacts.require('GovernanceMock');
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
let nxms;
let mr;
let pd;
let mcr;
let gv;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('ClaimsReward', function([
  owner,
  member1,
  member2,
  member3,
  staker1,
  staker2,
  coverHolder,
  notMember
]) {
  const stakeTokens = ether(250);
  const tokens = ether(6);
  const validity = duration.days(30);
  const UNLIMITED_ALLOWANCE = new BigNumber(2).pow(256).minus(1);
  let coverID;
  let closingTime;
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
    nxms = await NXMaster.deployed();
    tc = await TokenController.at(await nxms.getLatestAddress('TC'));
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    gv = await Governance.at(await nxms.getLatestAddress('GV'));
    mcr = await MCR.deployed();
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
    await tk.transfer(member1, ether(150));
    await tk.transfer(member2, ether(150));
    await tk.transfer(member3, ether(150));
    await tk.transfer(staker1, ether(450));
    await tk.transfer(staker2, ether(450));
    await tk.transfer(coverHolder, ether(150));
    await tf.addStake(smartConAdd, stakeTokens, { from: staker1 });
    await tf.addStake(smartConAdd, stakeTokens, { from: staker2 });
    maxVotingTime = await cd.maxVotingTime();
  });

  describe('Claim Assesor get rewards after Claim Assessment', function() {
    let rewardToGet;
    let initialBalance;
    let initialTokenBalance;
    before(async function() {
      await tc.lock(CLA, tokens, validity, { from: member1 });
      await tc.lock(CLA, tokens, validity, { from: member2 });
      await tc.lock(CLA, tokens, validity, { from: member3 });
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
      claimId = (await cd.actualClaimLength()) - 1;
      const maxVotingTime = await cd.maxVotingTime();
      const now = await latestTime();
      closingTime = maxVotingTime.plus(now);
      await cl.submitCAVote(claimId, -1, { from: member1 });
      await cl.submitCAVote(claimId, -1, { from: member2 });
      await cl.submitCAVote(claimId, -1, { from: member3 });
      await cr.claimAllPendingReward([], { from: member1 });
      await increaseTimeTo(closingTime.plus(2));
      let claimed = await cr.getRewardAndClaimedStatus(1, claimId, {
        from: member1
      });
      let claimed1 = await cr.getRewardAndClaimedStatus(1, 0, {
        from: member1
      });
      claimed[1].should.be.equal(false);
      let apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(apiid));
      await P1.__callback(apiid, '');
    });
    it('9.1 should change claim reward contract', async function() {
      let newCr = await ClaimsReward.new();
      actionHash = encode(
        'upgradeContract(bytes2,address)',
        'CR',
        newCr.address
      );
      await gvProp(29, actionHash, mr, gv, 2);
      (await nxms.getLatestAddress('CR')).should.be.equal(newCr.address);
      cr = newCr;
    });
    it('9.1 should be able to claim reward', async function() {
      let proposalIds = [];
      initialTokenBalance = await tk.balanceOf(cr.address);
      initialBalance = await tk.balanceOf(member1);
      rewardToGet = await cr.getAllPendingRewardOfUser(member1);
      await assertRevert(
        cr.claimAllPendingReward(proposalIds, { from: notMember })
      );
      await cr.claimAllPendingReward(proposalIds, { from: member1 });
      await cr.claimAllPendingReward(proposalIds, { from: member1 });
      (await cr.getAllPendingRewardOfUser(member1)).should.be.bignumber.equal(
        0
      );
    });
    it('9.2 should increase balance of member', async function() {
      (await tk.balanceOf(member1)).should.be.bignumber.equal(
        initialBalance.plus(rewardToGet)
      );
    });
    it('9.3 should decrease token balance of this contract', async function() {
      (await tk.balanceOf(cr.address)).should.be.bignumber.equal(
        initialTokenBalance.sub(rewardToGet)
      );
      let proposalIds = [];

      await cr.claimAllPendingReward(proposalIds, { from: member1 });
    });
  });
  describe('Staker gets reward', function() {
    let initialBalance;
    let rewardToGet;
    let lockedStakedNXM;

    before(async function() {
      initialBalance = await tk.balanceOf(staker1);
      lockedStakedNXM = await tf.getStakerAllLockedTokens(staker1);
      await increaseTimeTo((await latestTime()) + duration.days(3));
      rewardToGet = await cr.getAllPendingRewardOfUser(staker1);

      unlockableStakedNXM = await tf.getStakerAllUnlockableStakedTokens(
        staker1
      );
    });
    it('9.4 should be able to claim reward', async function() {
      let proposalIds = [];
      await cr.claimAllPendingReward(proposalIds, { from: staker1 });
      (await cr.getAllPendingRewardOfUser(staker1)).should.be.bignumber.equal(
        0
      );
    });
    it('9.5 should increase balance of staker', async function() {
      (await tk.balanceOf(staker1)).should.be.bignumber.equal(
        initialBalance.plus(rewardToGet)
      );
    });
    it('9.6 should decrease locked staked tokens of staker', async function() {
      (await tf.getStakerAllLockedTokens(staker1)).should.be.bignumber.equal(
        lockedStakedNXM.sub(unlockableStakedNXM)
      );
    });
    it('9.7 should return zero unlockable staked tokens of staker', async function() {
      (await tf.getStakerAllUnlockableStakedTokens(
        staker1
      )).should.be.bignumber.equal(0);
    });
  });

  describe('Misc', function() {
    it('9.8 should not be able change claim status', async function() {
      await assertRevert(cr.changeClaimStatus(claimId, { from: notMember }));
    });

    it('9.9 should not be able call upgrade function of this contract', async function() {
      await assertRevert(cr.upgrade(member1, { from: notMember }));
    });
  });
});
