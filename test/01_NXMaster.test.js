const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsDataMock');

const ClaimsReward = artifacts.require('ClaimsReward');
const DAI = artifacts.require('MockDAI');
const DSValue = artifacts.require('NXMDSValueMock');
const NXMaster = artifacts.require('NXMaster');
const MCR = artifacts.require('MCR');
const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenDataMock');
const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolDataMock');
const Quotation = artifacts.require('Quotation');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const MemberRoles = artifacts.require('MemberRoles');
const Governance = artifacts.require('Governance');
const ProposalCategory = artifacts.require('ProposalCategory');
const FactoryMock = artifacts.require('FactoryMock');

const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
var Exchange_0x;

const {ether, toHex, toWei} = require('./utils/ethTools');
const {assertRevert} = require('./utils/assertRevert');
const gvProp = require('./utils/gvProposal.js').gvProposal;
const setTriggerActionTime = require('./utils/gvProposal.js')
  .setTriggerActionTime;
const encode = require('./utils/encoder.js').encode;
const getValue = require('./utils/getMCRPerThreshold.js').getValue;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

let accounts = [];

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
let addr = [];
let dai;
let dsv;
let newMaster;
let memberRoles;
let gov;
let propCat;
let factory;

contract('NXMaster', function([
  owner,
  newOwner,
  member,
  nonMember,
  anotherAccount,
  govVoter1,
  govVoter2,
  govVoter3,
  govVoter4
]) {
  // const fee = ether(0.002);
  accounts = [
    owner,
    newOwner,
    member,
    nonMember,
    anotherAccount,
    govVoter1,
    govVoter2,
    govVoter3,
    govVoter4
  ];
  Exchange_0x = accounts[17];

  const fee = toWei(0.002);
  const poolEther = ether(2);
  const founderAddress = accounts[19];
  const INITIAL_SUPPLY = ether(1500000);
  const pauseTime = new web3.utils.BN(2419200);

  before(async function() {
    let dsv = await DSValue.deployed();
    factory = await FactoryMock.deployed();
    nxms = await NXMaster.deployed();
    qd = await QuotationDataMock.deployed();
    td = await TokenData.deployed();
    tf = await TokenFunctions.deployed();
    tc = await TokenController.new();
    cd = await ClaimsData.deployed();
    pd = await PoolData.deployed();
    qt = await Quotation.deployed();
    nxmtk = await NXMToken.deployed();
    cl = await Claims.deployed();
    cr = await ClaimsReward.deployed();
    pl1 = await Pool1.deployed();
    pl2 = await Pool2.deployed();
    mcr = await MCR.deployed();
    dai = await DAI.deployed();
    propCat = await ProposalCategory.new();
    memberRoles = await MemberRoles.new();
    let oldMR = await MemberRoles.at(await nxms.getLatestAddress(toHex('MR')));
    let oldTk = await NXMToken.deployed();
    let oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));

    const Web3 = require('web3');
    const web3 = new Web3(
      new Web3.providers.HttpProvider('http://localhost:8545')
    );

    addr.push(qd.address);
    addr.push(td.address);
    addr.push(cd.address);
    addr.push(pd.address);
    addr.push(qt.address);
    addr.push(tf.address);
    addr.push(tc.address);
    addr.push(cl.address);
    addr.push(cr.address);
    addr.push(pl1.address);
    addr.push(pl2.address);
    addr.push(mcr.address);
    addr.push(oldGv.address);
    addr.push(propCat.address);
    addr.push(oldMR.address);
    // await oldMR.payJoiningFee(web3.eth.accounts[0], {
    //   from: web3.eth.accounts[0],
    //   value: fee
    // });
    // await oldMR.kycVerdict(web3.eth.accounts[0], true);
    for (let itr = 5; itr < 9; itr++) {
      await oldMR.payJoiningFee(web3.eth.accounts[itr], {
        from: web3.eth.accounts[itr],
        value: fee
      });
      await oldMR.kycVerdict(web3.eth.accounts[itr], true);
      let isMember = await nxms.isMember(web3.eth.accounts[itr]);
      isMember.should.equal(true);

      await oldTk.transfer(web3.eth.accounts[itr], toWei(37500));
    }
  });
  describe('Updating state', function() {
    it('1.2 should not be able to change master address if master has not initialized', async function() {
      let newMaster = await NXMaster.new(nxmtk.address);
      await assertRevert(nxms.changeMasterAddress(newMaster.address));
    });

    it('1.3 should be able to change single contract (proxy contracts)', async function() {
      this.timeout(0);
      let newMemberRoles = await MemberRoles.new();
      let actionHash = encode(
        'upgradeContractImplementation(bytes2,address)',
        'MR',
        newMemberRoles.address
      );
      let oldMR = await MemberRoles.at(
        await nxms.getLatestAddress(toHex('MR'))
      );
      let oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
      // await oldGv.changeDependentContractAddress();
      await gvProp(5, actionHash, oldMR, oldGv, 2);
      (await qd.getImplementationAdd(toHex('MR'))).should.be.equal(
        newMemberRoles.address
      );
      memberRoles = newMemberRoles;
      memberRoles = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    });

    it('1.4 should set launch bit after adding initial members', async function() {
      memberRoles = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
      await memberRoles.addMembersBeforeLaunch([], []);
      (await memberRoles.launched()).should.be.equal(true);
    });

    it('1.5 should be able to reinitialize', async function() {
      this.timeout(0);
      let oldMR = await MemberRoles.at(
        await nxms.getLatestAddress(toHex('MR'))
      );
      let oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
      await pl1.sendEther({from: owner, value: poolEther});
      let actionHash = encode(
        'updateOwnerParameters(bytes8,address)',
        'OWNER',
        nonMember
      );
      await gvProp(28, actionHash, oldMR, oldGv, 3);
      (await nxms.owner()).should.be.equal(nonMember);
      (await oldMR.checkRole(nonMember, 3)).should.be.equal(true);
      actionHash = encode(
        'updateOwnerParameters(bytes8,address)',
        'OWNER',
        owner
      );
      await gvProp(28, actionHash, oldMR, oldGv, 3);
      (await nxms.owner()).should.be.equal(owner);
      actionHash = encode(
        'updateOwnerParameters(bytes8,address)',
        'QUOAUTH',
        owner
      );
      await gvProp(28, actionHash, oldMR, oldGv, 3);
      (await qd.authQuoteEngine()).should.be.equal(owner);
      actionHash = encode(
        'updateOwnerParameters(bytes8,address)',
        'QUOAUTH',
        QE
      );
      await gvProp(28, actionHash, oldMR, oldGv, 3);
      let qeAdd = await qd.authQuoteEngine();
      let qeAdd1 = web3.utils.toChecksumAddress(qeAdd);
      let qeAdd2 = web3.utils.toChecksumAddress(QE);
      let assertion = qeAdd2 == qeAdd1;

      assertion.should.equal(true);
      // await pd.changeCurrencyAssetAddress('0x444149', dai.address);
      // await pd.changeInvestmentAssetAddress('0x444149', dai.address);
      actionHash = encode(
        'updateOwnerParameters(bytes8,address)',
        'MCRNOTA',
        QE
      );
      await gvProp(28, actionHash, oldMR, oldGv, 3);
      (await pd.notariseMCR()).should.be.equal(qeAdd2);

      actionHash = encode(
        'updateOwnerParameters(bytes8,address)',
        'MCRNOTA',
        owner
      );
      await gvProp(28, actionHash, oldMR, oldGv, 3);
      (await pd.notariseMCR()).should.be.equal(owner);
      await mcr.addMCRData(
        await getValue(toWei(2), pd, mcr),
        toWei(100),
        toWei(2),
        ['0x455448', '0x444149'],
        [100, 15517],
        20190103
      );
      await pl2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 15517],
        20190103,
        true
      ); // for testing
    });

    // it('1.6 should be able to change token controller address', async function() {
    //   await tc.changeOperator(tc.address);
    // });

    // it('1.8 new Owner should be able to change owner address back to original owner', async function() {
    //   await nxms.changeOwner(owner, { from: newOwner });
    //   owner.should.equal(await nxms.owner());
    // });
  });

  describe('when called by unauthorised source', function() {
    it('1.9 should not be able to add a new version', async function() {
      await assertRevert(nxms.addNewVersion(addr, {from: anotherAccount}));
    });

    it('1.10 should not be able to change master address', async function() {
      newMaster = await NXMaster.new(nxmtk.address);
      await assertRevert(
        nxms.changeMasterAddress(newMaster.address, {from: anotherAccount})
      );
    });
  });

  describe('modifiers', function() {
    it('1.12 should return true if owner address', async function() {
      const isOwner = await nxms.isOwner(owner);
      isOwner.should.equal(true);
    });
    it('1.13 should return false if not owner address', async function() {
      const isOwner = await nxms.isOwner(newOwner);
      isOwner.should.equal(false);
    });
    it('1.14 should return true if internal contract address', async function() {
      const isInternal = await nxms.isInternal(nxms.address);
      isInternal.should.equal(true);
    });
    it('1.15 should return false if not internal contract address', async function() {
      const isInternal = await nxms.isInternal(newOwner);
      isInternal.should.equal(false);
    });
    it('1.16 should return true if member', async function() {
      await memberRoles.payJoiningFee(member, {from: member, value: fee});
      await memberRoles.kycVerdict(member, true);
      const isMember = await nxms.isMember(member);
      isMember.should.equal(true);
    });
    it('1.17 should return false if not member', async function() {
      const isMember = await nxms.isOwner(nonMember);
      isMember.should.equal(false);
    });
    it('1.18 should return false for no Emergency Pause', async function() {
      const isPause = await nxms.isPause();
      isPause.should.equal(false);
    });
  });

  describe('emergency pause ', function() {
    it('1.19 should return zero length for Emergency Pause', async function() {
      const len = await nxms.getEmergencyPausedLength();
      len.toString().should.be.equal(new web3.utils.BN(0).toString());
    });
    it('1.20 should return correct for last Emergency Pause', async function() {
      let check = false;
      const lastEP = await nxms.getLastEmergencyPause();
      if (lastEP[0] == false && lastEP[1] == 0) check = true;
      check.should.equal(true);
    });

    it('1.21 should return correct pasue time detail', async function() {
      const getPauseTime = await nxms.getPauseTime();
      pauseTime.toString().should.be.equal(getPauseTime.toString());
    });

    it('1.22 other address/contract should not be able to update pauseTime', async function() {
      // const updatePauseTime = pauseTime.addn(new web3.utils.BN(60));
      const updatePauseTime = pauseTime.toNumber() + 60;
      await assertRevert(
        nxms.updatePauseTime(updatePauseTime, {from: newOwner})
      );
      let pauseTime1 = await nxms.getPauseTime();
      updatePauseTime.should.be.not.equal(pauseTime1.toNumber());
    });

    it('1.23 governance call should be able to update pauseTime', async function() {
      let oldMR = await MemberRoles.at(
        await nxms.getLatestAddress(toHex('MR'))
      );
      let oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
      actionHash = encode('updateUintParameters(bytes8,uint)', 'EPTIME', 12);
      await gvProp(22, actionHash, oldMR, oldGv, 2);
      let val = await oldGv.getUintParameters(toHex('EPTIME'));
      (val[1] / 1).should.be.equal(12);
    });
  });

  describe('upgrade single non-proxy contracts', function() {
    it('1.24 should able to propose new contract code for quotation', async function() {
      let newQt = await Quotation.new();
      let oldMR = await MemberRoles.at(
        await nxms.getLatestAddress(toHex('MR'))
      );
      let oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
      actionHash = encode(
        'upgradeContract(bytes2,address)',
        'QT',
        newQt.address
      );
      await gvProp(29, actionHash, oldMR, oldGv, 2);
      (await nxms.getLatestAddress(toHex('QT'))).should.be.equal(newQt.address);
    });
    it('1.25 should able to propose new contract code for claimsReward', async function() {
      let newCr = await ClaimsReward.new();
      let oldMR = await MemberRoles.at(
        await nxms.getLatestAddress(toHex('MR'))
      );
      let oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
      actionHash = encode(
        'upgradeContract(bytes2,address)',
        'CR',
        newCr.address
      );
      await gvProp(29, actionHash, oldMR, oldGv, 2);
      (await nxms.getLatestAddress(toHex('CR'))).should.be.equal(newCr.address);
    });
    it('1.26 should able to propose new contract code for Pool1', async function() {
      let newP1 = await Pool1.new();
      let oldMR = await MemberRoles.at(
        await nxms.getLatestAddress(toHex('MR'))
      );
      let oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
      actionHash = encode(
        'upgradeContract(bytes2,address)',
        'P1',
        newP1.address
      );
      await gvProp(29, actionHash, oldMR, oldGv, 2);
      (await nxms.getLatestAddress(toHex('P1'))).should.be.equal(newP1.address);
    });
    it('1.27 should able to propose new contract code for Pool2', async function() {
      let newP2 = await Pool2.new(factory.address);
      let oldMR = await MemberRoles.at(
        await nxms.getLatestAddress(toHex('MR'))
      );
      let oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
      actionHash = encode(
        'upgradeContract(bytes2,address)',
        'P2',
        newP2.address
      );
      await gvProp(29, actionHash, oldMR, oldGv, 2);
      (await nxms.getLatestAddress(toHex('P2'))).should.be.equal(newP2.address);
    });
    it('1.28 should able to propose new contract code for mcr', async function() {
      let newMcr = await MCR.new();
      let oldMR = await MemberRoles.at(
        await nxms.getLatestAddress(toHex('MR'))
      );
      let oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
      actionHash = encode(
        'upgradeContract(bytes2,address)',
        'MC',
        newMcr.address
      );
      await gvProp(29, actionHash, oldMR, oldGv, 2);
      (await nxms.getLatestAddress(toHex('MC'))).should.be.equal(
        newMcr.address
      );
    });
    it('1.29 should not trigger action if passed invalid address', async function() {
      let oldMR = await MemberRoles.at(
        await nxms.getLatestAddress(toHex('MR'))
      );
      let oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
      let mcrOld = await nxms.getLatestAddress(toHex('MC'));
      actionHash = encode(
        'upgradeContract(bytes2,address)',
        'MC',
        ZERO_ADDRESS
      );
      await gvProp(29, actionHash, oldMR, oldGv, 2);
      (await nxms.getLatestAddress(toHex('MC'))).should.be.equal(mcrOld);
    });
    it('1.30 should not trigger action if passed invalid contrcat code', async function() {
      let oldMR = await MemberRoles.at(
        await nxms.getLatestAddress(toHex('MR'))
      );
      let oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
      let mcrOld = await nxms.getLatestAddress(toHex('MC'));
      actionHash = encode(
        'upgradeContract(bytes2,address)',
        'P4',
        oldMR.address
      );
      await gvProp(29, actionHash, oldMR, oldGv, 2);
    });
  });

  describe('more test cases', function() {
    it('1.24 revert in case of upgrade implementation by non governance contract', async function() {
      await assertRevert(
        nxms.upgradeContractImplementation(toHex('TC'), nxms.address)
      );
    });

    it('1.25 revert in case of applying EP directly', async function() {
      await assertRevert(nxms.addEmergencyPause(true, toHex('AB')));
    });
    it('1.26 even if passed by governance should not trigger action for wrong contrcat code', async function() {
      this.timeout(0);
      let actionHash = encode(
        'upgradeContractImplementation(bytes2,address)',
        'AS',
        nxms.address
      );
      let oldMR = await MemberRoles.at(
        await nxms.getLatestAddress(toHex('MR'))
      );
      let oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
      // await oldGv.changeDependentContractAddress();
      await gvProp(5, actionHash, oldMR, oldGv, 2);
    });
    it('1.27 revert in case of upgrade contract by non governance contract', async function() {
      await assertRevert(nxms.upgradeContract(toHex('TF'), nxms.address));
    });
  });
});
