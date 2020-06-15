const Pool1 = artifacts.require('Pool1Mock');
const NXMToken = artifacts.require('NXMToken');
const TokenController = artifacts.require('TokenController');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const PoolData = artifacts.require('PoolDataMock');
const TokenData = artifacts.require('TokenDataMock');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsDataMock');

const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const Quotation = artifacts.require('Quotation');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMasterMock');
const MCR = artifacts.require('MCR');
const Governance = artifacts.require('Governance');
const PooledStaking = artifacts.require('PooledStakingMock');
const {assertRevert} = require('./utils/assertRevert');
const {advanceBlock} = require('./utils/advanceToBlock');
const {ether, toHex, toWei} = require('./utils/ethTools');
const {increaseTimeTo, duration} = require('./utils/increaseTime');
const {latestTime} = require('./utils/latestTime');
const gvProp = require('./utils/gvProposal.js').gvProposal;
const encode = require('./utils/encoder.js').encode;
const encode1 = require('./utils/encoder.js').encode1;
const getQuoteValues = require('./utils/getQuote.js').getQuoteValues;
const getValue = require('./utils/getMCRPerThreshold.js').getValue;

const CA_ETH = '0x45544800';
const CLA = '0x434c41';
const fee = ether(0.002);
const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133';
const PID = 0;
const smartConAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const smartConAdd1 = '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07';
const smartConAdd2 = '0xB8c77482e45F1F44dE1745F52C74426C631bDD52';
const smartConAdd3 = '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2';
const smartConAdd4 = '0x0d8775f648430679a709e98d2b0cb6250d2887ef';
const smartConAdd5 = '0xd850942ef8811f2a866692a623011bde52a462c1';
const coverPeriod = 61;
const coverDetails = [1, '3362445813369838', '744892736679184', '7972408607'];
const v = 28;
const r = '0x66049184fb1cf394862cca6c3b2a0c462401a671d0f2b20597d121e56768f90a';
const s = '0x4c28c8f8ff0548dd3a41d7c75621940eb4adbac13696a2796e98a59691bf53ff';

let P1;
let tk;
let tf;
let tc;
let td;
let cr;
let cl;
let qd;
let qt;
let cad;
let nxms;
let mr;
let pd;
let mcr;
let gv;
let ps;
const BN = web3.utils.BN;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('ClaimsReward', function([
  owner,
  member1,
  member2,
  member3,
  staker1,
  staker2,
  coverHolder,
  notMember,
  newMember1,
  newMember2
]) {
  const stakeTokens = ether(250);
  const tokens = ether(6);
  const validity = duration.days(30);
  const UNLIMITED_ALLOWANCE = new BN((2).toString())
    .pow(new BN((256).toString()))
    .sub(new BN((1).toString()));
  let coverID;
  let closingTime;
  let claimId;

  before(async function() {
    await advanceBlock();
    tk = await NXMToken.deployed();
    tf = await TokenFunctions.deployed();
    td = await TokenData.deployed();
    cr = await ClaimsReward.deployed();
    cl = await Claims.deployed();
    cd = await ClaimsData.deployed();
    qd = await QuotationDataMock.deployed();
    P1 = await Pool1.deployed();
    pd = await PoolData.deployed();
    qt = await Quotation.deployed();
    nxms = await NXMaster.at(await td.ms());
    tc = await TokenController.at(await nxms.getLatestAddress(toHex('TC')));
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    gv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
    mcr = await MCR.deployed();
    ps = await PooledStaking.at(await nxms.getLatestAddress(toHex('PS')));
    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);
    await mcr.addMCRData(
      await getValue(toWei(2), pd, mcr),
      toWei(100),
      toWei(2),
      ['0x455448', '0x444149'],
      [100, 65407],
      20181011
    );

    async function updateCategory(nxmAdd, functionName, updateCat) {
      let actionHash = encode1(
        [
          'uint256',
          'string',
          'uint256',
          'uint256',
          'uint256',
          'uint256[]',
          'uint256',
          'string',
          'address',
          'bytes2',
          'uint256[]',
          'string'
        ],
        [
          updateCat,
          'Edit Category',
          2,
          50,
          15,
          [2],
          604800,
          '',
          nxmAdd,
          toHex('MS'),
          [0, 0, 80, 0],
          functionName
        ]
      );
      await gvProp(4, actionHash, mr, gv, 1);
    }
    await updateCategory(
      nxms.address,
      'upgradeMultipleContracts(bytes2[],address[])',
      29
    );
    let sevenDays = (await latestTime()) / 1 + 3600 * 24 * 7;
    await increaseTimeTo(
      new BN(sevenDays.toString()).add(new BN((1).toString()))
    );

    // await mr.payJoiningFee(owner, { from: owner, value: fee });
    // await mr.kycVerdict(owner, true);
    await mr.payJoiningFee(member1, {from: member1, value: fee});
    await mr.kycVerdict(member1, true);
    await mr.payJoiningFee(member2, {from: member2, value: fee});
    await mr.kycVerdict(member2, true);
    await mr.payJoiningFee(member3, {from: member3, value: fee});
    await mr.kycVerdict(member3, true);
    await mr.payJoiningFee(staker1, {from: staker1, value: fee});
    await mr.kycVerdict(staker1, true);
    await mr.payJoiningFee(staker2, {from: staker2, value: fee});
    await mr.kycVerdict(staker2, true);
    await mr.payJoiningFee(coverHolder, {from: coverHolder, value: fee});
    await mr.kycVerdict(coverHolder, true);
    await mr.payJoiningFee(newMember1, {from: newMember1, value: fee});
    await mr.kycVerdict(newMember1, true);
    await mr.payJoiningFee(newMember2, {from: newMember2, value: fee});
    await mr.kycVerdict(newMember2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member1});
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member2});
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member3});
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: staker1});
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: staker2});
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: coverHolder});
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: newMember1});
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: newMember2});
    await tk.transfer(member1, ether(150));
    await tk.transfer(member2, ether(150));
    await tk.transfer(member3, ether(150));
    await tk.transfer(staker1, ether(450));
    await tk.transfer(staker2, ether(450));
    await tk.transfer(coverHolder, ether(150));
    await tk.transfer(newMember1, ether(4500));
    await tk.transfer(newMember2, ether(450));

    const stakers = [staker1, staker2];
    for (const staker of stakers) {
      await tk.approve(ps.address, stakeTokens, {
        from: staker
      });
      await ps.depositAndStake(stakeTokens, [smartConAdd], [stakeTokens], {
        from: staker
      });
    }
    maxVotingTime = await cd.maxVotingTime();
  });

  describe('Claim Assesor get rewards after Claim Assessment', function() {
    let rewardToGet;
    let initialBalance;
    let initialTokenBalance;
    before(async function() {
      await tc.lock(CLA, tokens, validity, {from: member1});
      await tc.lock(CLA, tokens, validity, {from: member2});
      await tc.lock(CLA, tokens, validity, {from: member3});
      coverDetails[4] = 7972408607001;
      var vrsdata = await getQuoteValues(
        coverDetails,
        toHex('ETH'),
        coverPeriod,
        smartConAdd,
        qt.address
      );
      await P1.makeCoverBegin(
        smartConAdd,
        toHex('ETH'),
        coverDetails,
        coverPeriod,
        vrsdata[0],
        vrsdata[1],
        vrsdata[2],
        {from: coverHolder, value: coverDetails[1]}
      );
      coverID = await qd.getAllCoversOfUser(coverHolder);
      await cl.submitClaim(coverID[0], {from: coverHolder});
      claimId = (await cd.actualClaimLength()) - 1;
      const maxVotingTime = await cd.maxVotingTime();
      const now = await latestTime();
      closingTime = new BN(maxVotingTime.toString()).add(
        new BN(now.toString())
      );
      await cl.submitCAVote(claimId, -1, {from: member1});
      await cl.submitCAVote(claimId, -1, {from: member2});
      await cl.submitCAVote(claimId, -1, {from: member3});
      await cr.claimAllPendingReward(20, {from: member1});
      await increaseTimeTo(
        new BN(closingTime.toString()).add(new BN((2).toString()))
      );
      let claimed = await cr.getRewardAndClaimedStatus(1, claimId, {
        from: member1
      });
      let claimed1 = await cr.getRewardAndClaimedStatus(1, 0, {
        from: member1
      });
      claimed[1].should.be.equal(false);
      let apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await P1.__callback(apiid, '');

      await ps.processPendingActions();
    });
    it('9.1 should change claim reward contract', async function() {
      let newCr = await ClaimsReward.new();
      actionHash = encode1(
        ['bytes2[]', 'address[]'],
        [[toHex('CR')], [newCr.address]]
      );

      await gvProp(29, actionHash, mr, gv, 2);
      (await nxms.getLatestAddress(toHex('CR'))).should.be.equal(newCr.address);
      cr = newCr;

      // increase time to avoid token locking time.
      await increaseTimeTo((await latestTime()) + duration.days(7));
    });
    it('9.1 should be able to claim reward', async function() {
      let proposalIds = [];
      initialTokenBalance = await tk.balanceOf(cr.address);
      initialBalance = await tk.balanceOf(member1);
      rewardToGet = await cr.getAllPendingRewardOfUser(member1);
      await assertRevert(cr.claimAllPendingReward(20, {from: notMember}));
      await cr.claimAllPendingReward(20, {from: member1});
      await cr.claimAllPendingReward(20, {from: member1});
      (await cr.getAllPendingRewardOfUser(member1))
        .toString()
        .should.be.equal((0).toString());
    });
    it('9.2 should increase balance of member', async function() {
      (await tk.balanceOf(member1))
        .toString()
        .should.be.equal(
          new BN(initialBalance.toString())
            .add(new BN(rewardToGet.toString()))
            .toString()
        );
    });
    it('9.3 should decrease token balance of this contract', async function() {
      (await tk.balanceOf(cr.address))
        .toString()
        .should.be.equal(
          new BN(initialTokenBalance.toString())
            .sub(new BN(rewardToGet.toString()))
            .toString()
        );
      let proposalIds = [];

      await cr.claimAllPendingReward(20, {from: member1});
    });
  });
  describe('Staker gets reward', function() {
    let initialBalance;
    let rewardToGet;
    let lockedStakedNXM;
    let stakerRewardAmount;

    before(async function() {
      initialBalance = await tk.balanceOf(staker1);
      lockedStakedNXM = await ps.stakerDeposit(staker1);
      await increaseTimeTo((await latestTime()) + duration.days(3));

      rewardToGet = await cr.getAllPendingRewardOfUser(staker1);
      stakerRewardAmount = await ps.stakerReward(staker1);

      unlockableStakedNXM = await ps.stakerMaxWithdrawable(staker1);
    });
    it('9.4 should be able to claim reward and unlock all unlockable tokens', async function() {
      let proposalIds = [];
      await cr.claimAllPendingReward(20, {from: staker1});
      await ps.withdrawReward(staker1);
      await tf.unlockStakerUnlockableTokens(staker1);
      (await cr.getAllPendingRewardOfUser(staker1))
        .toString()
        .should.be.equal(stakeTokens.toString());
    });
    it('9.5 should increase balance of staker', async function() {
      (await tk.balanceOf(staker1)).toString().should.be.equal(
        new BN(initialBalance.toString())
          .add(new BN(rewardToGet.toString()))
          .sub(new BN(stakeTokens.toString()))
          .toString()
      );
    });
    it('9.6 should decrease locked staked tokens of staker', async function() {
      (await ps.stakerDeposit(staker1))
        .toString()
        .should.be.equal(
          new BN(lockedStakedNXM.toString())
            .sub(new BN(unlockableStakedNXM.toString()))
            .toString()
        );
    });
    it('9.7 should return zero unlockable staked tokens of staker', async function() {
      (await ps.stakerMaxWithdrawable(staker1))
        .toString()
        .should.be.equal((0).toString());
    });
  });

  describe('Misc', function() {
    it('9.8 should not be able change claim status', async function() {
      await assertRevert(cr.changeClaimStatus(claimId, {from: notMember}));
    });

    it('9.9 should not be able call upgrade function of this contract', async function() {
      await assertRevert(cr.upgrade(member1, {from: notMember}));
    });
  });

  describe('Test for claim reward for particular numbers of records', function() {
    let apiidArr = [];
    let contractAddresses = [
      smartConAdd1,
      smartConAdd2,
      smartConAdd3,
      smartConAdd4,
      smartConAdd5
    ];
    let totalCoverPrice = new BN(0);
    before(async function() {
      const stakeAmount = toWei(30).toString();
      const stakeAmounts = [];
      for (let j = 0; j < contractAddresses.length; j++) {
        stakeAmounts.push(stakeAmount);
      }

      await tk.approve(ps.address, stakeAmount, {
        from: newMember1
      });

      await ps.depositAndStake(stakeAmount, contractAddresses, stakeAmounts, {
        from: newMember1
      });

      let coverDetailsTest = [
        1,
        '3362445813369838',
        toWei(100),
        '7972408607',
        '7972408607201'
      ];

      for (let i = 0; i < contractAddresses.length; i++) {
        coverDetailsTest[4] = coverDetailsTest[4] / 1 + 1;

        coverDetailsTest[2] = coverDetailsTest[2] / 1 + toWei(100) / 1;
        if (i == 3) coverDetailsTest[2] = toWei(50) / 1;

        coverDetailsTest[2] = coverDetailsTest[2].toString();

        totalCoverPrice = totalCoverPrice.add(new BN(coverDetailsTest[2]));
        var vrsdata = await getQuoteValues(
          coverDetailsTest,
          toHex('ETH'),
          coverPeriod,
          contractAddresses[i],
          qt.address
        );
        await P1.makeCoverBegin(
          contractAddresses[i],
          toHex('ETH'),
          coverDetailsTest,
          coverPeriod,
          vrsdata[0],
          vrsdata[1],
          vrsdata[2],
          {from: newMember2, value: coverDetailsTest[1].toString()}
        );
      }
      await ps.processPendingActions();
    });

    it('9.10 should claim commision for covers', async function() {
      let initialBal = await tk.balanceOf(newMember1);
      await ps.withdrawReward(newMember1);
      let finalBal = await tk.balanceOf(newMember1);

      const stakerRewardPercentage = await td.stakerCommissionPer();
      const expectedTotalReward = totalCoverPrice
        .mul(new BN(stakerRewardPercentage))
        .div(new BN(100));

      let balanceDifference = finalBal.sub(initialBal).toString();

      assert.equal(balanceDifference, expectedTotalReward.toString());

      let coverDetailsTest = [
        1,
        '3362445813369838',
        toWei(100),
        '7972408607',
        '7972408607501'
      ];

      const coverNXMPrice = toWei(500);
      coverDetailsTest[2] = coverNXMPrice;
      var vrsdata = await getQuoteValues(
        coverDetailsTest,
        toHex('ETH'),
        coverPeriod,
        contractAddresses[3],
        qt.address
      );
      await P1.makeCoverBegin(
        contractAddresses[3],
        toHex('ETH'),
        coverDetailsTest,
        coverPeriod,
        vrsdata[0],
        vrsdata[1],
        vrsdata[2],
        {from: newMember2, value: coverDetailsTest[1].toString()}
      );

      await ps.processPendingActions();

      initialBal = await tk.balanceOf(newMember1);
      await ps.withdrawReward(newMember1);
      finalBal = await tk.balanceOf(newMember1);
      const secondExpectedReward = new BN(coverNXMPrice.toString())
        .mul(new BN(stakerRewardPercentage))
        .div(new BN(100));

      balanceDifference = finalBal.sub(initialBal).toString();
      assert.equal(balanceDifference, secondExpectedReward.toString());
    });

    it('9.11 should claim reward for CA votes', async function() {
      coverID = await qd.getAllCoversOfUser(newMember2);
      let initialLastClaimed = await cd.getRewardDistributedIndex(newMember1);
      assert.equal(initialLastClaimed[0], 0);
      await tc.lock(CLA, toWei(40), validity, {from: newMember1});
      let returnData = await claimAssesmentVoting(
        1,
        coverID,
        newMember2,
        newMember1,
        cl,
        cd,
        pd,
        P1,
        '2000'
      );
      let initialBal = await tk.balanceOf(newMember1);
      await cr.claimAllPendingReward(3, {from: newMember1});
      let finalBal = await tk.balanceOf(newMember1);
      assert.equal(parseFloat(returnData[0]), toWei(180));
      balanceDifference = finalBal.sub(initialBal).toString();
      assert.equal(balanceDifference, toWei(180));
      let newLastIndex = await cd.getRewardDistributedIndex(newMember1);
      assert.equal(newLastIndex[0], initialLastClaimed[0] / 1 + 3);
      initialBal = await tk.balanceOf(newMember1);
      await cr.claimAllPendingReward(3, {from: newMember1});
      finalBal = await tk.balanceOf(newMember1);
      newLastIndex = await cd.getRewardDistributedIndex(newMember1);
      assert.equal(newLastIndex[0], initialLastClaimed[0] / 1 + 3);
      balanceDifference = finalBal.sub(initialBal).toString();
      assert.equal(balanceDifference, toWei(30));
      await P1.__callback(returnData[1], '');
      initialBal = await tk.balanceOf(newMember1);
      await cr.claimAllPendingReward(3, {from: newMember1});
      finalBal = await tk.balanceOf(newMember1);
      newLastIndex = await cd.getRewardDistributedIndex(newMember1);
      assert.equal(newLastIndex[0], initialLastClaimed[0] / 1 + 5);
      balanceDifference = finalBal.sub(initialBal).toString();
      assert.equal(balanceDifference, toWei(10));
    });

    it('9.12 should claim reward for Member votes', async function() {
      coverID = await qd.getAllCoversOfUser(newMember2);
      let initialLastClaimed = await cd.getRewardDistributedIndex(newMember1);
      assert.equal(initialLastClaimed[1], 0);
      let returnData = await claimAssesmentVoting(
        2,
        coverID,
        newMember2,
        newMember1,
        cl,
        cd,
        pd,
        P1,
        '2000'
      );
      let initialBal = await tk.balanceOf(newMember1);
      await cr.claimAllPendingReward(3, {from: newMember1});
      let finalBal = await tk.balanceOf(newMember1);
      assert.equal(parseFloat(returnData[0]), toWei(180));
      balanceDifference = finalBal.sub(initialBal).toString();
      assert.equal(balanceDifference, toWei(180));
      let newLastIndex = await cd.getRewardDistributedIndex(newMember1);
      assert.equal(newLastIndex[1], initialLastClaimed[1] / 1 + 3);
      initialBal = await tk.balanceOf(newMember1);
      await cr.claimAllPendingReward(3, {from: newMember1});
      finalBal = await tk.balanceOf(newMember1);
      newLastIndex = await cd.getRewardDistributedIndex(newMember1);
      assert.equal(newLastIndex[1], initialLastClaimed[1] / 1 + 3);
      balanceDifference = finalBal.sub(initialBal).toString();
      assert.equal(balanceDifference, toWei(30));
      await P1.__callback(returnData[1], '');
      initialBal = await tk.balanceOf(newMember1);
      await cr.claimAllPendingReward(3, {from: newMember1});
      finalBal = await tk.balanceOf(newMember1);
      newLastIndex = await cd.getRewardDistributedIndex(newMember1);
      assert.equal(newLastIndex[1], initialLastClaimed[1] / 1 + 5);
      balanceDifference = finalBal.sub(initialBal).toString();
      assert.equal(balanceDifference, toWei(10));
    });
  });
});

async function claimAssesmentVoting(
  ca,
  coverid,
  newMember2,
  newMember1,
  cl,
  cd,
  pd,
  P1,
  _increaseTime
) {
  let totalOf3;
  let total;
  let pendingClaimAPIId;

  claimId = await cd.actualClaimLength();
  for (let i = 0; i < 5; i++) {
    await cl.submitClaim(coverid[i], {from: newMember2});
    if (ca == 1) await cl.submitCAVote(claimId, -1, {from: newMember1});
    let now = await latestTime();
    closingTime = new BN(_increaseTime.toString()).add(new BN(now.toString()));
    await increaseTimeTo(
      new BN(closingTime.toString()).add(new BN((1).toString()))
    );
    let apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
    if (i != 3 || ca != 1) await P1.__callback(apiid, '');
    else pendingClaimAPIId = apiid;
    if (ca != 1) {
      await cl.submitMemberVote(claimId, -1, {from: newMember1});
      now = await latestTime();
      closingTime = new BN(_increaseTime.toString()).add(
        new BN(now.toString())
      );
      await increaseTimeTo(
        new BN(closingTime.toString()).add(new BN((1).toString()))
      );
      apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      if (i != 3) await P1.__callback(apiid, '');
      else pendingClaimAPIId = apiid;
    }
    claimId = claimId / 1 + 1;
    if (i == 2) totalOf3 = await cr.getRewardToBeDistributedByUser(newMember1);
  }
  total = await cr.getRewardToBeDistributedByUser(newMember1);
  let returnData = [];
  returnData.push(totalOf3);
  returnData.push(pendingClaimAPIId);
  return returnData;
}
