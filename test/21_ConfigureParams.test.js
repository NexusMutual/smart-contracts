const Governance = artifacts.require('Governance');
const ProposalCategory = artifacts.require('ProposalCategory');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMasterMock');
const PoolData = artifacts.require('PoolDataMock');
const ClaimsReward = artifacts.require('ClaimsReward');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenDataMock');
const NXMToken = artifacts.require('NXMToken');
const QuotationData = artifacts.require('QuotationDataMock');
const DAI = artifacts.require('MockDAI');
const ClaimsData = artifacts.require('ClaimsDataMock');
const MCR = artifacts.require('MCR');

const Pool1 = artifacts.require('Pool1Mock');
const FactoryMock = artifacts.require('FactoryMock');
const gvProposal = require('./utils/gvProposal.js').gvProposal;
const encode = require('./utils/encoder.js').encode;
const TokenFunctions = artifacts.require('TokenFunctionMock');
const {toHex, toWei, toChecksumAddress} = require('./utils/ethTools');
const { takeSnapshot, revertSnapshot } = require('./utils/snapshot');

let mcr;
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
let p1;
let nxms;
let nxmToken;
let snapshotId;

const maxAllowance = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

contract('Configure Global Parameters', accounts => {

    const [ab1] = accounts;

    before(async function() {

      snapshotId = await takeSnapshot();

      tf = await TokenFunctions.deployed();
      nxms = await NXMaster.at(await tf.ms());
      cr = await ClaimsReward.deployed();
      nxmToken = await NXMToken.deployed();
      let address = await nxms.getLatestAddress('0x4756');
      gv = await Governance.at(address);
      address = await nxms.getLatestAddress('0x5043');
      pc = await ProposalCategory.at(address);
      address = await nxms.getLatestAddress('0x4d52');
      mr = await MemberRoles.at(address);
      tc = await TokenController.at(await nxms.getLatestAddress('0x5443'));
      pd = await PoolData.deployed();
      p1 = await Pool1.deployed();
      td = await TokenData.deployed();
      qd = await QuotationData.deployed();
      cd = await ClaimsData.deployed();
      mcr = await MCR.deployed();

      await nxmToken.approve(tc.address, maxAllowance);
      await nxmToken.approve(cr.address, maxAllowance, { from: ab1 });

      let balances = ['15000', '15000', '15000', '15000'];

      for (let i = 1; i < 4; i++) {
        await nxmToken.approve(cr.address, maxAllowance, { from: accounts[i] });
        await mr.payJoiningFee(accounts[i], { value: 2000000000000000, from: accounts[i] });
        await mr.kycVerdict(accounts[i], true, { from: ab1 });
        await nxmToken.transfer(accounts[i], toWei(balances[i]));
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
      code = toHex(code);
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
      if (code == toHex('MASTADD')) {
        let newMaster = await NXMaster.at(proposedValue);
        contractInst = newMaster;
      }
      let parameter = await contractInst[getterFunction](code);
      try {
        parameter[1] = parameter[1].toNumber();
      } catch (err) {}
      if (type == 'address' || type == 'owner') {
        assert.equal(
          toChecksumAddress(parameter[1]),
          toChecksumAddress(proposedValue)
        );
      } else {
        assert.equal(parameter[1], proposedValue, 'Not updated');
      }
    }
    async function updateInvalidParameter(
      cId,
      mrSequence,
      code,
      contractInst,
      type,
      proposedValue
    ) {
      code = toHex(code);
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
      if (code == toHex('MASTADD') && proposedValue != ZERO_ADDRESS) {
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
      it('Should update Max Followers limit', async function() {
        await updateParameter(22, 2, 'MAXFOL', gv, 'uint', '10');
      });
      it('Should update Max Draft time limit', async function() {
        await updateParameter(22, 2, 'MAXDRFT', gv, 'uint', '86400');
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
        await updateParameter(26, 2, 'MCRMIN', pd, 'uint', '7');
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
      it('Should not update Factor A', async function() {
        await updateInvalidParameter(26, 2, 'Z', pd, 'uint', '40');
      });
    });

    describe('Update newly added Capital Model Parameters', function() {
      before(async function() {
        const c1 = await pc.totalCategories();
        let actionHash = encode(
          'newCategory(string,uint256,uint256,uint256,uint256[],uint256,string,address,bytes2,uint256[],string)',
          'Description',
          2,
          50,
          15,
          [2],
          604800,
          '',
          mcr.address,
          toHex('MC'),
          [0, 0, 0, 1],
          'updateUintParameters(bytes8,uint256)'
        );
        let p1 = await gv.getProposalLength();
        await gv.createProposalwithSolution(
          'Add new member',
          'Add new member',
          'Addnewmember',
          3,
          'Add new member',
          actionHash
        );
        await gv.submitVote(p1.toNumber(), 1);
        await gv.closeProposal(p1.toNumber());
        const c2 = await pc.totalCategories();
        assert.equal(c2 / 1, c1 / 1 + 1, 'category not added');
        ((await mcr.variableMincap()) / 1e18)
          .toString()
          .should.be.equal((0).toString());
        await mcr.addMCRData(
          13001,
          '100000000000000000000',
          '7000000000000000000000',
          ['0x455448', '0x444149'],
          [100, 15517],
          20190113
        );
      });

      it('Should update Dynamic Mincap Threshold', async function() {
        ((await mcr.variableMincap()) / 1e18)
          .toString()
          .should.be.equal((70).toString());
        await updateParameter(33, 2, 'DMCT', mcr, 'uint', 14003);

        await mcr.addMCRData(
          14003,
          '100000000000000000000',
          '7000000000000000000000',
          ['0x455448', '0x444149'],
          [100, 15517],
          20190113
        );
        ((await mcr.variableMincap()) / 1e18)
          .toString()
          .should.be.equal((70).toString());

        await mcr.addMCRData(
          15003,
          '100000000000000000000',
          '7000000000000000000000',
          ['0x455448', '0x444149'],
          [100, 15517],
          20190113
        );
        ((await mcr.variableMincap()) / 1e18)
          .toString()
          .should.be.equal((140.7).toString());
      });

      // it('Should not update Dynamic Mincap Threshold', async function() {
      //   await updateInvalidParameter(33, 2, 'DMCT', mcr, 'uint', 4003);
      // });

      it('Should update Dynamic Mincap Increment', async function() {
        await updateParameter(33, 2, 'DMCI', mcr, 'uint', 123);

        await mcr.addMCRData(
          15003,
          '100000000000000000000',
          '7000000000000000000000',
          ['0x455448', '0x444149'],
          [100, 15517],
          20190113
        );
        ((await mcr.variableMincap()) / 1e18)
          .toString()
          .should.be.equal((228.53061).toString());
      });

      it('Should not update newly added Capital Model Parameters', async function() {
        await updateInvalidParameter(33, 2, 'DMC1', mcr, 'uint', 1245);
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
          accounts[1]
        );
      });
      it('Should update MCR Notarise Address', async function() {
        await updateParameter(
          28,
          3,
          'MCRNOTA',
          nxms,
          'owner',
          accounts[1]
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
          accounts[1]
        );
      });
      it('Should update Quote Engine Address', async function() {
        await updateParameter(
          28,
          3,
          'QUOAUTH',
          nxms,
          'owner',
          accounts[1]
        );
      });
      it('Should update KYC Authorised Address', async function() {
        await updateParameter(
          28,
          3,
          'KYCAUTH',
          nxms,
          'owner',
          accounts[1]
        );
      });
      it('Should not trigger action if wrong code is passed', async function() {
        await updateInvalidParameter(
          28,
          3,
          'ASD',
          nxms,
          'owner',
          accounts[1]
        );
      });
    });

    after(async function () {
      await revertSnapshot(snapshotId);
    });

  }
);
