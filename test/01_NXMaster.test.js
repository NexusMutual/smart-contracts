const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const DAI = artifacts.require('MockDAI');
const DSValue = artifacts.require('DSValue');
const NXMaster = artifacts.require('NXMaster');
const MCR = artifacts.require('MCR');
const MCRDataMock = artifacts.require('MCRDataMock');
const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctions');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenData');
const Pool1 = artifacts.require('Pool1');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolData');
const Quotation = artifacts.require('Quotation');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const MemberRoles = artifacts.require('MemberRoles');
const Governance = artifacts.require('Governance');
const ProposalCategory = artifacts.require('ProposalCategory');

const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const Exchange_0x = web3.eth.accounts[17];

const { ether } = require('./utils/ether');
const { assertRevert } = require('./utils/assertRevert');

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

let nxms;
let nxmtk;
let tf;
let tc;
let td;
let pl1;
let pl2;
let pd;
let qt;
let qd;
let cl;
let cr;
let cd;
let mcr;
let mcrd;
let addr = [];
let dai;
let dsv;
let newMaster;
let memberRoles;
let gov;
let propCat;

contract('NXMaster', function([
  owner,
  newOwner,
  member,
  nonMember,
  anotherAccount
]) {
  const fee = ether(0.002);
  const poolEther = ether(2);
  const founderAddress = web3.eth.accounts[19];
  const INITIAL_SUPPLY = ether(1500000);
  const pauseTime = new BigNumber(2419200);

  before(async function() {
    nxms = await NXMaster.deployed();
    qd = await QuotationDataMock.new();
    td = await TokenData.new();
    tf = await TokenFunctions.new();
    tc = await TokenController.new();
    cd = await ClaimsData.new();
    pd = await PoolData.new();
    mcrd = await MCRDataMock.new();
    qt = await Quotation.new();
    nxmtk = await NXMToken.new(tc.address, founderAddress, INITIAL_SUPPLY);
    cl = await Claims.new();
    cr = await ClaimsReward.new();
    pl1 = await Pool1.new();
    pl2 = await Pool2.new();
    mcr = await MCR.new();
    dai = await DAI.new();
    dsv = await DSValue.deployed();
    gov = await Governance.deployed();
    propCat = await ProposalCategory.deployed();
    memberRoles = await MemberRoles.deployed();
    addr.push(qd.address);
    addr.push(td.address);
    addr.push(cd.address);
    addr.push(pd.address);
    addr.push(mcrd.address);
    addr.push(qt.address);
    addr.push(tf.address);
    addr.push(tc.address);
    addr.push(cl.address);
    addr.push(cr.address);
    addr.push(pl1.address);
    addr.push(pl2.address);
    addr.push(mcr.address);
    addr.push(gov.address);
    addr.push(propCat.address);
    addr.push(memberRoles.address);
  });
  describe('when called by Owner', function() {
    it('should be able to add a new version', async function() {
      this.timeout(0);
      const version = await nxms.getCurrentVersion();
      await nxms.addNewVersion(addr, { from: owner });
      (await nxms.getCurrentVersion()).should.be.bignumber.equal(
        version.plus(1)
      );
    });

    it('should be able to change master address', async function() {
      this.timeout(0);
      newMaster = await NXMaster.new();
      await nxms.changeMasterAddress(newMaster.address, { from: owner });
      await newMaster.changeTokenAddress(nxmtk.address);
      await newMaster.addNewVersion(addr);
      nxms = newMaster;
    });

    it('should be able to reinitialize', async function() {
      this.timeout(0);
      await pl1.sendTransaction({ from: owner, value: poolEther });
      await td.changeWalletAddress(owner);
      await qd.changeAuthQuoteEngine(QE);
      await pd.changeCurrencyAssetAddress('0x444149', dai.address);
      await mcr.changenotariseAddress(owner);
      await mcr.addMCRData(
        18000,
        10000,
        2,
        ['0x455448', '0x444149'],
        [100, 65407],
        20180807
      );
      await pd.changeInvestmentAssetAddress('0x455448', ZERO_ADDRESS);
      await pd.changeInvestmentAssetAddress('0x444149', dai.address);
      await mcrd.changeDAIfeedAddress(dsv.address);
      await pl2.saveIADetails(['0x455448', '0x444149'], [100, 65407], 20180807);
    });

    it('should be able to add new Member Role', async function() {
      await memberRoles.addNewMemberRole(
        '0x4d656d626572',
        'Member of Nexus Mutual',
        tf.address,
        false
      );
    });

    it('should be able to change token controller address', async function() {
      await tc.changeOperator(tc.address);
    });

    it('owner should be able to change owner address', async function() {
      await nxms.changeOwner(newOwner, { from: owner });
      newOwner.should.equal(await nxms.owner());
    });

    it('new Owner should be able to change owner address back to original owner', async function() {
      await nxms.changeOwner(owner, { from: newOwner });
      owner.should.equal(await nxms.owner());
    });
  });

  describe('when not called by Owner', function() {
    it('should not be able to add a new version', async function() {
      await assertRevert(nxms.addNewVersion(addr, { from: anotherAccount }));
    });

    it('should not be able to change master address', async function() {
      newMaster = await NXMaster.new();
      await assertRevert(
        nxms.changeMasterAddress(newMaster.address, { from: anotherAccount })
      );
    });

    it('should not be able to change owner address', async function() {
      await assertRevert(nxms.changeOwner(newOwner, { from: newOwner }));
      newOwner.should.not.equal(await nxms.owner());
    });
  });

  describe('modifiers', function() {
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
    it('should return true if member', async function() {
      await tf.payJoiningFee(member, { from: member, value: fee });
      await tf.kycVerdict(member, true);
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
  });

  describe('emergency pause ', function() {
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
});
