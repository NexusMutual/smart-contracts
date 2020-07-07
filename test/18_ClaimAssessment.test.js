const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether, toBN, toHex, toWei } = require('./utils/ethTools');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');
const { gvProposal } = require('./utils/gvProposal');
const { encode } = require('./utils/encoder');
const { getQuoteValues } = require('./utils/getQuote');

const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolDataMock');
const NXMToken = artifacts.require('NXMToken');
const TokenController = artifacts.require('TokenController');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenData = artifacts.require('TokenDataMock');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsDataMock');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const DSValue = artifacts.require('NXMDSValueMock');
const Quotation = artifacts.require('Quotation');
const MCR = artifacts.require('MCR');
const DAI = artifacts.require('MockDAI');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMasterMock');
const Governance = artifacts.require('Governance');
const PooledStaking = artifacts.require('PooledStakingMock');

const CLA = toHex('CLA');
const MEMBER_FEE = ether('0.002');
const validity = duration.days(30);

const formatJSON = json => JSON.stringify(json, null, 2);

const filterArgsKeys = args => {
  const params = {};
  for (const key of Object.keys(args)) {
    if (isNaN(key) && key !== '__length__') {
      const value = args[key];
      params[key] = BN.isBN(value) ? value.toString() : value;
    }
  }
  return params;
};

const logEvents = receipt => receipt.logs.forEach(log => {
  const { event, args } = log;
  const params = filterArgsKeys(args);
  console.log(`Event emitted: ${event}(${formatJSON(params)}`);
});

let dai;
let p1;
let tk;
let tf;
let tc;
let td;
let cr;
let cl;
let qd;
let mcr;
let DSV;
let nxms;
let mr;
let gv;
let APIID;
let qt;
let ps;

const { BN } = web3.utils;
require('chai').should();

contract('Claim: Assessment 2', function (addresses) {

  const [owner] = addresses;
  const underwriters = addresses.slice(1, 6);
  const claimAssessors = addresses.slice(10, 15);
  const coverHolders = addresses.slice(15, 25);
  const members = addresses.slice(25, 35);

  const [
    underwriter1,
    underwriter2,
    underwriter3,
    underwriter4,
    underwriter5,
    underwriter6,
  ] = underwriters;

  const [
    claimAssessor1,
    claimAssessor2,
    claimAssessor3,
    claimAssessor4,
    claimAssessor5,
  ] = claimAssessors;

  const [
    coverHolder1,
    coverHolder2,
    coverHolder3,
    coverHolder4,
    coverHolder5,
    coverHolder6,
    coverHolder7,
    coverHolder8,
    coverHolder9,
  ] = coverHolders;

  const [
    member1,
    member2,
    member3,
    member4,
    member5,
    member6,
  ] = members;

  const UNLIMITED_ALLOWANCE = toBN('2').pow(toBN('256')).subn(1);

  const SC1 = '0xef68e7c694f40c8202821edf525de3782458639f';
  const SC2 = '0x39bb259f66e1c59d5abef88375979b4d20d98022';
  const SC3 = '0x618e75ac90b12c6049ba3b27f5d5f8651b0037f6';
  const SC4 = '0x40395044Ac3c0C57051906dA938B54BD6557F212';
  const SC5 = '0xee74110fb5a1007b06282e0de5d73a61bf41d9cd';

  let coverID;
  let claimID;
  let maxVotingTime;

  describe('claim test case', function () {

    const oneWeek = 604800; //  number of seconds in a week
    const oneWeekBN = toBN(oneWeek);

    const UWTokensBurned = []; // size will be same as that of UWArray
    const UWTotalBalanceBefore = [];
    const UWTotalBalanceAfter = [];

    let payoutReceived;
    let coverTokensUnlockable;
    let coverTokensBurned;

    it('18.0 Should setup stakers', async function () {

      await advanceBlock();

      tk = await NXMToken.deployed();
      tf = await TokenFunctions.deployed();
      p1 = await Pool1.deployed();
      p2 = await Pool2.deployed();
      pd = await PoolData.deployed();
      mcr = await MCR.deployed();
      dai = await DAI.deployed();
      qd = await QuotationDataMock.deployed();
      cr = await ClaimsReward.deployed();
      cl = await Claims.deployed();
      cd = await ClaimsData.deployed();
      td = await TokenData.deployed();
      DSV = await DSValue.deployed();
      qt = await Quotation.deployed();

      nxms = await NXMaster.at(await qd.ms());
      tc = await TokenController.at(await nxms.getLatestAddress(toHex('TC')));
      mr = await MemberRoles.at(await nxms.getLatestAddress(toHex('MR')));
      gv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
      ps = await PooledStaking.at(await nxms.getLatestAddress(toHex('PS')));

      await mr.addMembersBeforeLaunch([], []);
      (await mr.launched()).should.be.equal(true);

      await DSV.setRate(25);
      await pd.changeCurrencyAssetBaseMin(toHex('ETH'), toWei(30));
      await tf.upgradeCapitalPool(dai.address);
      await p1.sendEther({ from: owner, value: toWei(2500) });
      await pd.changeCurrencyAssetBaseMin(toHex('DAI'), toWei(750));
      await dai.transfer(p1.address, toWei(1250));

      await mcr.addMCRData(
        10000,
        0,
        toWei(6000), [toHex('ETH'), toHex('DAI')], [100, 2500],
        20190208
      );

      await tf.transferCurrencyAsset(toHex('ETH'), owner, toWei(2500 - 50));
      await p1.upgradeInvestmentPool(dai.address);
      await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: owner });

      const enrollMembers = [
        ...underwriters,
        ...claimAssessors,
        ...coverHolders,
        ...members,
      ]

      for (const member of enrollMembers) {
        await mr.payJoiningFee(member, { from: member, value: MEMBER_FEE });
        await mr.kycVerdict(member, true);
        await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member });
      }

      const accountsToFund = {
        underwriters: [190950, 160800, 150500, 180350, 170650],
        claimAssessors: [50000, 30000, 20000, 60000, 50000],
        coverHolders: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
        members: [30000, 20000, 10000, 20000, 30000, 150000],
      };

      for (const role of Object.keys(accountsToFund)) {
        // quick & dirty way fetch addresses by variable name
        const roleMembers = eval(role);

        for (let index = 0; index < accountsToFund[role].length; index++) {
          const member = roleMembers[index];
          const amount = accountsToFund[role][index];
          await tk.transfer(member, toWei(amount), { from: owner });
        }
      }

      const contracts = [SC1, SC2, SC3, SC4, SC5];
      const uwStakes = [
        { amounts: [2000, 9000, 9000, 70, 25], from: underwriter1 },
        { amounts: [3000, 9000, 8000, 60, 15], from: underwriter2 },
        { amounts: [4000, 6000, 9000, 40, 20], from: underwriter3 },
        { amounts: [5000, 7000, 5000, 30, 20], from: underwriter4 },
        { amounts: [6000, 9000, 9000, 50, 20], from: underwriter5 },
      ];

      for (const stake of uwStakes) {
        const stakes = stake.amounts.map(stake => ether(stake));
        const totalStake = stakes.reduce((a, b) => a.add(b), toBN(0));
        await ps.depositAndStake(totalStake, contracts, stakes, { from: stake.from });
      }

      { // set "A" parameter
        const actionHash = encode('updateUintParameters(bytes8,uint)', 'A', 10);
        await gvProposal(26, actionHash, mr, gv, 2);
        const { val: a } = await pd.getUintParameters(toHex('A'));
        assert.equal(a.toString(), '10');
      }

      { // set "C" parameter
        const actionHash = encode('updateUintParameters(bytes8,uint)', 'C', 400000);
        await gvProposal(26, actionHash, mr, gv, 2);
        const { val: c } = await pd.getUintParameters(toHex('C'));
        assert.equal(c.toString(), '400000');
      }
    });

    it('18.1 Should buy cover and collect rewards', async function () {

      const allCoverPremiums = [100, 100, 200, 200, 300, 300, 400, 400, 500];
      const allLockCNDetails = []; // here all lockCN values
      const underwritersBalances = [];

      for (let i = 0; i < underwriters.length; i++) {
        underwritersBalances[i] = await tk.balanceOf(underwriters[i]);
      }

      async function checkUWBalances(expectedBalanceChanges) {

        for (let i = 0; i < underwriters.length; i++) {

          const previousBalance = underwritersBalances[i];
          const expectedChange = ether(expectedBalanceChanges[i].toString());

          const expectedBalance = previousBalance.add(expectedChange);
          const actualBalance = await tk.balanceOf(underwriters[i]);
          assert.equal(actualBalance.toString(), expectedBalance.toString());

          underwritersBalances[i] = actualBalance;
        }
      }

      async function claimAllUWRewards() {
        await ps.processPendingActions('100');
        for (let i = 0; i < underwriters.length; i++) {
          await ps.withdrawReward(underwriters[i]);
        }
      }

      // buy cover 1
      let vrsdata = await getQuoteValues(
        [1, '6570841889000000', '100000000000000000000', '3549627424', '7972408607001'],
        toHex('ETH'), 100, SC1, qt.address,
      );

      await p1.makeCoverBegin(
        SC1,
        toHex('ETH'),
        [1, '6570841889000000', '100000000000000000000', '3549627424', '7972408607001'],
        100,
        ...vrsdata,
        { from: coverHolder5, value: '6570841889000000' },
      );

      let lockedCN = await tf.getLockedCNAgainstCover(1);
      allLockCNDetails.push(lockedCN);

      await claimAllUWRewards();
      await checkUWBalances([2, 3, 4, 5, 6]);

      // buy cover 2
      await dai.transfer(coverHolder3, '164271047228000000');
      await dai.approve(p1.address, '164271047228000000', { from: coverHolder3 });

      vrsdata = await getQuoteValues(
        [25, '164271047228000000', '100000000000000000000', '3549627424', '7972408607006'],
        toHex('DAI'),
        100,
        SC1,
        qt.address
      );
      await p1.makeCoverUsingCA(
        SC1,
        toHex('DAI'),
        [25, '164271047228000000', '100000000000000000000', '3549627424', '7972408607006'],
        100,
        ...vrsdata,
        { from: coverHolder3 }
      );

      lockedCN = await tf.getLockedCNAgainstCover(2);
      allLockCNDetails.push(lockedCN);

      await claimAllUWRewards();
      await checkUWBalances([2, 3, 4, 5, 6]);

      // buy cover 3
      vrsdata = await getQuoteValues(
        [
          2,
          '26283367556000000',
          '200000000000000000000',
          '3549627424',
          '7972408607002'
        ],
        toHex('ETH'),
        200,
        SC2,
        qt.address
      );
      await p1.makeCoverBegin(
        SC2,
        toHex('ETH'), [
          2,
          '26283367556000000',
          '200000000000000000000',
          '3549627424',
          '7972408607002'
        ],
        200,
        ...vrsdata,
        { from: coverHolder1, value: '26283367556000000' }
      );
      lockedCN = await tf.getLockedCNAgainstCover(3);
      allLockCNDetails.push(lockedCN);

      await claimAllUWRewards();
      await checkUWBalances([9, 9, 6, 7, 9]);

      // buy cover 4
      await dai.transfer(coverHolder2, '657084188912000000');
      await dai.approve(p1.address, '657084188912000000', { from: coverHolder2 });

      vrsdata = await getQuoteValues(
        [
          50,
          '657084188912000000',
          '200000000000000000000',
          '3549627424',
          '7972408607007'
        ],
        toHex('DAI'),
        200,
        SC2,
        qt.address
      );
      await p1.makeCoverUsingCA(
        SC2,
        toHex('DAI'), [
          50,
          '657084188912000000',
          '200000000000000000000',
          '3549627424',
          '7972408607007'
        ],
        200,
        ...vrsdata,
        { from: coverHolder2 }
      );
      lockedCN = await tf.getLockedCNAgainstCover(4);
      allLockCNDetails.push(lockedCN);

      await claimAllUWRewards();
      await checkUWBalances([9, 9, 6, 7, 9]);

      // buy cover 5
      vrsdata = await getQuoteValues(
        [
          3,
          '59137577002000000',
          '300000000000000000000',
          '3549627424',
          '7972408607003'
        ],
        toHex('ETH'),
        300,
        SC3,
        qt.address
      );
      await p1.makeCoverBegin(
        SC3,
        toHex('ETH'), [
          3,
          '59137577002000000',
          '300000000000000000000',
          '3549627424',
          '7972408607003'
        ],
        300,
        ...vrsdata,
        { from: coverHolder4, value: '59137577002000000' }
      );

      lockedCN = await tf.getLockedCNAgainstCover(5);
      allLockCNDetails.push(lockedCN);

      await claimAllUWRewards();
      await checkUWBalances([9, 8, 9, 5, 9].map(n => n * 300 / 5 / 40));

      // buy cover 6
      await dai.transfer(coverHolder6, '1478439425051000000');
      await dai.approve(p1.address, '1478439425051000000', { from: coverHolder6 });
      vrsdata = await getQuoteValues(
        [
          75,
          '1478439425051000000',
          '300000000000000000000',
          '3549627424',
          '7972408607008'
        ],
        toHex('DAI'),
        300,
        SC3,
        qt.address
      );
      await p1.makeCoverUsingCA(
        SC3,
        toHex('DAI'), [
          75,
          '1478439425051000000',
          '300000000000000000000',
          '3549627424',
          '7972408607008'
        ],
        300,
        ...vrsdata,
        { from: coverHolder6 }
      );
      lockedCN = await tf.getLockedCNAgainstCover(6);
      allLockCNDetails.push(lockedCN);

      await claimAllUWRewards();
      await checkUWBalances([9, 8, 9, 5, 9].map(n => n * 300 / 5 / 40));

      // buy cover 7
      vrsdata = await getQuoteValues(
        [
          4,
          '105133470226000000',
          '400000000000000000000',
          '3549627424',
          '7972408607004'
        ],
        toHex('ETH'),
        400,
        SC4,
        qt.address
      );
      await p1.makeCoverBegin(
        SC4,
        toHex('ETH'), [
          4,
          '105133470226000000',
          '400000000000000000000',
          '3549627424',
          '7972408607004'
        ],
        400,
        ...vrsdata,
        { from: coverHolder7, value: '105133470226000000' }
      );

      lockedCN = await tf.getLockedCNAgainstCover(7);
      allLockCNDetails.push(lockedCN);

      await claimAllUWRewards();
      await checkUWBalances([70, 60, 40, 30, 50].map(n => n * 400 / 5 / 250));

      // buy cover 8
      await dai.transfer(coverHolder8, '2628336755647000000');
      await dai.approve(p1.address, '2628336755647000000', { from: coverHolder8 });
      vrsdata = await getQuoteValues(
        [
          100,
          '2628336755647000000',
          '400000000000000000000',
          '3549627424',
          '7972408607009'
        ],
        toHex('DAI'),
        400,
        SC4,
        qt.address
      );
      await p1.makeCoverUsingCA(
        SC4,
        toHex('DAI'), [
          100,
          '2628336755647000000',
          '400000000000000000000',
          '3549627424',
          '7972408607009'
        ],
        400,
        ...vrsdata,
        { from: coverHolder8 }
      );

      lockedCN = await tf.getLockedCNAgainstCover(8);
      allLockCNDetails.push(lockedCN);

      await claimAllUWRewards();
      await checkUWBalances([70, 60, 40, 30, 50].map(n => n * 400 / 5 / 250));

      // buy cover 9
      vrsdata = await getQuoteValues(
        [
          5,
          '164271047228000000',
          '500000000000000000000',
          '3549627424',
          '7972408607005'
        ],
        toHex('ETH'),
        500,
        SC5,
        qt.address
      );
      await p1.makeCoverBegin(
        SC5,
        toHex('ETH'), [
          5,
          '164271047228000000',
          '500000000000000000000',
          '3549627424',
          '7972408607005'
        ],
        500,
        ...vrsdata,
        { from: coverHolder9, value: '164271047228000000' }
      );
      lockedCN = await tf.getLockedCNAgainstCover(9);
      allLockCNDetails.push(lockedCN);

      await claimAllUWRewards();
      await checkUWBalances([25, 15, 20, 20, 20]);

      await tf.upgradeCapitalPool(dai.address);
      await p1.sendEther({ from: owner, value: toWei(50) });
      await dai.transfer(p1.address, toWei(1250));

      for (let i = 0; i < underwriters.length; i++) {
        const expectedLockCN = ether(allCoverPremiums[i]).divn(10);
        const actualLockCN = toBN(allLockCNDetails[i]);
        assert(expectedLockCN.eq(actualLockCN));
      }
    });

    it('18.4 should pass for CA vote > 10 SA and majority > 70 % for reject(D1)', async function () {

      const claimAssessor1Data = {};
      const claimAssessor2Data = {};
      const claimAssessor3Data = {};

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceBefore[i] = await tc.totalBalanceOf(underwriters[i]);
      }

      await tc.lock(CLA, toWei(50000), validity, { from: claimAssessor1 });
      await tc.lock(CLA, toWei(30000), validity, { from: claimAssessor2 });
      await tc.lock(CLA, toWei(20000), validity, { from: claimAssessor3 });

      // cannot withdraw/switch membership as it has staked tokens
      await assertRevert(mr.withdrawMembership({ from: claimAssessor1 }));
      await assertRevert(mr.switchMembership(tc.address, { from: claimAssessor1 }));

      // try submitting an invalid cover ID
      coverID = await qd.getAllCoversOfUser(coverHolder5);
      await assertRevert(tf.depositCN(46, { from: owner }));

      await cl.submitClaim(coverID[0], { from: coverHolder5 });
      APIID = await pd.allAPIcall((await pd.getApilCallLength()).subn(1));

      // try submitting the same claim again (to pass the TokenData.sol setDepositCN's require condition of the coverage report)
      // await assertRevert(cl.submitClaim(coverID[0], { from: coverHolder5 }));
      await assertRevert(td.setDepositCN(coverID[0], true, { from: owner }));

      const now = toBN(await latestTime());
      const claimID = (await cd.actualClaimLength()).subn(1);

      claimAssessor1Data.initialDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.initialDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.initialDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);

      // tries to burn CA votes, but reverts as not auth to governed
      await assertRevert(tf.burnCAToken(claimID, 10, claimAssessor1));

      await cl.submitCAVote(claimID, -1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor3 });

      claimAssessor1Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);

      minVotingTime = await cd.minVotingTime();
      closingTime = minVotingTime.add(now);

      await increaseTimeTo(closingTime.sub(toBN(10)));
      await p1.__callback(APIID, '');

      assert.equal((await cd.getClaimStatusNumber(claimID))[1].toString(), '0');

      // check the CA vote not closing before the minimum time is reached even if the CA Vote is greater than 10*SA
      await increaseTimeTo(closingTime.add(toBN(10)));

      const tokenBalanceBefore = await tk.balanceOf(coverHolder5);
      const totalBalanceBefore = await tc.totalBalanceOf(coverHolder5);
      const balanceBefore = await web3.eth.getBalance(coverHolder5);

      // changing the claim status here
      await nxms.closeClaim(await pd.getIdOfApiId(APIID));
      assert.equal(await ps.hasPendingActions(), false, 'should not have pending actions');

      const balanceAfter = await web3.eth.getBalance(coverHolder5);
      const tokenBalanceAfter = await tk.balanceOf(coverHolder5);
      const totalBalanceAfter = await tc.totalBalanceOf(coverHolder5);

      payoutReceived = (balanceAfter - balanceBefore) / toWei(1);
      coverTokensUnlockable = (tokenBalanceBefore - tokenBalanceAfter) / toWei(1);
      coverTokensBurned = Number(((totalBalanceBefore - totalBalanceAfter) / toWei(1)).toFixed(2));

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceAfter[i] = await tc.totalBalanceOf(underwriters[i]);
      }

      claimAssessor1Data.rewardReceived = (await cr.getRewardToBeDistributedByUser(claimAssessor1)) / toWei(1);
      claimAssessor2Data.rewardReceived = (await cr.getRewardToBeDistributedByUser(claimAssessor2)) / toWei(1);
      claimAssessor3Data.rewardReceived = (await cr.getRewardToBeDistributedByUser(claimAssessor3)) / toWei(1);

      await cr.claimAllPendingReward(20, { from: claimAssessor1 });
      await cr.claimAllPendingReward(20, { from: claimAssessor2 });
      await cr.claimAllPendingReward(20, { from: claimAssessor3 });

      claimAssessor1Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor3, CLA);

      const UWTokensLocked = [];
      for (let i = 0; i < underwriters.length; i++) {
        UWTokensLocked.push(await ps.stakerContractStake(underwriters[i], SC1));
        UWTokensBurned[i] = UWTotalBalanceBefore[i].sub(UWTotalBalanceAfter[i]);
      }

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.initialDate).eq(oneWeekBN));

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.lockPeriodAfterRewardReceived).eq(toBN('0')));

      assert.equal(claimAssessor1Data.rewardReceived, 12.5);
      assert.equal(claimAssessor2Data.rewardReceived, 7.5);
      assert.equal(claimAssessor3Data.rewardReceived, 0);

      assert.equal(payoutReceived, 0);
      assert.equal(coverTokensUnlockable, 0);
      assert.equal(coverTokensBurned, 5.0);

      const UWTokensLockedExpected = [2000, 3000, 4000, 5000, 6000].map(n => ether(n));
      const UWTokensBurnedExpected = [0, 0, 0, 0, 0].map(n => ether(n));

      for (let i = 0; i < underwriters.length; i++) {
        assert(UWTokensLockedExpected[i].eq(UWTokensLocked[i]));
        assert(UWTokensBurnedExpected[i].eq(UWTokensBurned[i]));
      }
    });

    it('18.5 should pass for CA vote > 10 SA and majority > 70 % for accept(A1)', async function () {

      const claimAssessor1Data = {};
      const claimAssessor2Data = {};
      const claimAssessor3Data = {};

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceBefore[i] = (await tc.totalBalanceOf(underwriters[i])) / toWei(1);
      }

      const coverID = await qd.getAllCoversOfUser(coverHolder5);
      await cl.submitClaim(coverID[0], { from: coverHolder5 });

      const APIID = await pd.allAPIcall((await pd.getApilCallLength()).subn(1));
      const claimID = (await cd.actualClaimLength()).subn(1);

      claimAssessor1Data.initialDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.initialDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.initialDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);

      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor3 });

      claimAssessor1Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);

      const maxVotingTime = await cd.maxVotingTime();
      const closingTime = maxVotingTime.add(toBN(await latestTime()));
      await increaseTimeTo(closingTime.addn(2));

      const tokenBalanceBefore = await tk.balanceOf(coverHolder5);
      const balanceBefore = await web3.eth.getBalance(coverHolder5);
      const totalBalanceBefore = await tc.totalBalanceOf(coverHolder5);

      // changing the claim status here
      await p1.__callback(APIID, '');
      assert(await ps.hasPendingActions(), 'should have pending actions');
      await ps.processPendingActions('100');

      const UWStake = [];

      for (let i = 0; i < underwriters.length; i++) {
        UWStake.push(await ps.stakerContractStake(underwriters[i], SC1));
      }

      let balanceAfter = await web3.eth.getBalance(coverHolder5);
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder5));
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder5));

      coverTokensBurned = Number(
        ((totalBalanceBefore - totalBalanceAfter) / toWei(1)).toFixed(2),
      );
      payoutReceived = Number(
        ((balanceAfter - balanceBefore) / toWei(1)).toFixed(2),
      );
      coverTokensUnlockable = Number(
        ((tokenBalanceAfter - tokenBalanceBefore) / toWei(1)).toFixed(2),
      );

      claimAssessor1Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);

      await cr.claimAllPendingReward(20, { from: claimAssessor1 });
      await cr.claimAllPendingReward(20, { from: claimAssessor2 });
      await cr.claimAllPendingReward(20, { from: claimAssessor3 });

      claimAssessor1Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA),
      );
      claimAssessor2Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA),
      );
      claimAssessor3Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA),
      );

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underwriters[i])) / toWei(1);
      }

      for (let i = 0; i < underwriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i],
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Data.newLockDate - claimAssessor1Data.initialDate,
        oneWeek,
      );
      assert.equal(
        claimAssessor2Data.newLockDate - claimAssessor2Data.initialDate,
        oneWeek,
      );
      assert.equal(
        claimAssessor3Data.newLockDate - claimAssessor3Data.initialDate,
        oneWeek,
      );

      assert.equal(
        claimAssessor1Data.newLockDate - claimAssessor1Data.lockPeriodAfterRewardReceived,
        oneWeek,
      );
      assert.equal(
        claimAssessor2Data.newLockDate - claimAssessor2Data.lockPeriodAfterRewardReceived,
        oneWeek,
      );
      assert.equal(
        claimAssessor3Data.newLockDate - claimAssessor3Data.lockPeriodAfterRewardReceived,
        0,
      );

      assert.equal(claimAssessor1Data.rewardReceived, 12.5);
      assert.equal(claimAssessor2Data.rewardReceived, 7.5);
      assert.equal(claimAssessor3Data.rewardReceived, 0);

      assert.equal(payoutReceived, 1);
      assert.equal(coverTokensUnlockable, 5);
      assert.equal(coverTokensBurned, 0);

      let UWStakeExpected = [2000, 3000, 4000, 5000, 6000].map(n => n / 2);
      let UWTokensBurnedExpected = [2000, 3000, 4000, 5000, 6000].map(n => n / 2);

      for (let i = 0; i < underwriters.length; i++) {
        assert.equal(toBN(UWStakeExpected[i]).mul(ether(1)).toString(), UWStake[i].toString());
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }
    });

    it('18.6 should pass for CA vote > 10 SA and majority < 70%, open for member vote and majority reject(D3)', async function () {

      const claimAssessor1Data = {};
      const claimAssessor2Data = {};
      const claimAssessor3Data = {};
      const member1Data = {};
      const member2Data = {};
      const member3Data = {};

      const UWTotalBalanceBefore = [];
      const UWTokensLocked = [];

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceBefore[i] = await tc.totalBalanceOf(underwriters[i]);
        UWTokensLocked[i] = await ps.stakerContractStake(underwriters[i], SC1);
      }

      const coverID = await qd.getAllCoversOfUser(coverHolder3);
      await cl.submitClaim(coverID[0], { from: coverHolder3 });
      const claimID = (await cd.actualClaimLength()).subn(1);

      claimAssessor1Data.initialDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.initialDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.initialDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);

      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor3 });

      claimAssessor1Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);

      let maxVotingTime = await cd.maxVotingTime();
      let closingTime = maxVotingTime.add(toBN(await latestTime()));
      await increaseTimeTo(closingTime.addn(2));

      let tokenBalanceBefore = await tk.balanceOf(coverHolder3);
      let balanceBefore = await dai.balanceOf(coverHolder3);
      let totalBalanceBefore = await tc.totalBalanceOf(coverHolder3);

      APIID = await pd.allAPIcall((await pd.getApilCallLength()).subn(1));
      await p1.__callback(APIID, '');

      claimAssessor1Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor1);
      claimAssessor2Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor2);
      claimAssessor3Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor3);

      // now member voting started
      await cl.submitMemberVote(claimID, -1, { from: member1 });
      await cl.submitMemberVote(claimID, -1, { from: member2 });
      await cl.submitMemberVote(claimID, 1, { from: member3 });

      // cannot withdraw/switch membership as member has voted
      await assertRevert(mr.withdrawMembership({ from: member1 }));
      await assertRevert(mr.switchMembership(tc.address, { from: member1 }));

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      closingTime = maxVotingTime.add(toBN(await latestTime()));
      await increaseTimeTo(closingTime.add(toBN(2)));

      // now member voting will be closed
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await p1.__callback(APIID, '');
      assert.equal(await ps.hasPendingActions(), false, 'should not have pending actions');

      await cr.claimAllPendingReward(20, { from: claimAssessor1 });
      await cr.claimAllPendingReward(20, { from: claimAssessor2 });
      await cr.claimAllPendingReward(20, { from: claimAssessor3 });

      claimAssessor1Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor3, CLA);

      member1Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member1);
      member2Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member2);
      member3Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member3);

      await cr.claimAllPendingReward(20, { from: member1 });
      await cr.claimAllPendingReward(20, { from: member2 });
      await cr.claimAllPendingReward(20, { from: member3 });

      const balanceAfter = await dai.balanceOf(coverHolder3);
      const tokenBalanceAfter = await tk.balanceOf(coverHolder3);
      const totalBalanceAfter = await tc.totalBalanceOf(coverHolder3);

      coverTokensBurned = totalBalanceBefore.sub(totalBalanceAfter);
      payoutReceived = balanceAfter.sub(balanceBefore);
      coverTokensUnlockable = tokenBalanceAfter.sub(tokenBalanceBefore);

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceAfter[i] = await tc.totalBalanceOf(underwriters[i]);
        UWTokensBurned[i] = UWTotalBalanceBefore[i].sub(UWTotalBalanceAfter[i]);
      }

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.initialDate).eq(oneWeekBN));

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));

      assert.equal(claimAssessor1Data.rewardReceived.toString(), '0');
      assert.equal(claimAssessor2Data.rewardReceived.toString(), '0');
      assert.equal(claimAssessor3Data.rewardReceived.toString(), '0');

      assert(member1Data.rewardReceived.eq(ether(12)));
      assert(member2Data.rewardReceived.eq(ether(8)));
      assert(member3Data.rewardReceived.eq(ether(0)));

      assert(payoutReceived.eqn(0));
      assert(coverTokensUnlockable.eqn(0));
      assert(coverTokensBurned.eq(ether(5)));

      const UWTokensLockedExpected = [2000, 3000, 4000, 5000, 6000].map(n => ether(n/2));
      const UWTokensBurnedExpected = [0, 0, 0, 0, 0].map(n => toBN(n));

      for (let i = 0; i < underwriters.length; i++) {
        assert(UWTokensLockedExpected[i].eq(UWTokensLocked[i]));
        assert(UWTokensBurnedExpected[i].eq(UWTokensBurned[i]));
      }
    });

    it('18.7 should pass for CA vote > 10 SA and majority < 70%, open for member vote and majority accept(A3)', async function () {

      const claimAssessor1Data = {};
      const claimAssessor2Data = {};
      const claimAssessor3Data = {};
      const member1Data = {};
      const member2Data = {};
      const member3Data = {};

      const UWTotalBalanceBefore = [];
      const UWTokensLocked = [];

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceBefore[i] = await tc.totalBalanceOf(underwriters[i]);
        UWTokensLocked[i] = await ps.stakerContractStake(underwriters[i], SC1);
      }

      const coverID = await qd.getAllCoversOfUser(coverHolder3);
      await cl.submitClaim(coverID[0], { from: coverHolder3 });
      const claimID = (await cd.actualClaimLength()).subn(1);
      let APIID = await pd.allAPIcall((await pd.getApilCallLength()).subn(1));

      claimAssessor1Data.initialDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.initialDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.initialDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);

      await cl.submitCAVote(claimID, -1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor3 });

      claimAssessor1Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);

      let maxVotingTime = await cd.maxVotingTime();
      let closingTime = maxVotingTime.add(toBN(await latestTime()));
      await increaseTimeTo(closingTime.addn(2));

      const tokenBalanceBefore = await tk.balanceOf(coverHolder3);
      const balanceBefore = await dai.balanceOf(coverHolder3);
      const totalBalanceBefore = await tc.totalBalanceOf(coverHolder3);

      // changing the claim status here, vote is not conclusive
      await p1.__callback(APIID, '');
      assert(!(await ps.hasPendingActions()), 'should not have pending actions');

      claimAssessor1Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor1);
      claimAssessor2Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor2);
      claimAssessor3Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor3);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });
      await cl.submitMemberVote(claimID, -1, { from: member3 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      closingTime = maxVotingTime.add(toBN(await latestTime()));
      await increaseTimeTo(closingTime.addn(2));

      // now member voting will be closed
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await p1.__callback(APIID, '');
      assert((await ps.hasPendingActions()), 'should have pending actions');
      await ps.processPendingActions('100');

      await cr.claimAllPendingReward(20, { from: claimAssessor1 });
      await cr.claimAllPendingReward(20, { from: claimAssessor2 });
      await cr.claimAllPendingReward(20, { from: claimAssessor3 });

      claimAssessor1Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor3, CLA);

      member1Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member1);
      member2Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member2);
      member3Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member3);

      await cr.claimAllPendingReward(20, { from: member1 });
      await cr.claimAllPendingReward(20, { from: member2 });
      await cr.claimAllPendingReward(20, { from: member3 });

      const balanceAfter = await dai.balanceOf(coverHolder3);
      const tokenBalanceAfter = await tk.balanceOf(coverHolder3);
      const totalBalanceAfter = await tc.totalBalanceOf(coverHolder3);

      const coverTokensBurned = totalBalanceBefore.sub(totalBalanceAfter);
      const payoutReceived = balanceAfter.sub(balanceBefore);
      const coverTokensUnlockable = tokenBalanceAfter.sub(tokenBalanceBefore);

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceAfter[i] = await tc.totalBalanceOf(underwriters[i]);
        UWTokensBurned[i] = UWTotalBalanceBefore[i].sub(UWTotalBalanceAfter[i]);
      }

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.initialDate).eq(oneWeekBN));

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));

      assert(claimAssessor1Data.rewardReceived.eqn(0));
      assert(claimAssessor2Data.rewardReceived.eqn(0));
      assert(claimAssessor3Data.rewardReceived.eqn(0));

      assert(member1Data.rewardReceived.eq(ether(12)));
      assert(member2Data.rewardReceived.eq(ether(8)));
      assert(member3Data.rewardReceived.eq(ether(0)));

      assert(payoutReceived.eq(ether(25)));
      assert(coverTokensUnlockable.eq(ether(5)));
      assert(coverTokensBurned.eq(ether(0)));

      const UWTokensLockedExpected = [2000, 3000, 4000, 5000, 6000].map(n => ether(n/2));
      const UWTokensBurnedExpected = [2000, 3000, 4000, 5000, 6000].map(n => ether(n/2));

      for (let i = 0; i < underwriters.length; i++) {
        assert(UWTokensLockedExpected[i].eq(UWTokensLocked[i]));
        assert(UWTokensBurnedExpected[i].eq(UWTokensBurned[i]));
      }
    });

    it('18.8 should pass for CA vote > 10 SA and majority < 70%, open for member vote and MV<5 SA and CA majority reject(D4)', async function () {

      let claimAssessor1Data = {};
      let claimAssessor2Data = {};
      let claimAssessor3Data = {};
      let claimAssessor4Data = {};
      let claimAssessor5Data = {};
      let member1Data = {};
      let member2Data = {};
      let member3Data = {};

      await tc.lock(CLA, toWei(60000), validity, { from: claimAssessor4 });
      await tc.lock(CLA, toWei(50000), validity, { from: claimAssessor5 });

      const UWTotalBalanceBefore = [];
      const UWTokensLocked = [];

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceBefore[i] = await tc.totalBalanceOf(underwriters[i]);
        UWTokensLocked[i] = await ps.stakerContractStake(underwriters[i], SC2);
      }

      const coverID = await qd.getAllCoversOfUser(coverHolder1);
      await cl.submitClaim(coverID[0], { from: coverHolder1 });
      const claimID = (await cd.actualClaimLength()).subn(1);

      claimAssessor1Data.initialDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.initialDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.initialDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.initialDate = await tc.getLockedTokensValidity(claimAssessor4, CLA);
      claimAssessor5Data.initialDate = await tc.getLockedTokensValidity(claimAssessor5, CLA);

      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor3 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor4 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor5 });

      claimAssessor1Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor4, CLA);
      claimAssessor5Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor5, CLA);

      let maxVotingTime = await cd.maxVotingTime();
      let now = await latestTime();
      let closingTime = maxVotingTime.add(toBN(now));
      await increaseTimeTo(closingTime.addn(2));

      const tokenBalanceBefore = await tk.balanceOf(coverHolder1);
      const balanceBefore = toBN((await web3.eth.getBalance(coverHolder1)).toString());
      const totalBalanceBefore = await tc.totalBalanceOf(coverHolder1);

      // // changing the claim status here
      let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await p1.__callback(APIID, '');
      assert.equal(await ps.hasPendingActions(), false, 'should not have pending actions');

      claimAssessor1Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor1);
      claimAssessor2Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor2);
      claimAssessor3Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor3);
      claimAssessor4Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor4);
      claimAssessor5Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor5);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });
      await cl.submitMemberVote(claimID, 1, { from: member3 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = maxVotingTime.add(toBN(now));
      await increaseTimeTo(closingTime.addn(2));

      // now member voting will be closed
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await p1.__callback(APIID, '');
      assert.equal(await ps.hasPendingActions(), false, 'should not have pending actions');

      await cr.claimAllPendingReward(20, { from: claimAssessor1 });
      await cr.claimAllPendingReward(20, { from: claimAssessor2 });
      await cr.claimAllPendingReward(20, { from: claimAssessor3 });
      await cr.claimAllPendingReward(20, { from: claimAssessor4 });
      await cr.claimAllPendingReward(20, { from: claimAssessor5 });

      claimAssessor1Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor4, CLA);
      claimAssessor5Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor5, CLA);

      member1Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member1);
      member2Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member2);
      member3Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member3);

      await cr.claimAllPendingReward(20, { from: member1 });
      await cr.claimAllPendingReward(20, { from: member2 });
      await cr.claimAllPendingReward(20, { from: member3 });

      const balanceAfter = toBN((await web3.eth.getBalance(coverHolder1)).toString());
      const tokenBalanceAfter = await tk.balanceOf(coverHolder1);
      const totalBalanceAfter = await tc.totalBalanceOf(coverHolder1);

      const coverTokensBurned = totalBalanceBefore.sub(totalBalanceAfter);
      const payoutReceived = balanceAfter.sub(balanceBefore);
      const coverTokensUnlockable = tokenBalanceAfter.sub(tokenBalanceBefore);

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceAfter[i] = await tc.totalBalanceOf(underwriters[i]);
        UWTokensBurned[i] = UWTotalBalanceBefore[i].sub(UWTotalBalanceAfter[i]);
      }

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor4Data.newLockDate.sub(claimAssessor4Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor5Data.newLockDate.sub(claimAssessor5Data.initialDate).eq(oneWeekBN));

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor4Data.newLockDate.sub(claimAssessor4Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor5Data.newLockDate.sub(claimAssessor5Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));

      assert(claimAssessor1Data.rewardReceived.eqn(0));
      assert(claimAssessor2Data.rewardReceived.eqn(0));
      assert(claimAssessor3Data.rewardReceived.eqn(0));
      assert(claimAssessor4Data.rewardReceived.eqn(0));
      assert(claimAssessor5Data.rewardReceived.eqn(0));

      assert(member1Data.rewardReceived.eqn(0));
      assert(member2Data.rewardReceived.eqn(0));
      assert(member3Data.rewardReceived.eqn(0));

      assert(payoutReceived.eqn(0));
      assert(coverTokensUnlockable.eqn(0));
      assert(coverTokensBurned.eq(ether(10)));

      const UWTokensLockedExpected = [9000, 9000, 6000, 7000, 9000].map(n => ether(n));
      const UWTokensBurnedExpected = [0, 0, 0, 0, 0].map(n => ether(n));

      for (let i = 0; i < underwriters.length; i++) {
        assert(UWTokensLockedExpected[i].eq(UWTokensLocked[i]));
        assert(UWTokensBurnedExpected[i].eq(UWTokensBurned[i]));
      }
    });

    it('18.9 should pass for CA vote > 10 SA and majority < 70%, open for member vote and MV<5 SA and CA majority accept(A4)', async function () {

      const claimAssessor1Data = {};
      const claimAssessor2Data = {};
      const claimAssessor3Data = {};
      const claimAssessor4Data = {};
      const claimAssessor5Data = {};
      const member1Data = {};
      const member2Data = {};
      const member3Data = {};

      const UWTokensLocked = [];
      const UWTotalBalanceBefore = [];

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceBefore[i] = await tc.totalBalanceOf(underwriters[i]);
        UWTokensLocked[i] = await ps.stakerContractStake(underwriters[i], SC2);
      }

      const coverID = await qd.getAllCoversOfUser(coverHolder1);
      await cl.submitClaim(coverID[0], { from: coverHolder1 });
      const claimID = (await cd.actualClaimLength()).subn(1);
      let APIID = await pd.allAPIcall((await pd.getApilCallLength()).subn(1));

      claimAssessor1Data.initialDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.initialDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.initialDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.initialDate = await tc.getLockedTokensValidity(claimAssessor4, CLA);
      claimAssessor5Data.initialDate = await tc.getLockedTokensValidity(claimAssessor5, CLA);

      await cl.submitCAVote(claimID, -1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor3 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor4 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor5 });

      claimAssessor1Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor4, CLA);
      claimAssessor5Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor5, CLA);

      let maxVotingTime = await cd.maxVotingTime();
      let now = await latestTime();
      let closingTime = maxVotingTime.add(toBN(now));
      await increaseTimeTo(closingTime.addn(2));

      const totalBalanceBefore = await tc.totalBalanceOf(coverHolder1);
      const tokenBalanceBefore = await tk.balanceOf(coverHolder1);
      const balanceBefore = toBN((await web3.eth.getBalance(coverHolder1)).toString());

      // changing the claim status here
      await p1.__callback(APIID, '');
      assert(!(await ps.hasPendingActions()), 'should not have pending actions');

      claimAssessor1Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor1);
      claimAssessor2Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor2);
      claimAssessor3Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor3);
      claimAssessor4Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor4);
      claimAssessor5Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor5);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });
      await cl.submitMemberVote(claimID, 1, { from: member3 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = maxVotingTime.add(toBN(now));
      await increaseTimeTo(closingTime.addn(2));

      // now member voting will be closed
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await p1.__callback(APIID, '');
      assert(await ps.hasPendingActions(), 'should have pending actions');
      await ps.processPendingActions('100');

      await cr.claimAllPendingReward(20, { from: claimAssessor1 });
      await cr.claimAllPendingReward(20, { from: claimAssessor2 });
      await cr.claimAllPendingReward(20, { from: claimAssessor3 });
      await cr.claimAllPendingReward(20, { from: claimAssessor4 });
      await cr.claimAllPendingReward(20, { from: claimAssessor5 });

      claimAssessor1Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor4, CLA);
      claimAssessor5Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor5, CLA);

      member1Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member1);
      member2Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member2);
      member3Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member3);

      await cr.claimAllPendingReward(20, { from: member1 });
      await cr.claimAllPendingReward(20, { from: member2 });
      await cr.claimAllPendingReward(20, { from: member3 });

      const balanceAfter = toBN((await web3.eth.getBalance(coverHolder1)).toString());
      const tokenBalanceAfter = await tk.balanceOf(coverHolder1);
      const totalBalanceAfter = await tc.totalBalanceOf(coverHolder1);

      const payoutReceived = balanceAfter.sub(balanceBefore);
      const coverTokensUnlockable = tokenBalanceAfter.sub(tokenBalanceBefore);
      const coverTokensBurned = totalBalanceBefore.sub(totalBalanceAfter);

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceAfter[i] = await tc.totalBalanceOf(underwriters[i]);
        UWTokensBurned[i] = UWTotalBalanceBefore[i].sub(UWTotalBalanceAfter[i]);
      }

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor4Data.newLockDate.sub(claimAssessor4Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor5Data.newLockDate.sub(claimAssessor5Data.initialDate).eq(oneWeekBN));

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor4Data.newLockDate.sub(claimAssessor4Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor5Data.newLockDate.sub(claimAssessor5Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));

      assert(claimAssessor1Data.rewardReceived.eqn(0));
      assert(claimAssessor2Data.rewardReceived.eqn(0));
      assert(claimAssessor3Data.rewardReceived.eqn(0));
      assert(claimAssessor4Data.rewardReceived.eqn(0));
      assert(claimAssessor5Data.rewardReceived.eqn(0));

      assert(member1Data.rewardReceived.eqn(0));
      assert(member2Data.rewardReceived.eqn(0));
      assert(member3Data.rewardReceived.eqn(0));

      assert(payoutReceived.eq(ether(2)));
      assert(coverTokensUnlockable.eq(ether(10)));
      assert(coverTokensBurned.eqn(0));

      const UWTokensLockedExpected = [9000, 9000, 6000, 7000, 9000].map(n => ether(n));
      const UWTokensBurnedExpected = [9000, 9000, 6000, 7000, 9000].map(n => ether(n / 2));

      for (let i = 0; i < underwriters.length; i++) {
        assert(UWTokensLockedExpected[i].eq(UWTokensLocked[i]));
        assert(UWTokensBurnedExpected[i].eq(UWTokensBurned[i]));
      }
    });

    it('18.10 should pass for CA vote > 5SA and <10 SA and majority < 70%, open for member vote and majority reject(D3)', async function () {

      const claimAssessor1Data = {};
      const claimAssessor2Data = {};
      const claimAssessor3Data = {};
      const claimAssessor4Data = {};
      const member1Data = {};
      const member2Data = {};
      const member3Data = {};
      const member4Data = {};
      const member5Data = {};

      const UWTokensLocked = [];
      const UWTotalBalanceBefore = [];

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceBefore[i] = await tc.totalBalanceOf(underwriters[i]);
        UWTokensLocked[i] = await ps.stakerContractStake(underwriters[i], SC2);
      }

      const coverID = await qd.getAllCoversOfUser(coverHolder2);
      await cl.submitClaim(coverID[0], { from: coverHolder2 });
      const claimID = (await cd.actualClaimLength()).subn(1);

      claimAssessor1Data.initialDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.initialDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.initialDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.initialDate = await tc.getLockedTokensValidity(claimAssessor4, CLA);

      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor3 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor4 });

      claimAssessor1Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor4, CLA);

      let maxVotingTime = await cd.maxVotingTime();
      let now = await latestTime();
      let closingTime = maxVotingTime.add(toBN(now));
      await increaseTimeTo(closingTime.addn(2));

      const tokenBalanceBefore = await tk.balanceOf(coverHolder2);
      const balanceBefore = await dai.balanceOf(coverHolder2);
      const totalBalanceBefore = await tc.totalBalanceOf(coverHolder2);

      // // changing the claim status here
      APIID = await pd.allAPIcall((await pd.getApilCallLength()).subn(1));
      await p1.__callback(APIID, '');
      assert(!(await ps.hasPendingActions()), 'should not have pending actions');

      claimAssessor1Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor1);
      claimAssessor2Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor2);
      claimAssessor3Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor3);
      claimAssessor4Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor4);

      // now member voting started
      await cl.submitMemberVote(claimID, -1, { from: member1 });
      await cl.submitMemberVote(claimID, -1, { from: member2 });
      await cl.submitMemberVote(claimID, -1, { from: member3 });
      await cl.submitMemberVote(claimID, -1, { from: member4 });
      await cl.submitMemberVote(claimID, 1, { from: member5 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = maxVotingTime.add(toBN(now));
      await increaseTimeTo(closingTime.addn(2));

      // now member voting will be closed
      APIID = await pd.allAPIcall((await pd.getApilCallLength()).subn(1));
      await p1.__callback(APIID, '');
      assert(!(await ps.hasPendingActions()), 'should not have pending actions');

      await cr.claimAllPendingReward(20, { from: claimAssessor1 });
      await cr.claimAllPendingReward(20, { from: claimAssessor2 });
      await cr.claimAllPendingReward(20, { from: claimAssessor3 });
      await cr.claimAllPendingReward(20, { from: claimAssessor4 });

      claimAssessor1Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor4, CLA);

      member1Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member1);
      member2Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member2);
      member3Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member3);
      member4Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member4);
      member5Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member5);

      await cr.claimAllPendingReward(20, { from: member1 });
      await cr.claimAllPendingReward(20, { from: member2 });
      await cr.claimAllPendingReward(20, { from: member3 });
      await cr.claimAllPendingReward(20, { from: member4 });
      await cr.claimAllPendingReward(20, { from: member5 });

      const balanceAfter = await dai.balanceOf(coverHolder2);
      const tokenBalanceAfter = await tk.balanceOf(coverHolder2);
      const totalBalanceAfter = await tc.totalBalanceOf(coverHolder2);

      const coverTokensBurned = totalBalanceBefore.sub(totalBalanceAfter);
      const payoutReceived = balanceAfter.sub(balanceBefore);
      const coverTokensUnlockable = tokenBalanceAfter.sub(tokenBalanceBefore);

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceAfter[i] = await tc.totalBalanceOf(underwriters[i]);
        UWTokensBurned[i] = UWTotalBalanceBefore[i].sub(UWTotalBalanceAfter[i]);
      }

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor4Data.newLockDate.sub(claimAssessor4Data.initialDate).eq(oneWeekBN));

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor4Data.newLockDate.sub(claimAssessor4Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));

      assert(claimAssessor1Data.rewardReceived.eqn(0));
      assert(claimAssessor2Data.rewardReceived.eqn(0));
      assert(claimAssessor3Data.rewardReceived.eqn(0));
      assert(claimAssessor4Data.rewardReceived.eqn(0));

      assert(member1Data.rewardReceived.eq(toBN('15004497751124437781')));
      assert(member2Data.rewardReceived.eq(toBN('10002998500749625187')));
      assert(member3Data.rewardReceived.eq(toBN('4997501249375312343')));
      assert(member4Data.rewardReceived.eq(toBN('9995002498750624687')));
      assert(member5Data.rewardReceived.eqn(0));

      assert(payoutReceived.eqn(0));
      assert(coverTokensUnlockable.eqn(0));
      assert(coverTokensBurned.eq(ether(10)));

      const UWTokensLockedExpected = [9000, 9000, 6000, 7000, 9000].map(n => ether(n / 2));
      const UWTokensBurnedExpected = [0, 0, 0, 0, 0].map(n => ether(n));

      for (let i = 0; i < underwriters.length; i++) {
        assert(UWTokensLockedExpected[i].eq(UWTokensLocked[i]));
        assert(UWTokensBurnedExpected[i].eq(UWTokensBurned[i]));
      }
    });

    it('18.11 should pass for CA vote > 5SA and <10 SA and majority < 70%, open for member vote and majority accept(A3)', async function () {

      const claimAssessor1Data = {};
      const claimAssessor2Data = {};
      const claimAssessor3Data = {};
      const claimAssessor4Data = {};
      const member1Data = {};
      const member2Data = {};
      const member3Data = {};
      const member4Data = {};
      const member5Data = {};

      const UWTotalBalanceBefore = [];
      const UWTokensLocked = [];

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceBefore[i] = await tc.totalBalanceOf(underwriters[i]);
        UWTokensLocked[i] = await ps.stakerContractStake(underwriters[i], SC2);
      }

      const coverID = await qd.getAllCoversOfUser(coverHolder2);
      await cl.submitClaim(coverID[0], { from: coverHolder2 });
      const claimID = (await cd.actualClaimLength()).subn(1);
      let APIID = await pd.allAPIcall((await pd.getApilCallLength()).subn(1));

      claimAssessor1Data.initialDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.initialDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.initialDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.initialDate = await tc.getLockedTokensValidity(claimAssessor4, CLA);

      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor3 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor4 });

      claimAssessor1Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor4, CLA);

      let maxVotingTime = await cd.maxVotingTime();
      let now = await latestTime();
      let closingTime = maxVotingTime.add(toBN(now));
      await increaseTimeTo(closingTime.addn(2));

      let tokenBalanceBefore = await tk.balanceOf(coverHolder2);
      let balanceBefore = await dai.balanceOf(coverHolder2);
      let totalBalanceBefore = await tc.totalBalanceOf(coverHolder2);

      // changing the claim status here
      await p1.__callback(APIID, '');
      assert(!(await ps.hasPendingActions()), 'should not have pending actions');

      claimAssessor1Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor1);
      claimAssessor2Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor2);
      claimAssessor3Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor3);
      claimAssessor4Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor4);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });
      await cl.submitMemberVote(claimID, 1, { from: member3 });
      await cl.submitMemberVote(claimID, 1, { from: member4 });
      await cl.submitMemberVote(claimID, -1, { from: member5 });

      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = maxVotingTime.add(toBN(now));
      await increaseTimeTo(closingTime.addn(2));

      // now member voting will be closed
      APIID = await pd.allAPIcall((await pd.getApilCallLength()).subn(1));
      await p1.__callback(APIID, '');
      assert.equal(await ps.hasPendingActions(), true, 'should have pending actions');
      await ps.processPendingActions('100');

      await cr.claimAllPendingReward(20, { from: claimAssessor1 });
      await cr.claimAllPendingReward(20, { from: claimAssessor2 });
      await cr.claimAllPendingReward(20, { from: claimAssessor3 });
      await cr.claimAllPendingReward(20, { from: claimAssessor4 });

      claimAssessor1Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor4, CLA);

      member1Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member1);
      member2Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member2);
      member3Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member3);
      member4Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member4);
      member5Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member5);

      await cr.claimAllPendingReward(20, { from: member1 });
      await cr.claimAllPendingReward(20, { from: member2 });
      await cr.claimAllPendingReward(20, { from: member3 });
      await cr.claimAllPendingReward(20, { from: member4 });
      await cr.claimAllPendingReward(20, { from: member5 });

      const balanceAfter = await dai.balanceOf(coverHolder2);
      const tokenBalanceAfter = await tk.balanceOf(coverHolder2);
      const totalBalanceAfter = await tc.totalBalanceOf(coverHolder2);

      const coverTokensBurned = totalBalanceBefore.sub(totalBalanceAfter);
      const payoutReceived = balanceAfter.sub(balanceBefore);
      const coverTokensUnlockable = tokenBalanceAfter.sub(tokenBalanceBefore);

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceAfter[i] = await tc.totalBalanceOf(underwriters[i]);
        UWTokensBurned[i] = UWTotalBalanceBefore[i].sub(UWTotalBalanceAfter[i]);
      }

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor4Data.newLockDate.sub(claimAssessor4Data.initialDate).eq(oneWeekBN));

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor4Data.newLockDate.sub(claimAssessor4Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));

      assert(claimAssessor1Data.rewardReceived.eqn(0));
      assert(claimAssessor2Data.rewardReceived.eqn(0));
      assert(claimAssessor3Data.rewardReceived.eqn(0));
      assert(claimAssessor4Data.rewardReceived.eqn(0));

      assert(member1Data.rewardReceived.eq(toBN('15004497751124437781')));
      assert(member2Data.rewardReceived.eq(toBN('10002998500749625187')));
      assert(member3Data.rewardReceived.eq(toBN('4997501249375312343')));
      assert(member4Data.rewardReceived.eq(toBN('9995002498750624687')));
      assert(member5Data.rewardReceived.eqn(0));

      assert(payoutReceived.eq(ether(50)));
      assert(coverTokensUnlockable.eq(ether(10)));
      assert(coverTokensBurned.eq(ether(0)));

      const UWTokensLockedExpected = [9000, 9000, 6000, 7000, 9000].map(n => ether(n / 2));
      const UWTokensBurnedExpected = [9000, 9000, 6000, 7000, 9000].map(n => ether(n / 2));

      for (let i = 0; i < underwriters.length; i++) {
        assert(UWTokensLockedExpected[i].eq(UWTokensLocked[i]));
        assert(UWTokensBurnedExpected[i].eq(UWTokensBurned[i]));
      }
    });

    it('18.12 should pass for CA vote > 5* SA and <10 SA and majority > 70 % for reject(D1)', async function () {

      const claimAssessor1Data = {};
      const claimAssessor2Data = {};
      const claimAssessor3Data = {};
      const claimAssessor4Data = {};
      const claimAssessor5Data = {};

      const UWTotalBalanceBefore = [];
      const UWTokensLocked = [];

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceBefore[i] = await tc.totalBalanceOf(underwriters[i]);
        UWTokensLocked[i] = await ps.stakerContractStake(underwriters[i], SC3);
      }

      const coverID = await qd.getAllCoversOfUser(coverHolder4);
      await cl.submitClaim(coverID[0], { from: coverHolder4 });
      const claimID = (await cd.actualClaimLength()).subn(1);
      const APIID = await pd.allAPIcall((await pd.getApilCallLength()).subn(1));

      claimAssessor1Data.initialDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.initialDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.initialDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.initialDate = await tc.getLockedTokensValidity(claimAssessor4, CLA);
      claimAssessor5Data.initialDate = await tc.getLockedTokensValidity(claimAssessor5, CLA);

      await cl.submitCAVote(claimID, -1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor3 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor4 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor5 });

      claimAssessor1Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor4, CLA);
      claimAssessor5Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor5, CLA);

      let maxVotingTime = await cd.maxVotingTime();
      let now = await latestTime();
      let closingTime = maxVotingTime.add(toBN(now));
      await increaseTimeTo(closingTime.addn(2));

      const tokenBalanceBefore = await tk.balanceOf(coverHolder4);
      const balanceBefore = toBN((await web3.eth.getBalance(coverHolder4)).toString());
      const totalBalanceBefore = await tc.totalBalanceOf(coverHolder4);

      // changing the claim status here
      await p1.__callback(APIID, '');
      assert(!(await ps.hasPendingActions()), 'should not have pending actions');

      const balanceAfter = toBN((await web3.eth.getBalance(coverHolder4)).toString());
      const tokenBalanceAfter = await tk.balanceOf(coverHolder4);
      const totalBalanceAfter = await tc.totalBalanceOf(coverHolder4);

      coverTokensBurned = totalBalanceBefore.sub(totalBalanceAfter);
      payoutReceived = balanceAfter.sub(balanceBefore);
      coverTokensUnlockable = tokenBalanceAfter.sub(tokenBalanceBefore);

      claimAssessor1Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor1);
      claimAssessor2Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor2);
      claimAssessor3Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor3);
      claimAssessor4Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor4);
      claimAssessor5Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor5);

      await cr.claimAllPendingReward(20, { from: claimAssessor1 });
      await cr.claimAllPendingReward(20, { from: claimAssessor2 });
      await cr.claimAllPendingReward(20, { from: claimAssessor3 });
      await cr.claimAllPendingReward(20, { from: claimAssessor4 });
      await cr.claimAllPendingReward(20, { from: claimAssessor5 });

      claimAssessor1Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor4, CLA);
      claimAssessor5Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor5, CLA);

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceAfter[i] = await tc.totalBalanceOf(underwriters[i]);
        UWTokensBurned[i] = UWTotalBalanceBefore[i].sub(UWTotalBalanceAfter[i]);
      }

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor4Data.newLockDate.sub(claimAssessor4Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor5Data.newLockDate.sub(claimAssessor5Data.initialDate).eq(oneWeekBN));

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor4Data.newLockDate.sub(claimAssessor4Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor5Data.newLockDate.sub(claimAssessor5Data.lockPeriodAfterRewardReceived).eqn(0));

      assert(claimAssessor1Data.rewardReceived.eq(ether('18.75')));
      assert(claimAssessor2Data.rewardReceived.eq(ether('11.25')));
      assert(claimAssessor3Data.rewardReceived.eq(ether('7.5')));
      assert(claimAssessor4Data.rewardReceived.eq(ether('22.5')));
      assert(claimAssessor5Data.rewardReceived.eq(ether('0')));

      assert(payoutReceived.eq(ether('0')));
      assert(coverTokensUnlockable.eq(ether('0')));
      assert(coverTokensBurned.eq(ether('15')));

      const UWTokensLockedExpected = [9000, 8000, 9000, 5000, 9000].map(ether);
      const UWTokensBurnedExpected = [0, 0, 0, 0, 0].map(ether);

      for (let i = 0; i < underwriters.length; i++) {
        assert(UWTokensLockedExpected[i].eq(UWTokensLocked[i]));
        assert(UWTokensBurnedExpected[i].eq(UWTokensBurned[i]));
      }
    });

    it('18.13 should pass for CA vote > 5* SA and <10 SA and majority > 70 % for accept(A1)', async function () {

      const claimAssessor1Data = {};
      const claimAssessor2Data = {};
      const claimAssessor3Data = {};
      const claimAssessor4Data = {};
      const claimAssessor5Data = {};

      const UWTotalBalanceBefore = [];
      const UWTokensLocked = [];

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceBefore[i] = await tc.totalBalanceOf(underwriters[i]);
        UWTokensLocked[i] = await ps.stakerContractStake(underwriters[i], SC3);
      }

      const coverID = await qd.getAllCoversOfUser(coverHolder4);
      await cl.submitClaim(coverID[0], { from: coverHolder4 });
      const claimID = (await cd.actualClaimLength()).subn(1);
      const APIID = await pd.allAPIcall((await pd.getApilCallLength()).subn(1));

      claimAssessor1Data.initialDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.initialDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.initialDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.initialDate = await tc.getLockedTokensValidity(claimAssessor4, CLA);
      claimAssessor5Data.initialDate = await tc.getLockedTokensValidity(claimAssessor5, CLA);

      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor3 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor4 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor5 });

      claimAssessor1Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor4, CLA);
      claimAssessor5Data.newLockDate = await tc.getLockedTokensValidity(claimAssessor5, CLA);

      const maxVotingTime = await cd.maxVotingTime();
      const now = await latestTime();
      const closingTime = maxVotingTime.add(toBN(now));
      await increaseTimeTo(closingTime.addn(2));

      const tokenBalanceBefore = await tk.balanceOf(coverHolder4);
      const balanceBefore = toBN((await web3.eth.getBalance(coverHolder4)).toString());
      const totalBalanceBefore = await tc.totalBalanceOf(coverHolder4);

      // changing the claim status here
      await p1.__callback(APIID, '');
      assert.equal(await ps.hasPendingActions(), true, 'should have pending actions');
      await ps.processPendingActions('100');

      const balanceAfter = toBN((await web3.eth.getBalance(coverHolder4)).toString());
      const tokenBalanceAfter = await tk.balanceOf(coverHolder4);
      const totalBalanceAfter = await tc.totalBalanceOf(coverHolder4);

      const coverTokensBurned = totalBalanceBefore.sub(totalBalanceAfter);
      const payoutReceived = balanceAfter.sub(balanceBefore);
      const coverTokensUnlockable = tokenBalanceAfter.sub(tokenBalanceBefore);

      claimAssessor1Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor1);
      claimAssessor2Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor2);
      claimAssessor3Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor3);
      claimAssessor4Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor4);
      claimAssessor5Data.rewardReceived = await cr.getRewardToBeDistributedByUser(claimAssessor5);

      await cr.claimAllPendingReward(20, { from: claimAssessor1 });
      await cr.claimAllPendingReward(20, { from: claimAssessor2 });
      await cr.claimAllPendingReward(20, { from: claimAssessor3 });
      await cr.claimAllPendingReward(20, { from: claimAssessor4 });
      await cr.claimAllPendingReward(20, { from: claimAssessor5 });

      claimAssessor1Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor2, CLA);
      claimAssessor3Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor3, CLA);
      claimAssessor4Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor4, CLA);
      claimAssessor5Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor5, CLA);

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceAfter[i] = await tc.totalBalanceOf(underwriters[i]);
        UWTokensBurned[i] = UWTotalBalanceBefore[i].sub(UWTotalBalanceAfter[i]);
      }

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor4Data.newLockDate.sub(claimAssessor4Data.initialDate).eq(oneWeekBN));
      assert(claimAssessor5Data.newLockDate.sub(claimAssessor5Data.initialDate).eq(oneWeekBN));

      assert(claimAssessor1Data.newLockDate.sub(claimAssessor1Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor2Data.newLockDate.sub(claimAssessor2Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor3Data.newLockDate.sub(claimAssessor3Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor4Data.newLockDate.sub(claimAssessor4Data.lockPeriodAfterRewardReceived).eq(oneWeekBN));
      assert(claimAssessor5Data.newLockDate.sub(claimAssessor5Data.lockPeriodAfterRewardReceived).eqn(0));

      assert(claimAssessor1Data.rewardReceived.eq(ether('18.75')));
      assert(claimAssessor2Data.rewardReceived.eq(ether('11.25')));
      assert(claimAssessor3Data.rewardReceived.eq(ether('7.5')));
      assert(claimAssessor4Data.rewardReceived.eq(ether('22.5')));
      assert(claimAssessor5Data.rewardReceived.eq(ether('0')));

      assert(payoutReceived.eq(ether('3')));
      assert(coverTokensUnlockable.eq(ether('15')));
      assert(coverTokensBurned.eq(ether('0')));

      const UWTokensLockedExpected = [9000, 8000, 9000, 5000, 9000].map(n => ether(n));
      const UWTokensBurnedExpected = [9000, 8000, 9000, 5000, 9000].map(n => ether(n * 0.75));

      for (let i = 0; i < underwriters.length; i++) {
        assert(UWTokensLockedExpected[i].eq(UWTokensLocked[i]));
        assert(UWTokensBurnedExpected[i].eq(UWTokensBurned[i]));
      }
    });

    it('18.14 should pass for CA vote < 5* SA and MV < 5 SA and CA majority reject(D4)', async function () {

      let claimAssessor1Data = {};
      let claimAssessor2Data = {};
      let claimAssessor3Data = {};
      let member1Data = {};
      let member2Data = {};

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underwriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underwriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(await ps.stakerContractStake(underwriters[i], SC3)) -
              parseFloat(await ps.stakerContractStake(underwriters[i], SC3))) /
            toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder6);
      await cl.submitClaim(coverID[0], { from: coverHolder6 });
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      await cl.submitCAVote(claimID, -1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor3 });

      claimAssessor1Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      maxVotingTime = await cd.maxVotingTime();
      let now = await latestTime();
      closingTime = new BN(maxVotingTime.toString()).add(
        new BN(now.toString())
      );
      await increaseTimeTo(
        new BN(closingTime.toString()).add(new BN((2).toString()))
      );

      let coverTokensLockedBefore = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder6, coverID)
      );
      let tokenBalanceBefore = parseFloat(await tk.balanceOf(coverHolder6));
      let balanceBefore = parseFloat(await dai.balanceOf(coverHolder6));
      let totalBalanceBefore = parseFloat(
        await tc.totalBalanceOf(coverHolder6)
      );

      // // changing the claim status here
      await p1.__callback(APIID, '');

      claimAssessor1Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = new BN(maxVotingTime.toString()).add(
        new BN(now.toString())
      );
      await increaseTimeTo(
        new BN(closingTime.toString()).add(new BN((2).toString()))
      );

      await ps.processPendingActions('100');

      // now member voting will be closed
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(20, { from: claimAssessor1 });
      await cr.claimAllPendingReward(20, { from: claimAssessor2 });
      await cr.claimAllPendingReward(20, { from: claimAssessor3 });


      claimAssessor1Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      member1Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);

      await cr.claimAllPendingReward(20, { from: member1 });
      await cr.claimAllPendingReward(20, { from: member2 });


      let balanceAfter = parseFloat(await dai.balanceOf(coverHolder6));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder6));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder6, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder6));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / toWei(1)
      ).toFixed(2);
      payoutReceived = Number(
        (balanceAfter - balanceBefore) / toWei(1)
      ).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / toWei(1)
      ).toFixed(2);

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underwriters[i])) / toWei(1);
      }

      for (let i = 0; i < underwriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Data.newLockDate - claimAssessor1Data.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Data.newLockDate - claimAssessor2Data.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Data.newLockDate - claimAssessor3Data.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Data.newLockDate -
        claimAssessor1Data.lockPeriodAfterRewardReceived,
        oneWeek
      );
      assert.equal(
        claimAssessor2Data.newLockDate -
        claimAssessor2Data.lockPeriodAfterRewardReceived,
        oneWeek
      );
      assert.equal(
        claimAssessor3Data.newLockDate -
        claimAssessor3Data.lockPeriodAfterRewardReceived,
        oneWeek
      );

      assert.equal(claimAssessor1Data.rewardReceived, 0);
      assert.equal(claimAssessor2Data.rewardReceived, 0);
      assert.equal(claimAssessor3Data.rewardReceived, 0);

      assert.equal(member1Data.rewardReceived, 0);
      assert.equal(member2Data.rewardReceived, 0);

      assert.equal(payoutReceived, 0);
      assert.equal(coverTokensUnlockable, 0);
      assert.equal(coverTokensBurned, 15);

      let UWTokensLockedExpected = [0, 0, 0, 0, 5000];
      let UWTokensBurnedExpected = [0, 0, 0, 0, 0];

      for (let i = 0; i < underwriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.15 should pass for CA vote < 5* SA and MV < 5 SA and CA majority accept(A4)', async function () {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardReceived,
          lockPeriodAfterRewardReceived
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardReceived = lockPeriodAfterRewardReceived;
          this.rewardReceived = rewardReceived;
        }
      }
      class member {
        constructor(rewardReceived) {
          this.rewardReceived = rewardReceived;
        }
      }
      let claimAssessor1Data = new claimAssessor();
      let claimAssessor2Data = new claimAssessor();
      let claimAssessor3Data = new claimAssessor();

      let member1Data = new member();
      let member2Data = new member();

      underwriters = [
        underwriter5,
        underwriter4,
        underwriter3,
        underwriter2,
        underwriter1
      ];
      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underwriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underwriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(await ps.stakerContractStake(underwriters[i], SC3)) -
              parseFloat(await ps.stakerContractStake(underwriters[i], SC3))) /
            toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder6);
      await cl.submitClaim(coverID[0], { from: coverHolder6 });
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor3 });

      claimAssessor1Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      maxVotingTime = await cd.maxVotingTime();
      let now = await latestTime();
      closingTime = new BN(maxVotingTime.toString()).add(
        new BN(now.toString())
      );
      await increaseTimeTo(
        new BN(closingTime.toString()).add(new BN((2).toString()))
      );

      let coverTokensLockedBefore = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder6, coverID)
      );
      let tokenBalanceBefore = parseFloat(await tk.balanceOf(coverHolder6));
      let balanceBefore = parseFloat(await dai.balanceOf(coverHolder6));
      let totalBalanceBefore = parseFloat(
        await tc.totalBalanceOf(coverHolder6)
      );

      // // changing the claim status here
      await p1.__callback(APIID, '');

      claimAssessor1Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = new BN(maxVotingTime.toString()).add(
        new BN(now.toString())
      );
      await increaseTimeTo(
        new BN(closingTime.toString()).add(new BN((2).toString()))
      );

      // now member voting will be closed
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(20, { from: claimAssessor1 });
      await cr.claimAllPendingReward(20, { from: claimAssessor2 });
      await cr.claimAllPendingReward(20, { from: claimAssessor3 });


      claimAssessor1Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      member1Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);

      await cr.claimAllPendingReward(20, { from: member1 });
      await cr.claimAllPendingReward(20, { from: member2 });


      let balanceAfter = parseFloat(await dai.balanceOf(coverHolder6));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder6));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder6, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder6));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / toWei(1)
      ).toFixed(2);
      payoutReceived = Number(
        (balanceAfter - balanceBefore) / toWei(1)
      ).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / toWei(1)
      ).toFixed(2);

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underwriters[i])) / toWei(1);
      }

      for (let i = 0; i < underwriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Data.newLockDate - claimAssessor1Data.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Data.newLockDate - claimAssessor2Data.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Data.newLockDate - claimAssessor3Data.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Data.newLockDate -
        claimAssessor1Data.lockPeriodAfterRewardReceived,
        oneWeek
      );
      assert.equal(
        claimAssessor2Data.newLockDate -
        claimAssessor2Data.lockPeriodAfterRewardReceived,
        oneWeek
      );
      assert.equal(
        claimAssessor3Data.newLockDate -
        claimAssessor3Data.lockPeriodAfterRewardReceived,
        oneWeek
      );

      assert.equal(claimAssessor1Data.rewardReceived, 0);
      assert.equal(claimAssessor2Data.rewardReceived, 0);
      assert.equal(claimAssessor3Data.rewardReceived, 0);

      assert.equal(member1Data.rewardReceived, 0);
      assert.equal(member2Data.rewardReceived, 0);

      assert.equal(payoutReceived, 75);
      assert.equal(coverTokensUnlockable, 15);
      assert.equal(coverTokensBurned, 0);

      // let UWTokensLockedExpected = [0, 0, 0, 0, 5000];
      // let UWTokensBurnedExpected = [0, 0, 0, 0, 5000];
      //
      // for (let i = 0; i < underwriters.length; i++) {
      //   assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
      //   assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      // }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.16 should pass for 0 CA votes, MV < 5 SA(D4)', async function () {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardReceived,
          lockPeriodAfterRewardReceived
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardReceived = lockPeriodAfterRewardReceived;
          this.rewardReceived = rewardReceived;
        }
      }
      class member {
        constructor(rewardReceived) {
          this.rewardReceived = rewardReceived;
        }
      }
      underwriters = [
        underwriter4,
        underwriter3,
        underwriter5,
        underwriter2,
        underwriter1
      ];

      let member1Data = new member();
      let member2Data = new member();
      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underwriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underwriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(await ps.stakerContractStake(underwriters[i], SC4)) -
              parseFloat(await ps.stakerContractStake(underwriters[i], SC4))) /
            toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder7);
      await cl.submitClaim(coverID[0], { from: coverHolder7 });
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      maxVotingTime = await cd.maxVotingTime();
      let now = await latestTime();
      closingTime = new BN(maxVotingTime.toString()).add(
        new BN(now.toString())
      );
      await increaseTimeTo(
        new BN(closingTime.toString()).add(new BN((2).toString()))
      );

      let coverTokensLockedBefore = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder7, coverID)
      );
      let tokenBalanceBefore = parseFloat(await tk.balanceOf(coverHolder7));
      let balanceBefore = parseFloat(await dai.balanceOf(coverHolder7));
      let totalBalanceBefore = parseFloat(
        await tc.totalBalanceOf(coverHolder7)
      );

      // // changing the claim status here
      await p1.__callback(APIID, '');

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = new BN(maxVotingTime.toString()).add(
        new BN(now.toString())
      );
      await increaseTimeTo(
        new BN(closingTime.toString()).add(new BN((2).toString()))
      );

      // now member voting will be closed
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await p1.__callback(APIID, '');

      let proposalIds = [];

      member1Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);

      await cr.claimAllPendingReward(20, { from: member1 });
      await cr.claimAllPendingReward(20, { from: member2 });


      let balanceAfter = parseFloat(await dai.balanceOf(coverHolder7));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder7));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder7, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder7));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / toWei(1)
      ).toFixed(2);
      payoutReceived = Number(
        (balanceAfter - balanceBefore) / toWei(1)
      ).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / toWei(1)
      ).toFixed(2);

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underwriters[i])) / toWei(1);
      }

      for (let i = 0; i < underwriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(member1Data.rewardReceived, 0);
      assert.equal(member2Data.rewardReceived, 0);

      assert.equal(payoutReceived, 0);
      assert.equal(coverTokensUnlockable, 0);
      assert.equal(coverTokensBurned, 20);

      // let UWTokensLockedExpected = [30, 40, 50, 60, 70];
      // let UWTokensBurnedExpected = [0, 0, 0, 0, 0];
      //
      // for (let i = 0; i < underwriters.length; i++) {
      //   assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
      //   assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      // }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.17 should pass for CA vote > 5 SA and CA<10 SA and majority < 70%, open for member vote and MV<5 SA and CA majority reject(D4)', async function () {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardReceived,
          lockPeriodAfterRewardReceived
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardReceived = lockPeriodAfterRewardReceived;
          this.rewardReceived = rewardReceived;
        }
      }
      class member {
        constructor(rewardReceived) {
          this.rewardReceived = rewardReceived;
        }
      }
      let claimAssessor1Data = new claimAssessor();
      let claimAssessor2Data = new claimAssessor();
      let claimAssessor3Data = new claimAssessor();
      let claimAssessor4Data = new claimAssessor();
      let claimAssessor5Data = new claimAssessor();
      let member1Data = new member();
      let member2Data = new member();
      let member3Data = new member();

      underwriters = [
        underwriter4,
        underwriter3,
        underwriter5,
        underwriter2,
        underwriter1
      ];

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underwriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underwriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(await ps.stakerContractStake(underwriters[i], SC4)) -
              parseFloat(await ps.stakerContractStake(underwriters[i], SC4))) /
            toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder7);
      await cl.submitClaim(coverID[0], { from: coverHolder7 });
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );
      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor3 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor4 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor5 });

      claimAssessor1Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );

      maxVotingTime = await cd.maxVotingTime();
      let now = await latestTime();
      closingTime = new BN(maxVotingTime.toString()).add(
        new BN(now.toString())
      );
      await increaseTimeTo(
        new BN(closingTime.toString()).add(new BN((2).toString()))
      );

      let coverTokensLockedBefore = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder7, coverID)
      );
      let tokenBalanceBefore = parseFloat(await tk.balanceOf(coverHolder7));
      let balanceBefore = parseFloat(await web3.eth.getBalance(coverHolder7));
      let totalBalanceBefore = parseFloat(
        await tc.totalBalanceOf(coverHolder7)
      );

      // // changing the claim status here
      await p1.__callback(APIID, '');

      claimAssessor1Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);
      claimAssessor4Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        toWei(1);
      claimAssessor5Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor5)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });
      await cl.submitMemberVote(claimID, 1, { from: member3 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = new BN(maxVotingTime.toString()).add(
        new BN(now.toString())
      );
      await increaseTimeTo(
        new BN(closingTime.toString()).add(new BN((2).toString()))
      );

      // now member voting will be closed
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(20, { from: claimAssessor1 });
      await cr.claimAllPendingReward(20, { from: claimAssessor2 });
      await cr.claimAllPendingReward(20, { from: claimAssessor3 });
      await cr.claimAllPendingReward(20, { from: claimAssessor4 });
      await cr.claimAllPendingReward(20, { from: claimAssessor5 });


      claimAssessor1Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );

      member1Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);
      member3Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / toWei(1);

      await cr.claimAllPendingReward(20, { from: member1 });
      await cr.claimAllPendingReward(20, { from: member2 });
      await cr.claimAllPendingReward(20, { from: member3 });


      let balanceAfter = parseFloat(await web3.eth.getBalance(coverHolder7));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder7));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder7, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder7));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / toWei(1)
      ).toFixed(2);
      payoutReceived = Number(
        (balanceAfter - balanceBefore) / toWei(1)
      ).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / toWei(1)
      ).toFixed(2);

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underwriters[i])) / toWei(1);
      }

      for (let i = 0; i < underwriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Data.newLockDate - claimAssessor1Data.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Data.newLockDate - claimAssessor2Data.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Data.newLockDate - claimAssessor3Data.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor4Data.newLockDate - claimAssessor4Data.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor5Data.newLockDate - claimAssessor5Data.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Data.newLockDate -
        claimAssessor1Data.lockPeriodAfterRewardReceived,
        oneWeek
      );
      assert.equal(
        claimAssessor2Data.newLockDate -
        claimAssessor2Data.lockPeriodAfterRewardReceived,
        oneWeek
      );
      assert.equal(
        claimAssessor3Data.newLockDate -
        claimAssessor3Data.lockPeriodAfterRewardReceived,
        oneWeek
      );
      assert.equal(
        claimAssessor4Data.newLockDate -
        claimAssessor4Data.lockPeriodAfterRewardReceived,
        oneWeek
      );
      assert.equal(
        claimAssessor5Data.newLockDate -
        claimAssessor5Data.lockPeriodAfterRewardReceived,
        oneWeek
      );

      assert.equal(claimAssessor1Data.rewardReceived, 0);
      assert.equal(claimAssessor2Data.rewardReceived, 0);
      assert.equal(claimAssessor3Data.rewardReceived, 0);
      assert.equal(claimAssessor4Data.rewardReceived, 0);
      assert.equal(claimAssessor5Data.rewardReceived, 0);

      assert.equal(member1Data.rewardReceived, 0);
      assert.equal(member2Data.rewardReceived, 0);
      assert.equal(member3Data.rewardReceived, 0);

      assert.equal(payoutReceived, 0);
      assert.equal(coverTokensUnlockable, 0);
      assert.equal(coverTokensBurned, 20);

      let UWTokensLockedExpected = [30, 40, 50, 60, 70];
      let UWTokensBurnedExpected = [0, 0, 0, 0, 0];

      for (let i = 0; i < underwriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.18 should pass for CA vote > 5 SA and CA<10SA majority < 70%, open for member vote and MV<5 SA and CA majority accept(A4)', async function () {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardReceived,
          lockPeriodAfterRewardReceived
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardReceived = lockPeriodAfterRewardReceived;
          this.rewardReceived = rewardReceived;
        }
      }
      class member {
        constructor(rewardReceived) {
          this.rewardReceived = rewardReceived;
        }
      }
      let claimAssessor1Data = new claimAssessor();
      let claimAssessor2Data = new claimAssessor();
      let claimAssessor3Data = new claimAssessor();
      let claimAssessor4Data = new claimAssessor();
      let claimAssessor5Data = new claimAssessor();
      let member1Data = new member();
      let member2Data = new member();
      let member3Data = new member();

      underwriters = [
        underwriter4,
        underwriter3,
        underwriter5,
        underwriter2,
        underwriter1
      ];
      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underwriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underwriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(await ps.stakerContractStake(underwriters[i], SC4)) -
              parseFloat(await ps.stakerContractStake(underwriters[i], SC4))) /
            toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder8);
      await cl.submitClaim(coverID[0], { from: coverHolder8 });
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );
      await cl.submitCAVote(claimID, -1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor3 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor4 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor5 });

      claimAssessor1Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );

      maxVotingTime = await cd.maxVotingTime();
      let now = await latestTime();
      closingTime = new BN(maxVotingTime.toString()).add(
        new BN(now.toString())
      );
      await increaseTimeTo(
        new BN(closingTime.toString()).add(new BN((2).toString()))
      );

      let coverTokensLockedBefore = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder8, coverID)
      );
      let tokenBalanceBefore = parseFloat(await tk.balanceOf(coverHolder8));
      let balanceBefore = parseFloat(await dai.balanceOf(coverHolder8));
      let totalBalanceBefore = parseFloat(
        await tc.totalBalanceOf(coverHolder8)
      );

      // // changing the claim status here
      await p1.__callback(APIID, '');

      claimAssessor1Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);
      claimAssessor4Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        toWei(1);
      claimAssessor5Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor5)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });
      await cl.submitMemberVote(claimID, 1, { from: member3 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = new BN(maxVotingTime.toString()).add(
        new BN(now.toString())
      );
      await increaseTimeTo(
        new BN(closingTime.toString()).add(new BN((2).toString()))
      );

      await ps.processPendingActions('100');

      // now member voting will be closed
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(20, { from: claimAssessor1 });
      await cr.claimAllPendingReward(20, { from: claimAssessor2 });
      await cr.claimAllPendingReward(20, { from: claimAssessor3 });
      await cr.claimAllPendingReward(20, { from: claimAssessor4 });
      await cr.claimAllPendingReward(20, { from: claimAssessor5 });


      claimAssessor1Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );

      member1Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);
      member3Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / toWei(1);

      await cr.claimAllPendingReward(20, { from: member1 });
      await cr.claimAllPendingReward(20, { from: member2 });
      await cr.claimAllPendingReward(20, { from: member3 });


      let balanceAfter = parseFloat(await dai.balanceOf(coverHolder8));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder8));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder8, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder8));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / toWei(1)
      ).toFixed(2);
      payoutReceived = Number(
        (balanceAfter - balanceBefore) / toWei(1)
      ).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / toWei(1)
      ).toFixed(2);

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underwriters[i])) / toWei(1);
      }

      for (let i = 0; i < underwriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Data.newLockDate - claimAssessor1Data.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Data.newLockDate - claimAssessor2Data.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Data.newLockDate - claimAssessor3Data.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Data.newLockDate - claimAssessor2Data.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Data.newLockDate - claimAssessor3Data.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Data.newLockDate -
        claimAssessor1Data.lockPeriodAfterRewardReceived,
        oneWeek
      );
      assert.equal(
        claimAssessor2Data.newLockDate -
        claimAssessor2Data.lockPeriodAfterRewardReceived,
        oneWeek
      );
      assert.equal(
        claimAssessor3Data.newLockDate -
        claimAssessor3Data.lockPeriodAfterRewardReceived,
        oneWeek
      );
      assert.equal(
        claimAssessor2Data.newLockDate -
        claimAssessor2Data.lockPeriodAfterRewardReceived,
        oneWeek
      );
      assert.equal(
        claimAssessor3Data.newLockDate -
        claimAssessor3Data.lockPeriodAfterRewardReceived,
        oneWeek
      );

      assert.equal(claimAssessor1Data.rewardReceived, 0);
      assert.equal(claimAssessor2Data.rewardReceived, 0);
      assert.equal(claimAssessor3Data.rewardReceived, 0);
      assert.equal(claimAssessor2Data.rewardReceived, 0);
      assert.equal(claimAssessor3Data.rewardReceived, 0);

      assert.equal(member1Data.rewardReceived, 0);
      assert.equal(member2Data.rewardReceived, 0);
      assert.equal(member3Data.rewardReceived, 0);

      assert.equal(payoutReceived, 100);
      assert.equal(coverTokensUnlockable, 40);
      assert.equal(coverTokensBurned, 0);

      let UWTokensLockedExpected = [30, 40, 50, 60, 70];
      let UWTokensBurnedExpected = [30, 40, 50, 60, 70];

      for (let i = 0; i < underwriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.19 CA vote<5SA, open for member vote and majority reject(D3)', async function () {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardReceived,
          lockPeriodAfterRewardReceived
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardReceived = lockPeriodAfterRewardReceived;
          this.rewardReceived = rewardReceived;
        }
      }
      class member {
        constructor(rewardReceived) {
          this.rewardReceived = rewardReceived;
        }
      }
      let claimAssessor1Data = new claimAssessor();
      let claimAssessor2Data = new claimAssessor();
      let member1Data = new member();
      let member2Data = new member();
      let member3Data = new member();
      let member4Data = new member();
      let member5Data = new member();
      let member6Data = new member();

      underwriters = [
        underwriter4,
        underwriter3,
        underwriter5,
        underwriter2,
        underwriter1
      ];
      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underwriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underwriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(await ps.stakerContractStake(underwriters[i], SC5)) -
              parseFloat(await ps.stakerContractStake(underwriters[i], SC5))) /
            toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder9);
      await cl.submitClaim(coverID[0], { from: coverHolder9 });
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor2 });

      claimAssessor1Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );

      maxVotingTime = await cd.maxVotingTime();
      let now = await latestTime();
      closingTime = new BN(maxVotingTime.toString()).add(
        new BN(now.toString())
      );
      await increaseTimeTo(
        new BN(closingTime.toString()).add(new BN((2).toString()))
      );

      let coverTokensLockedBefore = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder9, coverID)
      );
      let tokenBalanceBefore = parseFloat(await tk.balanceOf(coverHolder9));
      let balanceBefore = parseFloat(await web3.eth.getBalance(coverHolder9));
      let totalBalanceBefore = parseFloat(
        await tc.totalBalanceOf(coverHolder9)
      );

      await ps.processPendingActions('100');

      // // changing the claim status here
      await p1.__callback(APIID, '');

      claimAssessor1Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, -1, { from: member1 });
      await cl.submitMemberVote(claimID, -1, { from: member2 });
      await cl.submitMemberVote(claimID, -1, { from: member3 });
      await cl.submitMemberVote(claimID, -1, { from: member4 });
      await cl.submitMemberVote(claimID, 1, { from: member5 });
      await cl.submitMemberVote(claimID, -1, { from: member6 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = new BN(maxVotingTime.toString()).add(
        new BN(now.toString())
      );
      await increaseTimeTo(
        new BN(closingTime.toString()).add(new BN((2).toString()))
      );

      // now member voting will be closed
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(20, { from: claimAssessor1 });
      await cr.claimAllPendingReward(20, { from: claimAssessor2 });


      claimAssessor1Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Data.lockPeriodAfterRewardReceived = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );

      member1Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);
      member3Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / toWei(1);
      member4Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member4)) / toWei(1);
      member5Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member5)) / toWei(1);
      member6Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(member6)) / toWei(1);

      await cr.claimAllPendingReward(20, { from: member1 });
      await cr.claimAllPendingReward(20, { from: member2 });
      await cr.claimAllPendingReward(20, { from: member3 });
      await cr.claimAllPendingReward(20, { from: member4 });
      await cr.claimAllPendingReward(20, { from: member5 });
      await cr.claimAllPendingReward(20, { from: member6 });


      let balanceAfter = parseFloat(await web3.eth.getBalance(coverHolder9));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder9));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder9, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder9));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / toWei(1)
      ).toFixed(2);
      payoutReceived = Number(
        (balanceAfter - balanceBefore) / toWei(1)
      ).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / toWei(1)
      ).toFixed(2);

      for (let i = 0; i < underwriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underwriters[i])) / toWei(1);
      }

      for (let i = 0; i < underwriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Data.newLockDate - claimAssessor1Data.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Data.newLockDate - claimAssessor2Data.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Data.newLockDate -
        claimAssessor1Data.lockPeriodAfterRewardReceived,
        oneWeek
      );
      assert.equal(
        claimAssessor2Data.newLockDate -
        claimAssessor2Data.lockPeriodAfterRewardReceived,
        oneWeek
      );

      assert.equal(claimAssessor1Data.rewardReceived, 0);
      assert.equal(claimAssessor2Data.rewardReceived, 0);

      assert.equal(member1Data.rewardReceived, 13.060146443378345);
      assert.equal(member2Data.rewardReceived, 8.706764295585563);
      assert.equal(member3Data.rewardReceived, 4.349902226011972);
      assert.equal(member4Data.rewardReceived, 8.699804452023944);
      assert.equal(member5Data.rewardReceived, 0);
      assert.equal(member6Data.rewardReceived, 65.18338258300017);

      assert.equal(payoutReceived, 0);
      assert.equal(coverTokensUnlockable, 0);
      assert.equal(coverTokensBurned, 25);

      // let UWTokensLockedExpected = [5, 10, 15, 20, 25];
      // let UWTokensBurnedExpected = [0, 0, 0, 0, 0];
      //
      // for (let i = 0; i < underwriters.length; i++) {
      //   assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
      //   assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      // }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.20 CA vote <5SA and majority < 70%, open for member vote and majority accept(A3)', async function () {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardReceived,
          lockPeriodAfterRewardReceived
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardReceived = lockPeriodAfterRewardReceived;
          this.rewardReceived = rewardReceived;
        }
      }
      class member {
        constructor(rewardReceived) {
          this.rewardReceived = rewardReceived;
        }
      }
      let claimAssessor1Data = new claimAssessor();
      let claimAssessor2Data = new claimAssessor();
      let member1Data = new member();
      let member2Data = new member();
      let member3Data = new member();
      let member4Data = new member();
      let member5Data = new member();
      let member6Data = new member();

      let UWarray = [
        underwriter4,
        underwriter3,
        underwriter5,
        underwriter2,
        underwriter1
      ];
      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / toWei(1);
      }

      const UWTokensLocked = [];
      for (let i = 0; i < UWarray.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(await ps.stakerContractStake(UWarray[i], SC5)) -
              parseFloat(await ps.stakerContractStake(UWarray[i], SC5))) /
            toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder9);
      await cl.submitClaim(coverID[0], { from: coverHolder9 });
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimID = (await cd.actualClaimLength()) - 1;
      claimAssessor1Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Data.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );

      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor2 });

      claimAssessor1Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Data.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );

      maxVotingTime = await cd.maxVotingTime();
      let now = await latestTime();
      closingTime = maxVotingTime.add(toBN(now));
      await increaseTimeTo(closingTime.addn(2));

      let tokenBalanceBefore = await tk.balanceOf(coverHolder9);
      let balanceBefore = await web3.eth.getBalance(coverHolder9);
      let totalBalanceBefore = await tc.totalBalanceOf(coverHolder9);

      // // changing the claim status here
      await p1.__callback(APIID, '');

      claimAssessor1Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Data.rewardReceived =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });
      await cl.submitMemberVote(claimID, 1, { from: member3 });
      await cl.submitMemberVote(claimID, 1, { from: member4 });
      await cl.submitMemberVote(claimID, -1, { from: member5 });
      await cl.submitMemberVote(claimID, 1, { from: member6 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = new BN(maxVotingTime.toString()).add(
        new BN(now.toString())
      );
      await increaseTimeTo(
        new BN(closingTime.toString()).add(new BN((2).toString()))
      );

      await ps.processPendingActions('100');

      // now member voting will be closed
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await p1.__callback(APIID, '');

      await cr.claimAllPendingReward(20, { from: claimAssessor1 });
      await cr.claimAllPendingReward(20, { from: claimAssessor2 });

      claimAssessor1Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor1, CLA);
      claimAssessor2Data.lockPeriodAfterRewardReceived = await tc.getLockedTokensValidity(claimAssessor2, CLA);

      member1Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member1);
      member2Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member2);
      member3Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member3);
      member4Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member4);
      member5Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member5);
      member6Data.rewardReceived = await cr.getRewardToBeDistributedByUser(member6);

      await increaseTimeTo(closingTime.addn(172800));

      // cannot withdraw/switch membership as it has not claimed Pending reward
      await assertRevert(mr.withdrawMembership({ from: member1 }));
      await assertRevert(mr.switchMembership(tc.address, { from: member1 }));

      await cr.claimAllPendingReward(20, { from: member1 });
      await cr.claimAllPendingReward(20, { from: member2 });
      await cr.claimAllPendingReward(20, { from: member3 });
      await cr.claimAllPendingReward(20, { from: member4 });
      await cr.claimAllPendingReward(20, { from: member5 });
      await cr.claimAllPendingReward(20, { from: member6 });

      const balanceAfter = await web3.eth.getBalance(coverHolder9);
      const tokenBalanceAfter = await tk.balanceOf(coverHolder9);
      const totalBalanceAfter = await tc.totalBalanceOf(coverHolder9);

      coverTokensBurned = totalBalanceBefore.sub(totalBalanceAfter);
      payoutReceived = balanceAfter.sub(balanceBefore);
      coverTokensUnlockable = tokenBalanceAfter.sub(tokenBalanceBefore);

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / toWei(1);
      }

      for (let i = 0; i < UWarray.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Data.newLockDate - claimAssessor1Data.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Data.newLockDate - claimAssessor2Data.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Data.newLockDate -
        claimAssessor1Data.lockPeriodAfterRewardReceived,
        oneWeek
      );
      assert.equal(
        claimAssessor2Data.newLockDate -
        claimAssessor2Data.lockPeriodAfterRewardReceived,
        oneWeek
      );

      assert.equal(claimAssessor1Data.rewardReceived, 0);
      assert.equal(claimAssessor2Data.rewardReceived, 0);

      assert.equal(member1Data.rewardReceived, 13.060146443378345);
      assert.equal(member2Data.rewardReceived, 8.706764295585563);
      assert.equal(member3Data.rewardReceived, 4.349902226011972);
      assert.equal(member4Data.rewardReceived, 8.699804452023944);
      assert.equal(member5Data.rewardReceived, 0);
      assert.equal(member6Data.rewardReceived, 65.18338258300017);

      assert.equal(payoutReceived, 5);
      assert.equal(coverTokensUnlockable, 25);
      assert.equal(coverTokensBurned, 0);

      let UWTokensLockedExpected = [5, 10, 15, 20, 25];
      let UWTokensBurnedExpected = [5, 10, 15, 20, 25];

      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }
    });
  });

  describe('Burning 0 tokens of a staker', function () {

    it('18.24 successful', async function () {
      const stakeTokens = toWei(200);
      await tk.approve(ps.address, stakeTokens, { from: underwriter6 });
      await ps.depositAndStake(stakeTokens, [SC1], [stakeTokens], { from: underwriter6 });

      coverID = await qd.getAllCoversOfUser(coverHolder5);

      await tf.burnStakerLockedToken(SC1, 0);
    });

    it('18.25 when stakerStakedNXM = 0', async function () {
      maxVotingTime = await cd.maxVotingTime();
      let maxStakeTime = 21600000;
      let now = await latestTime();
      closingTime = new BN(maxVotingTime.toString()).add(
        new BN((now + maxStakeTime).toString())
      );
      await increaseTimeTo(closingTime);
      await tf.burnStakerLockedToken(SC1, 10);
    });

    it('18.26 when stakerStakedNXM = 0', async function () {
      await assertRevert(p1.depositCN(0));
    });

  });
});
