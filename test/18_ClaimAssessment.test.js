const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolData');
const NXMToken = artifacts.require('NXMToken');
const TokenController = artifacts.require('TokenController');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenData = artifacts.require('TokenDataMock');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const DSValue = artifacts.require('DSValueMock');
const Quotation = artifacts.require('Quotation');
const MCR = artifacts.require('MCR');
const DAI = artifacts.require('MockDAI');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const Governance = artifacts.require('GovernanceMock');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');
const gvProp = require('./utils/gvProposal.js').gvProposal;
const encode = require('./utils/encoder.js').encode;

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
const ethereum_string = 'ETH';
const dai_string = 'DAI';

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
  const UNLIMITED_ALLOWANCE = new BigNumber(2).pow(256).minus(1);

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

    nxms = await NXMaster.deployed();
    tc = await TokenController.at(await nxms.getLatestAddress('TC'));
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    gv = await Governance.at(await nxms.getLatestAddress('GV'));
    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);
    await DSV.setRate(25 * 1e18);
    await gv.changeCurrencyAssetBaseMin(ethereum_string, 30 * 1e18);
    await tf.upgradeCapitalPool(owner);
    await p1.sendTransaction({ from: owner, value: 50 * 1e18 });
    await gv.changeCurrencyAssetBaseMin(dai_string, 750 * 1e18);
    await dai.transfer(p1.address, 1250 * 1e18);
    await mcr.addMCRData(
      10000,
      0,
      100 * 1e18,
      [ethereum_string, dai_string],
      [100, 2500],
      20190208
    );
    await p1.upgradeInvestmentPool(owner);
    // await pd.changeC(400000);
    // await pd.changeA(10);
    // await td.changeBookTime(60);
    // await mr.payJoiningFee(owner, { from: owner, value: fee });
    // await mr.kycVerdict(owner, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: owner });
    // if ((await tk.totalSupply()) < 600000 * 1e18)
    //   await tc.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
    // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);

    // const BASE_MIN_ETH = await pd.getCurrencyAssetBaseMin(ethereum_string);
    // const BASE_MIN_DAI = await pd.getCurrencyAssetBaseMin(dai_string);

    // let ia_pool_eth = await web3.eth.getBalance(p2.address);
    // let ia_pool_dai = await dai.balanceOf(p2.address);

    await mr.payJoiningFee(underWriter1, { from: underWriter1, value: fee });
    await mr.kycVerdict(underWriter1, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: underWriter1 });

    await mr.payJoiningFee(underWriter2, { from: underWriter2, value: fee });
    await mr.kycVerdict(underWriter2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: underWriter2 });

    await mr.payJoiningFee(underWriter3, { from: underWriter3, value: fee });
    await mr.kycVerdict(underWriter3, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: underWriter3 });

    await mr.payJoiningFee(underWriter4, { from: underWriter4, value: fee });
    await mr.kycVerdict(underWriter4, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: underWriter4 });

    await mr.payJoiningFee(underWriter5, { from: underWriter5, value: fee });
    await mr.kycVerdict(underWriter5, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: underWriter5 });

    await mr.payJoiningFee(underWriter6, { from: underWriter6, value: fee });
    await mr.kycVerdict(underWriter6, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: underWriter6 });

    await mr.payJoiningFee(claimAssessor1, {
      from: claimAssessor1,
      value: fee
    });
    await mr.kycVerdict(claimAssessor1, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: claimAssessor1 });

    await mr.payJoiningFee(claimAssessor2, {
      from: claimAssessor2,
      value: fee
    });
    await mr.kycVerdict(claimAssessor2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: claimAssessor2 });

    await mr.payJoiningFee(claimAssessor3, {
      from: claimAssessor3,
      value: fee
    });
    await mr.kycVerdict(claimAssessor3, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: claimAssessor3 });

    await mr.payJoiningFee(claimAssessor4, {
      from: claimAssessor4,
      value: fee
    });
    await mr.kycVerdict(claimAssessor4, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: claimAssessor4 });

    await mr.payJoiningFee(claimAssessor5, {
      from: claimAssessor5,
      value: fee
    });
    await mr.kycVerdict(claimAssessor5, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: claimAssessor5 });

    await mr.payJoiningFee(coverHolder1, { from: coverHolder1, value: fee });
    await mr.kycVerdict(coverHolder1, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: coverHolder1 });

    await mr.payJoiningFee(coverHolder2, { from: coverHolder2, value: fee });
    await mr.kycVerdict(coverHolder2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: coverHolder2 });

    await mr.payJoiningFee(coverHolder3, { from: coverHolder3, value: fee });
    await mr.kycVerdict(coverHolder3, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: coverHolder3 });

    await mr.payJoiningFee(coverHolder4, { from: coverHolder4, value: fee });
    await mr.kycVerdict(coverHolder4, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: coverHolder4 });

    await mr.payJoiningFee(coverHolder5, { from: coverHolder5, value: fee });
    await mr.kycVerdict(coverHolder5, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: coverHolder5 });

    await mr.payJoiningFee(coverHolder6, { from: coverHolder6, value: fee });
    await mr.kycVerdict(coverHolder6, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: coverHolder6 });

    await mr.payJoiningFee(coverHolder7, { from: coverHolder7, value: fee });
    await mr.kycVerdict(coverHolder7, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: coverHolder7 });

    await mr.payJoiningFee(coverHolder8, { from: coverHolder8, value: fee });
    await mr.kycVerdict(coverHolder8, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: coverHolder8 });

    await mr.payJoiningFee(coverHolder9, { from: coverHolder9, value: fee });
    await mr.kycVerdict(coverHolder9, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: coverHolder9 });

    await mr.payJoiningFee(member1, { from: member1, value: fee });
    await mr.kycVerdict(member1, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member1 });

    await mr.payJoiningFee(member2, { from: member2, value: fee });
    await mr.kycVerdict(member2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member2 });

    await mr.payJoiningFee(member3, { from: member3, value: fee });
    await mr.kycVerdict(member3, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member3 });

    await mr.payJoiningFee(member4, { from: member4, value: fee });
    await mr.kycVerdict(member4, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member4 });

    await mr.payJoiningFee(member5, { from: member5, value: fee });
    await mr.kycVerdict(member5, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member5 });

    await mr.payJoiningFee(member6, { from: member6, value: fee });
    await mr.kycVerdict(member6, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member6 });

    await tk.transfer(underWriter1, 19095 * 1e18, { from: owner });
    await tk.transfer(underWriter2, 16080 * 1e18, { from: owner });
    await tk.transfer(underWriter3, 15050 * 1e18, { from: owner });
    await tk.transfer(underWriter4, 18035 * 1e18, { from: owner });
    await tk.transfer(underWriter5, 17065 * 1e18, { from: owner });
    await tk.transfer(underWriter6, 19095 * 1e18, { from: owner });

    await tk.transfer(claimAssessor1, 50000 * 1e18, { from: owner });
    await tk.transfer(claimAssessor2, 30000 * 1e18, { from: owner });
    await tk.transfer(claimAssessor3, 20000 * 1e18, { from: owner });
    await tk.transfer(claimAssessor4, 60000 * 1e18, { from: owner });
    await tk.transfer(claimAssessor5, 50000 * 1e18, { from: owner });

    await tk.transfer(coverHolder1, 1000 * 1e18, { from: owner });
    await tk.transfer(coverHolder2, 1000 * 1e18, { from: owner });
    await tk.transfer(coverHolder3, 1000 * 1e18, { from: owner });
    await tk.transfer(coverHolder4, 1000 * 1e18, { from: owner });
    await tk.transfer(coverHolder5, 1000 * 1e18, { from: owner });
    await tk.transfer(coverHolder6, 1000 * 1e18, { from: owner });
    await tk.transfer(coverHolder7, 1000 * 1e18, { from: owner });
    await tk.transfer(coverHolder8, 1000 * 1e18, { from: owner });
    await tk.transfer(coverHolder9, 1000 * 1e18, { from: owner });

    await tk.transfer(member1, 30000 * 1e18, { from: owner });
    await tk.transfer(member2, 20000 * 1e18, { from: owner });
    await tk.transfer(member3, 10000 * 1e18, { from: owner });
    await tk.transfer(member4, 20000 * 1e18, { from: owner });
    await tk.transfer(member5, 30000 * 1e18, { from: owner });
    await tk.transfer(member6, 150000 * 1e18, { from: owner });

    // now stake the tokens from the underwriters to the contracts
    // Smart contract 1
    tf.addStake(SC1, 2000 * 1e18, { from: underWriter1 });
    tf.addStake(SC1, 3000 * 1e18, { from: underWriter2 });
    tf.addStake(SC1, 4000 * 1e18, { from: underWriter3 });
    tf.addStake(SC1, 5000 * 1e18, { from: underWriter4 });
    tf.addStake(SC1, 6000 * 1e18, { from: underWriter5 });

    // Smart contract 2
    tf.addStake(SC2, 4000 * 1e18, { from: underWriter3 });
    tf.addStake(SC2, 5000 * 1e18, { from: underWriter2 });
    tf.addStake(SC2, 6000 * 1e18, { from: underWriter5 });
    tf.addStake(SC2, 7000 * 1e18, { from: underWriter4 });
    tf.addStake(SC2, 8000 * 1e18, { from: underWriter1 });

    // Smart contract 3
    tf.addStake(SC3, 5000 * 1e18, { from: underWriter5 });
    tf.addStake(SC3, 6000 * 1e18, { from: underWriter4 });
    tf.addStake(SC3, 7000 * 1e18, { from: underWriter3 });
    tf.addStake(SC3, 8000 * 1e18, { from: underWriter2 });
    tf.addStake(SC3, 9000 * 1e18, { from: underWriter1 });

    // Smart contract 4
    tf.addStake(SC4, 30 * 1e18, { from: underWriter4 });
    tf.addStake(SC4, 40 * 1e18, { from: underWriter3 });
    tf.addStake(SC4, 50 * 1e18, { from: underWriter5 });
    tf.addStake(SC4, 60 * 1e18, { from: underWriter2 });
    tf.addStake(SC4, 70 * 1e18, { from: underWriter1 });

    // Smart contract 5
    tf.addStake(SC5, 5 * 1e18, { from: underWriter4 });
    tf.addStake(SC5, 10 * 1e18, { from: underWriter3 });
    tf.addStake(SC5, 15 * 1e18, { from: underWriter5 });
    tf.addStake(SC5, 20 * 1e18, { from: underWriter2 });
    tf.addStake(SC5, 25 * 1e18, { from: underWriter1 });

    actionHash = encode('updateUintParameters(bytes8,uint)', 'A', 10);
    await gvProp(26, actionHash, mr, gv, 2);
    val = await pd.getUintParameters('A');
    (val[1] / 1).should.be.equal(10);

    actionHash = encode('updateUintParameters(bytes8,uint)', 'C', 400000);
    await gvProp(26, actionHash, mr, gv, 2);
    val = await pd.getUintParameters('C');
    (val[1] / 1).should.be.equal(400000);
  });

  describe('claim test case', function() {
    let UWarray = [
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
    it('18.1 Should buy cover and collect rewards', async function() {
      let allCoverPremiums = [100, 100, 200, 200, 300, 300, 400, 400, 500];
      let allLockCNDetails = []; // here all lockCN values
      let changeInUWBalance = [];

      let balanceUW = [];
      for (let i = 0; i < UWarray.length; i++) {
        balanceUW.push(0);
        changeInUWBalance.push(0);
      }
      let rewardsFlag = 1;
      async function updateUWDetails(changeInUWBalanceExpected) {
        for (let i = 0; i < UWarray.length; i++) {
          let currentUWBalance = parseFloat(
            (await tk.balanceOf(UWarray[i])) / 1e18
          );
          changeInUWBalance[i] = currentUWBalance - balanceUW[i];
          if (changeInUWBalance[i] != changeInUWBalanceExpected[i]) {
            rewardsFlag = -1;
          }
          balanceUW[i] = currentUWBalance;
        }
      }
      function claimAllUWRewards() {
        for (let i = 0; i < UWarray.length; i++)
          cr.claimAllPendingReward([], { from: UWarray[i] });
      }
      // buy cover 1
      await p1.makeCoverBegin(
        SC1,
        ethereum_string,
        [1, 6570841889000000, 100000000000000000000, 3549627424],
        100,
        28,
        '0x6c944cf6193a757c7dfe36691aa993ac5b635c705db54df4bd30f333b4b209f9',
        '0x4400c07f7b7a3335f9ab7a0cba334995eac0b385363cb884010b487aa9fede6e',
        { from: coverHolder5, value: 6570841889000000 }
      );
      let lockedCN = await tf.getLockedCNAgainstCover(1);
      claimAllUWRewards();
      allLockCNDetails.push(lockedCN);
      updateUWDetails([20, 0, 0, 0, 0]);

      if ((await tk.totalSupply()) < 600000 * 1e18)
        await p1.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      else await p1.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);

      // buy cover 2
      await dai.transfer(coverHolder3, 164271047228000000);
      await dai.approve(p1.address, 164271047228000000, { from: coverHolder3 });
      await p1.makeCoverUsingCA(
        SC1,
        dai_string,
        [25, 164271047228000000, 100000000000000000000, 3549627424],
        100,
        27,
        '0x24c7142dc7df88d843ded769a01aa8f971ea152fad2be311f463f792c1c7948e',
        '0x62320c196a6bba57d0d74db3426036794fa105225baa25d2d4dd7e6b3a726535',
        { from: coverHolder3 }
      );
      lockedCN = await tf.getLockedCNAgainstCover(2);
      claimAllUWRewards();
      allLockCNDetails.push(lockedCN);
      updateUWDetails([20, 0, 0, 0, 0]);
      if ((await tk.totalSupply()) < 600000 * 1e18)
        await p1.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      else await p1.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);

      // buy cover 3
      await p1.makeCoverBegin(
        SC2,
        ethereum_string,
        [2, 26283367556000000, 200000000000000000000, 3549627424],
        200,
        27,
        '0x8e8914d33082e0a559193d1a213c17b9b713c718a0947e97e9147ee1da0d5cfb',
        '0x538fe22574703a22eee32439266802ad2bbf86f7b1725eca9f19869d19eab7d9',
        { from: coverHolder1, value: 26283367556000000 }
      );
      lockedCN = await tf.getLockedCNAgainstCover(3);
      claimAllUWRewards();
      allLockCNDetails.push(lockedCN);
      updateUWDetails([0, 0, 40, 0, 0]);
      if ((await tk.totalSupply()) < 600000 * 1e18)
        await p1.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      else await p1.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);

      // buy cover 4
      await dai.transfer(coverHolder2, 657084188912000000);
      await dai.approve(p1.address, 657084188912000000, { from: coverHolder2 });
      await p1.makeCoverUsingCA(
        SC2,
        dai_string,
        [50, 657084188912000000, 200000000000000000000, 3549627424],
        200,
        28,
        '0x4eababac8c2ce2de33b187fdebeb2204b0b7a6324da5c04cae740c12e442f7db',
        '0x176abf6c5eafd69a80d93fdb36d42a4f2528d28102642f610d885fc271cde6b3',
        { from: coverHolder2 }
      );
      lockedCN = await tf.getLockedCNAgainstCover(4);
      claimAllUWRewards();
      allLockCNDetails.push(lockedCN);
      updateUWDetails([0, 0, 40, 0, 0]);
      if ((await tk.totalSupply()) < 600000 * 1e18)
        await p1.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      else await p1.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);

      // buy cover 5
      await p1.makeCoverBegin(
        SC3,
        ethereum_string,
        [3, 59137577002000000, 300000000000000000000, 3549627424],
        300,
        27,
        '0x259d493e835d7914cf303ebcf54b70facb5578ba2ceb5312fd7370acd83a8a38',
        '0x6d007b19b3c9eb5f674456169c46a1237e5012c609789f0aeb7d5ec133638658',
        { from: coverHolder4, value: 59137577002000000 }
      );
      lockedCN = await tf.getLockedCNAgainstCover(5);
      claimAllUWRewards();
      allLockCNDetails.push(lockedCN);
      updateUWDetails([0, 0, 0, 0, 60]);
      if ((await tk.totalSupply()) < 600000 * 1e18)
        await p1.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      else await p1.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);

      // buy cover 6
      await dai.transfer(coverHolder6, 1478439425051000000);
      await dai.approve(p1.address, 1478439425051000000, {
        from: coverHolder6
      });
      await p1.makeCoverUsingCA(
        SC3,
        dai_string,
        [75, 1478439425051000000, 300000000000000000000, 3549627424],
        300,
        27,
        '0xc95fd84e43701129559932594c8b2795db605225513adc024fc12d62b6336b0a',
        '0x042e2fdcb91b51c3779495674042d8da8da5586ecb71cef86d0ad7ab104b3811',
        { from: coverHolder6 }
      );
      lockedCN = await tf.getLockedCNAgainstCover(6);
      claimAllUWRewards();
      allLockCNDetails.push(lockedCN);
      updateUWDetails([0, 0, 0, 0, 60]);
      if ((await tk.totalSupply()) < 600000 * 1e18)
        await p1.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      else await p1.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);

      // buy cover 7
      await p1.makeCoverBegin(
        SC4,
        ethereum_string,
        [4, 105133470226000000, 400000000000000000000, 3549627424],
        400,
        27,
        '0x2da1cb66be29243a25b3dd4b699cd2a0fb923600fb735d690f022d6c5bc79248',
        '0x5159be8e2c06a468af31d3cebdebeb9ad8fb735a365da194eea7a844b331472a',
        { from: coverHolder7, value: 105133470226000000 }
      );
      lockedCN = await tf.getLockedCNAgainstCover(7);
      claimAllUWRewards();
      allLockCNDetails.push(lockedCN);
      updateUWDetails([0, 20, 20, 15, 25]);
      if ((await tk.totalSupply()) < 600000 * 1e18)
        await p1.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      else await p1.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);

      // buy cover 8
      await dai.transfer(coverHolder8, 2628336755647000000);
      await dai.approve(p1.address, 2628336755647000000, {
        from: coverHolder8
      });
      await p1.makeCoverUsingCA(
        SC4,
        dai_string,
        [100, 2628336755647000000, 400000000000000000000, 3549627424],
        400,
        28,
        '0xfcde6fd85c5dc1424ce136dcbdbdbb87f331c4ae01a1a7882d2f08c200020354',
        '0x2aa8769ca67007bdce1a2d68a4c5a53c1723127f565effee24bc7c7081bc79a4',
        { from: coverHolder8 }
      );
      lockedCN = await tf.getLockedCNAgainstCover(8);
      claimAllUWRewards();

      allLockCNDetails.push(lockedCN);
      updateUWDetails([35, 10, 0, 0, 0]);
      if ((await tk.totalSupply()) < 600000 * 1e18)
        await p1.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      else await p1.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);

      // buy cover 9
      await p1.makeCoverBegin(
        SC5,
        ethereum_string,
        [5, 164271047228000000, 500000000000000000000, 3549627424],
        500,
        28,
        '0x42265a1747e5656d930bcf57c7325bb4fde14b18ff6bd490e1746c9e580d6fda',
        '0x544b183f8f8327976832f5f6fc685a032e20f54f0b93f50f45205b5d6fe0b8ed',
        { from: coverHolder9, value: 164271047228000000 }
      );
      lockedCN = await tf.getLockedCNAgainstCover(9);
      claimAllUWRewards();

      allLockCNDetails.push(lockedCN);
      updateUWDetails([12.5, 10, 5, 2.5, 7.5]);
      if ((await tk.totalSupply()) < 600000 * 1e18)
        await p1.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      else await p1.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);

      await tf.upgradeCapitalPool(owner);
      await p1.sendTransaction({ from: owner, value: 50 * 1e18 });
      await dai.transfer(p1.address, 1250 * 1e18);
      let lockCNFlag = 1;
      for (let i = 0; i < UWarray.length; i++) {
        if (allCoverPremiums[i] * 0.1 * 1e18 != allLockCNDetails[i])
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

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }
      await tc.lock(CLA, 50000 * 1e18, validity, { from: claimAssessor1 });
      await tc.lock(CLA, 30000 * 1e18, validity, { from: claimAssessor2 });
      await tc.lock(CLA, 20000 * 1e18, validity, { from: claimAssessor3 });
      // cannot withdraw membership as it has staked tokens
      await assertRevert(mr.withdrawMembership({ from: claimAssessor1 }));

      coverID = await qd.getAllCoversOfUser(coverHolder5);

      // try submitting an invalid cover ID
      await assertRevert(tf.depositCN(46, { from: owner }));

      await cl.submitClaim(coverID[0], { from: coverHolder5 });
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      // try submitting the same claim again (to pass the TokenData.sol setDepositCN's require condition of the coverage report)
      // await assertRevert(cl.submitClaim(coverID[0], { from: coverHolder5 }));
      await assertRevert(td.setDepositCN(coverID[0], true, { from: owner }));

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

      await cl.submitCAVote(claimID, -1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor3 });

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

      closingTime = minVotingTime.plus(now);
      await increaseTimeTo(closingTime.minus(10));

      await p1.__callback(APIID, '');

      assert.equal(parseFloat((await cd.getClaimStatusNumber(claimID))[1]), 0);

      // check the CA vote not closing before the minimum time is reached even if the CA Vote is greater than 10*SA
      await increaseTimeTo(closingTime.plus(10));

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

      payoutReceived = (balanceAfter - balanceBefore) / 1e18;
      coverTokensUnlockable = (tokenBalanceBefore - tokenBalanceAfter) / 1e18;
      coverTokensBurned = Number(
        ((totalBalanceBefore - totalBalanceAfter) / 1e18).toFixed(2)
      );

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }

      // now = await latestTime();
      // await increaseTimeTo(now+(await td.bookTime())/1+10);
      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        1e18;
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        1e18;
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        1e18;

      let proposalIds = [];
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor1 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor2 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor3 });

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
      for (let i = 0; i < UWarray.length; i++) {
        UWTokensLocked.push(
          (parseFloat(
            await tf.getStakerLockedTokensOnSmartContract(UWarray[i], SC1, i)
          ) -
            parseFloat(
              await tf.getStakerUnlockableTokensOnSmartContract(
                UWarray[i],
                SC1,
                0
              )
            )) /
            1e18
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
      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * 1e18)
      //   await tc.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);
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

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }

      // need not to do the lock again
      // await tc.lock(CLA, 50000 * 1e18, validity, {from: claimAssessor1});
      // await tc.lock(CLA, 30000 * 1e18, validity, {from: claimAssessor2});
      // await tc.lock(CLA, 20000 * 1e18, validity, {from: claimAssessor3});

      coverID = await qd.getAllCoversOfUser(coverHolder5);
      await cl.submitClaim(coverID[0], { from: coverHolder5 });
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

      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor3 });

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
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

      let coverTokensLockedBefore = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder5, coverID)
      );
      let tokenBalanceBefore = parseFloat(await tk.balanceOf(coverHolder5));
      let balanceBefore = await web3.eth.getBalance(coverHolder5);
      let totalBalanceBefore = parseFloat(
        await tc.totalBalanceOf(coverHolder5)
      );

      let UWTokensLocked = [];
      for (let i = 0; i < UWarray.length; i++) {
        UWTokensLocked.push(
          (parseFloat(
            await tf.getStakerLockedTokensOnSmartContract(UWarray[i], SC1, i)
          ) -
            parseFloat(
              await tf.getStakerUnlockableTokensOnSmartContract(
                UWarray[i],
                SC1,
                0
              )
            )) /
            1e18
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
        ((totalBalanceBefore - totalBalanceAfter) / 1e18).toFixed(2)
      );
      payoutReceived = Number(
        ((balanceAfter - balanceBefore) / 1e18).toFixed(2)
      );
      coverTokensUnlockable = Number(
        ((tokenBalanceAfter - tokenBalanceBefore) / 1e18).toFixed(2)
      );

      now = await latestTime();

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        1e18;
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        1e18;
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        1e18;

      let proposalIds = [];
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor1 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor2 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor3 });

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      claimAssessor3Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor3, CLA)
      );
      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
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
          1e18,
        2000
      );

      // befor the last burn happened, all UW 2000 were staked and none was unlocked befor the voting closed.
      assert.equal(
        parseFloat(
          await td.getStakerStakedUnlockableBeforeLastBurnByIndex(
            underWriter1,
            0
          )
        ) / 1e18,
        0
      );

      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * 1e18)
      //   await tc.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);

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
      // await tc.lock(CLA, 50000 * 1e18, validity, {from: claimAssessor1});
      // await tc.lock(CLA, 30000 * 1e18, validity, {from: claimAssessor2});
      // await tc.lock(CLA, 20000 * 1e18, validity, {from: claimAssessor3});
      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }

      let UWTokensLocked = [];
      for (let i = 0; i < UWarray.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(UWarray[i], SC1, i)
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  UWarray[i],
                  SC1,
                  0
                )
              )) /
              1e18
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder3);
      await cl.submitClaim(coverID[0], { from: coverHolder3 });
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

      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor3 });

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
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

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
        1e18;
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        1e18;
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        1e18;

      // now member voting started
      await cl.submitMemberVote(claimID, -1, { from: member1 });
      await cl.submitMemberVote(claimID, -1, { from: member2 });
      await cl.submitMemberVote(claimID, 1, { from: member3 });

      // cannot withdraw membership as member has voted
      await assertRevert(mr.withdrawMembership({ from: member1 }));
      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

      // now member voting will be closed
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor1 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor2 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor3 });

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
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / 1e18;
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / 1e18;
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / 1e18;

      await cr.claimAllPendingReward(proposalIds, { from: member1 });
      await cr.claimAllPendingReward(proposalIds, { from: member2 });
      await cr.claimAllPendingReward(proposalIds, { from: member3 });

      let balanceAfter = await dai.balanceOf(coverHolder3);
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder3));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder3, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder3));

      coverTokensBurned = Number(
        ((totalBalanceBefore - totalBalanceAfter) / 1e18).toFixed(2)
      );
      payoutReceived = Number(
        ((balanceAfter - balanceBefore) / 1e18).toFixed(2)
      );
      coverTokensUnlockable = Number(
        ((tokenBalanceAfter - tokenBalanceBefore) / 1e18).toFixed(2)
      );

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
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
      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * 1e18)
      //   await tc.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);
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
      // await tc.lock(CLA, 50000 * 1e18, validity, {from: claimAssessor1});
      // await tc.lock(CLA, 30000 * 1e18, validity, {from: claimAssessor2});
      // await tc.lock(CLA, 20000 * 1e18, validity, {from: claimAssessor3});
      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }

      let UWTokensLocked = [];
      for (let i = 0; i < UWarray.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(UWarray[i], SC1, i)
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  UWarray[i],
                  SC1,
                  0
                )
              )) /
              1e18
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder3);
      await cl.submitClaim(coverID[0], { from: coverHolder3 });
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

      await cl.submitCAVote(claimID, -1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor3 });

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
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

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
        1e18;
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        1e18;
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        1e18;

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });
      await cl.submitMemberVote(claimID, -1, { from: member3 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

      // now member voting will be closed
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor1 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor2 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor3 });

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
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / 1e18;
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / 1e18;
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / 1e18;

      await cr.claimAllPendingReward(proposalIds, { from: member1 });
      await cr.claimAllPendingReward(proposalIds, { from: member2 });
      await cr.claimAllPendingReward(proposalIds, { from: member3 });

      let balanceAfter = parseFloat(await dai.balanceOf(coverHolder3));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder3));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder3, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder3));

      coverTokensBurned = Number(
        ((totalBalanceBefore - totalBalanceAfter) / 1e18).toFixed(2)
      );
      payoutReceived = Number(
        ((balanceAfter - balanceBefore) / 1e18).toFixed(2)
      );
      coverTokensUnlockable = Number(
        ((tokenBalanceAfter - tokenBalanceBefore) / 1e18).toFixed(2)
      );

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
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
      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * 1e18)
      //   await tc.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);
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

      UWarray = [
        underWriter3,
        underWriter2,
        underWriter5,
        underWriter4,
        underWriter1
      ];
      // need not to do the lock again
      // await tc.lock(CLA, 50000 * 1e18, validity, {from: claimAssessor1});
      // await tc.lock(CLA, 30000 * 1e18, validity, {from: claimAssessor2});
      // await tc.lock(CLA, 20000 * 1e18, validity, {from: claimAssessor3});

      await tc.lock(CLA, 60000 * 1e18, validity, { from: claimAssessor4 });
      await tc.lock(CLA, 50000 * 1e18, validity, { from: claimAssessor5 });

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }

      let UWTokensLocked = [];
      for (let i = 0; i < UWarray.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(UWarray[i], SC2, i)
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  UWarray[i],
                  SC2,
                  1
                )
              )) /
              1e18
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder1);
      await cl.submitClaim(coverID[0], { from: coverHolder1 });
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
      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor3 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor4 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor5 });

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
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

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
        1e18;
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        1e18;
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        1e18;
      claimAssessor4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        1e18;
      claimAssessor5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor5)) /
        1e18;

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });
      await cl.submitMemberVote(claimID, 1, { from: member3 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

      // now member voting will be closed
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor1 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor2 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor3 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor4 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor5 });

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
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / 1e18;
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / 1e18;
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / 1e18;

      await cr.claimAllPendingReward(proposalIds, { from: member1 });
      await cr.claimAllPendingReward(proposalIds, { from: member2 });
      await cr.claimAllPendingReward(proposalIds, { from: member3 });

      let balanceAfter = parseFloat(await web3.eth.getBalance(coverHolder1));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder1));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder1, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder1));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / 1e18
      ).toFixed(2);
      payoutReceived = Number((balanceAfter - balanceBefore) / 1e18).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / 1e18
      ).toFixed(2);

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
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

      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * 1e18)
      //   await tc.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);
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

      UWarray = [
        underWriter3,
        underWriter2,
        underWriter5,
        underWriter4,
        underWriter1
      ];

      // need not to do the lock again
      // await tc.lock(CLA, 50000 * 1e18, validity, {from: claimAssessor1});
      // await tc.lock(CLA, 30000 * 1e18, validity, {from: claimAssessor2});
      // await tc.lock(CLA, 20000 * 1e18, validity, {from: claimAssessor3});

      // await tc.lock(CLA, 60000 * 1e18, validity, {from: claimAssessor4});
      // await tc.lock(CLA, 50000 * 1e18, validity, {from: claimAssessor5});
      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }

      let UWTokensLocked = [];
      for (let i = 0; i < UWarray.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(UWarray[i], SC2, i)
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  UWarray[i],
                  SC2,
                  1
                )
              )) /
              1e18
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder1);
      await cl.submitClaim(coverID[0], { from: coverHolder1 });
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
      await cl.submitCAVote(claimID, -1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor3 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor4 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor5 });

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
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

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
        1e18;
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        1e18;
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        1e18;
      claimAssessor4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        1e18;
      claimAssessor5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor5)) /
        1e18;

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });
      await cl.submitMemberVote(claimID, 1, { from: member3 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

      // now member voting will be closed
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor1 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor2 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor3 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor4 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor5 });

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
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / 1e18;
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / 1e18;
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / 1e18;

      await cr.claimAllPendingReward(proposalIds, { from: member1 });
      await cr.claimAllPendingReward(proposalIds, { from: member2 });
      await cr.claimAllPendingReward(proposalIds, { from: member3 });

      let balanceAfter = parseFloat(await web3.eth.getBalance(coverHolder1));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder1));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder1, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder1));

      payoutReceived = (balanceAfter - balanceBefore) / 1e18;
      coverTokensUnlockable = (tokenBalanceAfter - tokenBalanceBefore) / 1e18;
      coverTokensBurned =
        (coverTokensLockedBefore - coverTokensLockedAfter) / 1e18;

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / 1e18
      ).toFixed(2);
      payoutReceived = Number((balanceAfter - balanceBefore) / 1e18).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / 1e18
      ).toFixed(2);

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
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
      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * 1e18)
      //   await tc.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);
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

      UWarray = [
        underWriter3,
        underWriter2,
        underWriter5,
        underWriter4,
        underWriter1
      ];

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }

      let UWTokensLocked = [];
      for (let i = 0; i < UWarray.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(UWarray[i], SC2, i)
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  UWarray[i],
                  SC2,
                  1
                )
              )) /
              1e18
          ).toFixed(2)
        );
      }

      // need not to do the lock again
      // await tc.lock(CLA, 50000 * 1e18, validity, {from: claimAssessor1});
      // await tc.lock(CLA, 30000 * 1e18, validity, {from: claimAssessor2});
      // await tc.lock(CLA, 20000 * 1e18, validity, {from: claimAssessor3});

      // await tc.lock(CLA, 60000 * 1e18, validity, {from: claimAssessor4});
      // await tc.lock(CLA, 50000 * 1e18, validity, {from: claimAssessor5});

      coverID = await qd.getAllCoversOfUser(coverHolder2);
      await cl.submitClaim(coverID[0], { from: coverHolder2 });
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

      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor3 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor4 });

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
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

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
        1e18;
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        1e18;
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        1e18;
      claimAssessor4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        1e18;

      // now member voting started
      await cl.submitMemberVote(claimID, -1, { from: member1 });
      await cl.submitMemberVote(claimID, -1, { from: member2 });
      await cl.submitMemberVote(claimID, -1, { from: member3 });
      await cl.submitMemberVote(claimID, -1, { from: member4 });
      await cl.submitMemberVote(claimID, 1, { from: member5 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

      // now member voting will be closed
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor1 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor2 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor3 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor4 });

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
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / 1e18;
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / 1e18;
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / 1e18;
      member4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member4)) / 1e18;
      member5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member5)) / 1e18;

      await cr.claimAllPendingReward(proposalIds, { from: member1 });
      await cr.claimAllPendingReward(proposalIds, { from: member2 });
      await cr.claimAllPendingReward(proposalIds, { from: member3 });
      await cr.claimAllPendingReward(proposalIds, { from: member4 });
      await cr.claimAllPendingReward(proposalIds, { from: member5 });

      let balanceAfter = parseFloat(await dai.balanceOf(coverHolder2));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder2));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder2, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder2));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / 1e18
      ).toFixed(2);
      payoutReceived = Number((balanceAfter - balanceBefore) / 1e18).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / 1e18
      ).toFixed(2);

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
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
      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * 1e18)
      //   await tc.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);
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

      UWarray = [
        underWriter3,
        underWriter2,
        underWriter5,
        underWriter4,
        underWriter1
      ];
      // need not to do the lock again
      // await tc.lock(CLA, 50000 * 1e18, validity, {from: claimAssessor1});
      // await tc.lock(CLA, 30000 * 1e18, validity, {from: claimAssessor2});
      // await tc.lock(CLA, 20000 * 1e18, validity, {from: claimAssessor3});

      // await tc.lock(CLA, 60000 * 1e18, validity, {from: claimAssessor4});
      // await tc.lock(CLA, 50000 * 1e18, validity, {from: claimAssessor5});
      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }

      let UWTokensLocked = [];
      for (let i = 0; i < UWarray.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(UWarray[i], SC2, i)
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  UWarray[i],
                  SC2,
                  1
                )
              )) /
              1e18
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder2);
      await cl.submitClaim(coverID[0], { from: coverHolder2 });
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

      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor3 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor4 });

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
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

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
        1e18;
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        1e18;
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        1e18;
      claimAssessor4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        1e18;

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });
      await cl.submitMemberVote(claimID, 1, { from: member3 });
      await cl.submitMemberVote(claimID, 1, { from: member4 });
      await cl.submitMemberVote(claimID, -1, { from: member5 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

      // now member voting will be closed
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor1 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor2 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor3 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor4 });

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
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / 1e18;
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / 1e18;
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / 1e18;
      member4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member4)) / 1e18;
      member5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member5)) / 1e18;

      await cr.claimAllPendingReward(proposalIds, { from: member1 });
      await cr.claimAllPendingReward(proposalIds, { from: member2 });
      await cr.claimAllPendingReward(proposalIds, { from: member3 });
      await cr.claimAllPendingReward(proposalIds, { from: member4 });
      await cr.claimAllPendingReward(proposalIds, { from: member5 });

      let balanceAfter = parseFloat(await dai.balanceOf(coverHolder2));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder2));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder2, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder2));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / 1e18
      ).toFixed(2);
      payoutReceived = Number((balanceAfter - balanceBefore) / 1e18).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / 1e18
      ).toFixed(2);

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
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

      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * 1e18)
      //   await tc.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);
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

      UWarray = [
        underWriter5,
        underWriter4,
        underWriter3,
        underWriter2,
        underWriter1
      ];
      // need not to do the lock again
      // await tc.lock(CLA, 50000 * 1e18, validity, {from: claimAssessor1});
      // await tc.lock(CLA, 30000 * 1e18, validity, {from: claimAssessor2});
      // await tc.lock(CLA, 20000 * 1e18, validity, {from: claimAssessor3});
      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }
      let UWTokensLocked = [];
      for (let i = 0; i < UWarray.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(UWarray[i], SC3, i)
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  UWarray[i],
                  SC3,
                  2
                )
              )) /
              1e18
          ).toFixed(2)
        );
      }
      coverID = await qd.getAllCoversOfUser(coverHolder4);
      await cl.submitClaim(coverID[0], { from: coverHolder4 });
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

      await cl.submitCAVote(claimID, -1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor3 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor4 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor5 });

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
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

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
        (totalBalanceBefore - totalBalanceAfter) / 1e18
      ).toFixed(2);
      payoutReceived = Number((balanceAfter - balanceBefore) / 1e18).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / 1e18
      ).toFixed(2);
      now = await latestTime();

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        1e18;
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        1e18;
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        1e18;
      claimAssessor4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        1e18;
      claimAssessor5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor5)) /
        1e18;

      let proposalIds = [];
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor1 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor2 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor3 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor4 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor5 });

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

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
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

      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * 1e18)
      //   await tc.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);
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

      UWarray = [
        underWriter5,
        underWriter4,
        underWriter3,
        underWriter2,
        underWriter1
      ];

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }

      let UWTokensLocked = [];
      for (let i = 0; i < UWarray.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(UWarray[i], SC3, i)
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  UWarray[i],
                  SC3,
                  2
                )
              )) /
              1e18
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder4);
      await cl.submitClaim(coverID[0], { from: coverHolder4 });
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

      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor3 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor4 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor5 });

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
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

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
        (totalBalanceBefore - totalBalanceAfter) / 1e18
      ).toFixed(2);
      payoutReceived = Number((balanceAfter - balanceBefore) / 1e18).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / 1e18
      ).toFixed(2);
      now = await latestTime();

      claimAssessor1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor1)) /
        1e18;
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        1e18;
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        1e18;
      claimAssessor4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        1e18;
      claimAssessor5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor5)) /
        1e18;

      let proposalIds = [];
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor1 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor2 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor3 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor4 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor5 });

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

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
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
      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * 1e18)
      //   await tc.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);
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

      UWarray = [
        underWriter5,
        underWriter4,
        underWriter3,
        underWriter2,
        underWriter1
      ];
      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }

      let UWTokensLocked = [];
      for (let i = 0; i < UWarray.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(UWarray[i], SC3, i)
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  UWarray[i],
                  SC3,
                  2
                )
              )) /
              1e18
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder6);
      await cl.submitClaim(coverID[0], { from: coverHolder6 });
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

      await cl.submitCAVote(claimID, -1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor3 });

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
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

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
        1e18;
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        1e18;
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        1e18;

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

      // now member voting will be closed
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor1 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor2 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor3 });

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
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / 1e18;
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / 1e18;

      await cr.claimAllPendingReward(proposalIds, { from: member1 });
      await cr.claimAllPendingReward(proposalIds, { from: member2 });

      let balanceAfter = parseFloat(await dai.balanceOf(coverHolder6));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder6));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder6, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder6));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / 1e18
      ).toFixed(2);
      payoutReceived = Number((balanceAfter - balanceBefore) / 1e18).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / 1e18
      ).toFixed(2);

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
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

      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * 1e18)
      //   await tc.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);
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

      UWarray = [
        underWriter5,
        underWriter4,
        underWriter3,
        underWriter2,
        underWriter1
      ];
      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }

      let UWTokensLocked = [];
      for (let i = 0; i < UWarray.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(UWarray[i], SC3, i)
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  UWarray[i],
                  SC3,
                  2
                )
              )) /
              1e18
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder6);
      await cl.submitClaim(coverID[0], { from: coverHolder6 });
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

      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor3 });

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
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

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
        1e18;
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        1e18;
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        1e18;

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

      // now member voting will be closed
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor1 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor2 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor3 });

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
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / 1e18;
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / 1e18;

      await cr.claimAllPendingReward(proposalIds, { from: member1 });
      await cr.claimAllPendingReward(proposalIds, { from: member2 });

      let balanceAfter = parseFloat(await dai.balanceOf(coverHolder6));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder6));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder6, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder6));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / 1e18
      ).toFixed(2);
      payoutReceived = Number((balanceAfter - balanceBefore) / 1e18).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / 1e18
      ).toFixed(2);

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
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

      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * 1e18)
      //   await tc.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);
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
      UWarray = [
        underWriter4,
        underWriter3,
        underWriter5,
        underWriter2,
        underWriter1
      ];

      let member1Object = new member();
      let member2Object = new member();
      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }

      let UWTokensLocked = [];
      for (let i = 0; i < UWarray.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(UWarray[i], SC4, i)
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  UWarray[i],
                  SC4,
                  3
                )
              )) /
              1e18
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder7);
      await cl.submitClaim(coverID[0], { from: coverHolder7 });
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      maxVotingTime = await cd.maxVotingTime();
      let now = await latestTime();
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

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
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

      // now member voting will be closed
      await p1.__callback(APIID, '');

      let proposalIds = [];

      member1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / 1e18;
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / 1e18;

      await cr.claimAllPendingReward(proposalIds, { from: member1 });
      await cr.claimAllPendingReward(proposalIds, { from: member2 });

      let balanceAfter = parseFloat(await dai.balanceOf(coverHolder7));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder7));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder7, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder7));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / 1e18
      ).toFixed(2);
      payoutReceived = Number((balanceAfter - balanceBefore) / 1e18).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / 1e18
      ).toFixed(2);

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }

      for (let i = 0; i < UWarray.length; i++) {
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

      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * 1e18)
      //   await tc.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);
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

      UWarray = [
        underWriter4,
        underWriter3,
        underWriter5,
        underWriter2,
        underWriter1
      ];

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }

      let UWTokensLocked = [];
      for (let i = 0; i < UWarray.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(UWarray[i], SC4, i)
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  UWarray[i],
                  SC4,
                  3
                )
              )) /
              1e18
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder7);
      await cl.submitClaim(coverID[0], { from: coverHolder7 });
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
      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor3 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor4 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor5 });

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
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

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
        1e18;
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        1e18;
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        1e18;
      claimAssessor4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        1e18;
      claimAssessor5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor5)) /
        1e18;

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });
      await cl.submitMemberVote(claimID, 1, { from: member3 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

      // now member voting will be closed
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor1 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor2 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor3 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor4 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor5 });

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
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / 1e18;
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / 1e18;
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / 1e18;

      await cr.claimAllPendingReward(proposalIds, { from: member1 });
      await cr.claimAllPendingReward(proposalIds, { from: member2 });
      await cr.claimAllPendingReward(proposalIds, { from: member3 });

      let balanceAfter = parseFloat(await web3.eth.getBalance(coverHolder7));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder7));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder7, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder7));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / 1e18
      ).toFixed(2);
      payoutReceived = Number((balanceAfter - balanceBefore) / 1e18).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / 1e18
      ).toFixed(2);

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
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

      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * 1e18)
      //   await tc.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);
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

      UWarray = [
        underWriter4,
        underWriter3,
        underWriter5,
        underWriter2,
        underWriter1
      ];
      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }

      let UWTokensLocked = [];
      for (let i = 0; i < UWarray.length; i++) {
        UWTokensLocked.push(
          Number(
            (parseFloat(
              await tf.getStakerLockedTokensOnSmartContract(UWarray[i], SC4, i)
            ) -
              parseFloat(
                await tf.getStakerUnlockableTokensOnSmartContract(
                  UWarray[i],
                  SC4,
                  3
                )
              )) /
              1e18
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder8);
      await cl.submitClaim(coverID[0], { from: coverHolder8 });
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
      await cl.submitCAVote(claimID, -1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor2 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor3 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor4 });
      await cl.submitCAVote(claimID, 1, { from: claimAssessor5 });

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
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

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
        1e18;
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        1e18;
      claimAssessor3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor3)) /
        1e18;
      claimAssessor4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor4)) /
        1e18;
      claimAssessor5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor5)) /
        1e18;

      // now member voting started
      await cl.submitMemberVote(claimID, 1, { from: member1 });
      await cl.submitMemberVote(claimID, 1, { from: member2 });
      await cl.submitMemberVote(claimID, 1, { from: member3 });

      // to close the member voting
      maxVotingTime = await cd.maxVotingTime();
      now = await latestTime();
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

      // now member voting will be closed
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor1 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor2 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor3 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor4 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor5 });

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
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / 1e18;
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / 1e18;
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / 1e18;

      await cr.claimAllPendingReward(proposalIds, { from: member1 });
      await cr.claimAllPendingReward(proposalIds, { from: member2 });
      await cr.claimAllPendingReward(proposalIds, { from: member3 });

      let balanceAfter = parseFloat(await dai.balanceOf(coverHolder8));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder8));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder8, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder8));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / 1e18
      ).toFixed(2);
      payoutReceived = Number((balanceAfter - balanceBefore) / 1e18).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / 1e18
      ).toFixed(2);

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
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

      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * 1e18)
      //   await tc.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);
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

      UWarray = [
        underWriter4,
        underWriter3,
        underWriter5,
        underWriter2,
        underWriter1
      ];
      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceBefore[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
      }

      let UWTokensLocked = [];
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
              1e18
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder9);
      await cl.submitClaim(coverID[0], { from: coverHolder9 });
      claimID = (await cd.actualClaimLength()) - 1;
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );
      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor2 });

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );

      maxVotingTime = await cd.maxVotingTime();
      let now = await latestTime();
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

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
        1e18;
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        1e18;

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
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

      // now member voting will be closed
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor1 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor2 });

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );

      member1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / 1e18;
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / 1e18;
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / 1e18;
      member4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member4)) / 1e18;
      member5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member5)) / 1e18;
      member6Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member6)) / 1e18;

      await cr.claimAllPendingReward(proposalIds, { from: member1 });
      await cr.claimAllPendingReward(proposalIds, { from: member2 });
      await cr.claimAllPendingReward(proposalIds, { from: member3 });
      await cr.claimAllPendingReward(proposalIds, { from: member4 });
      await cr.claimAllPendingReward(proposalIds, { from: member5 });
      await cr.claimAllPendingReward(proposalIds, { from: member6 });

      let balanceAfter = parseFloat(await web3.eth.getBalance(coverHolder9));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder9));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder9, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder9));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / 1e18
      ).toFixed(2);
      payoutReceived = Number((balanceAfter - balanceBefore) / 1e18).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / 1e18
      ).toFixed(2);

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
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

      assert.equal(payoutReceived, 0);
      assert.equal(coverTokensUnlockable, 0);
      assert.equal(coverTokensBurned, 25);

      let UWTokensLockedExpected = [5, 10, 15, 20, 25];
      let UWTokensBurnedExpected = [0, 0, 0, 0, 0];

      for (let i = 0; i < UWarray.length; i++) {
        assert.equal(UWTokensLockedExpected[i], UWTokensLocked[i]);
        assert.equal(UWTokensBurnedExpected[i], UWTokensBurned[i]);
      }

      // if ((await tk.totalSupply()) < 600000 * 1e18)
      //   await tc.mint(owner, 600000 * 1e18 - (await tk.totalSupply()));
      // else await tc.burnFrom(owner, (await tk.totalSupply()) - 600000 * 1e18);
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
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
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
              1e18
          ).toFixed(2)
        );
      }

      coverID = await qd.getAllCoversOfUser(coverHolder9);
      await cl.submitClaim(coverID[0], { from: coverHolder9 });
      APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      claimID = (await cd.actualClaimLength()) - 1;
      claimAssessor1Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.initialDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );

      await cl.submitCAVote(claimID, 1, { from: claimAssessor1 });
      await cl.submitCAVote(claimID, -1, { from: claimAssessor2 });

      claimAssessor1Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.newLockDate = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );

      maxVotingTime = await cd.maxVotingTime();
      let now = await latestTime();
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

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
        1e18;
      claimAssessor2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(claimAssessor2)) /
        1e18;

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
      closingTime = maxVotingTime.plus(now);
      await increaseTimeTo(closingTime.plus(2));

      // now member voting will be closed
      await p1.__callback(APIID, '');

      let proposalIds = [];
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor1 });
      await cr.claimAllPendingReward(proposalIds, { from: claimAssessor2 });

      claimAssessor1Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor1, CLA)
      );
      claimAssessor2Object.lockPeriodAfterRewardRecieved = parseFloat(
        await tc.getLockedTokensValidity(claimAssessor2, CLA)
      );

      member1Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member1)) / 1e18;
      member2Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member2)) / 1e18;
      member3Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member3)) / 1e18;
      member4Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member4)) / 1e18;
      member5Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member5)) / 1e18;
      member6Object.rewardRecieved =
        parseFloat(await cr.getRewardToBeDistributedByUser(member6)) / 1e18;

      await increaseTimeTo(closingTime.plus(172800));

      // cannot withdraw membership as it has not claimed Pending reward
      await assertRevert(mr.withdrawMembership({ from: member1 }));

      await cr.claimAllPendingReward(proposalIds, { from: member1 });
      await cr.claimAllPendingReward(proposalIds, { from: member2 });
      await cr.claimAllPendingReward(proposalIds, { from: member3 });
      await cr.claimAllPendingReward(proposalIds, { from: member4 });
      await cr.claimAllPendingReward(proposalIds, { from: member5 });
      await cr.claimAllPendingReward(proposalIds, { from: member6 });

      let balanceAfter = parseFloat(await web3.eth.getBalance(coverHolder9));
      let tokenBalanceAfter = parseFloat(await tk.balanceOf(coverHolder9));
      let coverTokensLockedAfter = parseFloat(
        await tf.getUserLockedCNTokens(coverHolder9, coverID)
      );
      let totalBalanceAfter = parseFloat(await tc.totalBalanceOf(coverHolder9));

      coverTokensBurned = Number(
        (totalBalanceBefore - totalBalanceAfter) / 1e18
      ).toFixed(2);
      payoutReceived = Number((balanceAfter - balanceBefore) / 1e18).toFixed(2);
      coverTokensUnlockable = Number(
        (tokenBalanceAfter - tokenBalanceBefore) / 1e18
      ).toFixed(2);

      for (let i = 0; i < UWarray.length; i++) {
        UWTotalBalanceAfter[i] =
          parseFloat(await tc.totalBalanceOf(UWarray[i])) / 1e18;
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
      tf.addStake(SC1, 200 * 1e18, { from: underWriter6 });
      coverID = await qd.getAllCoversOfUser(coverHolder5);

      await tf.burnStakerLockedToken(SC1, 0);
    });
    it('18.25 when stakerStakedNXM = 0', async function() {
      maxVotingTime = await cd.maxVotingTime();
      let maxStakeTime = 21600000;
      let now = await latestTime();
      closingTime = maxVotingTime.plus(now + maxStakeTime);
      await increaseTimeTo(closingTime);
      await tf.burnStakerLockedToken(SC1, 10);
    });
    it('18.26 when stakerStakedNXM = 0', async function() {
      await assertRevert(p1.depositCN(0));
    });
    it('18.26 when stakerStakedNXM = 0', async function() {
      console.log(parseFloat(await qd.getValidityOfCover(1)));
      console.log(parseFloat(await latestTime()));
      // await assertRevert(p1.depositCN(0));
    });
  });
});
