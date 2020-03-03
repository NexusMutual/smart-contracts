const Governance = artifacts.require('Governance');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const TokenController = artifacts.require('TokenController');
const NXMToken = artifacts.require('NXMToken');
const QuotationData = artifacts.require('QuotationDataMock');
const StakedData = artifacts.require('StakedData');
const increaseTime = require('./utils/increaseTime.js').increaseTime;
const gvProposal = require('./utils/gvProposal.js').gvProposal;
const encode = require('./utils/encoder.js').encode;
const { latestTime } = require('./utils/latestTime');
const TokenFunctions = artifacts.require('TokenFunctionNewMock');
const ClaimsReward = artifacts.require('ClaimsReward');
const ProposalCategory = artifacts.require('ProposalCategory');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545')); // Hardcoded development port
// const { toWei } = require('./utils/ethTools');
const { toHex, toWei } = require('./utils/ethTools');

let tf;
let gv;
let mr;
let tc;
let qd;
let nxms;
let nxmToken;
let sd;
let cr;
let pc;
let maxAllowance =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';

contract(
  'Pooled staking',
  ([
    mem1,
    mem2,
    mem3,
    mem4,
    mem5,
    mem6,
    mem7,
    mem8,
    mem9,
    mem10,
    mem11,
    mem12,
    mem13,
    mem14,
    mem15
  ]) => {
    before(async function() {
      nxms = await NXMaster.deployed();
      nxmToken = await NXMToken.deployed();
      let address = await nxms.getLatestAddress('0x4756');
      gv = await Governance.at(address);
      address = await nxms.getLatestAddress('0x5043');
      address = await nxms.getLatestAddress('0x4d52');
      mr = await MemberRoles.at(address);
      qd = await QuotationData.deployed();
      sd = await StakedData.new(await nxms.getLatestAddress('0x5443'));
      address = await nxms.getLatestAddress(toHex('PC'));
      pc = await ProposalCategory.at(address);
      let balances = '15000';
      for (let i = 0; i < 15; i++) {
        await nxmToken.approve(
          await nxms.getLatestAddress('0x5443'),
          maxAllowance,
          { from: web3.eth.accounts[i] }
        );
        if (i != 0) {
          await mr.payJoiningFee(web3.eth.accounts[i], {
            value: 2000000000000000,
            from: web3.eth.accounts[i]
          });
          await mr.kycVerdict(web3.eth.accounts[i], true, {
            from: web3.eth.accounts[0]
          });
          await nxmToken.transfer(web3.eth.accounts[i], toWei(balances));
        }
      }
    });

    describe('Staking', function() {
      it('Upgrade TokenFunctions, claimRewards and TokenController contract', async function() {
        let newTf = await TokenFunctions.new(sd.address);

        let actionHash = encode(
          'upgradeContract(bytes2,address)',
          'TF',
          newTf.address
        );
        await gvProposal(29, actionHash, mr, gv, 2);
        assert.equal(await nxms.getLatestAddress(toHex('TF')), newTf.address);
        tf = newTf;
        let newCr = await ClaimsReward.new(sd.address);
        actionHash = encode(
          'upgradeContract(bytes2,address)',
          'CR',
          newCr.address
        );
        await gvProposal(29, actionHash, mr, gv, 2);
        assert.equal(await nxms.getLatestAddress(toHex('CR')), newCr.address);

        cr = await ClaimsReward.at(await nxms.getLatestAddress(toHex('CR')));
        for (let b = 0; b < 15; b++) {
          await cr.migrateStake(web3.eth.accounts[b]);
          assert.equal(await sd.userMigrated(web3.eth.accounts[b]), true);
        }
        let newTc = await TokenController.new();
        actionHash = encode(
          'upgradeContractImplementation(bytes2,address)',
          'TC',
          newTc.address
        );
        await gvProposal(5, actionHash, mr, gv, 2);
        assert.equal(await qd.getImplementationAdd(toHex('TC')), newTc.address);

        tc = await TokenController.at(await nxms.getLatestAddress('0x5443'));
      });

      it('Added a proposal category to update min stake', async function() {
        let c1 = await pc.totalCategories();
        let actionHash = encode(
          'addCategory(string,uint,uint,uint,uint[],uint,string,address,bytes2,uint[])',
          'Description',
          1,
          1,
          0,
          [1],
          604800,
          '',
          sd.address,
          toHex('EX'),
          [0, 0, 0, 0]
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

        actionHash = encode(
          'updateUintParameters(bytes8,uint)',
          toHex('MINSTK'),
          toWei(20)
        );
        p1 = await gv.getProposalLength();
        await gv.createProposal('Proposal1', 'Proposal1', 'Proposal1', 0);
        await gv.categorizeProposal(p1.toNumber(), c1, 0);
        await gv.submitProposalWithSolution(
          p1.toNumber(),
          'proposal',
          actionHash
        );
        await gv.submitVote(p1.toNumber(), 1);
        await gv.closeProposal(p1.toNumber());
      });

      it('5 users stake in risk assesment', async function() {
        console.log('Staked by users as follow: ');
        stake = [100, 500, 300, 20, 1000];
        for (let i = 0; i < 5; i++) {
          await tf.increaseStake(web3.eth.accounts[i], toWei(stake[i]), {
            from: web3.eth.accounts[i]
          });
          let finalStake = (await sd.globalStake(web3.eth.accounts[i])) / 1e18;
          console.log('Member ' + (i / 1 + 1) + ' staked: ', finalStake);
          assert.equal(finalStake, stake[i]);
        }
      });

      it('5 users allocate stake against X contract', async function() {
        console.log(
          'Stake allocated by users on X = 0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf as follow: '
        );
        stakeAlloc = [1000, 200, 350, 800, 250];
        for (let i = 0; i < 5; i++) {
          await tf.increaseAllocation(
            web3.eth.accounts[i],
            ['0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'.toLowerCase()],
            [stakeAlloc[i]],
            { from: web3.eth.accounts[i] }
          );
          let finalAllocation =
            (await sd.stakerStakedContracts(web3.eth.accounts[i], 0))[1] / 100;
          console.log(
            'Member ' + (i / 1 + 1) + ' allocated stake: ',
            finalAllocation,
            '%'
          );
          assert.equal(finalAllocation, stakeAlloc[i] / 100);
        }
      });

      it('Check proportion for all 5 users allocated stake against X contract', async function() {
        console.log(
          'Stake proportion allocated by users on X = 0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf as follow: '
        );
        stakeProp = [17.51, 17.51, 18.39, 2.8, 43.78];
        let toatalStakedOnContract = await sd.getTotalStakedTokensOnSmartContract(
          '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'
        );
        for (let i = 0; i < 5; i++) {
          let finalProp =
            ((await sd.globalStake(web3.eth.accounts[i])) *
              (await sd.stakerStakedContracts(web3.eth.accounts[i], 0))[1]) /
            (toatalStakedOnContract * 100);
          console.log(
            'Member ' + (i / 1 + 1) + "'s allocated stake: ",
            finalProp
          );
          assert.equal(finalProp.toFixed(2), stakeProp[i]);
        }
      });

      it('Burn 100 NXM for X contract', async function() {
        console.log(
          'Stake proportion burned for users on X = 0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf as follow: '
        );
        individualBurn = [17.51, 17.51, 18.39, 2.8, 43.78];
        await tf.burnStakerStake(
          1,
          '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf',
          toWei(100)
        );
        for (let i = 0; i < 5; i++) {
          let burned = (
            (await tc.globalBurned(web3.eth.accounts[i])) / 1e18
          ).toFixed(2);
          console.log('Member ' + (i / 1 + 1) + "'s burned stake: ", burned);
          assert.equal(individualBurn[i], burned);
        }
      });

      it('2nd set of 5 users stake in risk assesment', async function() {
        console.log('Staked by users as follow: ');
        stake = [100, 500, 300, 20, 1000];
        for (let i = 5; i < 10; i++) {
          await tf.increaseStake(web3.eth.accounts[i], toWei(stake[i - 5]), {
            from: web3.eth.accounts[i]
          });
          let finalStake = (await sd.globalStake(web3.eth.accounts[i])) / 1e18;
          console.log('Member ' + (i / 1 + 1) + ' staked: ', finalStake);
          assert.equal(finalStake, stake[i - 5]);
        }
      });

      it('2nd set of 5 users allocate stake against Y contract', async function() {
        console.log(
          'Stake allocated by users on Y = 0xdac17f958d2ee523a2206206994597c13d831ec7 as follow: '
        );
        stakeAlloc = [1000, 200, 350, 800, 250];
        for (let i = 5; i < 10; i++) {
          await tf.increaseAllocation(
            web3.eth.accounts[i],
            ['0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase()],
            [stakeAlloc[i - 5]],
            { from: web3.eth.accounts[i] }
          );
          let finalAllocation =
            (await sd.stakerStakedContracts(web3.eth.accounts[i], 0))[1] / 100;
          console.log(
            'Member ' + (i / 1 + 1) + ' allocated stake: ',
            finalAllocation,
            '%'
          );
          assert.equal(finalAllocation, stakeAlloc[i - 5] / 100);
        }
      });

      it('Check proportion for 2nd set of 5 users allocated stake against Y contract', async function() {
        console.log(
          'Stake proportion allocated by users on Y = 0xdac17f958d2ee523a2206206994597c13d831ec7 as follow: '
        );
        stakeProp = [17.51, 17.51, 18.39, 2.8, 43.78];
        let toatalStakedOnContract = await sd.getTotalStakedTokensOnSmartContract(
          '0xdac17f958d2ee523a2206206994597c13d831ec7'
        );
        for (let i = 5; i < 10; i++) {
          let finalProp =
            ((await sd.globalStake(web3.eth.accounts[i])) *
              (await sd.stakerStakedContracts(web3.eth.accounts[i], 0))[1]) /
            (toatalStakedOnContract * 100);
          console.log(
            'Member ' + (i / 1 + 1) + "'s allocated stake: ",
            finalProp
          );
          assert.equal(finalProp.toFixed(2), stakeProp[i - 5]);
        }
      });

      it('Burn 500 NXM for Y contract', async function() {
        console.log(
          'Stake proportion burned for users on Y = 0xdac17f958d2ee523a2206206994597c13d831ec7 as follow: '
        );
        individualBurn = [87.57, 87.57, 91.94, 14.01, 218.91];
        await tf.burnStakerStake(
          1,
          '0xdac17f958d2ee523a2206206994597c13d831ec7',
          toWei(500)
        );
        for (let i = 5; i < 10; i++) {
          let burned = (
            (await tc.globalBurned(web3.eth.accounts[i])) / 1e18
          ).toFixed(2);
          console.log('Member ' + (i / 1 + 1) + "'s burned stake: ", burned);
          assert.equal(individualBurn[i - 5], burned);
        }
      });

      it('3rd set of 5 users stake in risk assesment', async function() {
        console.log('Staked by users as follow: ');
        stake = [100, 500, 300, 20, 1000];
        for (let i = 10; i < 15; i++) {
          await tf.increaseStake(web3.eth.accounts[i], toWei(stake[i - 10]), {
            from: web3.eth.accounts[i]
          });
          let finalStake = (await sd.globalStake(web3.eth.accounts[i])) / 1e18;
          console.log('Member ' + (i / 1 + 1) + ' staked: ', finalStake);
          assert.equal(finalStake, stake[i - 10]);
        }
      });

      it('3rd set of 5 users allocate stake against Z contract', async function() {
        console.log(
          'Stake allocated by users on Z = 0xB8c77482e45F1F44dE1745F52C74426C631bDD52 as follow: '
        );
        stakeAlloc = [1000, 200, 350, 800, 250];
        for (let i = 10; i < 15; i++) {
          await tf.increaseAllocation(
            web3.eth.accounts[i],
            ['0xB8c77482e45F1F44dE1745F52C74426C631bDD52'.toLowerCase()],
            [stakeAlloc[i - 10]],
            { from: web3.eth.accounts[i] }
          );
          let finalAllocation =
            (await sd.stakerStakedContracts(web3.eth.accounts[i], 0))[1] / 100;
          console.log(
            'Member ' + (i / 1 + 1) + ' allocated stake: ',
            finalAllocation,
            '%'
          );
          assert.equal(finalAllocation, stakeAlloc[i - 10] / 100);
        }
      });

      it('Check proportion for 3rd set of 5 users allocated stake against Z contract', async function() {
        console.log(
          'Stake proportion allocated by users on Z = 0xB8c77482e45F1F44dE1745F52C74426C631bDD52 as follow: '
        );
        stakeProp = [17.51, 17.51, 18.39, 2.8, 43.78];
        let toatalStakedOnContract = await sd.getTotalStakedTokensOnSmartContract(
          '0xB8c77482e45F1F44dE1745F52C74426C631bDD52'
        );
        for (let i = 10; i < 15; i++) {
          let finalProp =
            ((await sd.globalStake(web3.eth.accounts[i])) *
              (await sd.stakerStakedContracts(web3.eth.accounts[i], 0))[1]) /
            (toatalStakedOnContract * 100);
          console.log(
            'Member ' + (i / 1 + 1) + "'s allocated stake: ",
            finalProp
          );
          assert.equal(finalProp.toFixed(2), stakeProp[i - 10]);
        }
      });

      it('Burn 1000 NXM for Z contract', async function() {
        console.log(
          'Stake proportion burned for users on Z = 0xB8c77482e45F1F44dE1745F52C74426C631bDD52 as follow: '
        );
        individualBurn = [100.0, 100.0, 105.0, 16.0, 250.0];
        await tf.burnStakerStake(
          1,
          '0xB8c77482e45F1F44dE1745F52C74426C631bDD52',
          toWei(1000)
        );
        for (let i = 10; i < 15; i++) {
          let burned = (
            (await tc.globalBurned(web3.eth.accounts[i])) / 1e18
          ).toFixed(2);
          console.log('Member ' + (i / 1 + 1) + "'s burned stake: ", burned);
          assert.equal(individualBurn[i - 10], burned);
        }
      });
    });
  }
);
