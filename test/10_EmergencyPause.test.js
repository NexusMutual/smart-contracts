const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolData');
const NXMaster = artifacts.require('NXMaster');
const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenController = artifacts.require('TokenController');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const Quotation = artifacts.require('Quotation');
const TokenData = artifacts.require('TokenDataMock');
const MCR = artifacts.require('MCR');
const Governance = artifacts.require('GovernanceMock');
const ProposalCategory = artifacts.require('ProposalCategory');
const MemberRoles = artifacts.require('MemberRoles');
const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');

const CLA = '0x434c41';
const fee = ether(0.002);
const smartConAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const coverPeriod = 61;
const coverDetails = [1, 3362445813369838, 744892736679184, 7972408607];
const v = 28;
const r = '0x66049184fb1cf394862cca6c3b2a0c462401a671d0f2b20597d121e56768f90a';
const s = '0x4c28c8f8ff0548dd3a41d7c75621940eb4adbac13696a2796e98a59691bf53ff';
const AdvisoryBoard = '0x41420000';

let P1;
let p2;
let nxms;
let cr;
let cl;
let qd;
let qt;
let mcr;
let gv;
let mr;
let newStakerPercentage = 5;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('NXMaster: Emergency Pause', function([
  owner,
  member1,
  member2,
  member3,
  member4,
  member5,
  coverHolder1,
  coverHolder2,
  coverHolder3,
  newMember
]) {
  const stakeTokens = ether(1);
  const tokens = ether(200);
  const validity = duration.days(30);
  const UNLIMITED_ALLOWANCE = new BigNumber(2).pow(256).minus(1);

  before(async function() {
    await advanceBlock();
    tk = await NXMToken.deployed();
    tf = await TokenFunctions.deployed();
    nxms = await NXMaster.deployed();
    cr = await ClaimsReward.deployed();
    cl = await Claims.deployed();
    cd = await ClaimsData.deployed();
    qd = await QuotationDataMock.deployed();
    P1 = await Pool1.deployed();
    pd = await PoolData.deployed();
    qt = await Quotation.deployed();
    td = await TokenData.deployed();
    mcr = await MCR.deployed();
    p2 = await Pool2.deployed();
    gvAddress = await nxms.getLatestAddress('GV');
    gv = await Governance.at(gvAddress);
    let address = await nxms.getLatestAddress('MR');
    mr = await MemberRoles.at(address);
    tc = await TokenController.at(await nxms.getLatestAddress('TC'));
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
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member1 });
    await mr.payJoiningFee(member2, { from: member2, value: fee });
    await mr.kycVerdict(member2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member2 });
    await mr.payJoiningFee(member3, { from: member3, value: fee });
    await mr.kycVerdict(member3, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member3 });

    await mr.payJoiningFee(member4, { from: member4, value: fee });
    await mr.kycVerdict(member4, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member4 });
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: owner });

    await mr.payJoiningFee(coverHolder1, {
      from: coverHolder1,
      value: fee
    });
    await mr.kycVerdict(coverHolder1, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: coverHolder1 });
    await mr.payJoiningFee(coverHolder2, {
      from: coverHolder2,
      value: fee
    });
    await mr.kycVerdict(coverHolder2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: coverHolder2 });
    await mr.payJoiningFee(coverHolder3, {
      from: coverHolder3,
      value: fee
    });
    await mr.kycVerdict(coverHolder3, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: coverHolder3 });
    await tk.transfer(member1, tokens);
    await tk.transfer(member2, tokens);
    await tk.transfer(member3, tokens);
    await tk.transfer(member4, tokens);
    await tk.transfer(coverHolder1, tokens);
    await tk.transfer(coverHolder2, tokens);
    await tf.addStake(smartConAdd, stakeTokens, { from: member1 });
    await tf.addStake(smartConAdd, stakeTokens, { from: member2 });
    maxVotingTime = await cd.maxVotingTime();
  });

  describe('Before Emergency Pause', function() {
    before(async function() {
      await P1.makeCoverBegin(
        smartConAdd,
        'ETH',
        coverDetails,
        coverPeriod,
        v,
        r,
        s,
        { from: coverHolder1, value: coverDetails[1] }
      );

      await P1.makeCoverBegin(
        smartConAdd,
        'ETH',
        coverDetails,
        coverPeriod,
        v,
        r,
        s,
        { from: coverHolder2, value: coverDetails[1] }
      );

      await P1.makeCoverBegin(
        smartConAdd,
        'ETH',
        coverDetails,
        coverPeriod,
        v,
        r,
        s,
        { from: coverHolder3, value: coverDetails[1] }
      );

      await tc.lock(CLA, ether(60), validity, {
        from: member1
      });
      await tc.lock(CLA, ether(9), validity, {
        from: member2
      });
      let proposalsIDs = [];
      await cr.claimAllPendingReward(proposalsIDs, { from: member4 });
    });
    it('10.1 should return false for isPause', async function() {
      (await nxms.isPause()).should.equal(false);
    });
    it('10.2 should let deny claim', async function() {
      const coverID = await qd.getAllCoversOfUser(coverHolder3);
      await cl.submitClaim(coverID[0], { from: coverHolder3 });
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      const claimId = (await cd.actualClaimLength()) - 1;
      let nowTime = await latestTime();
      await increaseTimeTo(nowTime / 1 + (await cd.maxVotingTime()) / 1 + 100);
      await P1.__callback(APIID, '');
      nowTime = await latestTime();
      await increaseTimeTo(nowTime / 1 + (await cd.maxVotingTime()) / 1 + 100);
      await P1.__callback(APIID, '');
      let cid = await cd.getAllClaimsByIndex(claimId);
      ((await qd.getCoverStatusNo(cid[0])) / 1).should.be.bignumber.equal(2);
    });
    it('10.2 should let submit claim', async function() {
      const coverID = await qd.getAllCoversOfUser(coverHolder1);
      await cl.submitClaim(coverID[0], { from: coverHolder1 });
      const claimId = (await cd.actualClaimLength()) - 1;
      claimId.should.be.bignumber.equal(2);
      let cid = await cd.getAllClaimsByIndex(claimId);
      ((await qd.getCoverStatusNo(cid[0])) / 1).should.be.bignumber.equal(4);
    });
    it('10.3 should be able to do claim assessment or stake NXM for claim', async function() {
      await tc.lock(CLA, ether(60), validity, { from: member3 });
    });
    it('10.4 should be able to buy nxm token', async function() {
      await P1.buyToken({ value: ether(60), from: member1 });
    });

    it('10.5 should be able to redeem NXM tokens', async function() {
      await P1.sellNXMTokens(ether(0.01), { from: member1 });
    });
    it('10.6 should be able to withdraw membership', async function() {
      await mr.withdrawMembership({ from: member4 });
    });
  });

  describe('Emergency Pause: Active', function() {
    let startTime;
    before(async function() {
      const totalFee = fee.plus(coverDetails[1].toString());
      await qt.initiateMembershipAndCover(
        smartConAdd,
        'ETH',
        coverDetails,
        coverPeriod,
        v,
        r,
        s,
        { from: newMember, value: totalFee }
      );

      let p = await gv.getProposalLength();
      await gv.createProposalwithVote(
        'Implement Emergency Pause',
        'Implement Emergency Pause',
        'Implement Emergency Pause',
        6,
        'Implement Emergency Pause',
        '0x872f1eb3'
      );
      // await gv.categorizeProposal(p.toNumber(), 6, 0);
      // await gv.submitProposalWithSolution(
      //   p,
      //   'Implement Emergency Pause',
      //   '0x872f1eb3'
      // );
      // await gv.submitVote(p, 1);
      await gv.closeProposal(p);
      startTime = await latestTime();
      await assertRevert(
        qt.initiateMembershipAndCover(
          smartConAdd,
          'ETH',
          coverDetails,
          coverPeriod,
          v,
          r,
          s,
          { from: newMember, value: totalFee }
        )
      );
    });
    it('10.7 should return true for isPause', async function() {
      (await nxms.isPause()).should.equal(true);
    });
    it('10.8 should return emergency pause details', async function() {
      await nxms.getEmergencyPauseByIndex(0);
      const epd = await nxms.getLastEmergencyPause();
      epd[0].should.equal(true);
      epd[1].should.be.bignumber.equal(startTime);
      epd[2].should.equal(AdvisoryBoard);
    });
    it('10.9 should not be able to pay joining fee', async function() {
      await assertRevert(
        mr.payJoiningFee(member5, { from: member5, value: fee })
      );
    });
    it('10.10 should not be able to trigger kyc', async function() {
      await assertRevert(mr.kycVerdict(member5, true));
    });
    it('10.11 add claim to queue', async function() {
      const coverID = await qd.getAllCoversOfUser(coverHolder2);
      await cl.submitClaim(coverID[0], { from: coverHolder2 });
      (await qd.getCoverStatusNo(coverID[0])).should.be.bignumber.equal(5);
    });
    it('10.12 should not let member vote for claim assessment', async function() {
      const claimId = (await cd.actualClaimLength()) - 1;
      await assertRevert(cl.submitCAVote(claimId, -1, { from: member1 }));
    });
    it('10.13 should not be able to change claim status', async function() {
      const claimId = (await cd.actualClaimLength()) - 1;
      await assertRevert(cr.changeClaimStatus(claimId, { from: owner }));
    });
    it('10.14 should not be able to make cover', async function() {
      await assertRevert(
        P1.makeCoverBegin(
          smartConAdd,
          'ETH',
          coverDetails,
          coverPeriod,
          v,
          r,
          s,
          { from: coverHolder1, value: coverDetails[1] }
        )
      );
    });
    it('10.15 should not be able to assess risk', async function() {
      await assertRevert(tf.addStake(smartConAdd, 1, { from: member1 }));
    });
    it('10.16 should not be able to submit CA Vote', async function() {
      const claimId = (await cd.actualClaimLength()) - 1;
      await assertRevert(cl.submitCAVote(claimId, 0, { from: member1 }));
    });

    it('10.17 should not be able to do claim assessment or stake NXM for claim', async function() {
      await assertRevert(tc.lock(CLA, ether(60), validity, { from: member3 }));
      // dont use member1 or member2 as they are already locked
    });
    it('10.18 should not be able to buy nxm token', async function() {
      await assertRevert(P1.buyToken({ value: ether(60), from: member1 }));
    });
    it('10.19 should not be able to redeem NXM tokens', async function() {
      await assertRevert(P1.sellNXMTokens(ether(1), { from: member1 }));
    });

    it('10.20 should not be able to withdraw membership', async function() {
      await assertRevert(mr.withdrawMembership({ from: member4 }));
    });

    it('10.21 Should not be able to save IA details', async function() {
      await assertRevert(
        p2.saveIADetails(['0x455448', '0x444149'], [100, 1000], 20190125, false)
      );
    });
  });

  describe('Emergency Pause: Inactive', function() {
    before(async function() {
      // await tc.burnFrom(owner, await tk.balanceOf(owner));
      let p = await gv.getProposalLength();
      await gv.createProposal(
        'close Emergency Pause',
        'close Emergency Pause',
        'close Emergency Pause',
        0
      );
      await gv.categorizeProposal(p.toNumber(), 7, 0);
      await gv.submitProposalWithSolution(
        p,
        'Implement Emergency Pause',
        '0xffa3992900000000000000000000000000000000000000000000000000000000000000004142000000000000000000000000000000000000000000000000000000000000'
      );
      let members = await mr.members(2);
      let iteration = 0;
      for (iteration = 0; iteration < members[1].length; iteration++)
        await gv.submitVote(p, 1, {
          from: members[1][iteration]
        });

      await gv.closeProposal(p);
    });
    describe('Turning off emergency pause automatically', function() {
      it('10.26 should be able to turn off automatically', async function() {
        let p = await gv.getProposalLength();
        await gv.createProposalwithVote(
          'Implement Emergency Pause',
          'Implement Emergency Pause',
          'Implement Emergency Pause',
          6,
          'Implement Emergency Pause',
          '0x872f1eb3'
        );

        await gv.closeProposal(p);
        startTime = await latestTime();
        await increaseTimeTo(startTime / 1 + 2419300 + 100);
        var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
        await tf.setClaimSubmittedAtEPTrue(0, true);
        await assertRevert(P1.__callback(APIID, ''));
        await tf.setClaimSubmittedAtEPTrue(0, false);
        await P1.__callback(APIID, '');
      });
    });
    describe('Resume Everything', function() {
      it('10.27 should return false for isPause', async function() {
        (await nxms.isPause()).should.equal(false);
      });
      it('10.28 should submit queued claims', async function() {
        (await nxms.isPause()).should.equal(false);
        const claimId = (await cd.actualClaimLength()) - 1;
        claimId.should.be.bignumber.equal(3);
        let cid = await cd.getAllClaimsByIndex(claimId);
        ((await qd.getCoverStatusNo(cid[0])) / 1).should.be.bignumber.equal(4);
      });
    });
  });
});
