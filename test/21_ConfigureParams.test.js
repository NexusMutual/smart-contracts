const Governance = artifacts.require('GovernanceMock');
const ProposalCategory = artifacts.require('ProposalCategory');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const PoolData = artifacts.require('PoolData');
const EventCaller = artifacts.require('EventCaller');
const ClaimsReward = artifacts.require('ClaimsReward');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenDataMock');
const NXMToken = artifacts.require('NXMToken');
const QuotationData = artifacts.require('QuotationDataMock');
const DAI = artifacts.require('MockDAI');
const ClaimsData = artifacts.require('ClaimsData');
const FactoryMock = artifacts.require('FactoryMock');
const expectEvent = require('./utils/expectEvent');
const assertRevert = require('./utils/assertRevert.js').assertRevert;
const increaseTime = require('./utils/increaseTime.js').increaseTime;
const gvProposal = require('./utils/gvProposal.js').gvProposal;
const encode = require('./utils/encoder.js').encode;
const AdvisoryBoard = '0x41420000';
const TokenFunctions = artifacts.require('TokenFunctionMock');

let tf;
let gv;
let cr;
let pc;
let mr;
let tc;
let pd;
let td;
let qd;
let cd;
let nxms;
let eventCaller;
let proposalId;
let pId;
let nxmToken;
let balance;
let status;
let voters;
let maxAllowance =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const CLA = '0x434c41';
const validity = 2592000;

contract(
  'Configure Global Parameters',
  ([ab1, mem1, mem2, mem3, notMember]) => {
    before(async function() {
      nxms = await NXMaster.deployed();
      tf = await TokenFunctions.deployed();
      cr = await ClaimsReward.deployed();
      nxmToken = await NXMToken.deployed();
      let address = await nxms.getLatestAddress('GV');
      gv = await Governance.at(address);
      address = await nxms.getLatestAddress('PC');
      pc = await ProposalCategory.at(address);
      address = await nxms.getLatestAddress('MR');
      mr = await MemberRoles.at(address);
      tc = await TokenController.at(await nxms.getLatestAddress('TC'));
      pd = await PoolData.deployed();
      td = await TokenData.deployed();
      qd = await QuotationData.deployed();
      cd = await ClaimsData.deployed();
      eventCaller = await EventCaller.deployed();
      await nxmToken.approve(tc.address, maxAllowance);
      let bal = await nxmToken.balanceOf(ab1);
      await nxmToken.approve(cr.address, maxAllowance, {
        from: web3.eth.accounts[0]
      });
      // await mr.payJoiningFee(web3.eth.accounts[0], {
      //   value: 2000000000000000,
      //   from: web3.eth.accounts[0]
      // });
      // await mr.kycVerdict(web3.eth.accounts[0], true, {
      //   from: web3.eth.accounts[0]
      // });
      // await nxmToken.transfer(notMember, 267600*1e18);
      let balances = [150000, 150000, 150000, 150000];
      for (let i = 1; i < 4; i++) {
        await nxmToken.approve(cr.address, maxAllowance, {
          from: web3.eth.accounts[i]
        });
        await mr.payJoiningFee(web3.eth.accounts[i], {
          value: 2000000000000000,
          from: web3.eth.accounts[i]
        });
        await mr.kycVerdict(web3.eth.accounts[i], true, {
          from: web3.eth.accounts[0]
        });
        await nxmToken.transfer(web3.eth.accounts[i], balances[i] * 1e18);
      }
    });
    async function updateParameter(
      cId,
      mrSequence,
      code,
      contractInst,
      type,
      proposedValue
    ) {
      let getterFunction;
      if (type == 'uint') {
        action = 'updateUintParameters(bytes8,uint)';
        getterFunction = 'getUintParameters';
      } else if (type == 'address') {
        action = 'updateAddressParameters(bytes8,address)';
        getterFunction = 'getAddressParameters';
      } else if (type == 'owner') {
        action = 'updateOwnerParameters(bytes8,address)';
        getterFunction = 'getOwnerParameters';
      }
      // console.log(proposedValue);
      let actionHash = encode(action, code, proposedValue);
      await gvProposal(cId, actionHash, mr, gv, mrSequence);
      if (code == 'MASTADD') {
        let newMaster = await NXMaster.at(proposedValue);
        contractInst = newMaster;
      }
      let parameter = await contractInst[getterFunction](code);
      try {
        parameter[1] = parameter[1].toNumber();
      } catch (err) {}
      assert.equal(parameter[1], proposedValue);
    }
    async function updateInvalidParameter(
      cId,
      mrSequence,
      code,
      contractInst,
      type,
      proposedValue
    ) {
      let getterFunction;
      if (type == 'uint') {
        action = 'updateUintParameters(bytes8,uint)';
        getterFunction = 'getUintParameters';
      } else if (type == 'address') {
        action = 'updateAddressParameters(bytes8,address)';
        getterFunction = 'getAddressParameters';
      } else if (type == 'owner') {
        action = 'updateOwnerParameters(bytes8,address)';
        getterFunction = 'getOwnerParameters';
      }
      let actionHash = encode(action, code, proposedValue);
      await gvProposal(cId, actionHash, mr, gv, mrSequence);
      if (code == 'MASTADD') {
        let newMaster = await NXMaster.at(proposedValue);
        contractInst = newMaster;
      }
      let parameter = await contractInst[getterFunction](code);
      try {
        parameter[1] = parameter[1].toNumber();
      } catch (err) {}
      assert.notEqual(parameter[1], proposedValue);
    }

    describe('Update Token Parameters', function() {
      it('Should update Exponent in Token Price', async function() {
        await updateParameter(20, 2, 'TOKEXP', td, 'uint', '7000000000000000');
      });
      it('Should update Token Step', async function() {
        await updateParameter(20, 2, 'TOKSTEP', td, 'uint', '10000');
      });
      it('Should update Token Step', async function() {
        await updateParameter(20, 2, 'QUOLOCKT', td, 'uint', '7000');
      });
      it('Should update Token Step', async function() {
        await updateInvalidParameter(20, 2, 'QUOLOC12', td, 'uint', '7000');
      });
    });

    describe('Update Risk Assessment Parameters', function() {
      it('Should update Stake Period', async function() {
        await updateParameter(21, 2, 'RALOCKT', td, 'uint', '86400');
      });
      it('Should update Commission%', async function() {
        await updateParameter(21, 2, 'RACOMM', td, 'uint', '90');
      });
      it('Should update Max Commission%', async function() {
        await updateParameter(21, 2, 'RAMAXC', td, 'uint', '40');
      });
      it('Should update Extra CA Lock Period', async function() {
        await updateParameter(21, 2, 'CALOCKT', td, 'uint', '86400');
      });
      it('Should update Extra Member Lock Period', async function() {
        await updateParameter(21, 2, 'MVLOCKT', td, 'uint', '86400');
      });
      it('Should update Claim  Assessor Velocity', async function() {
        await updateParameter(21, 2, 'CABOOKT', td, 'uint', '7000');
      });
      it('Should update Membership joining fee', async function() {
        await updateParameter(21, 2, 'JOINFEE', td, 'uint', '6000000000000000');
      });
    });

    describe('Update Governance Parameters', function() {
      it('Should update Governance Token Holding Time', async function() {
        await updateParameter(22, 2, 'GOVHOLD', gv, 'uint', '86400');
      });
      it('Should update Max Advisory Board Members', async function() {
        await updateParameter(22, 2, 'MAXAB', gv, 'uint', '10');
      });
      it('Should update Emergency Pause Time', async function() {
        await updateParameter(22, 2, 'EPTIME', gv, 'uint', '86400');
      });
      it('Should not update if parameter code is incorrect', async function() {
        await updateInvalidParameter(22, 2, 'EPTIM', gv, 'uint', '86400');
      });
    });

    describe('Update Quotation Parameters', function() {
      it('Should update Short Term Load Period', async function() {
        await updateParameter(23, 2, 'STLP', qd, 'uint', '40');
      });
      it('Should update Short Term Load', async function() {
        await updateParameter(23, 2, 'STL', qd, 'uint', '1000');
      });
      it('Should update Profit Margin', async function() {
        await updateParameter(23, 2, 'PM', qd, 'uint', '60');
      });
      it('Should update Minimum Cover Period', async function() {
        await updateParameter(23, 2, 'QUOMIND', qd, 'uint', '86400');
      });
      it('Should update Tokens Retained', async function() {
        await updateParameter(23, 2, 'QUOTOK', qd, 'uint', '10000');
      });
      it('Should not trigger action if wrong code is passed', async function() {
        await updateInvalidParameter(23, 2, 'QUOTO1', qd, 'uint', '10000');
      });
    });

    describe('Update Claims Assessment Parameters', function() {
      it('Should update Max Vote Period', async function() {
        await updateParameter(24, 2, 'CAMAXVT', cd, 'uint', '3600');
      });
      it('Should update Min Vote Period', async function() {
        await updateParameter(24, 2, 'CAMINVT', cd, 'uint', '3600');
      });
      it('Should update Payout Retry Time', async function() {
        await updateParameter(24, 2, 'CAPRETRY', cd, 'uint', '3600');
      });
      it('Should update Min Lock Period', async function() {
        await updateParameter(24, 2, 'CADEPT', cd, 'uint', '86400');
      });
      it('Should update Reward%', async function() {
        await updateParameter(24, 2, 'CAREWPER', cd, 'uint', '40');
      });
      it('Should update Min Vote Threshold', async function() {
        await updateParameter(24, 2, 'CAMINTH', cd, 'uint', '30');
      });
      it('Should update Max Vote Threshold', async function() {
        await updateParameter(24, 2, 'CAMAXTH', cd, 'uint', '30');
      });
      it('Should update CA Consensus%', async function() {
        await updateParameter(24, 2, 'CACONPER', cd, 'uint', '40');
      });
      it('Should update Pause Claim Assessor Voting Time', async function() {
        await updateParameter(24, 2, 'CAPAUSET', cd, 'uint', '86400');
      });
    });

    describe('Update Investment module Parameters', function() {
      it('Should update IA  Variation%', async function() {
        await updateParameter(25, 2, 'IMZ', pd, 'uint', '40');
      });
      it('Should update IA Exchange Rate Feed', async function() {
        await updateParameter(25, 2, 'IMRATET', pd, 'uint', '3600');
      });
      it('Should update Uniswap Order Deadline', async function() {
        await updateParameter(25, 2, 'IMUNIDL', pd, 'uint', '60');
      });
      it('Should update Liquidity Trade Callback', async function() {
        await updateParameter(25, 2, 'IMLIQT', pd, 'uint', '3600');
      });
      it('Should update Uniswap Exchange Min Liquidity', async function() {
        await updateParameter(25, 2, 'IMETHVL', pd, 'uint', '40');
      });
    });

    describe('Update Capital Model Parameters', function() {
      it('Should update MCR Post Time', async function() {
        await updateParameter(26, 2, 'MCRTIM', pd, 'uint', '3600');
      });
      it('Should update MCR Fail Post Time', async function() {
        await updateParameter(26, 2, 'MCRFTIM', pd, 'uint', '3600');
      });
      it('Should update Min Capital Required', async function() {
        await updateParameter(26, 2, 'MCRMIN', pd, 'uint', '60');
      });
      it('Should update Shock Parameter', async function() {
        await updateParameter(26, 2, 'MCRSHOCK', pd, 'uint', '60');
      });
      it('Should update Capacity Limit%', async function() {
        await updateParameter(26, 2, 'MCRCAPL', pd, 'uint', '40');
      });
      it('Should update Factor C', async function() {
        await updateParameter(26, 2, 'C', pd, 'uint', '40');
      });
      it('Should update Factor A', async function() {
        await updateParameter(26, 2, 'A', pd, 'uint', '40');
      });
      it('Should update Factor A', async function() {
        await updateInvalidParameter(26, 2, 'Z', pd, 'uint', '40');
      });
    });

    describe('Update Address Parameters', function() {
      it('Should update Event Caller Address', async function() {
        let newEventCaller = await EventCaller.new();
        await updateParameter(
          27,
          2,
          'EVCALL',
          nxms,
          'address',
          newEventCaller.address
        );
      });
      it('Should update Master Contract Address', async function() {
        // let eventCaller = EventCaller.deployed();
        let newMaster = await NXMaster.new(
          eventCaller.address,
          nxmToken.address
        );
        addressCon = await nxms.getVersionData(await nxms.getCurrentVersion());
        addressIncorrect = await nxms.getVersionData(
          await nxms.getCurrentVersion()
        );
        addressIncorrect[2][0] = ZERO_ADDRESS;
        await assertRevert(newMaster.addNewVersion(addressIncorrect[2]));
        await newMaster.addNewVersion(addressCon[2]);
        await updateParameter(
          27,
          2,
          'MASTADD',
          nxms,
          'address',
          newMaster.address,
          newMaster
        );
        (await gv.nxMasterAddress()).should.be.equal(newMaster.address);
        nxms = newMaster;
      });
      it('Should not trigger action if wrong code is passed', async function() {
        await updateInvalidParameter(
          27,
          2,
          'ASD',
          nxms,
          'address',
          web3.eth.accounts[1]
        );
      });
      it('Should not trigger action if null address is passed', async function() {
        await updateInvalidParameter(
          27,
          2,
          'EVCALL',
          nxms,
          'address',
          ZERO_ADDRESS
        );
      });
    });

    describe('Update Owner Parameters', function() {
      it('Should update Multi sig Wallet Address', async function() {
        await updateParameter(
          28,
          3,
          'MSWALLET',
          nxms,
          'owner',
          web3.eth.accounts[1]
        );
      });
      it('Should update MCR Notarise Address', async function() {
        await updateParameter(
          28,
          3,
          'MCRNOTA',
          nxms,
          'owner',
          web3.eth.accounts[1]
        );
      });
      it('Should updateDAI Feed Address', async function() {
        let newDai = await DAI.new();
        await updateParameter(28, 3, 'DAIFEED', nxms, 'owner', newDai.address);
      });
      it('Should update Uniswap Factory Address', async function() {
        var newUniswap = await FactoryMock.new();
        await updateParameter(
          28,
          3,
          'UNISWADD',
          nxms,
          'owner',
          newUniswap.address
        );
      });
      it('Should update Owner Address', async function() {
        await updateParameter(
          28,
          3,
          'OWNER',
          nxms,
          'owner',
          web3.eth.accounts[1]
        );
      });
      it('Should update Quote Engine Address', async function() {
        await updateParameter(
          28,
          3,
          'QUOAUTH',
          nxms,
          'owner',
          web3.eth.accounts[1]
        );
      });
      it('Should update KYC Authorised Address', async function() {
        await updateParameter(
          28,
          3,
          'KYCAUTH',
          nxms,
          'owner',
          web3.eth.accounts[1]
        );
      });
      it('Should not trigger action if wrong code is passed', async function() {
        await updateInvalidParameter(
          28,
          3,
          'ASD',
          nxms,
          'owner',
          web3.eth.accounts[1]
        );
      });
    });
  }
);
