const { defaultSender, contract, web3 } = require('@openzeppelin/test-environment');
const { BN, expectRevert, ether } = require('@openzeppelin/test-helpers');

const setup = require('../integration/setup');
const { accounts, helpers: { hex } } = require('../utils');

const ClaimsReward = contract.fromArtifact('ClaimsReward');
const NXMaster = contract.fromArtifact('NXMaster');
const MCR = contract.fromArtifact('MCR');
const Pool1 = contract.fromArtifact('Pool1Mock');
const Pool2 = contract.fromArtifact('Pool2');
const Quotation = contract.fromArtifact('Quotation');
const MemberRoles = contract.fromArtifact('MemberRoles');
const Governance = contract.fromArtifact('Governance');

const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const { toWei } = require('./utils/ethTools');
const gvProp = require('./utils/gvProposal.js').gvProposal;
const encode = require('./utils/encoder.js').encode;
const getValue = require('./utils/getMCRPerThreshold.js').getValue;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

const owner = defaultSender;
const {
  members: [newOwner, member],
  nonMembers: [nonMember, anotherAccount],
} = accounts;

const poolEther = ether('2');
const pauseTime = new BN(2419200);

describe('NXMaster', function () {

  this.timeout(0);

  describe('Updating state', function () {

    beforeEach(setup);

    it('1.2 should not be able to change master address if master has not initialized', async function () {
      const tkAddress = await this.master.getLatestAddress(hex('TK'));
      const newMaster = await NXMaster.new(tkAddress);
      await expectRevert.unspecified(this.master.changeMasterAddress(newMaster.address));
    });

    it('1.3 should be able to change single contract (proxy contracts)', async function () {

      const newMemberRoles = await MemberRoles.new();
      const actionHash = encode(
        'upgradeContractImplementation(bytes2,address)',
        'MR',
        newMemberRoles.address,
      );

      const oldMR = await MemberRoles.at(
        await this.master.getLatestAddress(hex('MR')),
      );

      const oldGv = await Governance.at(await this.master.getLatestAddress(hex('GV')));

      await gvProp(5, actionHash, oldMR, oldGv, 2);
      (await this.qd.getImplementationAdd(hex('MR'))).should.be.equal(
        newMemberRoles.address,
      );
      this.memberRoles = newMemberRoles;
      this.memberRoles = await MemberRoles.at(await this.master.getLatestAddress('0x4d52'));
    });

    it('1.4 should set launch bit after adding initial members', async function () {
      this.memberRoles = await MemberRoles.at(await this.master.getLatestAddress('0x4d52'));
      await this.memberRoles.addMembersBeforeLaunch([], []);
      (await this.memberRoles.launched()).should.be.equal(true);
    });

    it('1.5 should be able to reinitialize', async function () {

      const oldMR = await MemberRoles.at(
        await this.master.getLatestAddress(hex('MR')),
      );
      const oldGv = await Governance.at(await this.master.getLatestAddress(hex('GV')));
      await this.p1.sendEther({ from: owner, value: poolEther });
      let actionHash = encode(
        'updateOwnerParameters(bytes8,address)',
        'OWNER',
        nonMember,
      );
      await gvProp(28, actionHash, oldMR, oldGv, 3);
      (await this.master.owner()).should.be.equal(nonMember);
      (await oldMR.checkRole(nonMember, 3)).should.be.equal(true);
      actionHash = encode(
        'updateOwnerParameters(bytes8,address)',
        'OWNER',
        owner,
      );
      await gvProp(28, actionHash, oldMR, oldGv, 3);
      (await this.master.owner()).should.be.equal(owner);
      actionHash = encode(
        'updateOwnerParameters(bytes8,address)',
        'QUOAUTH',
        owner,
      );
      await gvProp(28, actionHash, oldMR, oldGv, 3);
      (await this.qd.authQuoteEngine()).should.be.equal(owner);
      actionHash = encode(
        'updateOwnerParameters(bytes8,address)',
        'QUOAUTH',
        QE,
      );
      await gvProp(28, actionHash, oldMR, oldGv, 3);
      const qeAdd = await this.qd.authQuoteEngine();
      const qeAdd1 = web3.utils.toChecksumAddress(qeAdd);
      const qeAdd2 = web3.utils.toChecksumAddress(QE);
      const assertion = qeAdd2 === qeAdd1;

      assertion.should.equal(true);

      actionHash = encode(
        'updateOwnerParameters(bytes8,address)',
        'MCRNOTA',
        QE,
      );
      await gvProp(28, actionHash, oldMR, oldGv, 3);
      (await this.pd.notariseMCR()).should.be.equal(qeAdd2);

      actionHash = encode(
        'updateOwnerParameters(bytes8,address)',
        'MCRNOTA',
        owner,
      );
      await gvProp(28, actionHash, oldMR, oldGv, 3);
      (await this.pd.notariseMCR()).should.be.equal(owner);
      await this.mc.addMCRData(
        await getValue(toWei(2), this.pd, this.mc),
        toWei(100),
        toWei(2),
        ['0x455448', '0x444149'],
        [100, 15517],
        20190103,
      );
      await this.p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 15517],
        20190103,
        true,
      ); // for testing
    });
  });

  describe('when called by unauthorised source', function () {

    beforeEach(setup);

    it('1.9 should not be able to add a new version', async function () {
      const addr = []; // dummy
      await expectRevert.unspecified(this.master.addNewVersion(addr, { from: anotherAccount }));
    });

    it('1.10 should not be able to change master address', async function () {
      this.newMaster = await NXMaster.new(this.tk.address);
      await expectRevert.unspecified(
        this.master.changeMasterAddress(this.newMaster.address, { from: anotherAccount }),
      );
    });
  });

  describe('modifiers', function () {

    beforeEach(setup);

    it('1.12 should return true if owner address', async function () {
      const isOwner = await this.master.isOwner(owner);
      isOwner.should.equal(true);
    });

    it('1.13 should return false if not owner address', async function () {
      const isOwner = await this.master.isOwner(newOwner);
      isOwner.should.equal(false);
    });

    it('1.14 should return true if internal contract address', async function () {
      const isInternal = await this.master.isInternal(this.master.address);
      isInternal.should.equal(true);
    });

    it('1.15 should return false if not internal contract address', async function () {
      const isInternal = await this.master.isInternal(newOwner);
      isInternal.should.equal(false);
    });

    it('1.16 should return true if member', async function () {
      await this.mr.payJoiningFee(member, { from: member, value: ether('0.002') });
      await this.mr.kycVerdict(member, true);
      const isMember = await this.master.isMember(member);
      isMember.should.equal(true);
    });

    it('1.17 should return false if not member', async function () {
      const isMember = await this.master.isOwner(nonMember);
      isMember.should.equal(false);
    });

    it('1.18 should return false for no Emergency Pause', async function () {
      const isPause = await this.master.isPause();
      isPause.should.equal(false);
    });
  });

  describe('emergency pause ', function () {

    beforeEach(setup);

    it('1.19 should return zero length for Emergency Pause', async function () {
      const len = await this.master.getEmergencyPausedLength();
      len.toString().should.be.equal(new web3.utils.BN(0).toString());
    });

    it('1.20 should return correct for last Emergency Pause', async function () {
      const lastEP = await this.master.getLastEmergencyPause();
      const isNotPaused = lastEP._pause === false && lastEP._time.toString() === '0';
      isNotPaused.should.equal(true);
    });

    it('1.21 should return correct pasue time detail', async function () {
      const getPauseTime = await this.master.getPauseTime();
      pauseTime.toString().should.be.equal(getPauseTime.toString());
    });

    it('1.22 other address/contract should not be able to update pauseTime', async function () {
      // const updatePauseTime = pauseTime.addn(new web3.utils.BN(60));
      const updatePauseTime = pauseTime.toNumber() + 60;
      await expectRevert.unspecified(
        this.master.updatePauseTime(updatePauseTime, { from: newOwner }),
      );
      const pauseTime1 = await this.master.getPauseTime();
      updatePauseTime.should.be.not.equal(pauseTime1.toNumber());
    });

    it('1.23 governance call should be able to update pauseTime', async function () {
      const oldMR = await MemberRoles.at(
        await this.master.getLatestAddress(hex('MR')),
      );
      const oldGv = await Governance.at(await this.master.getLatestAddress(hex('GV')));
      const actionHash = encode('updateUintParameters(bytes8,uint)', 'EPTIME', 12);
      await gvProp(22, actionHash, oldMR, oldGv, 2);
      const val = await oldGv.getUintParameters(hex('EPTIME'));
      (val[1] / 1).should.be.equal(12);
    });
  });

  describe('upgrade single non-proxy contracts', function () {

    beforeEach(setup);

    it('1.24 should able to propose new contract code for quotation', async function () {
      const newQt = await Quotation.new();
      const oldMR = await MemberRoles.at(
        await this.master.getLatestAddress(hex('MR')),
      );
      const oldGv = await Governance.at(await this.master.getLatestAddress(hex('GV')));
      const actionHash = encode(
        'upgradeContract(bytes2,address)',
        'QT',
        newQt.address,
      );
      await gvProp(29, actionHash, oldMR, oldGv, 2);
      (await this.master.getLatestAddress(hex('QT'))).should.be.equal(newQt.address);
    });

    it('1.25 should able to propose new contract code for claimsReward', async function () {
      const newCr = await ClaimsReward.new();
      const oldMR = await MemberRoles.at(
        await this.master.getLatestAddress(hex('MR')),
      );
      const oldGv = await Governance.at(await this.master.getLatestAddress(hex('GV')));
      const actionHash = encode(
        'upgradeContract(bytes2,address)',
        'CR',
        newCr.address,
      );
      await gvProp(29, actionHash, oldMR, oldGv, 2);
      (await this.master.getLatestAddress(hex('CR'))).should.be.equal(newCr.address);
    });

    it('1.26 should able to propose new contract code for Pool1', async function () {
      const newP1 = await Pool1.new();
      const oldMR = await MemberRoles.at(
        await this.master.getLatestAddress(hex('MR')),
      );
      const oldGv = await Governance.at(await this.master.getLatestAddress(hex('GV')));
      const actionHash = encode(
        'upgradeContract(bytes2,address)',
        'P1',
        newP1.address,
      );
      await gvProp(29, actionHash, oldMR, oldGv, 2);
      (await this.master.getLatestAddress(hex('P1'))).should.be.equal(newP1.address);
    });

    it('1.27 should able to propose new contract code for Pool2', async function () {
      const newP2 = await Pool2.new(this.factory.address);
      const oldMR = await MemberRoles.at(
        await this.master.getLatestAddress(hex('MR')),
      );
      const oldGv = await Governance.at(await this.master.getLatestAddress(hex('GV')));
      const actionHash = encode(
        'upgradeContract(bytes2,address)',
        'P2',
        newP2.address,
      );
      await gvProp(29, actionHash, oldMR, oldGv, 2);
      (await this.master.getLatestAddress(hex('P2'))).should.be.equal(newP2.address);
    });

    it('1.28 should able to propose new contract code for mcr', async function () {
      const newMcr = await MCR.new();
      const oldMR = await MemberRoles.at(
        await this.master.getLatestAddress(hex('MR')),
      );
      const oldGv = await Governance.at(await this.master.getLatestAddress(hex('GV')));
      const actionHash = encode(
        'upgradeContract(bytes2,address)',
        'MC',
        newMcr.address,
      );
      await gvProp(29, actionHash, oldMR, oldGv, 2);
      (await this.master.getLatestAddress(hex('MC'))).should.be.equal(
        newMcr.address,
      );
    });

    it('1.29 should not trigger action if passed invalid address', async function () {
      const oldMR = await MemberRoles.at(
        await this.master.getLatestAddress(hex('MR')),
      );
      const oldGv = await Governance.at(await this.master.getLatestAddress(hex('GV')));
      const mcrOld = await this.master.getLatestAddress(hex('MC'));
      const actionHash = encode(
        'upgradeContract(bytes2,address)',
        'MC',
        ZERO_ADDRESS,
      );
      await gvProp(29, actionHash, oldMR, oldGv, 2);
      (await this.master.getLatestAddress(hex('MC'))).should.be.equal(mcrOld);
    });

    it('1.30 should not trigger action if passed invalid contrcat code', async function () {
      const oldMR = await MemberRoles.at(
        await this.master.getLatestAddress(hex('MR')),
      );
      const oldGv = await Governance.at(await this.master.getLatestAddress(hex('GV')));
      const actionHash = encode(
        'upgradeContract(bytes2,address)',
        'P4',
        oldMR.address,
      );
      await gvProp(29, actionHash, oldMR, oldGv, 2);
    });
  });

  describe('more test cases', function () {

    beforeEach(setup);

    it('1.24 revert in case of upgrade implementation by non governance contract', async function () {
      await expectRevert.unspecified(
        this.master.upgradeContractImplementation(hex('TC'), this.master.address),
      );
    });

    it('1.25 revert in case of applying EP directly', async function () {
      await expectRevert.unspecified(this.master.addEmergencyPause(true, hex('AB')));
    });

    it('1.26 even if passed by governance should not trigger action for wrong contrcat code', async function () {
      const actionHash = encode(
        'upgradeContractImplementation(bytes2,address)',
        'AS',
        this.master.address,
      );
      const oldMR = await MemberRoles.at(
        await this.master.getLatestAddress(hex('MR')),
      );
      const oldGv = await Governance.at(await this.master.getLatestAddress(hex('GV')));
      // await oldGv.changeDependentContractAddress();
      await gvProp(5, actionHash, oldMR, oldGv, 2);
    });

    it('1.27 revert in case of upgrade contract by non governance contract', async function () {
      await expectRevert.unspecified(this.master.upgradeContract(hex('TF'), this.master.address));
    });
  });
});
