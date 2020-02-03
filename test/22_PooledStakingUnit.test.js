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
const TokenFunctions = artifacts.require('TokenFunctions');
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
let maxAllowance =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';

contract('Pooled staking', ([ab1, mem1, mem2, mem3, notMember]) => {
  before(async function() {
    nxms = await NXMaster.deployed();
    nxmToken = await NXMToken.deployed();
    let address = await nxms.getLatestAddress('0x4756');
    gv = await Governance.at(address);
    address = await nxms.getLatestAddress('0x5043');
    address = await nxms.getLatestAddress('0x4d52');
    mr = await MemberRoles.at(address);
    qd = await QuotationData.deployed();
    sd = await StakedData.new(mr.address);

    await nxmToken.approve(await nxms.getLatestAddress('0x5443'), maxAllowance);

    let balances = ['15000', '15000', '15000', '15000'];
    for (let i = 1; i < 4; i++) {
      await mr.payJoiningFee(web3.eth.accounts[i], {
        value: 2000000000000000,
        from: web3.eth.accounts[i]
      });
      await mr.kycVerdict(web3.eth.accounts[i], true, {
        from: ab1
      });
      await nxmToken.transfer(web3.eth.accounts[i], toWei(balances[i]));
    }
  });

  describe('Config parameters', function() {
    it('Check all config parameters', async function() {
      assert.equal(await sd.maxAllocationPerx100(), 1000);
      assert.equal(await sd.minAllocationPerx100(), 200);
      assert.equal(await sd.minStake(), toWei(100));
      assert.equal(await sd.globalMaxStakeMultiplier(), 2);
      assert.equal(await sd.disallocateEffectTime(), 7776000);
      assert.equal(await sd.globalStake(ab1), 0);
    });
  });

  describe('Staking', function() {
    it('Upgrade TokenFunctions and TokenController contract', async function() {
      let newTf = await TokenFunctions.new(sd.address);

      let actionHash = encode(
        'upgradeContract(bytes2,address)',
        'TF',
        newTf.address
      );
      await gvProposal(29, actionHash, mr, gv, 2);
      assert.equal(await nxms.getLatestAddress(toHex('TF')), newTf.address);
      tf = newTf;
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

    it('User can lock against risk assesment', async function() {
      let currentCoverLen = await qd.getCoverLength();
      let initialBalance = await nxmToken.balanceOf(ab1);
      await tf.increaseStake(toWei(150));
      let finalBalance = await nxmToken.balanceOf(ab1);
      let time = await latestTime();
      assert.equal(await sd.globalStake(ab1), toWei(150));
      assert.equal(await sd.globalBurned(ab1), 0);
      assert.equal(
        (await sd.lastClaimedforCoverId(ab1)) / 1,
        currentCoverLen / 1
      );
      assert.equal(initialBalance.sub(finalBalance), toWei(150));
      assert.equal(await tc.totalLockedBalance(ab1, time), toWei(150));
    });

    it('User can increase stake against risk assesment (For total allocation = 0)', async function() {
      let currentCoverLen = await qd.getCoverLength();
      let initialBalance = await nxmToken.balanceOf(ab1);
      let initialLocked = await sd.globalStake(ab1);
      await tf.increaseStake(toWei(10));
      let finalBalance = await nxmToken.balanceOf(ab1);
      let time = await latestTime();
      assert.equal(
        await sd.globalStake(ab1),
        initialLocked / 1 + toWei(10) / 1
      );
      assert.equal(await sd.globalBurned(ab1), 0);
      assert.equal(
        (await sd.lastClaimedforCoverId(ab1)) / 1,
        currentCoverLen / 1
      );
      assert.equal(initialBalance.sub(finalBalance), toWei(10));
      assert.equal(
        await tc.totalLockedBalance(ab1, time),
        initialLocked / 1 + toWei(10) / 1
      );
    });

    it('User can decrease stake against risk assesment (For total allocation = 0)', async function() {
      let currentCoverLen = await qd.getCoverLength();
      let initialBalance = await nxmToken.balanceOf(ab1);
      let initialLocked = await sd.globalStake(ab1);
      await tf.decreaseStake(toWei(10));
      let finalBalance = await nxmToken.balanceOf(ab1);
      let time = await latestTime();
      assert.equal(await sd.globalStake(ab1), initialLocked - toWei(10));
      assert.equal(await sd.globalBurned(ab1), 0);
      assert.equal(
        (await sd.lastClaimedforCoverId(ab1)) / 1,
        currentCoverLen / 1
      );
      assert.equal(finalBalance.sub(initialBalance), toWei(10));
      assert.equal(
        await tc.totalLockedBalance(ab1, time),
        initialLocked - toWei(10) / 1
      );
    });

    it('User can allocate against any smart contract', async function() {
      assert.equal(await sd.userTotalAllocated(ab1), 0);
      await tf.increaseAllocation(
        [
          '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'.toLowerCase(),
          '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase()
        ],
        [500, 600]
      );

      let stakerStakedData1 = await sd.stakerStakedContracts(ab1, 0);
      let stakerStakedData2 = await sd.stakerStakedContracts(ab1, 1);
      let stakedStakerData1 = await sd.stakedContractStakers(
        '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'.toLowerCase(),
        0
      );
      let stakedStakerData2 = await sd.stakedContractStakers(
        '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase(),
        0
      );
      assert.equal(
        stakerStakedData1[0].toLowerCase(),
        '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'.toLowerCase()
      );
      assert.equal(stakerStakedData1[1], 500);
      assert.equal(
        stakerStakedData2[0].toLowerCase(),
        '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase()
      );
      assert.equal(stakerStakedData2[1], 600);
      assert.equal(stakedStakerData1[0], ab1);
      assert.equal(stakedStakerData1[1], 500);
      assert.equal(stakedStakerData2[0], ab1);
      assert.equal(stakedStakerData2[1], 600);
      assert.equal(await sd.userTotalAllocated(ab1), 1100);
      assert.equal(
        await sd.getScUserIndex(
          '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf',
          ab1
        ),
        0
      );
      assert.equal(
        await sd.getScUserIndex(
          '0xdac17f958d2ee523a2206206994597c13d831ec7',
          ab1
        ),
        1
      );
      assert.equal(
        await sd.getUserSCIndex(
          ab1,
          '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'
        ),
        0
      );
      assert.equal(
        await sd.getUserSCIndex(
          ab1,
          '0xdac17f958d2ee523a2206206994597c13d831ec7'
        ),
        0
      );
    });

    it('User can increase allocation/allocate against any smart contract', async function() {
      let currentStakerStakedData1 = await sd.stakerStakedContracts(ab1, 0);
      let currentStakerStakedData2 = await sd.stakerStakedContracts(ab1, 1);
      let currentStakedStakerData1 = await sd.stakedContractStakers(
        '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'.toLowerCase(),
        0
      );
      let currentStakedStakerData2 = await sd.stakedContractStakers(
        '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase(),
        0
      );
      let currentTotalAllocated = await sd.userTotalAllocated(ab1);
      await tf.increaseAllocation(
        [
          '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'.toLowerCase(),
          '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase(),
          '0xf1290473e210b2108a85237fbcd7b6eb42cc654f'.toLowerCase()
        ],
        [100, 50, 270]
      );

      let finalStakerStakedData1 = await sd.stakerStakedContracts(ab1, 0);
      let finalStakerStakedData2 = await sd.stakerStakedContracts(ab1, 1);
      let finalStakerStakedData3 = await sd.stakerStakedContracts(ab1, 2);
      let finalStakedStakerData1 = await sd.stakedContractStakers(
        '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'.toLowerCase(),
        0
      );
      let finalStakedStakerData2 = await sd.stakedContractStakers(
        '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase(),
        0
      );
      let finalStakedStakerData3 = await sd.stakedContractStakers(
        '0xf1290473e210b2108a85237fbcd7b6eb42cc654f'.toLowerCase(),
        0
      );
      let finalTotalAllocated = await sd.userTotalAllocated(ab1);
      assert.equal(
        await sd.getUserSCIndex(
          ab1,
          '0xf1290473e210b2108a85237fbcd7b6eb42cc654f'
        ),
        0
      );
      assert.equal(
        await sd.getScUserIndex(
          '0xf1290473e210b2108a85237fbcd7b6eb42cc654f',
          ab1
        ),
        2
      );
      assert.equal(
        finalStakerStakedData1[1] - currentStakerStakedData1[1],
        100
      );
      assert.equal(finalStakerStakedData2[1] - currentStakerStakedData2[1], 50);
      assert.equal(finalStakerStakedData3[1], 270);
      assert.equal(
        finalStakedStakerData1[1] - currentStakedStakerData1[1],
        100
      );
      assert.equal(finalStakedStakerData2[1] - currentStakedStakerData2[1], 50);
      assert.equal(finalStakedStakerData3[1], 270);
      assert.equal(finalTotalAllocated - currentTotalAllocated, 420);
    });

    it('User can decrease stake against risk assesment (For total allocation > 0)', async function() {
      let initialBalance = await nxmToken.balanceOf(ab1);
      let initialLocked = await sd.globalStake(ab1);
      let currentStakerStakedData1 = await sd.stakerStakedContracts(ab1, 0);
      let currentStakerStakedData2 = await sd.stakerStakedContracts(ab1, 1);
      let currentStakerStakedData3 = await sd.stakerStakedContracts(ab1, 2);
      let currentStakedStakerData1 = await sd.stakedContractStakers(
        '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'.toLowerCase(),
        0
      );
      let currentStakedStakerData2 = await sd.stakedContractStakers(
        '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase(),
        0
      );
      let currentStakedStakerData3 = await sd.stakedContractStakers(
        '0xf1290473e210b2108a85237fbcd7b6eb42cc654f'.toLowerCase(),
        0
      );
      await tf.decreaseStake(toWei(10));
      let finalBalance = await nxmToken.balanceOf(ab1);
      let finalStakerStakedData1 = await sd.stakerStakedContracts(ab1, 0);
      let finalStakerStakedData2 = await sd.stakerStakedContracts(ab1, 1);
      let finalStakerStakedData3 = await sd.stakerStakedContracts(ab1, 2);
      let finalStakedStakerData1 = await sd.stakedContractStakers(
        '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'.toLowerCase(),
        0
      );
      let finalStakedStakerData2 = await sd.stakedContractStakers(
        '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase(),
        0
      );
      let finalStakedStakerData3 = await sd.stakedContractStakers(
        '0xf1290473e210b2108a85237fbcd7b6eb42cc654f'.toLowerCase(),
        0
      );
      assert.equal(await sd.globalStake(ab1), initialLocked - toWei(10));
      assert.equal(finalBalance.sub(initialBalance), toWei(10));
      assert.equal(
        finalStakerStakedData1[1],
        Math.floor(
          (currentStakerStakedData1[1] * initialLocked) /
            (initialLocked - toWei(10))
        )
      );
      assert.equal(
        finalStakerStakedData2[1],
        Math.floor(
          (currentStakerStakedData2[1] * initialLocked) /
            (initialLocked - toWei(10))
        )
      );
      assert.equal(
        finalStakerStakedData3[1],
        Math.floor(
          (currentStakerStakedData3[1] * initialLocked) /
            (initialLocked - toWei(10))
        )
      );
      assert.equal(
        finalStakedStakerData1[1],
        Math.floor(
          (currentStakedStakerData1[1] * initialLocked) /
            (initialLocked - toWei(10))
        )
      );
      assert.equal(
        finalStakedStakerData2[1],
        Math.floor(
          (currentStakedStakerData2[1] * initialLocked) /
            (initialLocked - toWei(10))
        )
      );
      assert.equal(
        finalStakedStakerData3[1],
        Math.floor(
          (currentStakedStakerData3[1] * initialLocked) /
            (initialLocked - toWei(10))
        )
      );
    });

    it('User can increase stake against risk assesment (For total allocation > 0)', async function() {
      let initialBalance = await nxmToken.balanceOf(ab1);
      let initialLocked = await sd.globalStake(ab1);
      let currentStakerStakedData1 = await sd.stakerStakedContracts(ab1, 0);
      let currentStakerStakedData2 = await sd.stakerStakedContracts(ab1, 1);
      let currentStakerStakedData3 = await sd.stakerStakedContracts(ab1, 2);
      let currentStakedStakerData1 = await sd.stakedContractStakers(
        '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'.toLowerCase(),
        0
      );
      let currentStakedStakerData2 = await sd.stakedContractStakers(
        '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase(),
        0
      );
      let currentStakedStakerData3 = await sd.stakedContractStakers(
        '0xf1290473e210b2108a85237fbcd7b6eb42cc654f'.toLowerCase(),
        0
      );
      await tf.increaseStake(toWei(10));
      let finalBalance = await nxmToken.balanceOf(ab1);
      let finalStakerStakedData1 = await sd.stakerStakedContracts(ab1, 0);
      let finalStakerStakedData2 = await sd.stakerStakedContracts(ab1, 1);
      let finalStakerStakedData3 = await sd.stakerStakedContracts(ab1, 2);
      let finalStakedStakerData1 = await sd.stakedContractStakers(
        '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'.toLowerCase(),
        0
      );
      let finalStakedStakerData2 = await sd.stakedContractStakers(
        '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase(),
        0
      );
      let finalStakedStakerData3 = await sd.stakedContractStakers(
        '0xf1290473e210b2108a85237fbcd7b6eb42cc654f'.toLowerCase(),
        0
      );
      assert.equal(
        await sd.globalStake(ab1),
        initialLocked / 1 + toWei(10) / 1
      );
      assert.equal(initialBalance.sub(finalBalance), toWei(10));
      assert.equal(
        finalStakerStakedData1[1],
        Math.floor(
          (currentStakerStakedData1[1] * initialLocked) /
            (initialLocked / 1 + toWei(10) / 1)
        )
      );
      assert.equal(
        finalStakerStakedData2[1],
        Math.floor(
          (currentStakerStakedData2[1] * initialLocked) /
            (initialLocked / 1 + toWei(10) / 1)
        )
      );
      assert.equal(
        finalStakerStakedData3[1],
        Math.floor(
          (currentStakerStakedData3[1] * initialLocked) /
            (initialLocked / 1 + toWei(10) / 1)
        )
      );
      assert.equal(
        finalStakedStakerData1[1],
        Math.floor(
          (currentStakedStakerData1[1] * initialLocked) /
            (initialLocked / 1 + toWei(10) / 1)
        )
      );
      assert.equal(
        finalStakedStakerData2[1],
        Math.floor(
          (currentStakedStakerData2[1] * initialLocked) /
            (initialLocked / 1 + toWei(10) / 1)
        )
      );
      assert.equal(
        finalStakedStakerData3[1],
        Math.floor(
          (currentStakedStakerData3[1] * initialLocked) /
            (initialLocked / 1 + toWei(10) / 1)
        )
      );
    });

    it('User can request for decrease allocation against any smart contract', async function() {
      await tf.decreaseAllocation(
        [
          '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'.toLowerCase(),
          '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase(),
          '0xf1290473e210b2108a85237fbcd7b6eb42cc654f'.toLowerCase()
        ],
        [100, 50, 269]
      );
      let nowTime = await latestTime();
      let disallocReq1 = await sd.userDisallocationRequest(ab1, 0);
      let disallocReq2 = await sd.userDisallocationRequest(ab1, 1);
      let disallocReq3 = await sd.userDisallocationRequest(ab1, 2);
      assert.equal(
        disallocReq1[0].toLowerCase(),
        '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'.toLowerCase()
      );
      assert.equal(disallocReq1[1], 100);
      assert.equal(disallocReq1[2], nowTime / 1 + 24 * 60 * 60 * 90);

      assert.equal(
        disallocReq2[0].toLowerCase(),
        '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase()
      );
      assert.equal(disallocReq2[1], 50);
      assert.equal(disallocReq2[2], nowTime / 1 + 24 * 60 * 60 * 90);

      assert.equal(
        disallocReq3[0].toLowerCase(),
        '0xf1290473e210b2108a85237fbcd7b6eb42cc654f'.toLowerCase()
      );
      assert.equal(disallocReq3[1], 269);
      assert.equal(disallocReq3[2], nowTime / 1 + 24 * 60 * 60 * 90);
    });

    it('Anyone can call DissAllocate tx, It will trigger all valid disallocations for mentioned user', async function() {
      let currentStakerStakedData1 = await sd.stakerStakedContracts(ab1, 0);
      let currentStakerStakedData2 = await sd.stakerStakedContracts(ab1, 1);
      let currentStakedStakerData1 = await sd.stakedContractStakers(
        '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'.toLowerCase(),
        0
      );
      let currentStakedStakerData2 = await sd.stakedContractStakers(
        '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase(),
        0
      );
      let totalAllocated = await sd.userTotalAllocated(ab1);
      let nowTime = await latestTime();
      await increaseTime(nowTime / 1 + 24 * 60 * 60 * 91);
      await tf.disAllocate(ab1);

      let stakerStakedData1 = await sd.stakerStakedContracts(ab1, 0);
      let stakerStakedData2 = await sd.stakerStakedContracts(ab1, 1);
      let stakedStakerData1 = await sd.stakedContractStakers(
        '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf'.toLowerCase(),
        0
      );
      let stakedStakerData2 = await sd.stakedContractStakers(
        '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase(),
        0
      );
      assert.equal(await sd.userDisallocationExecuted(ab1), 3);
      assert.equal(stakerStakedData1[1], currentStakerStakedData1[1] - 100);
      assert.equal(stakerStakedData2[1], currentStakerStakedData2[1] - 50);
      assert.equal(stakedStakerData1[1], currentStakedStakerData1[1] - 100);
      assert.equal(stakedStakerData2[1], currentStakedStakerData2[1] - 50);
      assert.equal(
        await sd.userTotalAllocated(ab1),
        totalAllocated - 100 - 50 - 269
      );
      // Below two comparing indices with -1 because as user have unallocated entire stake so his mapping will not be available in structure.
      // Below conditions ensure that mapping don't exist anymore
      assert.equal(
        await sd.getScUserIndex(
          '0xf1290473e210b2108a85237fbcd7b6eb42cc654f',
          ab1
        ),
        -1
      );
      assert.equal(
        await sd.getUserSCIndex(
          ab1,
          '0xf1290473e210b2108a85237fbcd7b6eb42cc654f'
        ),
        -1
      );
    });
  });
});
