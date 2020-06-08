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

const {assertRevert} = require('./utils/assertRevert');
const {advanceBlock} = require('./utils/advanceToBlock');
const {ether, toHex, toWei} = require('./utils/ethTools');
const {increaseTimeTo, duration} = require('./utils/increaseTime');
const {latestTime} = require('./utils/latestTime');
const gvProp = require('./utils/gvProposal.js').gvProposal;
const encode = require('./utils/encoder.js').encode;
const getQuoteValues = require('./utils/getQuote.js').getQuoteValues;
const getValue = require('./utils/getMCRPerThreshold.js').getValue;

const CA_ETH = '0x45544800';
const CLA = '0x434c41';
const validity = duration.days(30);

const fee = ether(0.002);
const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133';
const PID = 0;
const smartConAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const coverPeriod = 61;
const coverDetails = [1, 3362445813369838, 744892736679184, 7972408607];
const v = 28;
const r = '0x66049184fb1cf394862cca6c3b2a0c462401a671d0f2b20597d121e56768f90a';
const s = '0x4c28c8f8ff0548dd3a41d7c75621940eb4adbac13696a2796e98a59691bf53ff';
const ethereum_string = toHex('ETH');
const dai_string = toHex('DAI');

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
const BN = web3.utils.BN;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('Claim: Assessment 2', function([
  owner,
  underWriter1,
  underWriter2,
  underWriter3,
  underWriter4,
  underWriter5,
  underWriter6,
  claimAssessor1,
  claimAssessor2,
  claimAssessor3,
  claimAssessor4,
  claimAssessor5,
  coverHolder1,
  coverHolder2,
  coverHolder3,
  coverHolder4,
  coverHolder5,
  coverHolder6,
  coverHolder7,
  coverHolder8,
  coverHolder9,
  member1,
  member2,
  member3,
  member4,
  member5,
  member6
]) {
  const UNLIMITED_ALLOWANCE = new BN((2).toString())
    .pow(new BN((256).toString()))
    .sub(new BN((1).toString()));

  const SC1 = '0xef68e7c694f40c8202821edf525de3782458639f';
  const SC2 = '0x39bb259f66e1c59d5abef88375979b4d20d98022';
  const SC3 = '0x618e75ac90b12c6049ba3b27f5d5f8651b0037f6';
  const SC4 = '0x40395044Ac3c0C57051906dA938B54BD6557F212';
  const SC5 = '0xee74110fb5a1007b06282e0de5d73a61bf41d9cd';

  let coverID;
  let claimID;
  let maxVotingTime;
  let newStakerPercentage = 5;
  before(async function() {
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

    nxms = await NXMaster.deployed();
    tc = await TokenController.at(await nxms.getLatestAddress(toHex('TC')));
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    gv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
    ps = await PooledStaking.deployed();
    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);
    await DSV.setRate(25);
    await pd.changeCurrencyAssetBaseMin(ethereum_string, toWei(30));
    await tf.upgradeCapitalPool(dai.address);
    await p1.sendEther({from: owner, value: toWei(2500)});
    await pd.changeCurrencyAssetBaseMin(dai_string, toWei(750));
    await dai.transfer(p1.address, toWei(1250));
    await mcr.addMCRData(
      10000,
      0,
      toWei(6000),
      [ethereum_string, dai_string],
      [100, 2500],
      20190208
    );
    await tf.transferCurrencyAsset(toHex('ETH'), owner, toWei(2500 - 50));
    await p1.upgradeInvestmentPool(dai.address);
    // await pd.changeC(400000);
    // await pd.changeA(10);
    // await td.changeBookTime(60);
    // await mr.payJoiningFee(owner, { from: owner, value: fee });
    // await mr.kycVerdict(owner, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: owner});
    // if ((await tk.totalSupply()) < 600000 * toWei(1))
    //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
    // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));

    // const BASE_MIN_ETH = await pd.getCurrencyAssetBaseMin(ethereum_string);
    // const BASE_MIN_DAI = await pd.getCurrencyAssetBaseMin(dai_string);

    // let ia_pool_eth = await web3.eth.getBalance(p2.address);
    // let ia_pool_dai = await dai.balanceOf(p2.address);
    await mr.payJoiningFee(underWriter1, {from: underWriter1, value: fee});
    await mr.kycVerdict(underWriter1, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: underWriter1});

    await mr.payJoiningFee(underWriter2, {from: underWriter2, value: fee});
    await mr.kycVerdict(underWriter2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: underWriter2});

    await mr.payJoiningFee(underWriter3, {from: underWriter3, value: fee});
    await mr.kycVerdict(underWriter3, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: underWriter3});

    await mr.payJoiningFee(underWriter4, {from: underWriter4, value: fee});
    await mr.kycVerdict(underWriter4, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: underWriter4});

    await mr.payJoiningFee(underWriter5, {from: underWriter5, value: fee});
    await mr.kycVerdict(underWriter5, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: underWriter5});

    await mr.payJoiningFee(underWriter6, {from: underWriter6, value: fee});
    await mr.kycVerdict(underWriter6, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: underWriter6});

    await mr.payJoiningFee(claimAssessor1, {
      from: claimAssessor1,
      value: fee
    });
    await mr.kycVerdict(claimAssessor1, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: claimAssessor1});

    await mr.payJoiningFee(claimAssessor2, {
      from: claimAssessor2,
      value: fee
    });
    await mr.kycVerdict(claimAssessor2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: claimAssessor2});

    await mr.payJoiningFee(claimAssessor3, {
      from: claimAssessor3,
      value: fee
    });
    await mr.kycVerdict(claimAssessor3, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: claimAssessor3});

    await mr.payJoiningFee(claimAssessor4, {
      from: claimAssessor4,
      value: fee
    });
    await mr.kycVerdict(claimAssessor4, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: claimAssessor4});

    await mr.payJoiningFee(claimAssessor5, {
      from: claimAssessor5,
      value: fee
    });
    await mr.kycVerdict(claimAssessor5, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: claimAssessor5});

    await mr.payJoiningFee(coverHolder1, {from: coverHolder1, value: fee});
    await mr.kycVerdict(coverHolder1, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: coverHolder1});

    await mr.payJoiningFee(coverHolder2, {from: coverHolder2, value: fee});
    await mr.kycVerdict(coverHolder2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: coverHolder2});

    await mr.payJoiningFee(coverHolder3, {from: coverHolder3, value: fee});
    await mr.kycVerdict(coverHolder3, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: coverHolder3});

    await mr.payJoiningFee(coverHolder4, {from: coverHolder4, value: fee});
    await mr.kycVerdict(coverHolder4, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: coverHolder4});

    await mr.payJoiningFee(coverHolder5, {from: coverHolder5, value: fee});
    await mr.kycVerdict(coverHolder5, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: coverHolder5});

    await mr.payJoiningFee(coverHolder6, {from: coverHolder6, value: fee});
    await mr.kycVerdict(coverHolder6, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: coverHolder6});

    await mr.payJoiningFee(coverHolder7, {from: coverHolder7, value: fee});
    await mr.kycVerdict(coverHolder7, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: coverHolder7});

    await mr.payJoiningFee(coverHolder8, {from: coverHolder8, value: fee});
    await mr.kycVerdict(coverHolder8, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: coverHolder8});

    await mr.payJoiningFee(coverHolder9, {from: coverHolder9, value: fee});
    await mr.kycVerdict(coverHolder9, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: coverHolder9});

    await mr.payJoiningFee(member1, {from: member1, value: fee});
    await mr.kycVerdict(member1, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member1});

    await mr.payJoiningFee(member2, {from: member2, value: fee});
    await mr.kycVerdict(member2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member2});

    await mr.payJoiningFee(member3, {from: member3, value: fee});
    await mr.kycVerdict(member3, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member3});

    await mr.payJoiningFee(member4, {from: member4, value: fee});
    await mr.kycVerdict(member4, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member4});

    await mr.payJoiningFee(member5, {from: member5, value: fee});
    await mr.kycVerdict(member5, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member5});

    await mr.payJoiningFee(member6, {from: member6, value: fee});
    await mr.kycVerdict(member6, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member6});

    await tk.transfer(underWriter1, toWei(19095), {from: owner});
    await tk.transfer(underWriter2, toWei(16080), {from: owner});
    await tk.transfer(underWriter3, toWei(15050), {from: owner});
    await tk.transfer(underWriter4, toWei(18035), {from: owner});
    await tk.transfer(underWriter5, toWei(17065), {from: owner});
    await tk.transfer(underWriter6, toWei(19095), {from: owner});

    await tk.transfer(claimAssessor1, toWei(50000), {from: owner});
    await tk.transfer(claimAssessor2, toWei(30000), {from: owner});
    await tk.transfer(claimAssessor3, toWei(20000), {from: owner});
    await tk.transfer(claimAssessor4, toWei(60000), {from: owner});
    await tk.transfer(claimAssessor5, toWei(50000), {from: owner});

    await tk.transfer(coverHolder1, toWei(1000), {from: owner});
    await tk.transfer(coverHolder2, toWei(1000), {from: owner});
    await tk.transfer(coverHolder3, toWei(1000), {from: owner});
    await tk.transfer(coverHolder4, toWei(1000), {from: owner});
    await tk.transfer(coverHolder5, toWei(1000), {from: owner});
    await tk.transfer(coverHolder6, toWei(1000), {from: owner});
    await tk.transfer(coverHolder7, toWei(1000), {from: owner});
    await tk.transfer(coverHolder8, toWei(1000), {from: owner});
    await tk.transfer(coverHolder9, toWei(1000), {from: owner});

    await tk.transfer(member1, toWei(30000), {from: owner});
    await tk.transfer(member2, toWei(20000), {from: owner});
    await tk.transfer(member3, toWei(10000), {from: owner});
    await tk.transfer(member4, toWei(20000), {from: owner});
    await tk.transfer(member5, toWei(30000), {from: owner});
    await tk.transfer(member6, toWei(150000), {from: owner});

    const contracts = [SC1, SC2, SC3, SC4, SC5];

    const stakes = [
      {
        allocations: [
          toWei(2000),
          toWei(8000),
          toWei(9000),
          toWei(70),
          toWei(25)
        ],
        from: underWriter1
      },
      {
        allocations: [
          toWei(3000),
          toWei(5000),
          toWei(8000),
          toWei(60),
          toWei(20)
        ],
        from: underWriter2
      },
      {
        allocations: [
          toWei(4000),
          toWei(4000),
          toWei(7000),
          toWei(40),
          toWei(20)
        ],
        from: underWriter3
      },
      {
        allocations: [
          toWei(5000),
          toWei(7000),
          toWei(6000),
          toWei(30),
          toWei(20)
        ],
        from: underWriter4
      },
      {
        allocations: [
          toWei(6000),
          toWei(6000),
          toWei(5000),
          toWei(50),
          toWei(20)
        ],
        from: underWriter5
      }
    ];

    for (const stake of stakes) {
      console.log(stake);
      const allocations = stake.allocations.map(a => new BN(a.toString()));
      const stakeTokens = allocations.reduce((a, b) => BN.max(a, b), new BN(0));
      console.log(stakeTokens);
      await tk.approve(ps.address, stakeTokens, {
        from: stake.from
      });
      await ps.depositAndStake(stakeTokens, contracts, allocations, {
        from: stake.from
      });
    }

    actionHash = encode('updateUintParameters(bytes8,uint)', 'A', 10);
    await gvProp(26, actionHash, mr, gv, 2);
    val = await pd.getUintParameters(toHex('A'));
    (val[1] / 1).should.be.equal(10);

    actionHash = encode('updateUintParameters(bytes8,uint)', 'C', 400000);
    await gvProp(26, actionHash, mr, gv, 2);
    val = await pd.getUintParameters(toHex('C'));
    (val[1] / 1).should.be.equal(400000);
  });

  describe('claim test case', function() {
    let underWriters = [
      underWriter1,
      underWriter2,
      underWriter3,
      underWriter4,
      underWriter5
    ];
    let oneWeek = 604800; //  number of seconds in a week
    let UWTokensBurned = []; // size will be same as that of UWArraty
    let UWTotalBalanceBefore = [];
    let UWTotalBalanceAfter = [];
    let payoutReceived;
    let coverTokensUnlockable;
    let coverTokensBurned;
    // function timeConverter(UNIX_timestamp) {
    //   var a = new Date(UNIX_timestamp * 1000);
    //   var date = a.getDate();
    //   var month = a.getMonth();
    //   return date + '/' + month;
    // }
    it.only('18.1 Should buy cover and collect rewards', async function() {
      let allCoverPremiums = [100, 100, 200, 200, 300, 300, 400, 400, 500];
      let allLockCNDetails = []; // here all lockCN values
      let changeInUWBalance = [];

      let balanceUW = [];
      for (let i = 0; i < underWriters.length; i++) {
        balanceUW.push(0);
        changeInUWBalance.push(0);
      }
      let rewardsFlag = 1;
      async function updateUWDetails(changeInUWBalanceExpected) {
        for (let i = 0; i < underWriters.length; i++) {
          let currentUWBalance = parseFloat(
            (await tk.balanceOf(underWriters[i])) / toWei(1)
          );
          changeInUWBalance[i] = currentUWBalance - balanceUW[i];
          if (changeInUWBalance[i] != changeInUWBalanceExpected[i]) {
            rewardsFlag = -1;
          }
          balanceUW[i] = currentUWBalance;
        }
      }
      function claimAllUWRewards() {
        for (let i = 0; i < underWriters.length; i++) {
          cr.claimAllPendingReward(20, {from: underWriters[i]});
          tf.unlockStakerUnlockableTokens(underWriters[i]);
        }
      }
      // buy cover 1

      var vrsdata = await getQuoteValues(
        [
          1,
          '6570841889000000',
          '100000000000000000000',
          '3549627424',
          '7972408607001'
        ],
        ethereum_string,
        100,
        SC1,
        qt.address
      );
      await p1.makeCoverBegin(
        SC1,
        ethereum_string,
        [
          1,
          '6570841889000000',
          '100000000000000000000',
          '3549627424',
          '7972408607001'
        ],
        100,
        vrsdata[0],
        vrsdata[1],
        vrsdata[2],
        {from: coverHolder5, value: '6570841889000000'}
      );
      let lockedCN = await tf.getLockedCNAgainstCover(1);
      claimAllUWRewards();
      allLockCNDetails.push(lockedCN);
      updateUWDetails([20, 0, 0, 0, 0]);

      if ((await tk.totalSupply()) < 600000 * toWei(1))
        await p1.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      else
        await p1.burnFrom(
          owner,
          toWei(((await tk.totalSupply()) - 600000 * toWei(1)) / toWei(1))
        );
      // buy cover 2
      await dai.transfer(coverHolder3, '164271047228000000');
      await dai.approve(p1.address, '164271047228000000', {
        from: coverHolder3
      });
      vrsdata = await getQuoteValues(
        [
          25,
          '164271047228000000',
          '100000000000000000000',
          '3549627424',
          '7972408607006'
        ],
        dai_string,
        100,
        SC1,
        qt.address
      );
      await p1.makeCoverUsingCA(
        SC1,
        dai_string,
        [
          25,
          '164271047228000000',
          '100000000000000000000',
          '3549627424',
          '7972408607006'
        ],
        100,
        vrsdata[0],
        vrsdata[1],
        vrsdata[2],
        {from: coverHolder3}
      );
      lockedCN = await tf.getLockedCNAgainstCover(2);
      claimAllUWRewards();
      allLockCNDetails.push(lockedCN);
      updateUWDetails([20, 0, 0, 0, 0]);
      if ((await tk.totalSupply()) < 600000 * toWei(1))
        await p1.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      else
        await p1.burnFrom(
          owner,
          toWei(((await tk.totalSupply()) - 600000 * toWei(1)) / toWei(1))
        );

      // buy cover 3
      vrsdata = await getQuoteValues(
        [
          2,
          '26283367556000000',
          '200000000000000000000',
          '3549627424',
          '7972408607002'
        ],
        ethereum_string,
        200,
        SC2,
        qt.address
      );
      await p1.makeCoverBegin(
        SC2,
        ethereum_string,
        [
          2,
          '26283367556000000',
          '200000000000000000000',
          '3549627424',
          '7972408607002'
        ],
        200,
        vrsdata[0],
        vrsdata[1],
        vrsdata[2],
        {from: coverHolder1, value: '26283367556000000'}
      );
      lockedCN = await tf.getLockedCNAgainstCover(3);
      claimAllUWRewards();
      allLockCNDetails.push(lockedCN);
      updateUWDetails([0, 0, 40, 0, 0]);
      if ((await tk.totalSupply()) < 600000 * toWei(1))
        await p1.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      else
        await p1.burnFrom(
          owner,
          toWei(((await tk.totalSupply()) - 600000 * toWei(1)) / toWei(1))
        );

      // buy cover 4
      await dai.transfer(coverHolder2, '657084188912000000');
      await dai.approve(p1.address, '657084188912000000', {
        from: coverHolder2
      });
      vrsdata = await getQuoteValues(
        [
          50,
          '657084188912000000',
          '200000000000000000000',
          '3549627424',
          '7972408607007'
        ],
        dai_string,
        200,
        SC2,
        qt.address
      );
      await p1.makeCoverUsingCA(
        SC2,
        dai_string,
        [
          50,
          '657084188912000000',
          '200000000000000000000',
          '3549627424',
          '7972408607007'
        ],
        200,
        vrsdata[0],
        vrsdata[1],
        vrsdata[2],
        {from: coverHolder2}
      );
      lockedCN = await tf.getLockedCNAgainstCover(4);
      claimAllUWRewards();
      allLockCNDetails.push(lockedCN);
      updateUWDetails([0, 0, 40, 0, 0]);
      if ((await tk.totalSupply()) < 600000 * toWei(1))
        await p1.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      else
        await p1.burnFrom(
          owner,
          toWei(((await tk.totalSupply()) - 600000 * toWei(1)) / toWei(1))
        );

      // buy cover 5
      vrsdata = await getQuoteValues(
        [
          3,
          '59137577002000000',
          '300000000000000000000',
          '3549627424',
          '7972408607003'
        ],
        ethereum_string,
        300,
        SC3,
        qt.address
      );
      await p1.makeCoverBegin(
        SC3,
        ethereum_string,
        [
          3,
          '59137577002000000',
          '300000000000000000000',
          '3549627424',
          '7972408607003'
        ],
        300,
        vrsdata[0],
        vrsdata[1],
        vrsdata[2],
        {from: coverHolder4, value: '59137577002000000'}
      );
      lockedCN = await tf.getLockedCNAgainstCover(5);
      claimAllUWRewards();
      allLockCNDetails.push(lockedCN);
      updateUWDetails([0, 0, 0, 0, 60]);
      if ((await tk.totalSupply()) < 600000 * toWei(1))
        await p1.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      else
        await p1.burnFrom(
          owner,
          toWei(((await tk.totalSupply()) - 600000 * toWei(1)) / toWei(1))
        );

      // buy cover 6
      await dai.transfer(coverHolder6, '1478439425051000000');
      await dai.approve(p1.address, '1478439425051000000', {
        from: coverHolder6
      });
      vrsdata = await getQuoteValues(
        [
          75,
          '1478439425051000000',
          '300000000000000000000',
          '3549627424',
          '7972408607008'
        ],
        dai_string,
        300,
        SC3,
        qt.address
      );
      await p1.makeCoverUsingCA(
        SC3,
        dai_string,
        [
          75,
          '1478439425051000000',
          '300000000000000000000',
          '3549627424',
          '7972408607008'
        ],
        300,
        vrsdata[0],
        vrsdata[1],
        vrsdata[2],
        {from: coverHolder6}
      );
      lockedCN = await tf.getLockedCNAgainstCover(6);
      claimAllUWRewards();
      allLockCNDetails.push(lockedCN);
      updateUWDetails([0, 0, 0, 0, 60]);
      if ((await tk.totalSupply()) < 600000 * toWei(1))
        await p1.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      else
        await p1.burnFrom(
          owner,
          toWei(((await tk.totalSupply()) - 600000 * toWei(1)) / toWei(1))
        );

      // buy cover 7
      vrsdata = await getQuoteValues(
        [
          4,
          '105133470226000000',
          '400000000000000000000',
          '3549627424',
          '7972408607004'
        ],
        ethereum_string,
        400,
        SC4,
        qt.address
      );
      await p1.makeCoverBegin(
        SC4,
        ethereum_string,
        [
          4,
          '105133470226000000',
          '400000000000000000000',
          '3549627424',
          '7972408607004'
        ],
        400,
        vrsdata[0],
        vrsdata[1],
        vrsdata[2],
        {from: coverHolder7, value: '105133470226000000'}
      );
      lockedCN = await tf.getLockedCNAgainstCover(7);
      claimAllUWRewards();
      allLockCNDetails.push(lockedCN);
      updateUWDetails([0, 20, 20, 15, 25]);
      if ((await tk.totalSupply()) < 600000 * toWei(1))
        await p1.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      else
        await p1.burnFrom(
          owner,
          toWei(((await tk.totalSupply()) - 600000 * toWei(1)) / toWei(1))
        );

      // buy cover 8
      await dai.transfer(coverHolder8, '2628336755647000000');
      await dai.approve(p1.address, '2628336755647000000', {
        from: coverHolder8
      });
      vrsdata = await getQuoteValues(
        [
          100,
          '2628336755647000000',
          '400000000000000000000',
          '3549627424',
          '7972408607009'
        ],
        dai_string,
        400,
        SC4,
        qt.address
      );
      await p1.makeCoverUsingCA(
        SC4,
        dai_string,
        [
          100,
          '2628336755647000000',
          '400000000000000000000',
          '3549627424',
          '7972408607009'
        ],
        400,
        vrsdata[0],
        vrsdata[1],
        vrsdata[2],
        {from: coverHolder8}
      );
      lockedCN = await tf.getLockedCNAgainstCover(8);
      claimAllUWRewards();

      allLockCNDetails.push(lockedCN);
      updateUWDetails([35, 10, 0, 0, 0]);
      if ((await tk.totalSupply()) < 600000 * toWei(1))
        await p1.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      else
        await p1.burnFrom(
          owner,
          toWei(((await tk.totalSupply()) - 600000 * toWei(1)) / toWei(1))
        );

      // buy cover 9
      vrsdata = await getQuoteValues(
        [
          5,
          '164271047228000000',
          '500000000000000000000',
          '3549627424',
          '7972408607005'
        ],
        ethereum_string,
        500,
        SC5,
        qt.address
      );
      await p1.makeCoverBegin(
        SC5,
        ethereum_string,
        [
          5,
          '164271047228000000',
          '500000000000000000000',
          '3549627424',
          '7972408607005'
        ],
        500,
        vrsdata[0],
        vrsdata[1],
        vrsdata[2],
        {from: coverHolder9, value: '164271047228000000'}
      );
      lockedCN = await tf.getLockedCNAgainstCover(9);
      claimAllUWRewards();

      allLockCNDetails.push(lockedCN);
      updateUWDetails([12.5, 10, 5, 2.5, 7.5]);
      if ((await tk.totalSupply()) < 600000 * toWei(1))
        await p1.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      else
        await p1.burnFrom(
          owner,
          toWei(((await tk.totalSupply()) - 600000 * toWei(1)) / toWei(1))
        );

      await tf.upgradeCapitalPool(dai.address);
      await p1.sendEther({from: owner, value: 50 * toWei(1)});
      await dai.transfer(p1.address, toWei(1250));
      let lockCNFlag = 1;
      for (let i = 0; i < underWriters.length; i++) {
        if (allCoverPremiums[i] * 0.1 * toWei(1) != allLockCNDetails[i])
          lockCNFlag = -1;
      }
      await rewardsFlag.should.equal(1);
      await lockCNFlag.should.equal(1);
    });

    // it('18.2 Should not be able to updateStakerCommission if premiumNXM is 0', async function() {
    //   await tf.updateStakerCommissions(SC1, 0, { from: owner });
    // });

    // it('18.3 Calling updateStakerCommissions when max commission is reached which is in case of buying cover 7 for SC4', async function() {
    //   // after calling make cover begin for SC4, all UW's recived 50% (max) of their staked as commission so calling the funtion in the next line has no effect
    //   await tf.updateStakerCommissions(SC4, 400000000000000000000, {
    //     from: owner
    //   });
    //   // the above function is simply run but has no effect for else part of if (maxCommission > commissionEarned)
    // });

    it('18.4 should pass for CA vote > 10 SA and majority > 70 % for reject(D1)', async function() {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardRecieved,
          lockPeriodAfterRewardRecieved
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardRecieved = lockPeriodAfterRewardRecieved;
          this.rewardRecieved = rewardRecieved;
        }
      }
      let claimAssessor1Object = new claimAssessor();
      let claimAssessor2Object = new claimAssessor();
      let claimAssessor3Object = new claimAssessor();

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }
      await tc.lock(CLA, toWei(50000), validity, {from: claimAssessor1});
      await tc.lock(CLA, toWei(30000), validity, {from: claimAssessor2});
      await tc.lock(CLA, toWei(20000), validity, {from: claimAssessor3});
      // cannot withdraw/switch membership as it has staked tokens
      await assertRevert(mr.withdrawMembership({from: claimAssessor1}));
      await assertRevert(
        mr.switchMembership(tc.address, {from: claimAssessor1})
      );

      coverID = await qd.getAllCoversOfUser(coverHolder5);

      // try submitting an invalid cover ID
      await assertRevert(tf.depositCN(46, {from: owner}));

      await cl.submitClaim(coverID[0], {from: coverHolder5});
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      // try submitting the same claim again (to pass the TokenData.sol setDepositCN's require condition of the coverage report)
      // await assertRevert(cl.submitClaim(coverID[0], { from: coverHolder5 }));
      await assertRevert(td.setDepositCN(coverID[0], true, {from: owner}));

      let now = await latestTime();
      claimID = (await cd.actualClaimLength()) - 1;

      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      // tries to burn CA votes, but reverts as not auth to governed
      await assertRevert(tf.burnCAToken(claimID, 10, claimAssessor1));

      await cl.submitCAVote(claimID, -1, {from: claimAssessor1});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor2});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor3});

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      minVotingTime = await cd.minVotingTime();

      closingTime = new BN(minVotingTime.toString()).add(
        new BN(now.toString())
      );
      await increaseTimeTo(
        new BN(closingTime.toString()).sub(new BN((10).toString()))
      );

      await p1.__callback(APIID, '');

      assert.equal(parseFloat((await cd.getClaimStatusNumber(claimID))[1]), 0);

      // check the CA vote not closing before the minimum time is reached even if the CA Vote is greater than 10*SA
      await increaseTimeTo(
        new BN(closingTime.toString()).add(new BN((10).toString()))
      );

      let coverTokensLockedBefore = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder5, coverID)
      );
      let tokenBalanceBefore = parseFloat(await tk.balanceOf(coverHolder5));
      let totalBalanceBefore = parseFloat(
        await tc.totalBalanceOf(coverHolder5)
      );
      let balanceBefore = parseFloat(await web3.eth.getBalance(coverHolder5));

      // changing the claim status here
      await p1.__callback(APIID, '');

      let balanceAfter = parseFloat(await web3.eth.getBalance(coverHolder5));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder5));
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder5));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder5, coverID)
      );

      payoutReceived = (balanceAfter - balanceBefore) / toWei(1);
      coverTokensUnlockable =
        (tokenBalanceBefore - tokenBalanceAfter) / toWei(1);
      coverTokensBurned = Number(
        ((totalBalanceBefore - totalBalanceAfter) / toWei(1)).toFixed(2)
      );

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);

      let proposalIds = [];
      await cr.claimAllPendingReward(20, {from: claimAssessor1});
      await cr.claimAllPendingReward(20, {from: claimAssessor2});
      await cr.claimAllPendingReward(20, {from: claimAssessor3});

      await tf.unlockStakerUnlockableTokens(claimAssessor1);
      await tf.unlockStakerUnlockableTokens(claimAssessor2);
      await tf.unlockStakerUnlockableTokens(claimAssessor3);

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      let UWTokensLocked = [];
      for (let i = 0; i < underWriters.length; i++) {
        UWTokensLocked.push(
          (parseFloat(
            await tf.getStakerLockedTokensOnSmartContract(
              underWriters[i],
              SC1,
              i
            )
          ) -
            parseFloat(
              await tf.getStakerUnlockableTokensOnSmartContract(
                underWriters[i],
                SC1,
                0
              )
            )) /
            toWei(1)
        );
        UWTokensBurned[i] = UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i];
      }

      assert.equal(
        claimAssessor1Object.newLockDate - claimAssessor1Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate - claimAssessor2Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate - claimAssessor3Object.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Object.newLockDate -
          claimAssessor1Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate -
          claimAssessor2Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate -
          claimAssessor3Object.lockPeriodAfterRewardRecieved,
        0
      );

      assert.equal(claimAssessor1Object.rewardRecieved, 12.5);
      assert.equal(claimAssessor2Object.rewardRecieved, 7.5);
      assert.equal(claimAssessor3Object.rewardRecieved, 0);

      assert.equal(payoutReceived, 0);
      assert.equal(coverTokensUnlockable, 0);
      assert.equal(coverTokensBurned, 5.0);

      let UWTokensLockedExpected = [2000, 3000, 4000, 5000, 6000];
      let UWTokensBurnedExpected = [0, 0, 0, 0, 0];
      for (let i = 0; i < underWriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
    });

    it('18.5 should pass for CA vote > 10 SA and majority > 70 % for accept(A1)', async function() {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardRecieved,
          lockPeriodAfterRewardRecieved
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardRecieved = lockPeriodAfterRewardRecieved;
          this.rewardRecieved = rewardRecieved;
        }
      }
      let claimAssessor1Object = new claimAssessor();
      let claimAssessor2Object = new claimAssessor();
      let claimAssessor3Object = new claimAssessor();

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      // need not to do the lock again
      // await tc.lock(CLA, 50000 * toWei(1), validity, {from: claimAssessor1});
      // await tc.lock(CLA, 30000 * toWei(1), validity, {from: claimAssessor2});
      // await tc.lock(CLA, 20000 * toWei(1), validity, {from: claimAssessor3});

      coverID = await qd.getAllCoversOfUser(coverHolder5);
      await cl.submitClaim(coverID[0], {from: coverHolder5});
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimID = (await cd.actualClaimLength()) - 1;

      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      await cl.submitCAVote(claimID, 1, {from: claimAssessor1});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor2});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor3});

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.newLockDate = parseFloat(
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
        await tf.getUserLockedCNTokens(coverHolder5, coverID)
      );
      let tokenBalanceBefore = parseFloat(await tk.balanceOf(coverHolder5));
      let balanceBefore = await web3.eth.getBalance(coverHolder5);
      let totalBalanceBefore = parseFloat(
        await tc.totalBalanceOf(coverHolder5)
      );

      let UWTokensLocked = [];
      for (let i = 0; i < underWriters.length; i++) {
        UWTokensLocked.push(
          (parseFloat(
            await tf.getStakerLockedTokensOnSmartContract(
              underWriters[i],
              SC1,
              i
            )
          ) -
            parseFloat(
              await tf.getStakerUnlockableTokensOnSmartContract(
                underWriters[i],
                SC1,
                0
              )
            )) /
            toWei(1)
        );
      }
      // changing the claim status here
      await p1.__callback(APIID, '');

      let balanceAfter = await web3.eth.getBalance(coverHolder5);
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder5));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder5, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder5));

      coverTokensBurned = Number(
        ((totalBalanceBefore - totalBalanceAfter) / toWei(1)).toFixed(2)
      );
      payoutReceived = Number(
        ((balanceAfter - balanceBefore) / toWei(1)).toFixed(2)
      );
      coverTokensUnlockable = Number(
        ((tokenBalanceAfter - tokenBalanceBefore) / toWei(1)).toFixed(2)
      );

      now = await latestTime();

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);

      let proposalIds = [];
      await cr.claimAllPendingReward(20, {from: claimAssessor1});
      await cr.claimAllPendingReward(20, {from: claimAssessor2});
      await cr.claimAllPendingReward(20, {from: claimAssessor3});

      await tf.unlockStakerUnlockableTokens(claimAssessor1);
      await tf.unlockStakerUnlockableTokens(claimAssessor2);
      await tf.unlockStakerUnlockableTokens(claimAssessor3);

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      for (let i = 0; i < underWriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Object.newLockDate - claimAssessor1Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate - claimAssessor2Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate - claimAssessor3Object.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Object.newLockDate -
          claimAssessor1Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate -
          claimAssessor2Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate -
          claimAssessor3Object.lockPeriodAfterRewardRecieved,
        0
      );

      assert.equal(claimAssessor1Object.rewardRecieved, 12.5);
      assert.equal(claimAssessor2Object.rewardRecieved, 7.5);
      assert.equal(claimAssessor3Object.rewardRecieved, 0);

      assert.equal(payoutReceived, 1);
      assert.equal(coverTokensUnlockable, 5);
      assert.equal(coverTokensBurned, 0);

      let UWTokensLockedExpected = [2000, 3000, 4000, 5000, 6000];
      let UWTokensBurnedExpected = [2000, 3000, 4000, 1000, 0];

      // to verify, the staker staked burned by index
      assert.equal(
        parseFloat(await td.getStakerStakedBurnedByIndex(underWriter1, 0)) /
          toWei(1),
        2000
      );

      // befor the last burn happened, all UW 2000 were staked and none was unlocked befor the voting closed.
      assert.equal(
        parseFloat(
          await td.getStakerStakedUnlockableBeforeLastBurnByIndex(
            underWriter1,
            0
          )
        ) / toWei(1),
        0
      );

      for (let i = 0; i < underWriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));

      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.6 should pass for CA vote > 10 SA and majority < 70%, open for member vote and majority reject(D3)', async function() {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardRecieved,
          lockPeriodAfterRewardRecieved
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardRecieved = lockPeriodAfterRewardRecieved;
          this.rewardRecieved = rewardRecieved;
        }
      }
      class member {
        constructor(rewardRecieved) {
          this.rewardRecieved = rewardRecieved;
        }
      }
      let claimAssessor1Object = new claimAssessor();
      let claimAssessor2Object = new claimAssessor();
      let claimAssessor3Object = new claimAssessor();
      let member1Object = new member();
      let member2Object = new member();
      let member3Object = new member();

      // need not to do the lock again
      // await tc.lock(CLA, 50000 * toWei(1), validity, {from: claimAssessor1});
      // await tc.lock(CLA, 30000 * toWei(1), validity, {from: claimAssessor2});
      // await tc.lock(CLA, 20000 * toWei(1), validity, {from: claimAssessor3});
      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underWriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(
                underWriters[i],
                SC1,
                i
              )
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  underWriters[i],
                  SC1,
                  0
                )
              )) /
              toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder3);
      await cl.submitClaim(coverID[0], {from: coverHolder3});
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      await cl.submitCAVote(claimID, 1, {from: claimAssessor1});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor2});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor3});

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.newLockDate = parseFloat(
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
        await tf.getUserLockedCNTokens(coverHolder3, coverID)
      );
      let tokenBalanceBefore = parseFloat(await tk.balanceOf(coverHolder3));
      let balanceBefore = await dai.balanceOf(coverHolder3);
      let totalBalanceBefore = parseFloat(
        await tc.totalBalanceOf(coverHolder3)
      );

      // // changing the claim status here
      await p1.__callback(APIID, '');

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, -1, {from: member1});
      await cl.submitMemberVote(claimID, -1, {from: member2});
      await cl.submitMemberVote(claimID, 1, {from: member3});

      // cannot withdraw/switch membership as member has voted
      await assertRevert(mr.withdrawMembership({from: member1}));
      await assertRevert(mr.switchMembership(tc.address, {from: member1}));
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
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(20, {from: claimAssessor1});
      await cr.claimAllPendingReward(20, {from: claimAssessor2});
      await cr.claimAllPendingReward(20, {from: claimAssessor3});

      await tf.unlockStakerUnlockableTokens(claimAssessor1);
      await tf.unlockStakerUnlockableTokens(claimAssessor2);
      await tf.unlockStakerUnlockableTokens(claimAssessor3);

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      member1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / toWei(1);

      await cr.claimAllPendingReward(20, {from: member1});
      await cr.claimAllPendingReward(20, {from: member2});
      await cr.claimAllPendingReward(20, {from: member3});
      await tf.unlockStakerUnlockableTokens(member1);
      await tf.unlockStakerUnlockableTokens(member2);
      await tf.unlockStakerUnlockableTokens(member3);

      let balanceAfter = await dai.balanceOf(coverHolder3);
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder3));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder3, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder3));

      coverTokensBurned = Number(
        ((totalBalanceBefore - totalBalanceAfter) / toWei(1)).toFixed(2)
      );
      payoutReceived = Number(
        ((balanceAfter - balanceBefore) / toWei(1)).toFixed(2)
      );
      coverTokensUnlockable = Number(
        ((tokenBalanceAfter - tokenBalanceBefore) / toWei(1)).toFixed(2)
      );

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      for (let i = 0; i < underWriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Object.newLockDate - claimAssessor1Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate - claimAssessor2Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate - claimAssessor3Object.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Object.newLockDate -
          claimAssessor1Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate -
          claimAssessor2Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate -
          claimAssessor3Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );

      assert.equal(claimAssessor1Object.rewardRecieved, 0);
      assert.equal(claimAssessor2Object.rewardRecieved, 0);
      assert.equal(claimAssessor3Object.rewardRecieved, 0);

      assert.equal(member1Object.rewardRecieved, 12);
      assert.equal(member2Object.rewardRecieved, 8);
      assert.equal(member3Object.rewardRecieved, 0);

      assert.equal(payoutReceived, 0);
      assert.equal(coverTokensUnlockable, 0);
      assert.equal(coverTokensBurned, 5.0);

      let UWTokensLockedExpected = [0, 0, 0, 4000, 6000];
      let UWTokensBurnedExpected = [0, 0, 0, 0, 0];
      for (let i = 0; i < underWriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.7 should pass for CA vote > 10 SA and majority < 70%, open for member vote and majority accept(A3)', async function() {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardRecieved,
          lockPeriodAfterRewardRecieved
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardRecieved = lockPeriodAfterRewardRecieved;
          this.rewardRecieved = rewardRecieved;
        }
      }
      class member {
        constructor(rewardRecieved) {
          this.rewardRecieved = rewardRecieved;
        }
      }
      let claimAssessor1Object = new claimAssessor();
      let claimAssessor2Object = new claimAssessor();
      let claimAssessor3Object = new claimAssessor();
      let member1Object = new member();
      let member2Object = new member();
      let member3Object = new member();

      // need not to do the lock again
      // await tc.lock(CLA, 50000 * toWei(1), validity, {from: claimAssessor1});
      // await tc.lock(CLA, 30000 * toWei(1), validity, {from: claimAssessor2});
      // await tc.lock(CLA, 20000 * toWei(1), validity, {from: claimAssessor3});
      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underWriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(
                underWriters[i],
                SC1,
                i
              )
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  underWriters[i],
                  SC1,
                  0
                )
              )) /
              toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder3);
      await cl.submitClaim(coverID[0], {from: coverHolder3});
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      await cl.submitCAVote(claimID, -1, {from: claimAssessor1});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor2});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor3});

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.newLockDate = parseFloat(
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
        await tf.getUserLockedCNTokens(coverHolder3, coverID)
      );
      let tokenBalanceBefore = parseFloat(await tk.balanceOf(coverHolder3));
      let balanceBefore = parseFloat(await dai.balanceOf(coverHolder3));
      let totalBalanceBefore = parseFloat(
        await tc.totalBalanceOf(coverHolder3)
      );

      // // changing the claim status here
      await p1.__callback(APIID, '');

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, {from: member1});
      await cl.submitMemberVote(claimID, 1, {from: member2});
      await cl.submitMemberVote(claimID, -1, {from: member3});

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
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(20, {from: claimAssessor1});
      await cr.claimAllPendingReward(20, {from: claimAssessor2});
      await cr.claimAllPendingReward(20, {from: claimAssessor3});

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      member1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / toWei(1);

      await cr.claimAllPendingReward(20, {from: member1});
      await cr.claimAllPendingReward(20, {from: member2});
      await cr.claimAllPendingReward(20, {from: member3});

      let balanceAfter = parseFloat(await dai.balanceOf(coverHolder3));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder3));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder3, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder3));

      coverTokensBurned = Number(
        ((totalBalanceBefore - totalBalanceAfter) / toWei(1)).toFixed(2)
      );
      payoutReceived = Number(
        ((balanceAfter - balanceBefore) / toWei(1)).toFixed(2)
      );
      coverTokensUnlockable = Number(
        ((tokenBalanceAfter - tokenBalanceBefore) / toWei(1)).toFixed(2)
      );

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      for (let i = 0; i < underWriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Object.newLockDate - claimAssessor1Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate - claimAssessor2Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate - claimAssessor3Object.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Object.newLockDate -
          claimAssessor1Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate -
          claimAssessor2Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate -
          claimAssessor3Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );

      assert.equal(claimAssessor1Object.rewardRecieved, 0);
      assert.equal(claimAssessor2Object.rewardRecieved, 0);
      assert.equal(claimAssessor3Object.rewardRecieved, 0);

      assert.equal(member1Object.rewardRecieved, 12);
      assert.equal(member2Object.rewardRecieved, 8);
      assert.equal(member3Object.rewardRecieved, 0);

      assert.equal(payoutReceived, 25);
      assert.equal(coverTokensUnlockable, 5);
      assert.equal(coverTokensBurned, 0);

      let UWTokensLockedExpected = [0, 0, 0, 4000, 6000];
      let UWTokensBurnedExpected = [0, 0, 0, 4000, 6000];
      for (let i = 0; i < underWriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.8 should pass for CA vote > 10 SA and majority < 70%, open for member vote and MV<5 SA and CA majority reject(D4)', async function() {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardRecieved,
          lockPeriodAfterRewardRecieved
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardRecieved = lockPeriodAfterRewardRecieved;
          this.rewardRecieved = rewardRecieved;
        }
      }
      class member {
        constructor(rewardRecieved) {
          this.rewardRecieved = rewardRecieved;
        }
      }
      let claimAssessor1Object = new claimAssessor();
      let claimAssessor2Object = new claimAssessor();
      let claimAssessor3Object = new claimAssessor();
      let claimAssessor4Object = new claimAssessor();
      let claimAssessor5Object = new claimAssessor();
      let member1Object = new member();
      let member2Object = new member();
      let member3Object = new member();

      underWriters = [
        underWriter3,
        underWriter2,
        underWriter5,
        underWriter4,
        underWriter1
      ];
      // need not to do the lock again
      // await tc.lock(CLA, 50000 * toWei(1), validity, {from: claimAssessor1});
      // await tc.lock(CLA, 30000 * toWei(1), validity, {from: claimAssessor2});
      // await tc.lock(CLA, 20000 * toWei(1), validity, {from: claimAssessor3});

      await tc.lock(CLA, toWei(60000), validity, {from: claimAssessor4});
      await tc.lock(CLA, toWei(50000), validity, {from: claimAssessor5});

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underWriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(
                underWriters[i],
                SC2,
                i
              )
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  underWriters[i],
                  SC2,
                  1
                )
              )) /
              toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder1);
      await cl.submitClaim(coverID[0], {from: coverHolder1});
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );
      await cl.submitCAVote(claimID, 1, {from: claimAssessor1});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor2});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor3});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor4});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor5});

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.newLockDate = parseFloat(
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
        await tf.getUserLockedCNTokens(coverHolder1, coverID)
      );
      let tokenBalanceBefore = parseFloat(await tk.balanceOf(coverHolder1));
      let balanceBefore = parseFloat(await web3.eth.getBalance(coverHolder1));
      let totalBalanceBefore = parseFloat(
        await tc.totalBalanceOf(coverHolder1)
      );

      // // changing the claim status here
      await p1.__callback(APIID, '');

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);
      claimAssessor4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        toWei(1);
      claimAssessor5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor5)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, {from: member1});
      await cl.submitMemberVote(claimID, 1, {from: member2});
      await cl.submitMemberVote(claimID, 1, {from: member3});

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
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(20, {from: claimAssessor1});
      await cr.claimAllPendingReward(20, {from: claimAssessor2});
      await cr.claimAllPendingReward(20, {from: claimAssessor3});
      await cr.claimAllPendingReward(20, {from: claimAssessor4});
      await cr.claimAllPendingReward(20, {from: claimAssessor5});

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );

      member1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / toWei(1);

      await cr.claimAllPendingReward(20, {from: member1});
      await cr.claimAllPendingReward(20, {from: member2});
      await cr.claimAllPendingReward(20, {from: member3});

      await tf.unlockStakerUnlockableTokens(member1);
      await tf.unlockStakerUnlockableTokens(member2);
      await tf.unlockStakerUnlockableTokens(member3);

      let balanceAfter = parseFloat(await web3.eth.getBalance(coverHolder1));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder1));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder1, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder1));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / toWei(1)
      ).toFixed(2);
      payoutReceived = Number(
        (balanceAfter - balanceBefore) / toWei(1)
      ).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / toWei(1)
      ).toFixed(2);

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      for (let i = 0; i < underWriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Object.newLockDate - claimAssessor1Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate - claimAssessor2Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate - claimAssessor3Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor4Object.newLockDate - claimAssessor4Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor5Object.newLockDate - claimAssessor5Object.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Object.newLockDate -
          claimAssessor1Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate -
          claimAssessor2Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate -
          claimAssessor3Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor4Object.newLockDate -
          claimAssessor4Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor5Object.newLockDate -
          claimAssessor5Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );

      assert.equal(claimAssessor1Object.rewardRecieved, 0);
      assert.equal(claimAssessor2Object.rewardRecieved, 0);
      assert.equal(claimAssessor3Object.rewardRecieved, 0);
      assert.equal(claimAssessor4Object.rewardRecieved, 0);
      assert.equal(claimAssessor5Object.rewardRecieved, 0);

      assert.equal(member1Object.rewardRecieved, 0);
      assert.equal(member2Object.rewardRecieved, 0);
      assert.equal(member3Object.rewardRecieved, 0);

      assert.equal(payoutReceived, 0);
      assert.equal(coverTokensUnlockable, 0);
      assert.equal(coverTokensBurned, 10);

      let UWTokensLockedExpected = [4000, 5000, 6000, 7000, 8000];
      let UWTokensBurnedExpected = [0, 0, 0, 0, 0];

      for (let i = 0; i < underWriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.9 should pass for CA vote > 10 SA and majority < 70%, open for member vote and MV<5 SA and CA majority accept(A4)', async function() {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardRecieved,
          lockPeriodAfterRewardRecieved
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardRecieved = lockPeriodAfterRewardRecieved;
          this.rewardRecieved = rewardRecieved;
        }
      }
      class member {
        constructor(rewardRecieved) {
          this.rewardRecieved = rewardRecieved;
        }
      }
      let claimAssessor1Object = new claimAssessor();
      let claimAssessor2Object = new claimAssessor();
      let claimAssessor3Object = new claimAssessor();
      let claimAssessor4Object = new claimAssessor();
      let claimAssessor5Object = new claimAssessor();
      let member1Object = new member();
      let member2Object = new member();
      let member3Object = new member();

      underWriters = [
        underWriter3,
        underWriter2,
        underWriter5,
        underWriter4,
        underWriter1
      ];

      // need not to do the lock again
      // await tc.lock(CLA, 50000 * toWei(1), validity, {from: claimAssessor1});
      // await tc.lock(CLA, 30000 * toWei(1), validity, {from: claimAssessor2});
      // await tc.lock(CLA, 20000 * toWei(1), validity, {from: claimAssessor3});

      // await tc.lock(CLA, 60000 * toWei(1), validity, {from: claimAssessor4});
      // await tc.lock(CLA, 50000 * toWei(1), validity, {from: claimAssessor5});
      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underWriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(
                underWriters[i],
                SC2,
                i
              )
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  underWriters[i],
                  SC2,
                  1
                )
              )) /
              toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder1);
      await cl.submitClaim(coverID[0], {from: coverHolder1});
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );
      await cl.submitCAVote(claimID, -1, {from: claimAssessor1});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor2});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor3});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor4});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor5});

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.newLockDate = parseFloat(
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
        await tf.getUserLockedCNTokens(coverHolder1, coverID)
      );
      let tokenBalanceBefore = parseFloat(await tk.balanceOf(coverHolder1));
      let balanceBefore = parseFloat(await web3.eth.getBalance(coverHolder1));
      let totalBalanceBefore = parseFloat(
        await tc.totalBalanceOf(coverHolder1)
      );

      // // changing the claim status here
      await p1.__callback(APIID, '');

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);
      claimAssessor4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        toWei(1);
      claimAssessor5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor5)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, {from: member1});
      await cl.submitMemberVote(claimID, 1, {from: member2});
      await cl.submitMemberVote(claimID, 1, {from: member3});

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
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(20, {from: claimAssessor1});
      await cr.claimAllPendingReward(20, {from: claimAssessor2});
      await cr.claimAllPendingReward(20, {from: claimAssessor3});
      await cr.claimAllPendingReward(20, {from: claimAssessor4});
      await cr.claimAllPendingReward(20, {from: claimAssessor5});

      await tf.unlockStakerUnlockableTokens(claimAssessor1);
      await tf.unlockStakerUnlockableTokens(claimAssessor2);
      await tf.unlockStakerUnlockableTokens(claimAssessor3);
      await tf.unlockStakerUnlockableTokens(claimAssessor4);
      await tf.unlockStakerUnlockableTokens(claimAssessor5);

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );

      member1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / toWei(1);

      await cr.claimAllPendingReward(20, {from: member1});
      await cr.claimAllPendingReward(20, {from: member2});
      await cr.claimAllPendingReward(20, {from: member3});

      await tf.unlockStakerUnlockableTokens(member1);
      await tf.unlockStakerUnlockableTokens(member2);
      await tf.unlockStakerUnlockableTokens(member3);

      let balanceAfter = parseFloat(await web3.eth.getBalance(coverHolder1));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder1));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder1, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder1));

      payoutReceived = (balanceAfter - balanceBefore) / toWei(1);
      coverTokensUnlockable =
        (tokenBalanceAfter - tokenBalanceBefore) / toWei(1);
      coverTokensBurned =
        (coverTokensLockedBefore - coverTokensLockedAfter) / toWei(1);

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / toWei(1)
      ).toFixed(2);
      payoutReceived = Number(
        (balanceAfter - balanceBefore) / toWei(1)
      ).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / toWei(1)
      ).toFixed(2);

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      for (let i = 0; i < underWriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Object.newLockDate - claimAssessor1Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate - claimAssessor2Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate - claimAssessor3Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor4Object.newLockDate - claimAssessor4Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor5Object.newLockDate - claimAssessor5Object.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Object.newLockDate -
          claimAssessor1Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate -
          claimAssessor2Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate -
          claimAssessor3Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor4Object.newLockDate -
          claimAssessor4Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor5Object.newLockDate -
          claimAssessor5Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );

      assert.equal(claimAssessor1Object.rewardRecieved, 0);
      assert.equal(claimAssessor2Object.rewardRecieved, 0);
      assert.equal(claimAssessor3Object.rewardRecieved, 0);
      assert.equal(claimAssessor4Object.rewardRecieved, 0);
      assert.equal(claimAssessor5Object.rewardRecieved, 0);

      assert.equal(member1Object.rewardRecieved, 0);
      assert.equal(member2Object.rewardRecieved, 0);
      assert.equal(member3Object.rewardRecieved, 0);

      assert.equal(payoutReceived, 2);
      assert.equal(coverTokensUnlockable, 10);
      assert.equal(coverTokensBurned, 0);

      let UWTokensLockedExpected = [4000, 5000, 6000, 7000, 8000];
      let UWTokensBurnedExpected = [4000, 5000, 6000, 5000, 0];
      for (let i = 0; i < underWriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.10 should pass for CA vote > 5SA and <10 SA and majority < 70%, open for member vote and majority reject(D3)', async function() {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardRecieved,
          lockPeriodAfterRewardRecieved
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardRecieved = lockPeriodAfterRewardRecieved;
          this.rewardRecieved = rewardRecieved;
        }
      }
      class member {
        constructor(rewardRecieved) {
          this.rewardRecieved = rewardRecieved;
        }
      }
      let claimAssessor1Object = new claimAssessor();
      let claimAssessor2Object = new claimAssessor();
      let claimAssessor3Object = new claimAssessor();
      let claimAssessor4Object = new claimAssessor();

      let member1Object = new member();
      let member2Object = new member();
      let member3Object = new member();
      let member4Object = new member();
      let member5Object = new member();

      underWriters = [
        underWriter3,
        underWriter2,
        underWriter5,
        underWriter4,
        underWriter1
      ];

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underWriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(
                underWriters[i],
                SC2,
                i
              )
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  underWriters[i],
                  SC2,
                  1
                )
              )) /
              toWei(1)
          ).toFixed(2)
        );
      }

      // need not to do the lock again
      // await tc.lock(CLA, 50000 * toWei(1), validity, {from: claimAssessor1});
      // await tc.lock(CLA, 30000 * toWei(1), validity, {from: claimAssessor2});
      // await tc.lock(CLA, 20000 * toWei(1), validity, {from: claimAssessor3});

      // await tc.lock(CLA, 60000 * toWei(1), validity, {from: claimAssessor4});
      // await tc.lock(CLA, 50000 * toWei(1), validity, {from: claimAssessor5});

      coverID = await qd.getAllCoversOfUser(coverHolder2);
      await cl.submitClaim(coverID[0], {from: coverHolder2});
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );

      await cl.submitCAVote(claimID, 1, {from: claimAssessor1});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor2});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor3});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor4});

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
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
        await tf.getUserLockedCNTokens(coverHolder2, coverID)
      );
      let tokenBalanceBefore = parseFloat(await tk.balanceOf(coverHolder2));
      let balanceBefore = parseFloat(await dai.balanceOf(coverHolder2));
      let totalBalanceBefore = parseFloat(
        await tc.totalBalanceOf(coverHolder2)
      );

      // // changing the claim status here
      await p1.__callback(APIID, '');

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);
      claimAssessor4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, -1, {from: member1});
      await cl.submitMemberVote(claimID, -1, {from: member2});
      await cl.submitMemberVote(claimID, -1, {from: member3});
      await cl.submitMemberVote(claimID, -1, {from: member4});
      await cl.submitMemberVote(claimID, 1, {from: member5});

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
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(20, {from: claimAssessor1});
      await cr.claimAllPendingReward(20, {from: claimAssessor2});
      await cr.claimAllPendingReward(20, {from: claimAssessor3});
      await cr.claimAllPendingReward(20, {from: claimAssessor4});

      await tf.unlockStakerUnlockableTokens(claimAssessor1);
      await tf.unlockStakerUnlockableTokens(claimAssessor2);
      await tf.unlockStakerUnlockableTokens(claimAssessor3);
      await tf.unlockStakerUnlockableTokens(claimAssessor4);

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );

      member1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / toWei(1);
      member4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member4)) / toWei(1);
      member5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member5)) / toWei(1);

      await cr.claimAllPendingReward(20, {from: member1});
      await cr.claimAllPendingReward(20, {from: member2});
      await cr.claimAllPendingReward(20, {from: member3});
      await cr.claimAllPendingReward(20, {from: member4});
      await cr.claimAllPendingReward(20, {from: member5});

      await tf.unlockStakerUnlockableTokens(member1);
      await tf.unlockStakerUnlockableTokens(member2);
      await tf.unlockStakerUnlockableTokens(member3);
      await tf.unlockStakerUnlockableTokens(member4);
      await tf.unlockStakerUnlockableTokens(member5);

      let balanceAfter = parseFloat(await dai.balanceOf(coverHolder2));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder2));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder2, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder2));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / toWei(1)
      ).toFixed(2);
      payoutReceived = Number(
        (balanceAfter - balanceBefore) / toWei(1)
      ).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / toWei(1)
      ).toFixed(2);

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      for (let i = 0; i < underWriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Object.newLockDate - claimAssessor1Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate - claimAssessor2Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate - claimAssessor3Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor4Object.newLockDate - claimAssessor4Object.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Object.newLockDate -
          claimAssessor1Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate -
          claimAssessor2Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate -
          claimAssessor3Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor4Object.newLockDate -
          claimAssessor4Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );

      assert.equal(claimAssessor1Object.rewardRecieved, 0);
      assert.equal(claimAssessor2Object.rewardRecieved, 0);
      assert.equal(claimAssessor3Object.rewardRecieved, 0);
      assert.equal(claimAssessor4Object.rewardRecieved, 0);

      assert.equal(member1Object.rewardRecieved, 15.004497751124436);
      assert.equal(member2Object.rewardRecieved, 10.002998500749625);
      assert.equal(member3Object.rewardRecieved, 4.997501249375312);
      assert.equal(member4Object.rewardRecieved, 9.995002498750624);
      assert.equal(member5Object.rewardRecieved, 0);

      assert.equal(payoutReceived, 0);
      assert.equal(coverTokensUnlockable, 0);
      assert.equal(coverTokensBurned, 10);

      let UWTokensLockedExpected = [0, 0, 0, 2000, 8000];
      let UWTokensBurnedExpected = [0, 0, 0, 0, 0];
      for (let i = 0; i < underWriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.11 should pass for CA vote > 5SA and <10 SA and majority < 70%, open for member vote and majority accept(A3)', async function() {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardRecieved,
          lockPeriodAfterRewardRecieved
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardRecieved = lockPeriodAfterRewardRecieved;
          this.rewardRecieved = rewardRecieved;
        }
      }
      class member {
        constructor(rewardRecieved) {
          this.rewardRecieved = rewardRecieved;
        }
      }
      let claimAssessor1Object = new claimAssessor();
      let claimAssessor2Object = new claimAssessor();
      let claimAssessor3Object = new claimAssessor();
      let claimAssessor4Object = new claimAssessor();

      let member1Object = new member();
      let member2Object = new member();
      let member3Object = new member();
      let member4Object = new member();
      let member5Object = new member();

      underWriters = [
        underWriter3,
        underWriter2,
        underWriter5,
        underWriter4,
        underWriter1
      ];
      // need not to do the lock again
      // await tc.lock(CLA, 50000 * toWei(1), validity, {from: claimAssessor1});
      // await tc.lock(CLA, 30000 * toWei(1), validity, {from: claimAssessor2});
      // await tc.lock(CLA, 20000 * toWei(1), validity, {from: claimAssessor3});

      // await tc.lock(CLA, 60000 * toWei(1), validity, {from: claimAssessor4});
      // await tc.lock(CLA, 50000 * toWei(1), validity, {from: claimAssessor5});
      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underWriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(
                underWriters[i],
                SC2,
                i
              )
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  underWriters[i],
                  SC2,
                  1
                )
              )) /
              toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder2);
      await cl.submitClaim(coverID[0], {from: coverHolder2});
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );

      await cl.submitCAVote(claimID, 1, {from: claimAssessor1});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor2});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor3});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor4});

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
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
        await tf.getUserLockedCNTokens(coverHolder2, coverID)
      );
      let tokenBalanceBefore = parseFloat(await tk.balanceOf(coverHolder2));
      let balanceBefore = parseFloat(await dai.balanceOf(coverHolder2));
      let totalBalanceBefore = parseFloat(
        await tc.totalBalanceOf(coverHolder2)
      );

      // // changing the claim status here
      await p1.__callback(APIID, '');

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);
      claimAssessor4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, {from: member1});
      await cl.submitMemberVote(claimID, 1, {from: member2});
      await cl.submitMemberVote(claimID, 1, {from: member3});
      await cl.submitMemberVote(claimID, 1, {from: member4});
      await cl.submitMemberVote(claimID, -1, {from: member5});

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
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(20, {from: claimAssessor1});
      await cr.claimAllPendingReward(20, {from: claimAssessor2});
      await cr.claimAllPendingReward(20, {from: claimAssessor3});
      await cr.claimAllPendingReward(20, {from: claimAssessor4});

      await tf.unlockStakerUnlockableTokens(claimAssessor1);
      await tf.unlockStakerUnlockableTokens(claimAssessor2);
      await tf.unlockStakerUnlockableTokens(claimAssessor3);
      await tf.unlockStakerUnlockableTokens(claimAssessor4);

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );

      member1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / toWei(1);
      member4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member4)) / toWei(1);
      member5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member5)) / toWei(1);

      await cr.claimAllPendingReward(20, {from: member1});
      await cr.claimAllPendingReward(20, {from: member2});
      await cr.claimAllPendingReward(20, {from: member3});
      await cr.claimAllPendingReward(20, {from: member4});
      await cr.claimAllPendingReward(20, {from: member5});

      await tf.unlockStakerUnlockableTokens(member1);
      await tf.unlockStakerUnlockableTokens(member2);
      await tf.unlockStakerUnlockableTokens(member3);
      await tf.unlockStakerUnlockableTokens(member4);
      await tf.unlockStakerUnlockableTokens(member5);

      let balanceAfter = parseFloat(await dai.balanceOf(coverHolder2));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder2));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder2, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder2));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / toWei(1)
      ).toFixed(2);
      payoutReceived = Number(
        (balanceAfter - balanceBefore) / toWei(1)
      ).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / toWei(1)
      ).toFixed(2);

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      for (let i = 0; i < underWriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }
      assert.equal(
        claimAssessor1Object.newLockDate - claimAssessor1Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate - claimAssessor2Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate - claimAssessor3Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor4Object.newLockDate - claimAssessor4Object.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Object.newLockDate -
          claimAssessor1Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate -
          claimAssessor2Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate -
          claimAssessor3Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor4Object.newLockDate -
          claimAssessor4Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );

      assert.equal(claimAssessor1Object.rewardRecieved, 0);
      assert.equal(claimAssessor2Object.rewardRecieved, 0);
      assert.equal(claimAssessor3Object.rewardRecieved, 0);
      assert.equal(claimAssessor4Object.rewardRecieved, 0);

      assert.equal(member1Object.rewardRecieved, 15.004497751124436);
      assert.equal(member2Object.rewardRecieved, 10.002998500749625);
      assert.equal(member3Object.rewardRecieved, 4.997501249375312);
      assert.equal(member4Object.rewardRecieved, 9.995002498750624);
      assert.equal(member5Object.rewardRecieved, 0);

      assert.equal(payoutReceived, 50);
      assert.equal(coverTokensUnlockable, 10);
      assert.equal(coverTokensBurned, 0);

      let UWTokensLockedExpected = [0, 0, 0, 2000, 8000];
      let UWTokensBurnedExpected = [0, 0, 0, 2000, 8000];

      for (let i = 0; i < underWriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.12 should pass for CA vote > 5* SA and <10 SA and majority > 70 % for reject(D1)', async function() {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardRecieved,
          lockPeriodAfterRewardRecieved
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardRecieved = lockPeriodAfterRewardRecieved;
          this.rewardRecieved = rewardRecieved;
        }
      }
      let claimAssessor1Object = new claimAssessor();
      let claimAssessor2Object = new claimAssessor();
      let claimAssessor3Object = new claimAssessor();
      let claimAssessor4Object = new claimAssessor();
      let claimAssessor5Object = new claimAssessor();

      underWriters = [
        underWriter5,
        underWriter4,
        underWriter3,
        underWriter2,
        underWriter1
      ];
      // need not to do the lock again
      // await tc.lock(CLA, 50000 * toWei(1), validity, {from: claimAssessor1});
      // await tc.lock(CLA, 30000 * toWei(1), validity, {from: claimAssessor2});
      // await tc.lock(CLA, 20000 * toWei(1), validity, {from: claimAssessor3});
      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }
      let UWTokensLocked = [];
      for (let i = 0; i < underWriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(
                underWriters[i],
                SC3,
                i
              )
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  underWriters[i],
                  SC3,
                  2
                )
              )) /
              toWei(1)
          ).toFixed(2)
        );
      }
      coverID = await qd.getAllCoversOfUser(coverHolder4);
      await cl.submitClaim(coverID[0], {from: coverHolder4});
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );

      await cl.submitCAVote(claimID, -1, {from: claimAssessor1});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor2});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor3});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor4});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor5});

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.newLockDate = parseFloat(
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
        await tf.getUserLockedCNTokens(coverHolder4, coverID)
      );
      let tokenBalanceBefore = parseFloat(await tk.balanceOf(coverHolder4));
      let balanceBefore = await web3.eth.getBalance(coverHolder4);
      let totalBalanceBefore = parseFloat(
        await tc.totalBalanceOf(coverHolder4)
      );

      // changing the claim status here
      await p1.__callback(APIID, '');

      let balanceAfter = await web3.eth.getBalance(coverHolder4);
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder4));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder4, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder4));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / toWei(1)
      ).toFixed(2);
      payoutReceived = Number(
        (balanceAfter - balanceBefore) / toWei(1)
      ).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / toWei(1)
      ).toFixed(2);
      now = await latestTime();

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);
      claimAssessor4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        toWei(1);
      claimAssessor5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor5)) /
        toWei(1);

      let proposalIds = [];
      await cr.claimAllPendingReward(20, {from: claimAssessor1});
      await cr.claimAllPendingReward(20, {from: claimAssessor2});
      await cr.claimAllPendingReward(20, {from: claimAssessor3});
      await cr.claimAllPendingReward(20, {from: claimAssessor4});
      await cr.claimAllPendingReward(20, {from: claimAssessor5});

      await tf.unlockStakerUnlockableTokens(claimAssessor1);
      await tf.unlockStakerUnlockableTokens(claimAssessor2);
      await tf.unlockStakerUnlockableTokens(claimAssessor3);
      await tf.unlockStakerUnlockableTokens(claimAssessor4);
      await tf.unlockStakerUnlockableTokens(claimAssessor5);

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      for (let i = 0; i < underWriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Object.newLockDate - claimAssessor1Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate - claimAssessor2Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate - claimAssessor3Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor4Object.newLockDate - claimAssessor4Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor5Object.newLockDate - claimAssessor5Object.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Object.newLockDate -
          claimAssessor1Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate -
          claimAssessor2Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate -
          claimAssessor3Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor4Object.newLockDate -
          claimAssessor4Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor5Object.newLockDate -
          claimAssessor5Object.lockPeriodAfterRewardRecieved,
        0
      );

      assert.equal(claimAssessor1Object.rewardRecieved, 18.75);
      assert.equal(claimAssessor2Object.rewardRecieved, 11.25);
      assert.equal(claimAssessor3Object.rewardRecieved, 7.5);
      assert.equal(claimAssessor4Object.rewardRecieved, 22.5);
      assert.equal(claimAssessor5Object.rewardRecieved, 0);

      assert.equal(payoutReceived, 0);
      assert.equal(coverTokensUnlockable, 0);
      assert.equal(coverTokensBurned, 15);

      let UWTokensLockedExpected = [5000, 6000, 7000, 8000, 9000];
      let UWTokensBurnedExpected = [0, 0, 0, 0, 0];

      for (let i = 0; i < underWriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.13 should pass for CA vote > 5* SA and <10 SA and majority > 70 % for accept(A1)', async function() {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardRecieved,
          lockPeriodAfterRewardRecieved
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardRecieved = lockPeriodAfterRewardRecieved;
          this.rewardRecieved = rewardRecieved;
        }
      }
      let claimAssessor1Object = new claimAssessor();
      let claimAssessor2Object = new claimAssessor();
      let claimAssessor3Object = new claimAssessor();
      let claimAssessor4Object = new claimAssessor();
      let claimAssessor5Object = new claimAssessor();

      underWriters = [
        underWriter5,
        underWriter4,
        underWriter3,
        underWriter2,
        underWriter1
      ];

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underWriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(
                underWriters[i],
                SC3,
                i
              )
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  underWriters[i],
                  SC3,
                  2
                )
              )) /
              toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder4);
      await cl.submitClaim(coverID[0], {from: coverHolder4});
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );

      await cl.submitCAVote(claimID, 1, {from: claimAssessor1});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor2});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor3});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor4});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor5});

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.newLockDate = parseFloat(
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
        await tf.getUserLockedCNTokens(coverHolder4, coverID)
      );
      let tokenBalanceBefore = parseFloat(await tk.balanceOf(coverHolder4));
      let balanceBefore = await web3.eth.getBalance(coverHolder4);
      let totalBalanceBefore = parseFloat(
        await tc.totalBalanceOf(coverHolder4)
      );

      // changing the claim status here
      await p1.__callback(APIID, '');

      let balanceAfter = await web3.eth.getBalance(coverHolder4);
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder4));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder4, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder4));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / toWei(1)
      ).toFixed(2);
      payoutReceived = Number(
        (balanceAfter - balanceBefore) / toWei(1)
      ).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / toWei(1)
      ).toFixed(2);
      now = await latestTime();

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);
      claimAssessor4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        toWei(1);
      claimAssessor5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor5)) /
        toWei(1);

      let proposalIds = [];
      await cr.claimAllPendingReward(20, {from: claimAssessor1});
      await cr.claimAllPendingReward(20, {from: claimAssessor2});
      await cr.claimAllPendingReward(20, {from: claimAssessor3});
      await cr.claimAllPendingReward(20, {from: claimAssessor4});
      await cr.claimAllPendingReward(20, {from: claimAssessor5});

      await tf.unlockStakerUnlockableTokens(claimAssessor1);
      await tf.unlockStakerUnlockableTokens(claimAssessor2);
      await tf.unlockStakerUnlockableTokens(claimAssessor3);
      await tf.unlockStakerUnlockableTokens(claimAssessor4);
      await tf.unlockStakerUnlockableTokens(claimAssessor5);

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      for (let i = 0; i < underWriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Object.newLockDate - claimAssessor1Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate - claimAssessor2Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate - claimAssessor3Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor4Object.newLockDate - claimAssessor4Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor5Object.newLockDate - claimAssessor5Object.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Object.newLockDate -
          claimAssessor1Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate -
          claimAssessor2Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate -
          claimAssessor3Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor4Object.newLockDate -
          claimAssessor4Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor5Object.newLockDate -
          claimAssessor5Object.lockPeriodAfterRewardRecieved,
        0
      );

      assert.equal(claimAssessor1Object.rewardRecieved, 18.75);
      assert.equal(claimAssessor2Object.rewardRecieved, 11.25);
      assert.equal(claimAssessor3Object.rewardRecieved, 7.5);
      assert.equal(claimAssessor4Object.rewardRecieved, 22.5);
      assert.equal(claimAssessor5Object.rewardRecieved, 0);

      assert.equal(payoutReceived, 3);
      assert.equal(coverTokensUnlockable, 15);
      assert.equal(coverTokensBurned, 0);

      let UWTokensLockedExpected = [5000, 6000, 7000, 8000, 9000];
      let UWTokensBurnedExpected = [5000, 6000, 7000, 8000, 4000];
      for (let i = 0; i < underWriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.14 should pass for CA vote < 5* SA and MV < 5 SA and CA majority reject(D4)', async function() {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardRecieved,
          lockPeriodAfterRewardRecieved
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardRecieved = lockPeriodAfterRewardRecieved;
          this.rewardRecieved = rewardRecieved;
        }
      }
      class member {
        constructor(rewardRecieved) {
          this.rewardRecieved = rewardRecieved;
        }
      }
      let claimAssessor1Object = new claimAssessor();
      let claimAssessor2Object = new claimAssessor();
      let claimAssessor3Object = new claimAssessor();

      let member1Object = new member();
      let member2Object = new member();

      underWriters = [
        underWriter5,
        underWriter4,
        underWriter3,
        underWriter2,
        underWriter1
      ];
      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underWriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(
                underWriters[i],
                SC3,
                i
              )
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  underWriters[i],
                  SC3,
                  2
                )
              )) /
              toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder6);
      await cl.submitClaim(coverID[0], {from: coverHolder6});
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      await cl.submitCAVote(claimID, -1, {from: claimAssessor1});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor2});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor3});

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.newLockDate = parseFloat(
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

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, {from: member1});
      await cl.submitMemberVote(claimID, 1, {from: member2});

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
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(20, {from: claimAssessor1});
      await cr.claimAllPendingReward(20, {from: claimAssessor2});
      await cr.claimAllPendingReward(20, {from: claimAssessor3});

      await tf.unlockStakerUnlockableTokens(claimAssessor1);
      await tf.unlockStakerUnlockableTokens(claimAssessor2);
      await tf.unlockStakerUnlockableTokens(claimAssessor3);

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      member1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);

      await cr.claimAllPendingReward(20, {from: member1});
      await cr.claimAllPendingReward(20, {from: member2});

      await tf.unlockStakerUnlockableTokens(member1);
      await tf.unlockStakerUnlockableTokens(member2);

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

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      for (let i = 0; i < underWriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Object.newLockDate - claimAssessor1Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate - claimAssessor2Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate - claimAssessor3Object.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Object.newLockDate -
          claimAssessor1Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate -
          claimAssessor2Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate -
          claimAssessor3Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );

      assert.equal(claimAssessor1Object.rewardRecieved, 0);
      assert.equal(claimAssessor2Object.rewardRecieved, 0);
      assert.equal(claimAssessor3Object.rewardRecieved, 0);

      assert.equal(member1Object.rewardRecieved, 0);
      assert.equal(member2Object.rewardRecieved, 0);

      assert.equal(payoutReceived, 0);
      assert.equal(coverTokensUnlockable, 0);
      assert.equal(coverTokensBurned, 15);

      let UWTokensLockedExpected = [0, 0, 0, 0, 5000];
      let UWTokensBurnedExpected = [0, 0, 0, 0, 0];

      for (let i = 0; i < underWriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.15 should pass for CA vote < 5* SA and MV < 5 SA and CA majority accept(A4)', async function() {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardRecieved,
          lockPeriodAfterRewardRecieved
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardRecieved = lockPeriodAfterRewardRecieved;
          this.rewardRecieved = rewardRecieved;
        }
      }
      class member {
        constructor(rewardRecieved) {
          this.rewardRecieved = rewardRecieved;
        }
      }
      let claimAssessor1Object = new claimAssessor();
      let claimAssessor2Object = new claimAssessor();
      let claimAssessor3Object = new claimAssessor();

      let member1Object = new member();
      let member2Object = new member();

      underWriters = [
        underWriter5,
        underWriter4,
        underWriter3,
        underWriter2,
        underWriter1
      ];
      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underWriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(
                underWriters[i],
                SC3,
                i
              )
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  underWriters[i],
                  SC3,
                  2
                )
              )) /
              toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder6);
      await cl.submitClaim(coverID[0], {from: coverHolder6});
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      await cl.submitCAVote(claimID, 1, {from: claimAssessor1});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor2});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor3});

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.newLockDate = parseFloat(
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

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, {from: member1});
      await cl.submitMemberVote(claimID, 1, {from: member2});

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
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(20, {from: claimAssessor1});
      await cr.claimAllPendingReward(20, {from: claimAssessor2});
      await cr.claimAllPendingReward(20, {from: claimAssessor3});

      await tf.unlockStakerUnlockableTokens(claimAssessor1);
      await tf.unlockStakerUnlockableTokens(claimAssessor2);
      await tf.unlockStakerUnlockableTokens(claimAssessor3);

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );

      member1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);

      await cr.claimAllPendingReward(20, {from: member1});
      await cr.claimAllPendingReward(20, {from: member2});

      await tf.unlockStakerUnlockableTokens(member1);
      await tf.unlockStakerUnlockableTokens(member2);

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

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      for (let i = 0; i < underWriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Object.newLockDate - claimAssessor1Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate - claimAssessor2Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate - claimAssessor3Object.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Object.newLockDate -
          claimAssessor1Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate -
          claimAssessor2Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate -
          claimAssessor3Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );

      assert.equal(claimAssessor1Object.rewardRecieved, 0);
      assert.equal(claimAssessor2Object.rewardRecieved, 0);
      assert.equal(claimAssessor3Object.rewardRecieved, 0);

      assert.equal(member1Object.rewardRecieved, 0);
      assert.equal(member2Object.rewardRecieved, 0);

      assert.equal(payoutReceived, 75);
      assert.equal(coverTokensUnlockable, 15);
      assert.equal(coverTokensBurned, 0);

      let UWTokensLockedExpected = [0, 0, 0, 0, 5000];
      let UWTokensBurnedExpected = [0, 0, 0, 0, 5000];

      for (let i = 0; i < underWriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.16 should pass for 0 CA votes, MV < 5 SA(D4)', async function() {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardRecieved,
          lockPeriodAfterRewardRecieved
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardRecieved = lockPeriodAfterRewardRecieved;
          this.rewardRecieved = rewardRecieved;
        }
      }
      class member {
        constructor(rewardRecieved) {
          this.rewardRecieved = rewardRecieved;
        }
      }
      underWriters = [
        underWriter4,
        underWriter3,
        underWriter5,
        underWriter2,
        underWriter1
      ];

      let member1Object = new member();
      let member2Object = new member();
      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underWriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(
                underWriters[i],
                SC4,
                i
              )
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  underWriters[i],
                  SC4,
                  3
                )
              )) /
              toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder7);
      await cl.submitClaim(coverID[0], {from: coverHolder7});
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
      await cl.submitMemberVote(claimID, 1, {from: member1});
      await cl.submitMemberVote(claimID, 1, {from: member2});

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
      await p1.__callback(APIID, '');

      let proposalIds = [];

      member1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);

      await cr.claimAllPendingReward(20, {from: member1});
      await cr.claimAllPendingReward(20, {from: member2});

      await tf.unlockStakerUnlockableTokens(member1);
      await tf.unlockStakerUnlockableTokens(member2);

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

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      for (let i = 0; i < underWriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(member1Object.rewardRecieved, 0);
      assert.equal(member2Object.rewardRecieved, 0);

      assert.equal(payoutReceived, 0);
      assert.equal(coverTokensUnlockable, 0);
      assert.equal(coverTokensBurned, 20);

      let UWTokensLockedExpected = [30, 40, 50, 60, 70];
      let UWTokensBurnedExpected = [0, 0, 0, 0, 0];

      for (let i = 0; i < underWriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.17 should pass for CA vote > 5 SA and CA<10 SA and majority < 70%, open for member vote and MV<5 SA and CA majority reject(D4)', async function() {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardRecieved,
          lockPeriodAfterRewardRecieved
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardRecieved = lockPeriodAfterRewardRecieved;
          this.rewardRecieved = rewardRecieved;
        }
      }
      class member {
        constructor(rewardRecieved) {
          this.rewardRecieved = rewardRecieved;
        }
      }
      let claimAssessor1Object = new claimAssessor();
      let claimAssessor2Object = new claimAssessor();
      let claimAssessor3Object = new claimAssessor();
      let claimAssessor4Object = new claimAssessor();
      let claimAssessor5Object = new claimAssessor();
      let member1Object = new member();
      let member2Object = new member();
      let member3Object = new member();

      underWriters = [
        underWriter4,
        underWriter3,
        underWriter5,
        underWriter2,
        underWriter1
      ];

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underWriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(
                underWriters[i],
                SC4,
                i
              )
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  underWriters[i],
                  SC4,
                  3
                )
              )) /
              toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder7);
      await cl.submitClaim(coverID[0], {from: coverHolder7});
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );
      await cl.submitCAVote(claimID, 1, {from: claimAssessor1});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor2});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor3});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor4});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor5});

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.newLockDate = parseFloat(
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

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);
      claimAssessor4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        toWei(1);
      claimAssessor5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor5)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, {from: member1});
      await cl.submitMemberVote(claimID, 1, {from: member2});
      await cl.submitMemberVote(claimID, 1, {from: member3});

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
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(20, {from: claimAssessor1});
      await cr.claimAllPendingReward(20, {from: claimAssessor2});
      await cr.claimAllPendingReward(20, {from: claimAssessor3});
      await cr.claimAllPendingReward(20, {from: claimAssessor4});
      await cr.claimAllPendingReward(20, {from: claimAssessor5});

      await tf.unlockStakerUnlockableTokens(claimAssessor1);
      await tf.unlockStakerUnlockableTokens(claimAssessor2);
      await tf.unlockStakerUnlockableTokens(claimAssessor3);
      await tf.unlockStakerUnlockableTokens(claimAssessor4);
      await tf.unlockStakerUnlockableTokens(claimAssessor5);

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );

      member1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / toWei(1);

      await cr.claimAllPendingReward(20, {from: member1});
      await cr.claimAllPendingReward(20, {from: member2});
      await cr.claimAllPendingReward(20, {from: member3});

      await tf.unlockStakerUnlockableTokens(member1);
      await tf.unlockStakerUnlockableTokens(member2);
      await tf.unlockStakerUnlockableTokens(member3);

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

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      for (let i = 0; i < underWriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Object.newLockDate - claimAssessor1Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate - claimAssessor2Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate - claimAssessor3Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor4Object.newLockDate - claimAssessor4Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor5Object.newLockDate - claimAssessor5Object.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Object.newLockDate -
          claimAssessor1Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate -
          claimAssessor2Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate -
          claimAssessor3Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor4Object.newLockDate -
          claimAssessor4Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor5Object.newLockDate -
          claimAssessor5Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );

      assert.equal(claimAssessor1Object.rewardRecieved, 0);
      assert.equal(claimAssessor2Object.rewardRecieved, 0);
      assert.equal(claimAssessor3Object.rewardRecieved, 0);
      assert.equal(claimAssessor4Object.rewardRecieved, 0);
      assert.equal(claimAssessor5Object.rewardRecieved, 0);

      assert.equal(member1Object.rewardRecieved, 0);
      assert.equal(member2Object.rewardRecieved, 0);
      assert.equal(member3Object.rewardRecieved, 0);

      assert.equal(payoutReceived, 0);
      assert.equal(coverTokensUnlockable, 0);
      assert.equal(coverTokensBurned, 20);

      let UWTokensLockedExpected = [30, 40, 50, 60, 70];
      let UWTokensBurnedExpected = [0, 0, 0, 0, 0];

      for (let i = 0; i < underWriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.18 should pass for CA vote > 5 SA and CA<10SA majority < 70%, open for member vote and MV<5 SA and CA majority accept(A4)', async function() {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardRecieved,
          lockPeriodAfterRewardRecieved
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardRecieved = lockPeriodAfterRewardRecieved;
          this.rewardRecieved = rewardRecieved;
        }
      }
      class member {
        constructor(rewardRecieved) {
          this.rewardRecieved = rewardRecieved;
        }
      }
      let claimAssessor1Object = new claimAssessor();
      let claimAssessor2Object = new claimAssessor();
      let claimAssessor3Object = new claimAssessor();
      let claimAssessor4Object = new claimAssessor();
      let claimAssessor5Object = new claimAssessor();
      let member1Object = new member();
      let member2Object = new member();
      let member3Object = new member();

      underWriters = [
        underWriter4,
        underWriter3,
        underWriter5,
        underWriter2,
        underWriter1
      ];
      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underWriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(
                underWriters[i],
                SC4,
                i
              )
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  underWriters[i],
                  SC4,
                  3
                )
              )) /
              toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder8);
      await cl.submitClaim(coverID[0], {from: coverHolder8});
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );
      await cl.submitCAVote(claimID, -1, {from: claimAssessor1});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor2});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor3});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor4});
      await cl.submitCAVote(claimID, 1, {from: claimAssessor5});

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.newLockDate = parseFloat(
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

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        toWei(1);
      claimAssessor4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        toWei(1);
      claimAssessor5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor5)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, {from: member1});
      await cl.submitMemberVote(claimID, 1, {from: member2});
      await cl.submitMemberVote(claimID, 1, {from: member3});

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
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(20, {from: claimAssessor1});
      await cr.claimAllPendingReward(20, {from: claimAssessor2});
      await cr.claimAllPendingReward(20, {from: claimAssessor3});
      await cr.claimAllPendingReward(20, {from: claimAssessor4});
      await cr.claimAllPendingReward(20, {from: claimAssessor5});

      await tf.unlockStakerUnlockableTokens(claimAssessor1);
      await tf.unlockStakerUnlockableTokens(claimAssessor2);
      await tf.unlockStakerUnlockableTokens(claimAssessor3);
      await tf.unlockStakerUnlockableTokens(claimAssessor4);
      await tf.unlockStakerUnlockableTokens(claimAssessor5);

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      claimAssessor4Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor4, CLA)
      );
      claimAssessor5Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor5, CLA)
      );

      member1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / toWei(1);

      await cr.claimAllPendingReward(20, {from: member1});
      await cr.claimAllPendingReward(20, {from: member2});
      await cr.claimAllPendingReward(20, {from: member3});

      await tf.unlockStakerUnlockableTokens(member1);
      await tf.unlockStakerUnlockableTokens(member2);
      await tf.unlockStakerUnlockableTokens(member3);

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

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      for (let i = 0; i < underWriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Object.newLockDate - claimAssessor1Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate - claimAssessor2Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate - claimAssessor3Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate - claimAssessor2Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate - claimAssessor3Object.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Object.newLockDate -
          claimAssessor1Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate -
          claimAssessor2Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate -
          claimAssessor3Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate -
          claimAssessor2Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor3Object.newLockDate -
          claimAssessor3Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );

      assert.equal(claimAssessor1Object.rewardRecieved, 0);
      assert.equal(claimAssessor2Object.rewardRecieved, 0);
      assert.equal(claimAssessor3Object.rewardRecieved, 0);
      assert.equal(claimAssessor2Object.rewardRecieved, 0);
      assert.equal(claimAssessor3Object.rewardRecieved, 0);

      assert.equal(member1Object.rewardRecieved, 0);
      assert.equal(member2Object.rewardRecieved, 0);
      assert.equal(member3Object.rewardRecieved, 0);

      assert.equal(payoutReceived, 100);
      assert.equal(coverTokensUnlockable, 40);
      assert.equal(coverTokensBurned, 0);

      let UWTokensLockedExpected = [30, 40, 50, 60, 70];
      let UWTokensBurnedExpected = [30, 40, 50, 60, 70];

      for (let i = 0; i < underWriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.19 CA vote<5SA, open for member vote and majority reject(D3)', async function() {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardRecieved,
          lockPeriodAfterRewardRecieved
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardRecieved = lockPeriodAfterRewardRecieved;
          this.rewardRecieved = rewardRecieved;
        }
      }
      class member {
        constructor(rewardRecieved) {
          this.rewardRecieved = rewardRecieved;
        }
      }
      let claimAssessor1Object = new claimAssessor();
      let claimAssessor2Object = new claimAssessor();
      let member1Object = new member();
      let member2Object = new member();
      let member3Object = new member();
      let member4Object = new member();
      let member5Object = new member();
      let member6Object = new member();

      underWriters = [
        underWriter4,
        underWriter3,
        underWriter5,
        underWriter2,
        underWriter1
      ];
      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      let UWTokensLocked = [];
      for (let i = 0; i < underWriters.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(
                underWriters[i],
                SC5,
                i
              )
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  underWriters[i],
                  SC5,
                  4
                )
              )) /
              toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder9);
      await cl.submitClaim(coverID[0], {from: coverHolder9});
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      await cl.submitCAVote(claimID, 1, {from: claimAssessor1});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor2});

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
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

      // // changing the claim status here
      await p1.__callback(APIID, '');

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, -1, {from: member1});
      await cl.submitMemberVote(claimID, -1, {from: member2});
      await cl.submitMemberVote(claimID, -1, {from: member3});
      await cl.submitMemberVote(claimID, -1, {from: member4});
      await cl.submitMemberVote(claimID, 1, {from: member5});
      await cl.submitMemberVote(claimID, -1, {from: member6});

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
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(20, {from: claimAssessor1});
      await cr.claimAllPendingReward(20, {from: claimAssessor2});

      await tf.unlockStakerUnlockableTokens(claimAssessor1);
      await tf.unlockStakerUnlockableTokens(claimAssessor2);

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );

      member1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / toWei(1);
      member4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member4)) / toWei(1);
      member5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member5)) / toWei(1);
      member6Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member6)) / toWei(1);

      await cr.claimAllPendingReward(20, {from: member1});
      await cr.claimAllPendingReward(20, {from: member2});
      await cr.claimAllPendingReward(20, {from: member3});
      await cr.claimAllPendingReward(20, {from: member4});
      await cr.claimAllPendingReward(20, {from: member5});
      await cr.claimAllPendingReward(20, {from: member6});

      await tf.unlockStakerUnlockableTokens(member1);
      await tf.unlockStakerUnlockableTokens(member2);
      await tf.unlockStakerUnlockableTokens(member3);
      await tf.unlockStakerUnlockableTokens(member4);
      await tf.unlockStakerUnlockableTokens(member5);
      await tf.unlockStakerUnlockableTokens(member6);

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

      for (let i = 0; i < underWriters.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(underWriters[i])) / toWei(1);
      }

      for (let i = 0; i < underWriters.length; i++) {
        UWTokensBurned[i] = Number(
          UWTotalBalanceBefore[i] - UWTotalBalanceAfter[i]
        ).toFixed(2);
      }

      assert.equal(
        claimAssessor1Object.newLockDate - claimAssessor1Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate - claimAssessor2Object.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Object.newLockDate -
          claimAssessor1Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate -
          claimAssessor2Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );

      assert.equal(claimAssessor1Object.rewardRecieved, 0);
      assert.equal(claimAssessor2Object.rewardRecieved, 0);

      assert.equal(member1Object.rewardRecieved, 13.060146443378345);
      assert.equal(member2Object.rewardRecieved, 8.706764295585563);
      assert.equal(member3Object.rewardRecieved, 4.349902226011972);
      assert.equal(member4Object.rewardRecieved, 8.699804452023944);
      assert.equal(member5Object.rewardRecieved, 0);
      assert.equal(member6Object.rewardRecieved, 65.18338258300017);

      assert.equal(payoutReceived, 0);
      assert.equal(coverTokensUnlockable, 0);
      assert.equal(coverTokensBurned, 25);

      let UWTokensLockedExpected = [5, 10, 15, 20, 25];
      let UWTokensBurnedExpected = [0, 0, 0, 0, 0];

      for (let i = 0; i < underWriters.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * toWei(1))
      //   await tc.mint(owner, 600000 * toWei(1) - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * toWei(1));
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });

    it('18.20 CA vote <5SA and majority < 70%, open for member vote and majority accept(A3)', async function() {
      // (await nxms.isPause()).should.equal(false);

      class claimAssessor {
        constructor(
          initialDate,
          newLockDate,
          rewardRecieved,
          lockPeriodAfterRewardRecieved
        ) {
          this.initialDate = initialDate;
          this.newLockDate = newLockDate;
          this.lockPeriodAfterRewardRecieved = lockPeriodAfterRewardRecieved;
          this.rewardRecieved = rewardRecieved;
        }
      }
      class member {
        constructor(rewardRecieved) {
          this.rewardRecieved = rewardRecieved;
        }
      }
      let claimAssessor1Object = new claimAssessor();
      let claimAssessor2Object = new claimAssessor();
      let member1Object = new member();
      let member2Object = new member();
      let member3Object = new member();
      let member4Object = new member();
      let member5Object = new member();
      let member6Object = new member();

      let UWarray = [
        underWriter4,
        underWriter3,
        underWriter5,
        underWriter2,
        underWriter1
      ];
      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / toWei(1);
      }

      UWTokensLocked = [];
      for (let i = 0; i < UWarray.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(UWarray[i], SC5, i)
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  UWarray[i],
                  SC5,
                  4
                )
              )) /
              toWei(1)
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder9);
      await cl.submitClaim(coverID[0], {from: coverHolder9});
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimID = (await cd.actualClaimLength()) - 1;
      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );

      await cl.submitCAVote(claimID, 1, {from: claimAssessor1});
      await cl.submitCAVote(claimID, -1, {from: claimAssessor2});

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
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

      // // changing the claim status here
      await p1.__callback(APIID, '');

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        toWei(1);
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        toWei(1);

      // now member voting started
      await cl.submitMemberVote(claimID, 1, {from: member1});
      await cl.submitMemberVote(claimID, 1, {from: member2});
      await cl.submitMemberVote(claimID, 1, {from: member3});
      await cl.submitMemberVote(claimID, 1, {from: member4});
      await cl.submitMemberVote(claimID, -1, {from: member5});
      await cl.submitMemberVote(claimID, 1, {from: member6});

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
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(20, {from: claimAssessor1});
      await cr.claimAllPendingReward(20, {from: claimAssessor2});

      await tf.unlockStakerUnlockableTokens(claimAssessor1);
      await tf.unlockStakerUnlockableTokens(claimAssessor2);

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );

      member1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / toWei(1);
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / toWei(1);
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / toWei(1);
      member4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member4)) / toWei(1);
      member5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member5)) / toWei(1);
      member6Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member6)) / toWei(1);

      await increaseTimeTo(
        new BN(closingTime.toString()).add(new BN((172800).toString()))
      );

      // cannot withdraw/switch membership as it has not claimed Pending reward
      await assertRevert(mr.withdrawMembership({from: member1}));
      await assertRevert(mr.switchMembership(tc.address, {from: member1}));

      await cr.claimAllPendingReward(20, {from: member1});
      await cr.claimAllPendingReward(20, {from: member2});
      await cr.claimAllPendingReward(20, {from: member3});
      await cr.claimAllPendingReward(20, {from: member4});
      await cr.claimAllPendingReward(20, {from: member5});
      await cr.claimAllPendingReward(20, {from: member6});

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
        claimAssessor1Object.newLockDate - claimAssessor1Object.initialDate,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate - claimAssessor2Object.initialDate,
        oneWeek
      );

      assert.equal(
        claimAssessor1Object.newLockDate -
          claimAssessor1Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );
      assert.equal(
        claimAssessor2Object.newLockDate -
          claimAssessor2Object.lockPeriodAfterRewardRecieved,
        oneWeek
      );

      assert.equal(claimAssessor1Object.rewardRecieved, 0);
      assert.equal(claimAssessor2Object.rewardRecieved, 0);

      assert.equal(member1Object.rewardRecieved, 13.060146443378345);
      assert.equal(member2Object.rewardRecieved, 8.706764295585563);
      assert.equal(member3Object.rewardRecieved, 4.349902226011972);
      assert.equal(member4Object.rewardRecieved, 8.699804452023944);
      assert.equal(member5Object.rewardRecieved, 0);
      assert.equal(member6Object.rewardRecieved, 65.18338258300017);

      assert.equal(payoutReceived, 5);
      assert.equal(coverTokensUnlockable, 25);
      assert.equal(coverTokensBurned, 0);

      let UWTokensLockedExpected = [5, 10, 15, 20, 25];
      let UWTokensBurnedExpected = [5, 10, 15, 20, 25];

      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }
      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
    });
  });
  describe('Burning 0 tokens of a staker', function() {
    it('18.24 successful', async function() {
      const stakeTokens = toWei(200);
      await tk.approve(ps.address, stakeTokens, {
        from: underWriter6
      });
      await ps.depositAndStake(stakeTokens, [SC1], [stakeTokens], {
        from: underWriter6
      });

      coverID = await qd.getAllCoversOfUser(coverHolder5);

      await tf.burnStakerLockedToken(SC1, 0);
    });
    it('18.25 when stakerStakedNXM = 0', async function() {
      maxVotingTime = await cd.maxVotingTime();
      let maxStakeTime = 21600000;
      let now = await latestTime();
      closingTime = new BN(maxVotingTime.toString()).add(
        new BN((now + maxStakeTime).toString())
      );
      await increaseTimeTo(closingTime);
      await tf.burnStakerLockedToken(SC1, 10);
    });
    it('18.26 when stakerStakedNXM = 0', async function() {
      await assertRevert(p1.depositCN(0));
    });
  });
});
