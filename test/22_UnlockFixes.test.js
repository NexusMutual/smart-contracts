const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenDataMock');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMasterMock');
const ClaimsReward = artifacts.require('ClaimsReward');
const Governance = artifacts.require('Governance');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const Quotation = artifacts.require('Quotation');
const Pool1 = artifacts.require('Pool1Mock');
const MCR = artifacts.require('MCR');
const PoolData = artifacts.require('PoolDataMock');
const Claims = artifacts.require('Claims');
const ProposalCategory = artifacts.require('ProposalCategory');
const PooledStaking = artifacts.require('PooledStakingMock');

const {assertRevert} = require('./utils/assertRevert');
const {ether, toHex, toWei} = require('./utils/ethTools');
const {increaseTimeTo, duration} = require('./utils/increaseTime');
const {latestTime} = require('./utils/latestTime');
const encode = require('./utils/encoder.js').encode;
const getQuoteValues = require('./utils/getQuote.js').getQuoteValues;
const getValue = require('./utils/getMCRPerThreshold.js').getValue;
const { takeSnapshot, revertSnapshot } = require('./utils/snapshot');

const coverDetails = [
  1,
  '3362445813369838',
  '744892736679184',
  '7972408607',
  '7972408607000'
];
const coverPeriod = 61;

const stakedContract = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const stakedContract2 = '0xee74110fb5a1007b06282e0de5d73a61bf41d9cd';

let tk;
let tf;
let tc;
let td;
let mr;
let qd;
let qt;
let nxms;
let cr;
let P1;
let mcr;
let cl;
let pd;
let pc;
let snapshotId;

const BN = web3.utils.BN;
const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('unlock-fixes', function([
  owner,
  member1,
  member2,
  member3,
]) {

  const fee = ether(0.002);
  const stakeTokens = ether(100);
  const tokens = ether(300);
  const UNLIMITED_ALLOWANCE = new BN((2).toString())
    .pow(new BN((256).toString()))
    .sub(new BN((1).toString()));

  before(async function() {

    snapshotId = await takeSnapshot();

    tk = await NXMToken.deployed();
    tf = await TokenFunctions.deployed();
    td = await TokenData.deployed();
    nxms = await NXMaster.at(await tf.ms());
    tc = await TokenController.at(await nxms.getLatestAddress(toHex('TC')));
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    cr = await ClaimsReward.deployed();
    qd = await QuotationDataMock.deployed();
    qt = await Quotation.deployed();
    P1 = await Pool1.deployed();
    mcr = await MCR.deployed();
    pd = await PoolData.deployed();
    cl = await Claims.deployed();
    pc = await ProposalCategory.at(await nxms.getLatestAddress(toHex('PC')));
    ps = await PooledStaking.at(await nxms.getLatestAddress(toHex('PS')));
    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);
    await mr.payJoiningFee(member1, {from: member1, value: fee});
    await mr.kycVerdict(member1, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member1});
    await mr.payJoiningFee(member2, {from: member2, value: fee});
    await mr.kycVerdict(member2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member2});
    await mr.payJoiningFee(member3, {from: member3, value: fee});
    await mr.kycVerdict(member3, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member3});
    await tk.transfer(member1, tokens);
    await tk.transfer(member2, tokens);
    await tk.transfer(member3, tokens);
    await P1.mint(await nxms.getLatestAddress(toHex('CR')), toWei(10));

    await tk.approve(tc.address, UNLIMITED_ALLOWANCE);

    await mcr.addMCRData(
      await getValue(toWei(2), pd, mcr),
      toWei(100),
      toWei(2),
      ['0x455448', '0x444149'],
      [100, 65407],
      20181011
    );
    (await pd.capReached()).toString().should.be.equal((1).toString());
  });

  describe('Stake Tokens', function() {
    describe('fixes related to tokenFunctions', function() {
      it('While buying cover after upgrading, cover note locked for correct time', async function() {
        coverDetails[4] = 7972408607001;
        var vrsdata = await getQuoteValues(
          coverDetails,
          toHex('ETH'),
          coverPeriod,
          stakedContract,
          qt.address
        );
        await P1.makeCoverBegin(
          stakedContract,
          toHex('ETH'),
          coverDetails,
          coverPeriod,
          vrsdata[0],
          vrsdata[1],
          vrsdata[2],
          {from: owner, value: coverDetails[1]}
        );

        let validUntil = await qd.getValidityOfCover(1);
        let cp = await qd.getCoverPeriod(1);
        let nowTime = validUntil - cp * 24 * 3600;
        let reason = await tc.lockReason(owner, 0);
        let lockedValidity = await tc.locked(owner, reason);

        let nowTime1 =
          lockedValidity[1] -
          cp * 24 * 3600 -
          (await td.lockTokenTimeAfterCoverExp());

        nowTime1.should.be.equal(nowTime);
      });

      it('Should not able to unlock CN if deposited', async function() {
        let time = await latestTime();
        time = time + (await duration.days(61));
        await increaseTimeTo(time);
        let coverID = (await qd.getCoverLength()) - 1;
        await cl.submitClaim(coverID);

        await assertRevert(qt.expireCover(coverID));
      });
    });
  });
  describe('Restrict lock,extend increase lock amount to CLA', function() {
    it('User can only be able to lock/extend/increase lock amount for CLA directly', async function() {
      await assertRevert(tc.lock(toHex('ABCD'), toWei(100), 10000000));
      ((await tc.tokensLocked(owner, toHex('ABCD'))) / 1).should.be.equal(0);
      await assertRevert(tc.extendLock(toHex('ABCD'), 100));
      await assertRevert(tc.increaseLockAmount(toHex('ABCD'), toWei(1)));
    });
    it('Lock under CLA and unlock it via unlock function', async function() {
      await tc.lock(toHex('CLA'), toWei(100), 30 * 24 * 3600, {from: member2});
      ((await tc.tokensLocked(member2, toHex('CLA'))) / 1).should.be.equal(
        toWei(100) / 1
      );

      let time = await latestTime();
      time = time + (await duration.days(30));
      await increaseTimeTo(time);

      let beforeBalance = await tk.balanceOf(member2);

      await tc.unlock(member2, {from: member2});

      let afterBalance = await tk.balanceOf(member2);
      ((afterBalance - beforeBalance) / 1).should.be.equal(toWei(100) / 1);
    });

    it('Should push reason while locking tokens and should remove reason when release all tokens', async function() {
      await ps.processPendingActions('100');

      await tk.approve(ps.address, stakeTokens, {
        from: member3
      });
      await ps.depositAndStake(stakeTokens, [stakedContract2], [stakeTokens], {
        from: member3
      });

      let time = await latestTime();
      time = time + (await duration.days(250));
      await increaseTimeTo(time);

      await ps.requestUnstake([stakedContract2], [stakeTokens], 0, {
        from: member3
      });
    });
  });
  describe('Create new category to upgrade uint parameter in TC', function() {
    it('Added a proposal category to update min CA lock time', async function() {
      let gv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
      let c1 = await pc.totalCategories();
      let actionHash = encode(
        'newCategory(string,uint256,uint256,uint256,uint256[],uint256,string,address,bytes2,uint256[],string)',
        'Description',
        1,
        1,
        0,
        [1],
        604800,
        '',
        tc.address,
        toHex('EX'),
        [0, 0, 0, 0],
        'updateUintParameters(bytes8,uint256)'
      );
      let p1 = await gv.getProposalLength();
      await gv.createProposalwithSolution(
        'Add new category',
        'Add new category',
        'AddnewCategory',
        3,
        'Add new category',
        actionHash
      );
      await gv.submitVote(p1.toNumber(), 1);
      await gv.closeProposal(p1.toNumber());

      actionHash = encode(
        'updateUintParameters(bytes8,uint)',
        toHex('MNCLT'),
        35
      );
      p1 = await gv.getProposalLength();
      await gv.createProposal(
        'update minCALockTime',
        'update minCALockTime',
        'update minCALockTime',
        0
      );
      await gv.categorizeProposal(p1.toNumber(), c1, 0);
      await gv.submitProposalWithSolution(
        p1.toNumber(),
        'update minCALockTime',
        actionHash
      );
      await gv.submitVote(p1.toNumber(), 1);
      await gv.closeProposal(p1.toNumber());
      assert.equal((await tc.minCALockTime()) / 1, 35 * 3600 * 24);
    });
  });

  after(async function () {
    await revertSnapshot(snapshotId);
  });

});
