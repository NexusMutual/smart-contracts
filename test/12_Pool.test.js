const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolData');
const DAI = artifacts.require('MockDAI');
const exchangeMock = artifacts.require('ExchangeMock');
const MCR = artifacts.require('MCR');
const DSValue = artifacts.require('DSValueMock');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const NXMToken = artifacts.require('NXMToken');
const TokenController = artifacts.require('TokenController');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const MKR = artifacts.require('MockMKR');
const Governance = artifacts.require('GovernanceMock');
const FactoryMock = artifacts.require('FactoryMock');

const { advanceBlock } = require('./utils/advanceToBlock');
const { assertRevert } = require('./utils/assertRevert');
const { ether } = require('./utils/ether');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');
const encode = require('./utils/encoder.js').encode;
const gvProp = require('./utils/gvProposal.js').gvProposal;

let p1;
let p2;
let pd;
let cad;
let emock;
let mcr;
let DSV;
let qd;
let tk;
let tf;
let tc;
let mr;
let nxms;
let mkr;
let gv;
let fac;

const BigNumber = web3.BigNumber;
const newAsset = '0x535253';
const CA_DAI = '0x44414900';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const NEW_ADDRESS = '0xb24919181daead6635e613576ca11c5aa5a4e133';
const smartConAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const coverDetailsLess = [
  5,
  19671964915000000,
  20000000000000000000,
  3549627424
];
const coverPeriodLess = 50;
const vrsLess = [
  27,
  '0x22d150b6e2d3f9ae98c67425d1224c87aed5f853487252875118352771b3ece2',
  '0x0fb3f18fc2b8a74083b3cf8ca24bcf877a397836bd4fa1aba4c3ae96ca92873b'
];
const tokens = ether(200);
const stakeTokens = ether(2);
const fee = ether(0.002);
const UNLIMITED_ALLOWANCE = new BigNumber(2).pow(256).minus(1);
const tokenDai = ether(4);

require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('Pool', function([
  owner,
  notOwner,
  member1,
  member2,
  member3,
  member4
]) {
  before(async function() {
    await advanceBlock();
    p1 = await Pool1.deployed();
    p2 = await Pool2.deployed();
    pd = await PoolData.deployed();
    cad = await DAI.deployed();
    emock = await exchangeMock.deployed();
    mcr = await MCR.deployed();
    DSV = await DSValue.deployed();
    qd = await QuotationDataMock.deployed();
    nxms = await NXMaster.deployed();
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    tk = await NXMToken.deployed();
    tf = await TokenFunctions.deployed();
    tc = await TokenController.at(await nxms.getLatestAddress('TC'));
    let address = await nxms.getLatestAddress('GV');
    gv = await Governance.at(address);
    fac = await FactoryMock.deployed();
    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);
    await mcr.addMCRData(
      18000,
      100 * 1e18,
      2 * 1e18,
      ['0x455448', '0x444149'],
      [100, 65407],
      20181011
    );
    // await mr.payJoiningFee(owner, { from: owner, value: fee });
    // await mr.kycVerdict(owner, true);

    await mr.payJoiningFee(member1, { from: member1, value: fee });
    await mr.kycVerdict(member1, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member1 });
    await tk.transfer(member1, tokens);
    await tf.addStake(smartConAdd, stakeTokens, { from: member1 });

    await mr.payJoiningFee(member2, { from: member2, value: fee });
    await mr.kycVerdict(member2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member2 });
    await tk.transfer(member2, tokens);

    await mr.payJoiningFee(member3, { from: member3, value: fee });
    await mr.kycVerdict(member3, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member3 });
    await tk.transfer(member3, tokens);

    await mr.payJoiningFee(member4, { from: member4, value: fee });
    await mr.kycVerdict(member4, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member4 });
    await tk.transfer(member4, tokens);
  });

  describe('PoolData', function() {
    describe('Misc', function() {
      it('12.11 should return true if notarise address', async function() {
        (await pd.isnotarise(owner)).should.equal(true);
      });
      it('12.12 should return false if not notarise address', async function() {
        (await pd.isnotarise(notOwner)).should.equal(false);
      });
      it('12.13 should not be able to change master address', async function() {
        await assertRevert(
          pd.changeMasterAddress(pd.address, { from: notOwner })
        );
      });
    });

    it('12.14 should return correct data', async function() {
      await pd.getAllCurrencies();
      const caIndex = await pd.getAllCurrenciesLen();
      (await pd.getCurrenciesByIndex(caIndex - 1)).should.equal(CA_DAI);
      await pd.getAllInvestmentCurrencies();
      const iaIndex = await pd.getInvestmentCurrencyLen();
      (await pd.getInvestmentCurrencyByIndex(iaIndex - 1)).should.equal(CA_DAI);
    });
    it('12.15 should not be able to add new Currency Asset', async function() {
      await assertRevert(
        pd.addCurrencyAssetCurrency(newAsset, ZERO_ADDRESS, 1)
      );
    });
    it('12.16 should not be able to add new Investment Asset', async function() {
      await assertRevert(
        pd.addInvestmentAssetCurrency(
          newAsset,
          ZERO_ADDRESS,
          false,
          4000,
          8500,
          18
        )
      );
    });

    it('12.17 should not be able to change UniswapFactoryAddress directly', async function() {
      await assertRevert(
        p2.changeUniswapFactoryAddress(pd.address, { from: notOwner })
      );
    });

    it('12.29 should not be able to call saveIADetails if not notarise', async function() {
      await assertRevert(
        p2.saveIADetails(
          ['0x455448', '0x444149'],
          [100, 15517],
          20190103,
          true,
          {
            from: notOwner
          }
        )
      );
    }); // for testing

    it('12.30 should return Investment Asset Rank Details', async function() {
      const lastDate = await pd.getLastDate();
      await pd.getIARankDetailsByDate(lastDate);
    });
  });

  describe('Liquidity', function() {
    it('12.32 Setting the testing parameters', async function() {
      await DSV.setRate(10 * 1e18);
      await gv.changeCurrencyAssetBaseMin('0x455448', 6 * 1e18);
      await gv.changeCurrencyAssetBaseMin('0x444149', 6 * 1e18);
      await tf.upgradeCapitalPool(owner);
      await p1.upgradeInvestmentPool(owner);
      await tf.transferCurrencyAsset('DAI', owner, 5 * 1e18);
      await tf.transferCurrencyAsset('ETH', owner, 5 * 1e18);
      await p1.sendTransaction({ from: owner, value: 20 * 1e18 });
      await cad.transfer(p1.address, 20 * 1e18);

      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190125,
        false
      );
      let baseMinE = await pd.getCurrencyAssetBaseMin('0x455448');
      let baseMinD = await pd.getCurrencyAssetBaseMin('0x444149');
      let holdMinE = await pd.getInvestmentAssetMinHoldingPerc('0x455448');
      let holdMinD = await pd.getInvestmentAssetMinHoldingPerc('0x444149');
      let holdMaxE = await pd.getInvestmentAssetMaxHoldingPerc('0x455448');
      let holdMaxD = await pd.getInvestmentAssetMaxHoldingPerc('0x444149');
    });
    it('12.33 ELT ETH (No IA available at IA pool)', async function() {
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);

      await p1.internalLiquiditySwap('ETH');

      let CABalE;
      let CABalD;
      let CABalE2;
      let CABalD2;
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);

      let baseVarMinE = await pd.getCurrencyAssetVarBase('ETH');

      let amount =
        parseFloat(ICABalE) -
        1.5 *
          parseFloat(parseFloat(baseVarMinE[0]) + parseFloat(baseVarMinE[1]));

      CABalE.should.be.bignumber.equal(ICABalE - amount);
      CABalE2.should.be.bignumber.equal(ICABalE2 + amount);
      CABalD.should.be.bignumber.equal(ICABalE);
      CABalD2.should.be.bignumber.equal(ICABalE2);

      await p1.internalLiquiditySwap('DAI');

      let FCABalE;
      let FCABalD;
      let FCABalE2;
      let FCABalD2;

      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      let exchangeDAI = await fac.getExchange(
        await pd.getInvestmentAssetAddress('DAI')
      );
      emock = await exchangeMock.at(exchangeDAI);
      await emock.sendTransaction({ from: notOwner, value: 2000 * 1e18 });
      await cad.transfer(emock.address, 200000 * 1e18);
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );

      await p1.__callback(APIID, '');

      FCABalE = await web3.eth.getBalance(p1.address);
      FCABalE2 = await web3.eth.getBalance(p2.address);
      FCABalD = await cad.balanceOf(p1.address);
      FCABalD2 = await cad.balanceOf(p2.address);
      baseVarMinE = await pd.getCurrencyAssetVarBase('DAI');
      amount =
        parseFloat(CABalD) -
        1.5 *
          parseFloat(parseFloat(baseVarMinE[0]) + parseFloat(baseVarMinE[1]));
      console.log('--->', parseFloat(amount));
      console.log('  ---->', parseFloat(FCABalE2));
      console.log('  ---->', parseFloat(CABalE2));
      FCABalE.should.be.bignumber.equal(CABalE);
      FCABalE2.should.be.bignumber.equal(
        amount / ((await pd.getCAAvgRate('DAI')) / 100) + CABalE2 * 1
      );
      FCABalD.should.be.bignumber.equal(CABalD - amount);
      FCABalD2.should.be.bignumber.equal(CABalD2);
    });
    it('12.34 RBT (ETH to ETH)', async function() {
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);

      await mcr.addMCRData(
        18000,
        100 * 1e18,
        ICABalE * 1 + ICABalE2 * 1 + (ICABalD / 10 + ICABalD2 / 10),
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129
      );
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        true
      );

      let CABalE;
      let CABalD;
      let CABalE2;
      let CABalD2;
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      let amount =
        (2 *
          (await pd.variationPercX100()) *
          (ICABalE * 1 + ICABalE2 * 1 + (ICABalD / 10 + ICABalD2 / 10))) /
        1e4;
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        false
      );
      CABalE.should.be.bignumber.equal(ICABalE * 1 + amount * 1);
      CABalE2.should.be.bignumber.equal(ICABalE2 - amount);
      CABalD.should.be.bignumber.equal(ICABalD);
      CABalD2.should.be.bignumber.equal(ICABalD2);
    });
    it('12.35 ILT(ETH->ETH)', async function() {
      await gv.changeCurrencyAssetBaseMin(
        '0x455448',
        (await pd.getCurrencyAssetBaseMin('ETH')) * 1 + 5 * 1e18
      );
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      let baseVarMinE = await pd.getCurrencyAssetVarBase('ETH');
      await p1.internalLiquiditySwap('ETH');
      let CABalE;
      let CABalD;
      let CABalE2;
      let CABalD2;
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        false
      );

      let amount =
        1.5 * (parseFloat(baseVarMinE[0]) + parseFloat(baseVarMinE[1])) -
        parseFloat(ICABalE);

      CABalE.toString().should.be.bignumber.equal(
        (ICABalE * 1 + amount * 1).toString()
      );
      CABalE2.should.be.bignumber.equal(ICABalE2 - amount);
      CABalD.should.be.bignumber.equal(ICABalD);
      CABalD2.should.be.bignumber.equal(ICABalD2);
    });
    it('12.36 ELT(ETH->DAI)', async function() {
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);

      await gv.changeCurrencyAssetBaseMin(
        '0x455448',
        (await pd.getCurrencyAssetBaseMin('ETH')) * 1 - 5 * 1e18
      );
      let baseVarMinE = await pd.getCurrencyAssetVarBase('ETH');
      let amount =
        parseFloat(ICABalE) -
        1.5 * (parseFloat(baseVarMinE[0]) + parseFloat(baseVarMinE[1]));
      await p1.internalLiquiditySwap('ETH');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      let CABalE;
      let CABalD;
      let CABalE2;
      let CABalD2;
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        false
      );

      CABalE.should.be.bignumber.equal(ICABalE - amount);
      CABalE2.should.be.bignumber.equal(ICABalE2);
      CABalD.should.be.bignumber.equal(ICABalD);
      CABalD2.should.be.bignumber.equal(
        ICABalD2 * 1 + (amount / 100) * (await pd.getCAAvgRate('DAI'))
      );
    });

    it('12.37 ILT(DAI->DAI)', async function() {
      await gv.changeCurrencyAssetBaseMin(
        'DAI',
        (await pd.getCurrencyAssetBaseMin('DAI')) * 1 + 5 * 1e18
      );
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      let baseVarMinD = await pd.getCurrencyAssetVarBase('DAI');
      let amount =
        1.5 * (parseFloat(baseVarMinD[0]) + parseFloat(baseVarMinD[1])) -
        parseFloat(ICABalD);
      await p1.internalLiquiditySwap('DAI');
      let CABalE;
      let CABalD;
      let CABalE2;
      let CABalD2;
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);

      CABalE.should.be.bignumber.equal(ICABalE);
      CABalE2.should.be.bignumber.equal(ICABalE2);
      CABalD.should.be.bignumber.equal(ICABalD * 1 + amount * 1);
      CABalD2.should.be.bignumber.equal(ICABalD2 - amount);
    });

    it('12.38 ELT(DAI->DAI)', async function() {
      await p2.sendTransaction({ from: owner, value: 3 * 1e18 });
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        false
      );
      await gv.changeCurrencyAssetBaseMin(
        'DAI',
        (await pd.getCurrencyAssetBaseMin('DAI')) * 1 - 5 * 1e18
      );
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      let baseVarMinD = await pd.getCurrencyAssetVarBase('DAI');
      let amount =
        parseFloat(ICABalD) -
        1.5 * (parseFloat(baseVarMinD[0]) + parseFloat(baseVarMinD[1]));
      await p1.internalLiquiditySwap('DAI');
      let CABalE;
      let CABalD;
      let CABalE2;
      let CABalD2;
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      await p1.upgradeInvestmentPool(owner);
      await p2.sendTransaction({ from: owner, value: CABalE2 / 1 - 3 * 1e18 });
      await cad.transfer(p2.address, CABalD2);
      await mcr.addMCRData(
        18000,
        100 * 1e18,
        CABalE * 1 + CABalE2 * 1 + (CABalD / 10 + CABalD2 / 10) - 3 * 1e18,
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129
      );
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        false
      );
      CABalE.should.be.bignumber.equal(ICABalE);
      CABalE2.should.be.bignumber.equal(ICABalE2);
      CABalD.should.be.bignumber.equal(ICABalD - amount);
      CABalD2.should.be.bignumber.equal(ICABalD2 * 1 + amount * 1);
    });

    it('12.39 RBT(DAI->ETH)', async function() {
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);

      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        true
      );

      let amount =
        (2 *
          (await pd.variationPercX100()) *
          (ICABalE * 1 +
            ICABalE2 * 1 +
            ((ICABalD * 100) / (await pd.getCAAvgRate('DAI')) +
              (ICABalD2 * 100) / (await pd.getCAAvgRate('DAI'))))) /
        1e4;
      let CABalE;
      let CABalD;
      let CABalE2;
      let CABalD2;
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);

      CABalE.should.be.bignumber.equal(ICABalE);
      CABalE2.should.be.bignumber.equal(ICABalE2 * 1 + amount * 1);
      CABalD.should.be.bignumber.equal(ICABalD);
      CABalD2.should.be.bignumber.equal(
        ICABalD2 * 1 - (amount / 100) * (await pd.getCAAvgRate('DAI'))
      );
    });

    it('12.40 ELT(DAI->ETH)', async function() {
      await cad.transfer(p1.address, 10 * 1e18);
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      let basemin = await pd.getCurrencyAssetVarBase('DAI');
      let amount = ICABalD - 1.5 * basemin[1];
      console.log(parseFloat(basemin[1]));
      console.log(parseFloat(ICABalE2));
      console.log(parseFloat(amount));
      await mcr.addMCRData(
        18000,
        100 * 1e18,
        ICABalE * 1 + ICABalE2 * 1 + (ICABalD / 10 + ICABalD2 / 10),
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129
      );
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        false
      );
      await p1.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);

      CABalE.should.be.bignumber.equal(ICABalE);
      CABalE2.should.be.bignumber.equal(
        ICABalE2 * 1 + (amount * 100) / (await pd.getCAAvgRate('DAI'))
      );
      CABalD.should.be.bignumber.equal(ICABalD - amount);
      CABalD2.should.be.bignumber.equal(ICABalD2);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });

    it('12.41 ILT DAI to ETH', async function() {
      await p2.sendTransaction({ from: owner, value: 5 * 1e18 });
      await tf.transferCurrencyAsset('DAI', owner, 5 * 1e18);
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);

      await mcr.addMCRData(
        18000,
        100 * 1e18,
        ICABalE * 1 + ICABalE2 * 1 + (ICABalD / 10 + ICABalD2 / 10),
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129
      );
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        false
      );

      let baseVarMinE = await pd.getCurrencyAssetVarBase('DAI');

      let amount =
        1.5 *
          parseFloat(parseFloat(baseVarMinE[0]) + parseFloat(baseVarMinE[1])) -
        parseFloat(ICABalD);
      await p1.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);

      CABalE.should.be.bignumber.equal(ICABalE);
      CABalE2.should.be.bignumber.equal(
        ICABalE2 * 1 - (amount * 100) / (await pd.getCAAvgRate('DAI'))
      );
      CABalD.should.be.bignumber.equal(ICABalD / 1 + amount / 1);
      CABalD2.should.be.bignumber.equal(ICABalD2);

      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });

    it('12.42 ELT(ETH->ETH)', async function() {
      let CABalE2 = await web3.eth.getBalance(p2.address);
      let CABalD2 = await cad.balanceOf(p2.address);
      await p1.sendTransaction({ from: owner, value: 5 * 1e18 });
      await p1.upgradeInvestmentPool(owner);
      await p2.sendTransaction({ from: owner, value: CABalE2 / 1 - 5 * 1e18 });
      await cad.transfer(p2.address, CABalD2);
      let CABalE;
      let CABalD;
      // let CABalE2;

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);

      await mcr.addMCRData(
        18000,
        100 * 1e18,
        CABalE * 1 + CABalE2 * 1 + (CABalD / 10 + CABalD2 / 10),
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129
      );
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        false
      );
      await p1.internalLiquiditySwap('ETH');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });

    it('12.43 ILT ETH to DAI', async function() {
      await cad.transfer(p2.address, 50 * 1e18, { from: owner });
      await tf.transferCurrencyAsset('ETH', owner, 5 * 1e18);
      let CABalE;
      let CABalD;
      let CABalE2;
      let CABalD2;
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);

      await mcr.addMCRData(
        18000,
        100 * 1e18,
        CABalE * 1 + CABalE2 * 1 + (CABalD / 10 + CABalD2 / 10),
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129
      );
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        false
      );
      await p1.internalLiquiditySwap('ETH');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });

    it('12.44 RBT DAI to ETH amount > price slippage', async function() {
      console.log(
        'emock---',
        parseFloat(await web3.eth.getBalance(emock.address))
      );
      await emock.sendEth(2087960000000000000000);
      console.log(
        'emock---',
        parseFloat(await web3.eth.getBalance(emock.address))
      );
      await cad.transfer(p2.address, 50 * 1e18, { from: owner });
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        true
      );
      console.log(await pd.getIARankDetailsByDate(20190229));
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });

    it('12.45 Initial ELT(ETH->DAI) but at time of call back ELT(ETH->ETH)', async function() {
      await p1.sendTransaction({ from: owner, value: 5 * 1e18 });
      await p1.upgradeInvestmentPool(owner);
      await p2.sendTransaction({ from: owner, value: CABalE2 });
      await cad.transfer(p2.address, CABalD2 / 1 - 50 * 1e18);
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        false
      );
      await p1.internalLiquiditySwap('ETH');
      let p2Eth = await web3.eth.getBalance(p2.address);
      let p2DAI = await cad.balanceOf(p2.address);
      await p1.upgradeInvestmentPool(owner);
      await p2.sendTransaction({ from: owner, value: p2Eth / 1 - 5 * 1e18 });
      await cad.transfer(p2.address, p2DAI);
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190307,
        false
      );

      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 2);
      console.log(await pd.getApiIdTypeOf(APIID));
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
      console.log(await pd.getIARankDetailsByDate(20190307));
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });
    it('12.46 ELT(ETH->DAI) amount > price slippage', async function() {
      await p1.sendTransaction({ from: owner, value: 10 * 1e18 });
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190308,
        false
      );
      console.log(await pd.getIARankDetailsByDate(20190308));
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
      await p1.internalLiquiditySwap('ETH');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });
    it('12.47 ELT(DAI->ETH) amount > price slippage', async function() {
      await emock.sendTransaction({ from: owner, value: 17400000000000000 });
      console.log(
        'emock---',
        parseFloat(await web3.eth.getBalance(emock.address))
      );
      await p1.upgradeInvestmentPool(owner);
      await p2.sendTransaction({ from: owner, value: CABalE2 / 1 - 5 * 1e18 });
      await cad.transfer(p2.address, CABalD2);
      await tf.transferCurrencyAsset('ETH', owner, 10 * 1e18);
      await cad.transfer(p1.address, 10 * 1e18, { from: owner });
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190309,
        false
      );
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
      let baseVarMinD = await pd.getCurrencyAssetVarBase('DAI');
      let baseVarMinE = await pd.getCurrencyAssetVarBase('ETH');
      console.log('bm ETH ', parseFloat(baseVarMinE[0]));
      console.log('bm DAI ', parseFloat(baseVarMinD[0]));
      console.log('bm ETH ', parseFloat(baseVarMinE[1]));
      console.log('bm DAI ', parseFloat(baseVarMinD[1]));
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      console.log(await pd.getIARankDetailsByDate(await pd.getLastDate()));
      await p1.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });
    it('12.48 ILT(ETH->DAI) amount > price slippage', async function() {
      // await emock.sendTransaction({ from: owner, value:  });
      console.log(
        'emock---',
        parseFloat(await web3.eth.getBalance(emock.address))
      );
      await tf.transferCurrencyAsset('ETH', owner, 3 * 1e18);
      await tf.transferCurrencyAsset('DAI', owner, 5 * 1e18);
      await cad.transfer(p2.address, 5 * 1e18, { from: owner });
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190309,
        false
      );
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.internalLiquiditySwap('ETH');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });
    it('12.49 ILT(DAI->ETH) amount > price slippage', async function() {
      await emock.sendEth(1520000000000000000);
      await p2.sendTransaction({ from: owner, value: 5 * 1e18 });
      console.log(await web3.eth.getBalance(p1.address));
      console.log(6 * 1e18 - (await web3.eth.getBalance(p1.address)));
      await p1.sendTransaction({
        from: owner,
        value: 6 * 1e18 - (await web3.eth.getBalance(p1.address))
      });
      console.log(
        'emock---',
        parseFloat(await web3.eth.getBalance(emock.address))
      );
      await tf.transferCurrencyAsset('DAI', owner, 5 * 1e18);
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190310,
        false
      );
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });
    it('12.50 ILT(ETH->DAI) IA dont have enough amount', async function() {
      await emock.sendTransaction({ from: owner, value: 50000 * 1e18 });

      await p1.upgradeInvestmentPool(owner);
      await p2.sendTransaction({ from: owner, value: CABalE2 / 1 - 5 * 1e18 });
      await cad.transfer(p2.address, CABalD2);
      await gv.changeCurrencyAssetBaseMin('ETH', 11 * 1e18);

      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190311,
        false
      );
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.internalLiquiditySwap('ETH');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });
    it('12.51 ILT(DAI->ETH) IA dont have enough amount', async function() {
      await p1.upgradeInvestmentPool(owner);
      await p2.sendTransaction({ from: owner, value: CABalE2 / 1 - 5 * 1e18 });
      await cad.transfer(p2.address, CABalD2);
      await gv.changeCurrencyAssetBaseMin('DAI', 16 * 1e18);

      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190311,
        false
      );
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });
    it('12.52 ILT(DAI->ETH) IA with 0 ETH balance', async function() {
      await gv.changeCurrencyAssetBaseMin('DAI', 21 * 1e18);

      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190311,
        false
      );
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });
    it('12.53 Initial ILT(DAI->ETH) but at time of call back ILT(DAI->DAI)', async function() {
      await p2.sendTransaction({ from: owner, value: 5 * 1e18 });
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190311,
        false
      );
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.internalLiquiditySwap('DAI');
      let p2ETH = await web3.eth.getBalance(p2.address);
      let p2DAI = await cad.balanceOf(p2.address);
      await p1.upgradeInvestmentPool(owner);
      await p2.sendTransaction({ from: owner, value: p2ETH / 1 - 5 * 1e18 });
      await cad.transfer(p2.address, p2DAI);
      await cad.transfer(p2.address, 30 * 1e18, { from: owner });
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190311,
        false
      );
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 2);
      console.log(await pd.getApiIdTypeOf(APIID));
      time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });
  });
  describe('Should be able to delegate callback for', function() {
    it('12.54 Expire Cover ', async function() {
      let coverID;

      await cad.approve(p1.address, coverDetailsLess[1], {
        from: member1
      });
      await cad.transfer(member1, tokenDai);

      await p1.makeCoverUsingCA(
        smartConAdd,
        'DAI',
        coverDetailsLess,
        coverPeriodLess,
        vrsLess[0],
        vrsLess[1],
        vrsLess[2],
        { from: member1 }
      );

      coverID = await qd.getAllCoversOfUser(member1);

      const validity = await qd.getValidityOfCover(coverID[0]);
      await increaseTimeTo(validity.plus(2));

      let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await p1.__callback(APIID, '');
      assert.equal(parseFloat(await qd.getCoverStatusNo(coverID)), 3);
    });
    it('12.55 Empty string res for unknown id', async function() {
      let APIID = '0x6c6f6c';
      await p1.__callback(APIID, '');
    });
  });
  describe('Trade Conditions checked', function() {
    it('12.56 For iaRate = 0', async function() {
      await p2.saveIADetails(['0x455448', '0x444149'], [0, 0], 20190125, true);
    });
  });
  describe('Liquidity trade Token to Token', function() {
    before(async function() {
      mkr = await MKR.deployed();
      let pId = (await gv.getProposalLength()).toNumber();
      await gv.createProposal('Add new IA', 'Add new IA', 'Add new IA', 0, {
        from: member1
      });
      await gv.categorizeProposal(pId, 13, 0);
      let actionHash = encode(
        'addInvestmentAssetCurrency(bytes4,address,bool,uint64,uint64,uint8)',
        '0x4d4b52',
        mkr.address,
        true,
        500,
        5000,
        18
      );
      await gv.submitProposalWithSolution(pId, 'Proposing new IA', actionHash, {
        from: member1
      });
      await tk.transfer(member1, ether(75000));
      await tk.transfer(member2, ether(75000));
      await tk.transfer(member3, ether(75000));
      await tk.transfer(member4, ether(75000));
      await gv.submitVote(pId, 1, { from: member1 });
      await gv.submitVote(pId, 1, { from: member2 });
      await gv.submitVote(pId, 1, { from: member3 });
      await gv.submitVote(pId, 1, { from: member4 });
      let time = await latestTime();
      await increaseTimeTo(time + 604800);
      await gv.closeProposal(pId);
      let newAssetAdd = await pd.getInvestmentAssetAddress('MKR');
      newAssetAdd.should.be.equal(mkr.address);
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 500],
        20190311,
        false
      );
      let newAssetRate = await pd.getIAAvgRate('MKR');
      (newAssetRate / 1).should.be.equal(500);
    });
    it('12.57 ELT(DAI->MKR)', async function() {
      await gv.changeCurrencyAssetBaseMin('0x444149', 15 * 1e18);
      await p2.sendTransaction({ from: owner, value: 5 * 1e18 });
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 500],
        20190311,
        false
      );
      console.log(await web3.eth.getBalance(p1.address));
      console.log(await web3.eth.getBalance(p2.address));
      console.log(await cad.balanceOf(p1.address));
      console.log(await cad.balanceOf(p2.address));
      console.log(await mkr.balanceOf(p2.address));
      console.log(await pd.getIARankDetailsByDate(20190311));
      await p1.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      let CABalE;
      let CABalD;
      let CABalE2;
      let CABalD2;
      let CAbalM;
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalM = await mkr.balanceOf(p2.address);
      console.log('CABalE', parseFloat(CABalE));
      console.log('CABalE2', parseFloat(CABalE2));
      console.log('CABalD', parseFloat(CABalD));
      console.log('CABalD2', parseFloat(CABalD2));
      console.log('CABalM', parseFloat(CABalM));
    });
    it('12.58 ILT(DAI->MKR)', async function() {
      await gv.changeCurrencyAssetBaseMin('0x444149', 9 * 1e18);
      let mkrBal = await mkr.balanceOf(p2.address);
      await p1.upgradeInvestmentPool(owner);
      // await p2.sendTransaction({ from: owner, value: (CABalE2/1 - 5 * 1e18) });
      await cad.transfer(p2.address, CABalD2);
      await mkr.transfer(p2.address, mkrBal);
      await mkr.transfer(p2.address, 50 * 1e18);
      await tf.transferCurrencyAsset('DAI', owner, 15 * 1e18);
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 500],
        20190311,
        false
      );
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalM = await mkr.balanceOf(p2.address);
      console.log('CABalE', parseFloat(CABalE));
      console.log('CABalE2', parseFloat(CABalE2));
      console.log('CABalD', parseFloat(CABalD));
      console.log('CABalD2', parseFloat(CABalD2));
      console.log('CABalM', parseFloat(CABalM));
      console.log(await pd.getIARankDetailsByDate(20190311));
      await p1.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));

      console.log(parseFloat(await pd.getCurrencyAssetBaseMin('DAI')));
      console.log(parseFloat(await pd.getCurrencyAssetBaseMin('ETH')));
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalM = await mkr.balanceOf(p2.address);
      console.log('CABalE', parseFloat(CABalE));
      console.log('CABalE2', parseFloat(CABalE2));
      console.log('CABalD', parseFloat(CABalD));
      console.log('CABalD2', parseFloat(CABalD2));
      console.log('CABalM', parseFloat(CABalM));
    });

    it('12.59 ILT(DAI->MKR) IA dont have enough amount', async function() {
      let emockM = await fac.getExchange(mkr.address);
      emock = await exchangeMock.at(emockM);
      await emock.sendTransaction({ from: owner, value: 1300 * 1e18 });
      console.log(parseFloat(await web3.eth.getBalance(emock.address)));
      let emockD = await fac.getExchange(cad.address);
      let emockDAI = await exchangeMock.at(emockD);
      await emockDAI.sendTransaction({ from: owner, value: 1300 * 1e18 });
      console.log(parseFloat(await web3.eth.getBalance(emockDAI.address)));
      await gv.changeCurrencyAssetBaseMin('0x444149', 66 * 1e18);
      await p1.upgradeInvestmentPool(owner);
      await cad.transfer(p2.address, CABalD2);
      await mkr.transfer(p2.address, CABalM / 1 - 20 * 1e18);
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 500],
        20190311,
        false
      );
      console.log(await pd.getIARankDetailsByDate(20190311));

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalM = await mkr.balanceOf(p2.address);
      console.log('CABalE', parseFloat(CABalE));
      console.log('CABalE2', parseFloat(CABalE2));
      console.log('CABalD', parseFloat(CABalD));
      console.log('CABalD2', parseFloat(CABalD2));
      console.log('CABalM', parseFloat(CABalM));
      await p1.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));

      console.log(parseFloat(await pd.getCurrencyAssetBaseMin('DAI')));
      console.log(parseFloat(await pd.getCurrencyAssetBaseMin('ETH')));
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalM = await mkr.balanceOf(p2.address);
      console.log('CABalE', parseFloat(CABalE));
      console.log('CABalE2', parseFloat(CABalE2));
      console.log('CABalD', parseFloat(CABalD));
      console.log('CABalD2', parseFloat(CABalD2));
      console.log('CABalM', parseFloat(CABalM));
    });

    it('12.60 ILT(DAI->MKR) amount > price slippage', async function() {
      emock.sendEth(await web3.eth.getBalance(emock.address));
      let emockD = await fac.getExchange(
        await pd.getInvestmentAssetAddress('DAI')
      );
      emockDAI = exchangeMock.at(emockD);
      emockDAI.sendEth(await web3.eth.getBalance(emockDAI.address));
      await emockDAI.sendTransaction({ from: owner, value: 80 * 1e18 });
      await emock.sendTransaction({ from: owner, value: 75 * 1e18 });
      await tf.transferCurrencyAsset('DAI', owner, 12.5 * 1e18);
      await mkr.transfer(p2.address, 50 * 1e18);
      console.log(parseFloat(await web3.eth.getBalance(emockDAI.address)));
      console.log(parseFloat(await web3.eth.getBalance(emock.address)));
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 500],
        20190311,
        false
      );
      console.log(await pd.getIARankDetailsByDate(20190311));
      let CABalE;
      let CABalD;
      let CABalE2;
      let CABalD2;
      let CAbalM;
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalM = await mkr.balanceOf(p2.address);
      console.log('CABalE', parseFloat(CABalE));
      console.log('CABalE2', parseFloat(CABalE2));
      console.log('CABalD', parseFloat(CABalD));
      console.log('CABalD2', parseFloat(CABalD2));
      console.log('CABalM', parseFloat(CABalM));
      await p1.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));

      console.log(parseFloat(await pd.getCurrencyAssetBaseMin('DAI')));
      console.log(parseFloat(await pd.getCurrencyAssetBaseMin('ETH')));
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalM = await mkr.balanceOf(p2.address);
      console.log('CABalE', parseFloat(CABalE));
      console.log('CABalE2', parseFloat(CABalE2));
      console.log('CABalD', parseFloat(CABalD));
      console.log('CABalD2', parseFloat(CABalD2));
      console.log('CABalM', parseFloat(CABalM));
    });

    it('12.61 ELT(DAI->MKR) amount > price slippage', async function() {
      await gv.changeCurrencyAssetBaseMin('0x444149', 6 * 1e18);
      await p1.upgradeInvestmentPool(owner);
      await p2.sendTransaction({ from: owner, value: CABalE2 });
      await cad.transfer(p2.address, CABalD2);
      await mkr.transfer(p2.address, CABalM / 1 - 30 * 1e18);
      await p2.sendTransaction({ from: owner, value: 10 * 1e18 });
      await emock.sendTransaction({ from: owner, value: 3 * 1e18 });
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 500],
        20190311,
        false
      );
      console.log(await pd.getIARankDetailsByDate(20190311));

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalM = await mkr.balanceOf(p2.address);
      console.log('CABalE', parseFloat(CABalE));
      console.log('CABalE2', parseFloat(CABalE2));
      console.log('CABalD', parseFloat(CABalD));
      console.log('CABalD2', parseFloat(CABalD2));
      console.log('CABalM', parseFloat(CABalM));
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));

      console.log(parseFloat(await pd.getCurrencyAssetBaseMin('DAI')));
      console.log(parseFloat(await pd.getCurrencyAssetBaseMin('ETH')));
      await p1.__callback(APIID, ''); // to cover else branch (if call comes before callback time)
      time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalM = await mkr.balanceOf(p2.address);
      console.log('CABalE', parseFloat(CABalE));
      console.log('CABalE2', parseFloat(CABalE2));
      console.log('CABalD', parseFloat(CABalD));
      console.log('CABalD2', parseFloat(CABalD2));
      console.log('CABalM', parseFloat(CABalM));
    });
    it('12.61 ILT(ETH->ETH) IA dont have sufficeint ETH', async function() {
      await gv.changeCurrencyAssetBaseMin('ETH', 21 * 1e18);
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 500],
        20190311,
        false
      );
      console.log(await pd.getIARankDetailsByDate(20190311));
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalM = await mkr.balanceOf(p2.address);
      console.log('CABalE', parseFloat(CABalE));
      console.log('CABalE2', parseFloat(CABalE2));
      console.log('CABalD', parseFloat(CABalD));
      console.log('CABalD2', parseFloat(CABalD2));
      console.log('CABalM', parseFloat(CABalM));
      await p1.internalLiquiditySwap('ETH');

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalM = await mkr.balanceOf(p2.address);
      console.log('CABalE', parseFloat(CABalE));
      console.log('CABalE2', parseFloat(CABalE2));
      console.log('CABalD', parseFloat(CABalD));
      console.log('CABalD2', parseFloat(CABalD2));
      console.log('CABalM', parseFloat(CABalM));
    });
    it('12.61 ILT(DAI->DAI) IA dont have sufficeint ETH', async function() {
      await gv.changeCurrencyAssetBaseMin('DAI', 36 * 1e18);
      await tf.transferCurrencyAsset('DAI', owner, 50 * 1e18);
      await p1.upgradeInvestmentPool(owner);
      await cad.transfer(p2.address, CABalD2);
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 500],
        20190311,
        false
      );

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalM = await mkr.balanceOf(p2.address);
      console.log('CABalE', parseFloat(CABalE));
      console.log('CABalE2', parseFloat(CABalE2));
      console.log('CABalD', parseFloat(CABalD));
      console.log('CABalD2', parseFloat(CABalD2));
      console.log('CABalM', parseFloat(CABalM));
      await p1.internalLiquiditySwap('DAI');

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalM = await mkr.balanceOf(p2.address);
      console.log('CABalE', parseFloat(CABalE));
      console.log('CABalE2', parseFloat(CABalE2));
      console.log('CABalD', parseFloat(CABalD));
      console.log('CABalD2', parseFloat(CABalD2));
      console.log('CABalM', parseFloat(CABalM));
    });
  });

  describe('More basic cases', function() {
    it('12.62 RBT For 0 balance in risk pool', async function() {
      await p1.upgradeInvestmentPool(owner);
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190311,
        true
      );
      await tf.upgradeCapitalPool(owner);
      await tf.upgradeCapitalPool(owner);
      await mcr.addMCRData(
        18000,
        0,
        0,
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129
      );
      let pId = (await gv.getProposalLength()).toNumber();
      await gv.createProposal(
        'Inactive DAI',
        'Inactive DAI',
        'Inactive DAI',
        0,
        {
          from: member1
        }
      );
      await gv.categorizeProposal(pId, 14, 0);
      let actionHash = encode(
        'changeInvestmentAssetStatus(bytes4,bool)',
        '0x444149',
        false
      );
      await gv.submitProposalWithSolution(pId, 'Inactive IA', actionHash, {
        from: member1
      });
      await gv.submitVote(pId, 1, { from: member1 });
      await gv.submitVote(pId, 1, { from: member2 });
      await gv.submitVote(pId, 1, { from: member3 });
      await gv.submitVote(pId, 1, { from: member4 });
      let time = await latestTime();
      await increaseTimeTo(time + 604800);
      await gv.closeProposal(pId);
      (await pd.getInvestmentAssetStatus('DAI')).should.be.equal(false);
      await p1.sendTransaction({ from: owner, value: 2 * 1e18 });
      await p2.saveIADetails(
        ['0x444149', '0x455448'],
        [100, 15517],
        20190103,
        false
      );
    });

    it('12.63 TransferEther should revert when called by other than govern', async function() {
      await assertRevert(p1.transferEther(1e18, owner));
    });
    it('12.64 should able to propose change in holding percentages', async function() {
      let pId = (await gv.getProposalLength()).toNumber();
      await gv.createProposal(
        'change holding perc',
        'change holding perc',
        'change holding perc',
        0,
        {
          from: member1
        }
      );
      await gv.categorizeProposal(pId, 13, 0);
      let actionHash = encode(
        'changeInvestmentAssetHoldingPerc(bytes4,uint64,uint64)',
        '0x444149',
        100,
        1000
      );
      await gv.submitProposalWithSolution(
        pId,
        'change holding perc',
        actionHash,
        {
          from: member1
        }
      );
      await gv.submitVote(pId, 1, { from: member1 });
      await gv.submitVote(pId, 1, { from: member2 });
      await gv.submitVote(pId, 1, { from: member3 });
      await gv.submitVote(pId, 1, { from: member4 });
      let time = await latestTime();
      await increaseTimeTo(time + 604800);
      await gv.closeProposal(pId);
      let initialPerc = await pd.getInvestmentAssetHoldingPerc('DAI');
      (initialPerc[0] / 1).should.be.equal(100);
      (initialPerc[1] / 1).should.be.equal(1000);
    });
    it('12.65 should not be able to change holding percentages directly', async function() {
      let initialPerc = await pd.getInvestmentAssetHoldingPerc('DAI');
      await assertRevert(
        pd.changeInvestmentAssetHoldingPerc('0x444149', 200, 300)
      );
      let finalPerc = await pd.getInvestmentAssetHoldingPerc('DAI');
      initialPerc[0].should.be.bignumber.equal(finalPerc[0]);
      initialPerc[1].should.be.bignumber.equal(finalPerc[1]);
    });

    it('12.68 should able to propose new currency asset', async function() {
      mkr = await MKR.deployed();
      let pId = await gv.getProposalLength();
      pId = pId.toNumber();
      await gv.createProposal('add new CA', 'add new CA', 'add new CA', 0, {
        from: member1
      });
      await gv.categorizeProposal(pId, 17, 0);
      let actionHash = encode(
        'addCurrencyAssetCurrency(bytes4,address,uint)',
        'MKR',
        mkr.address,
        '10000000000000000000'
      );
      await gv.submitProposalWithSolution(pId, 'add CA', actionHash, {
        from: member1
      });
      await gv.submitVote(pId, 1, { from: member1 });
      await gv.submitVote(pId, 1, { from: member2 });
      await gv.submitVote(pId, 1, { from: member3 });
      await gv.submitVote(pId, 1, { from: member4 });
      let time = await latestTime();
      await increaseTimeTo(time + 604800);
      await gv.closeProposal(pId);
      let varbase = await pd.getCurrencyAssetVarBase('MKR');
      (varbase[1] / 1).should.be.equal(10 * 1e18);
      (varbase[2] / 1).should.be.equal(0);
      (await pd.getCurrencyAssetAddress('MKR')).should.be.equal(mkr.address);
    });
    it('12.69 should not be able to add new currency asset directly', async function() {
      await assertRevert(
        pd.addCurrencyAssetCurrency('0x49434e', mkr.address, 11 * 1e18)
      );
    });
    it('12.70 should not be able to change IA status directly', async function() {
      await assertRevert(pd.changeInvestmentAssetStatus('0x49434e', false));
    });
    it('12.71 should not be able to update pool parameters directly', async function() {
      await assertRevert(pd.updateUintParameters('0x49434e', 12));
    });
    it('12.72 should be able to propose new currency address by owner', async function() {
      let actionHash = encode(
        'changeCurrencyAssetAddress(bytes4,address)',
        'DAI',
        member4
      );
      await gvProp(30, actionHash, mr, gv, 3);
      (await pd.getCurrencyAssetAddress('DAI')).should.be.equal(member4);
    });
    it('12.73 should be able to propose new IA address and decimal by owner', async function() {
      let actionHash = encode(
        'changeInvestmentAssetAddressAndDecimal(bytes4,address,uint8)',
        'DAI',
        member3,
        16
      );
      await gvProp(32, actionHash, mr, gv, 3);
      (await pd.getInvestmentAssetAddress('DAI')).should.be.equal(member3);
      ((await pd.getInvestmentAssetDecimals('DAI')) / 1).should.be.equal(16);
    });
  });
});
