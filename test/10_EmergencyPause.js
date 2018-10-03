const Pool1 = artifacts.require('Pool1');
const Pool3 = artifacts.require('Pool3');
const PoolData = artifacts.require('PoolData');
const NXMaster = artifacts.require('NXMaster');
const NXMToken1 = artifacts.require('NXMToken1');
const NXMToken2 = artifacts.require('NXMToken2');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const Quotation = artifacts.require('Quotation');
const NXMTokenData = artifacts.require('NXMTokenData');
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
const AdvisoryBoard = '0x41420000';

let P1;
let P3;
let nxms;
let nxmtk1;
let nxmtk2;
let cr;
let cl;
let qd;
let qt;
let cad;
let td;
let mcr;

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
  coverHolder1,
  coverHolder2,
  newMember
]) {
  const P_18 = new BigNumber(1e18);
  const stakeTokens = ether(1);
  const tokens = ether(1);
  const validity = duration.days(30);
  let coverID;
  let closingTime;
  let minTime;
  let maxVotingTime;
  let claimId;

  before(async function() {
    await advanceBlock();
    nxmtk1 = await NXMToken1.deployed();
    nxmtk2 = await NXMToken2.deployed();
    nxms = await NXMaster.deployed();
    cr = await ClaimsReward.deployed();
    cl = await Claims.deployed();
    cd = await ClaimsData.deployed();
    qd = await QuotationDataMock.deployed();
    P1 = await Pool1.deployed();
    pd = await PoolData.deployed();
    qt = await Quotation.deployed();
    td = await NXMTokenData.deployed();
    P3 = await Pool3.deployed();
    mcr = await MCR.deployed();
    await nxmtk2.payJoiningFee(member1, { from: member1, value: fee });
    await P1.buyTokenBegin({ from: member1, value: ether(1) });
    await nxmtk2.payJoiningFee(member2, { from: member2, value: fee });
    await P1.buyTokenBegin({ from: member2, value: ether(2) });
    await nxmtk2.payJoiningFee(member3, { from: member3, value: fee });
    await P1.buyTokenBegin({ from: member3, value: ether(2) });
    await nxmtk2.payJoiningFee(coverHolder1, {
      from: coverHolder1,
      value: fee
    });
    await P1.buyTokenBegin({ from: coverHolder1, value: ether(3) });
    await nxmtk2.payJoiningFee(coverHolder2, {
      from: coverHolder2,
      value: fee
    });
    await P1.buyTokenBegin({ from: coverHolder2, value: ether(3) });
    await nxmtk2.addStake(smartConAdd, stakeTokens, { from: member1 });
    await nxmtk2.addStake(smartConAdd, stakeTokens, { from: member2 });
    maxVotingTime = await cd.maxVotingTime();
  });

  describe('Before Emergency Pause', function() {
    before(async function() {
      await P1.makeCoverBegin(
        PID,
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
        PID,
        smartConAdd,
        'ETH',
        coverDetails,
        coverPeriod,
        v,
        r,
        s,
        { from: coverHolder2, value: coverDetails[1] }
      );

      await nxmtk1.lock(CLA, tokens, validity, {
        from: member1
      });
      await nxmtk1.lock(CLA, tokens, validity, {
        from: member2
      });
    });
    it('should return false for isPause', async function() {
      (await nxms.isPause()).should.equal(false);
    });
    it('should let submit claim', async function() {
      const coverID = await qd.getAllCoversOfUser(coverHolder1);
      await cl.submitClaim(coverID[0], { from: coverHolder1 });
      const claimId = (await cd.actualClaimLength()) - 1;
      claimId.should.be.bignumber.equal(1);
      (await qd.getCoverStatusNo(claimId)).should.be.bignumber.equal(4);
    });
  });

  describe('Emergency Pause: Active', function() {
    let startTime;
    before(async function() {
      const totalFee = fee.plus(coverDetails[1].toString());
      await qt.verifyQuote(
        PID,
        smartConAdd,
        'ETH',
        coverDetails,
        coverPeriod,
        v,
        r,
        s,
        { from: newMember, value: totalFee }
      );

      await nxms.startEmergencyPause();
      startTime = await latestTime();
    });
    it('should return true for isPause', async function() {
      (await nxms.isPause()).should.equal(true);
    });
    it('should return emergency pause details', async function() {
      await nxms.getEmergencyPauseByIndex(0);
      const epd = await nxms.getLastEmergencyPause();
      epd[0].should.equal(true);
      epd[1].should.be.bignumber.equal(startTime);
      epd[2].should.equal(AdvisoryBoard);
    });
    it('should not be able to trigger kyc', async function() {
      await assertRevert(qt.kycTrigger(true, 1));
    });
    it('add claim to queue', async function() {
      const coverID = await qd.getAllCoversOfUser(coverHolder2);
      await cl.submitClaim(coverID[0], { from: coverHolder2 });
      (await qd.getCoverStatusNo(coverID[0])).should.be.bignumber.equal(5);
    });
    it('should not let member vote for claim assessment', async function() {
      const claimId = (await cd.actualClaimLength()) - 1;
      await assertRevert(cl.submitCAVote(claimId, -1, { from: member1 }));
    });
    it('should not be able to change claim status', async function() {
      const claimId = (await cd.actualClaimLength()) - 1;
      await assertRevert(cr.changeClaimStatus(claimId, { from: owner }));
    });
  });

  describe('Emergency Pause: Inactive', function() {
    before(async function() {
      await nxms.addEmergencyPause(false, AdvisoryBoard);
    });
    describe('Resume Everything', function() {
      it('should return false for isPause', async function() {
        (await nxms.isPause()).should.equal(false);
      });
      it('should submit queued claims', async function() {
        (await nxms.isPause()).should.equal(false);
        const claimId = (await cd.actualClaimLength()) - 1;
        claimId.should.be.bignumber.equal(2);
        (await qd.getCoverStatusNo(claimId)).should.be.bignumber.equal(4);
      });
    });
  });
});
