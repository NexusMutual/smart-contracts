const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const DAI = artifacts.require('DAI');
const NXMaster = artifacts.require('NXMaster');
const NXMaster2 = artifacts.require('NXMaster2');
const MCR = artifacts.require('MCR');
const MCRData = artifacts.require('MCRData');
const NXMToken1 = artifacts.require('NXMToken1');
const NXMToken2 = artifacts.require('NXMToken2');
const NXMTokenData = artifacts.require('NXMTokenData');
const Pool1 = artifacts.require('Pool1');
const Pool2 = artifacts.require('Pool2');
const Pool3 = artifacts.require('Pool3');
const PoolData = artifacts.require('PoolData');
const Quotation = artifacts.require('Quotation');
const QuotationData = artifacts.require('QuotationData');
const MemberRoles = artifacts.require('MemberRoles');

const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133'; //web3.eth.accounts[19];
const WETH_0x = web3.eth.accounts[18];
const Exchange_0x = web3.eth.accounts[17];
const fee = web3.toWei(0.002);
const { assertRevert } = require('./utils/assertRevert');

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

let nxms;
let nxms2;
let nxmt1;
let nxmt2;
let nxmtd;
let pl1;
let pl2;
let pl3;
let pd;
let qt;
let qd;
let cl;
let cr;
let cd;
let mcr;
let mcrd;
let addr = [];
let newMaster;
let memberRoles;

contract('NXMaster', function([owner, newOwner, member, nonMember]) {
  const ver = new BigNumber(1);
  const pauseTime = new BigNumber(2419200);
  before(async function() {
    this.timeout(0);
    nxms = await NXMaster.deployed();
    qd = await QuotationData.new();
    nxmtd = await NXMTokenData.new();
    cd = await ClaimsData.new();
    pd = await PoolData.new();
    mcrd = await MCRData.new();
    qt = await Quotation.new();
    nxmt1 = await NXMToken1.new();
    nxmt2 = await NXMToken2.new();
    cl = await Claims.new();
    cr = await ClaimsReward.new();
    pl1 = await Pool1.new();
    pl2 = await Pool2.new();
    mcr = await MCR.new();
    nxms2 = await NXMaster2.new();
    pl3 = await Pool3.new();
    addr.push(qd.address);
    addr.push(nxmtd.address);
    addr.push(cd.address);
    addr.push(pd.address);
    addr.push(mcrd.address);
    addr.push(qt.address);
    addr.push(nxmt1.address);
    addr.push(nxmt2.address);
    addr.push(cl.address);
    addr.push(cr.address);
    addr.push(pl1.address);
    addr.push(pl2.address);
    addr.push(nxms2.address);
    addr.push(mcr.address);
    addr.push(pl3.address);
  });
  it('should be able to add a new version', async function() {
    this.timeout(0);
    const versionLength = await nxms.versionLength();
    await nxms.addNewVersion(addr);
    const newVersionLength = await nxms.versionLength();
    newVersionLength.should.be.bignumber.equal(versionLength.plus(ver));
  });
  it('should be able to switch to new version', async function() {
    this.timeout(0);
    const currentVersion = await nxms.currentVersion();
    const newVer = new BigNumber(1);
    await nxms.switchToRecentVersion();
    const newCurrentVersion = await nxms.currentVersion();
    newCurrentVersion.should.be.bignumber.equal(currentVersion.plus(newVer));
  });
  it('should be able to change master address', async function() {
    this.timeout(0);
    newMaster = await NXMaster.new();
    let newMasterAddr = await newMaster.address;
    await nxms.changeMasterAddress(newMasterAddr);
    await newMaster.addNewVersion(addr);
    await newMaster.switchToRecentVersion();
    const verifyMasterAddress = await nxms2.masterAddress();
    verifyMasterAddress.should.equal(newMasterAddr);
    nxms = newMaster;
  });
  it('should be able to change MemberRole Address', async function() {
    this.timeout(0);
    memberRoles = await MemberRoles.deployed();
    let MRAddress = await memberRoles.address;
    await newMaster.changeMemberRolesAddress(MRAddress);
    let verifyMRAddress = await newMaster.memberRolesAddress();
    verifyMRAddress.should.equal(MRAddress);
  });
  it('should be able to reinitialize', async function() {
    this.timeout(0);
    await pl1.takeEthersOnly({ from: owner, value: 2000000000000000000 });
    await nxmtd.setWalletAddress(owner); //"0x7266c50f1f461d2748e675b907ef22987f6b5358");
    await qd.changeAuthQuoteEngine(QE); //"0xb24919181daead6635e613576ca11c5aa5a4e133");
    await nxms2.addCoverStatus();
    await nxms2.callPoolDataMethods();
    await nxms2.addStatusInClaims();
    await nxms2.addMCRCurr();
    await nxms2.addStatusInClaims();
    await pd.changeWETHAddress(WETH_0x); //"0xd0a1e359811322d97991e03f863a0c30c2cf029c");
    let dai = await DAI.new();
    await pd.changeCurrencyAssetAddress('0x444149', dai.address);
    await pd.change0xMakerAddress(owner); //"0x7266C50F1f461d2748e675B907eF22987F6B5358");
    await pl2.changeExchangeContractAddress(Exchange_0x); //"0x90fe2af704b34e0224bf2299c838e04d4dcf1364");
    await pl3.changeExchangeContractAddress(Exchange_0x); //"0x90fe2af704b34e0224bf2299c838e04d4dcf1364");
    await mcr.changenotariseAddress(owner); //"0x7266c50f1f461d2748e675b907ef22987f6b5358");
    var arg1 = 18000;
    var arg2 = 10000;
    var arg3 = 2;
    var arg4 = ['0x455448', '0x444149'];
    var arg5 = [100, 65407];
    var arg6 = 20180807;
    await mcr.addMCRData(arg1, arg2, arg3, arg4, arg5, arg6);
  });
  it('should return true if owner address', async function() {
    const isOwner = await nxms.isOwner(owner);
    isOwner.should.equal(true);
  });
  it('should return false if not owner address', async function() {
    const isOwner = await nxms.isOwner(newOwner);
    isOwner.should.equal(false);
  });
  it('should return true if internal contract address', async function() {
    const isInternal = await nxms.isInternal(nxms.address);
    isInternal.should.equal(true);
  });
  it('should return false if not internal contract address', async function() {
    const isInternal = await nxms.isInternal(newOwner);
    isInternal.should.equal(false);
  });
  it('should be able to add new Member Role', async function() {
    await memberRoles.addNewMemberRole(
      '0x4d656d626572',
      'Member of Nexus Mutual',
      nxmt2.address,
      false
    );
  });
  it('should return true if member', async function() {
    await nxmt2.payJoiningFee({ from: member, value: fee });
    const isMember = await nxms.isMember(member);
    isMember.should.equal(true);
  });
  it('should return false if not member', async function() {
    const isMember = await nxms.isOwner(nonMember);
    isMember.should.equal(false);
  });
  it('should return false for no Emergency Pause', async function() {
    const isPause = await nxms.isPause();
    isPause.should.equal(false);
  });
  it('should return zero length for Emergency Pause', async function() {
    const len = await nxms.getEmergencyPausedLength();
    len.should.be.bignumber.equal(new BigNumber(0));
  });
  it('should return correct for last Emergency Pause', async function() {
    let check = false;
    const lastEP = await nxms.getLastEmergencyPause();
    if (lastEP[0] == false && lastEP[1] == 0) check = true;
    check.should.equal(true);
  });
  it('non Owner should not be able to change owner address', async function() {
    await assertRevert(nxms.changeOwner(newOwner, { from: newOwner }));
    newOwner.should.not.equal(await nxms.owner());
  });
  it('owner should be able to change owner address', async function() {
    await nxms.changeOwner(newOwner, { from: owner });
    newOwner.should.equal(await nxms.owner());
  });
  it('new Owner should be able to change owner address back to original owner', async function() {
    await nxms.changeOwner(owner, { from: newOwner });
    owner.should.equal(await nxms.owner());
  });
  it('should return correct pasue time detail', async function() {
    const getPauseTime = await nxms.getPauseTime();
    pauseTime.should.be.bignumber.equal(getPauseTime);
  });
  it('other address/contract should not be able to update pauseTime', async function() {
    const updatePauseTime = pauseTime.plus(new BigNumber(60));
    await assertRevert(
      nxms.updatePauseTime(updatePauseTime, { from: newOwner })
    );
    updatePauseTime.should.be.bignumber.not.equal(await nxms.getPauseTime());
  });
  it('internal contracts should be able to update pauseTime', async function() {
    const updatePauseTime = pauseTime.plus(new BigNumber(60));
    await nxms.updatePauseTime(updatePauseTime);
    updatePauseTime.should.be.bignumber.equal(await nxms.getPauseTime());
  });
});
