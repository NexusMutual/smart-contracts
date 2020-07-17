const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolDataMock');
const DAI = artifacts.require('MockDAI');
const exchangeMock = artifacts.require('ExchangeMock');
const MCR = artifacts.require('MCR');
const DSValue = artifacts.require('NXMDSValueMock');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const Quotation = artifacts.require('Quotation');
const NXMToken = artifacts.require('NXMToken');
const TokenController = artifacts.require('TokenController');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMasterMock');
const MKR = artifacts.require('MockMKR');
const Governance = artifacts.require('Governance');
const FactoryMock = artifacts.require('FactoryMock');

const {advanceBlock} = require('./utils/advanceToBlock');
const {assertRevert} = require('./utils/assertRevert');
const {ether, toBN, toHex, toWei} = require('./utils/ethTools');
const {increaseTimeTo, latestTime} = require('./utils/increaseTime');
const encode = require('./utils/encoder.js').encode;
const gvProp = require('./utils/gvProposal.js').gvProposal;
const getQuoteValues = require('./utils/getQuote.js').getQuoteValues;
const getValue = require('./utils/getMCRPerThreshold.js').getValue;
const { takeSnapshot, revertSnapshot } = require('./utils/snapshot');

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
let qt;
let snapshotId;

const BN = web3.utils.BN;
const BigNumber = web3.BigNumber;
const newAsset = '0x535253';
const CA_DAI = '0x44414900';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const smartConAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const coverDetailsLess = [
  5,
  '19671964915000000',
  '20000000000000000000',
  '3549627424'
];
const coverPeriodLess = 50;
const tokens = ether(200);
const stakeTokens = ether(20);
const fee = ether(0.002);
const UNLIMITED_ALLOWANCE = new BN((2).toString())
  .pow(new BN((256).toString()))
  .sub(new BN((1).toString()));
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

    snapshotId = await takeSnapshot();

    await advanceBlock();
    p1 = await Pool1.deployed();
    p2 = await Pool2.deployed();
    pd = await PoolData.deployed();
    cad = await DAI.deployed();
    emock = await exchangeMock.deployed();
    mcr = await MCR.deployed();
    DSV = await DSValue.deployed();
    qd = await QuotationDataMock.deployed();
    qt = await Quotation.deployed();
    nxms = await NXMaster.at(await qd.ms());
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    tk = await NXMToken.deployed();
    tf = await TokenFunctions.deployed();
    tc = await TokenController.at(await nxms.getLatestAddress(toHex('TC')));
    let address = await nxms.getLatestAddress(toHex('GV'));
    gv = await Governance.at(address);
    fac = await FactoryMock.deployed();

    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);
    await mcr.addMCRData(
      18000,
      toWei(100),
      toWei(2),
      ['0x455448', '0x444149'],
      [100, 65407],
      20181011
    );

    await mr.payJoiningFee(member1, {from: member1, value: fee});
    await mr.kycVerdict(member1, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member1});
    await tk.transfer(member1, tokens);

    await mr.payJoiningFee(member2, {from: member2, value: fee});
    await mr.kycVerdict(member2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member2});
    await tk.transfer(member2, tokens);

    await mr.payJoiningFee(member3, {from: member3, value: fee});
    await mr.kycVerdict(member3, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member3});
    await tk.transfer(member3, tokens);

    await mr.payJoiningFee(member4, {from: member4, value: fee});
    await mr.kycVerdict(member4, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member4});
    await tk.transfer(member4, tokens);
  });

  describe('PoolDataMock', function() {
    describe('Misc', function() {
      it('12.11 should return true if notarise address', async function() {
        (await pd.isnotarise(owner)).should.equal(true);
      });
      it('12.12 should return false if not notarise address', async function() {
        (await pd.isnotarise(notOwner)).should.equal(false);
      });
      it('12.13 should not be able to change master address', async function() {
        await assertRevert(
          pd.changeMasterAddress(pd.address, {from: notOwner})
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
        p2.changeUniswapFactoryAddress(pd.address, {from: notOwner})
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
      await DSV.setRate(10);
      await pd.changeCurrencyAssetBaseMin('0x455448', toWei(6));
      await pd.changeCurrencyAssetBaseMin('0x444149', toWei(6));
      await tf.upgradeCapitalPool(cad.address);
      await p1.upgradeInvestmentPool(cad.address);
      await tf.transferCurrencyAsset(toHex('DAI'), owner, toWei(5));
      await tf.transferCurrencyAsset(toHex('ETH'), owner, toWei(5));
      await p1.sendEther({from: owner, value: toWei(20)});
      await cad.transfer(p1.address, toWei(20));

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

      await p1.internalLiquiditySwap(toHex('ETH'));

      let CABalE;
      let CABalD;
      let CABalE2;
      let CABalD2;
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);

      let baseVarMinE = await pd.getCurrencyAssetVarBase(toHex('ETH'));

      let amount =
        parseFloat(ICABalE) -
        1.5 *
          parseFloat(parseFloat(baseVarMinE[2]) + parseFloat(baseVarMinE[1]));

      CABalE.toString().should.be.equal((ICABalE - amount).toString());
      CABalE2.toString().should.be.equal(
        (ICABalE2 + amount).toString().substr(1)
      );
      CABalD.toString().should.be.equal(ICABalE.toString());
      CABalD2.toString().should.be.equal(ICABalE2.toString());
      await p1.internalLiquiditySwap(toHex('DAI'));
      let FCABalE;
      let FCABalD;
      let FCABalE2;
      let FCABalD2;
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      let exchangeDAI = await fac.getExchange(
        await pd.getInvestmentAssetAddress(toHex('DAI'))
      );
      emock = await exchangeMock.at(exchangeDAI);
      await emock.sendEther({from: notOwner, value: toWei(2000)});
      await cad.transfer(emock.address, toWei(200000));
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      FCABalE = await web3.eth.getBalance(p1.address);
      FCABalE2 = await web3.eth.getBalance(p2.address);
      FCABalD = await cad.balanceOf(p1.address);
      FCABalD2 = await cad.balanceOf(p2.address);
      baseVarMinE = await pd.getCurrencyAssetVarBase(toHex('DAI'));
      amount =
        parseFloat(CABalD) -
        1.5 *
          parseFloat(parseFloat(baseVarMinE[2]) + parseFloat(baseVarMinE[1]));
      FCABalE.toString().should.be.equal(CABalE.toString());
      FCABalE2.toString().should.be.equal(
        (
          amount / ((await pd.getCAAvgRate(toHex('DAI'))) / 100) +
          CABalE2 * 1
        ).toString()
      );
      FCABalD.toString().should.be.equal((CABalD - amount).toString());
      FCABalD2.toString().should.be.equal(CABalD2.toString());
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
        await getValue(
          (
            ICABalE * 1 +
            ICABalE2 * 1 +
            (ICABalD / 10 + ICABalD2 / 10)
          ).toString(),
          pd,
          mcr
        ),
        toWei(100),
        (
          ICABalE * 1 +
          ICABalE2 * 1 +
          (ICABalD / 10 + ICABalD2 / 10)
        ).toString(),
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
        10000;
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        false
      );
      CABalE.toString().should.be.equal((ICABalE * 1 + amount * 1).toString());
      CABalE2.toString().should.be.equal((ICABalE2 - amount).toString());
      CABalD.toString().should.be.equal(ICABalD.toString());
      CABalD2.toString().should.be.equal(ICABalD2.toString());
    });
    it('12.35 ILT(ETH->ETH)', async function() {
      await pd.changeCurrencyAssetBaseMin(
        '0x455448',
        (
          (await pd.getCurrencyAssetBaseMin(toHex('ETH'))) * 1 +
          toWei(5) * 1
        ).toString()
      );
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      let baseVarMinE = await pd.getCurrencyAssetVarBase(toHex('ETH'));
      await p1.internalLiquiditySwap(toHex('ETH'));
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
        1.5 *
          (parseFloat(baseVarMinE[2]) * 1 + parseFloat(baseVarMinE[1]) * 1) -
        parseFloat(ICABalE) * 1;
      CABalE.toString()
        .toString()
        .should.be.equal((ICABalE * 1 + amount * 1).toString().toString());
      CABalE2.toString().should.be.equal((ICABalE2 - amount).toString());
      CABalD.toString().should.be.equal(ICABalD.toString());
      CABalD2.toString().should.be.equal(ICABalD2.toString());
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

      await pd.changeCurrencyAssetBaseMin(
        '0x455448',
        (
          (await pd.getCurrencyAssetBaseMin(toHex('ETH'))) * 1 -
          toWei(5) * 1
        ).toString()
      );
      let baseVarMinE = await pd.getCurrencyAssetVarBase(toHex('ETH'));
      let amount =
        parseFloat(ICABalE) -
        1.5 * (parseFloat(baseVarMinE[2]) + parseFloat(baseVarMinE[1]));
      await p1.internalLiquiditySwap(toHex('ETH'));
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

      CABalE.toString().should.be.equal((ICABalE - amount).toString());
      CABalE2.toString().should.be.equal(ICABalE2.toString());
      CABalD.toString().should.be.equal(ICABalD.toString());
      CABalD2.toString().should.be.equal(
        (
          ICABalD2 * 1 +
          (amount / 100) * (await pd.getCAAvgRate(toHex('DAI')))
        ).toString()
      );
    });

    it('12.37 ILT(DAI->DAI)', async function() {
      await pd.changeCurrencyAssetBaseMin(
        toHex('DAI'),
        (
          (await pd.getCurrencyAssetBaseMin(toHex('DAI'))) * 1 +
          toWei(5) * 1
        ).toString()
      );
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      let baseVarMinD = await pd.getCurrencyAssetVarBase(toHex('DAI'));
      let amount =
        1.5 * (parseFloat(baseVarMinD[0]) + parseFloat(baseVarMinD[1])) -
        parseFloat(ICABalD);
      await p1.internalLiquiditySwap(toHex('DAI'));
      let CABalE;
      let CABalD;
      let CABalE2;
      let CABalD2;
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);

      CABalE.toString().should.be.equal(ICABalE.toString());
      CABalE2.toString().should.be.equal(ICABalE2.toString());
      CABalD.toString().should.be.equal((ICABalD * 1 + amount * 1).toString());
      CABalD2.toString().should.be.equal((ICABalD2 - amount).toString());
    });

    it('12.38 ELT(DAI->DAI)', async function() {
      await p2.sendEther({from: owner, value: toWei(3)});
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        false
      );
      await pd.changeCurrencyAssetBaseMin(
        toHex('DAI'),
        (
          (await pd.getCurrencyAssetBaseMin(toHex('DAI'))) * 1 -
          toWei(5) * 1
        ).toString()
      );
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      let baseVarMinD = await pd.getCurrencyAssetVarBase(toHex('DAI'));
      let amount =
        parseFloat(ICABalD) -
        1.5 * (parseFloat(baseVarMinD[0]) + parseFloat(baseVarMinD[1]));
      await p1.internalLiquiditySwap(toHex('DAI'));
      let CABalE;
      let CABalD;
      let CABalE2;
      let CABalD2;
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      await p1.upgradeInvestmentPool(cad.address);
      await p2.sendEther({
        from: owner,
        value: (CABalE2 / 1 - toWei(3)).toString()
      });
      await cad.transfer(p2.address, CABalD2);
      await mcr.addMCRData(
        await getValue(
          (
            CABalE * 1 +
            CABalE2 * 1 +
            (CABalD / 10 + CABalD2 / 10) -
            toWei(3)
          ).toString(),
          pd,
          mcr
        ),
        toWei(100),
        (
          CABalE * 1 +
          CABalE2 * 1 +
          (CABalD / 10 + CABalD2 / 10) -
          toWei(3)
        ).toString(),
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
      CABalE.toString().should.be.equal(ICABalE.toString());
      CABalE2.toString().should.be.equal(ICABalE2.toString());
      CABalD.toString().should.be.equal((ICABalD - amount).toString());
      CABalD2.toString().should.be.equal(
        (ICABalD2 * 1 + amount * 1).toString()
      );
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
            ((ICABalD * 100) / (await pd.getCAAvgRate(toHex('DAI'))) +
              (ICABalD2 * 100) / (await pd.getCAAvgRate(toHex('DAI')))))) /
        10000;
      let CABalE;
      let CABalD;
      let CABalE2;
      let CABalD2;
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);

      CABalE.toString().should.be.equal(ICABalE.toString());
      CABalE2.toString().should.be.equal(
        (ICABalE2 * 1 + amount * 1).toString()
      );
      CABalD.toString().should.be.equal(ICABalD.toString());
      CABalD2.toString().should.be.equal(
        (
          ICABalD2 * 1 -
          (amount / 100) * (await pd.getCAAvgRate(toHex('DAI')))
        ).toString()
      );
    });

    it('12.40 ELT(DAI->ETH)', async function() {
      await cad.transfer(p1.address, toWei(10));
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      let basemin = await pd.getCurrencyAssetVarBase(toHex('DAI'));
      let amount = ICABalD - 1.5 * basemin[1];
      await mcr.addMCRData(
        await getValue(
          (
            ICABalE * 1 +
            ICABalE2 * 1 +
            (ICABalD / 10 + ICABalD2 / 10)
          ).toString(),
          pd,
          mcr
        ),
        toWei(100),
        (
          ICABalE * 1 +
          ICABalE2 * 1 +
          (ICABalD / 10 + ICABalD2 / 10)
        ).toString(),
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
      await p1.internalLiquiditySwap(toHex('DAI'));
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);

      CABalE.toString().should.be.equal(ICABalE.toString());
      CABalE2.toString().should.be.equal(
        (
          ICABalE2 * 1 +
          (amount * 100) / (await pd.getCAAvgRate(toHex('DAI')))
        ).toString()
      );
      CABalD.toString().should.be.equal((ICABalD - amount).toString());
      CABalD2.toString().should.be.equal(ICABalD2.toString());
    });

    it('12.41 ILT DAI to ETH', async function() {
      await p2.sendEther({from: owner, value: toWei(5)});
      await tf.transferCurrencyAsset(toHex('DAI'), owner, toWei(5));
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);

      await mcr.addMCRData(
        await getValue(
          (
            ICABalE * 1 +
            ICABalE2 * 1 +
            (ICABalD / 10 + ICABalD2 / 10)
          ).toString(),
          pd,
          mcr
        ),
        toWei(100),
        (
          ICABalE * 1 +
          ICABalE2 * 1 +
          (ICABalD / 10 + ICABalD2 / 10)
        ).toString(),
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

      let baseVarMinE = await pd.getCurrencyAssetVarBase(toHex('DAI'));

      let amount =
        1.5 *
          parseFloat(parseFloat(baseVarMinE[2]) + parseFloat(baseVarMinE[1])) -
        parseFloat(ICABalD);
      await p1.internalLiquiditySwap(toHex('DAI'));
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);

      CABalE.toString().should.be.equal(ICABalE.toString());
      CABalE2.toString().should.be.equal(
        (
          ICABalE2 * 1 -
          (amount * 100) / (await pd.getCAAvgRate(toHex('DAI')))
        ).toString()
      );
      CABalD.toString().should.be.equal((ICABalD / 1 + amount / 1).toString());
      CABalD2.toString().should.be.equal(ICABalD2.toString());
    });

    it('12.42 ELT(ETH->ETH)', async function() {
      let ICABalE2 = await web3.eth.getBalance(p2.address);
      let ICABalD2 = await cad.balanceOf(p2.address);
      await p1.sendEther({from: owner, value: toWei(5)});
      await p1.upgradeInvestmentPool(cad.address);
      await p2.sendEther({from: owner, value: CABalE2 / 1 - toWei(5)});
      await cad.transfer(p2.address, CABalD2);
      let ICABalE;
      let ICABalD;
      // let CABalE2;

      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);

      await mcr.addMCRData(
        await getValue(
          (
            ICABalE * 1 +
            ICABalE2 * 1 +
            (ICABalD / 10 + ICABalD2 / 10)
          ).toString(),
          pd,
          mcr
        ),
        toWei(100),
        (
          ICABalE * 1 +
          ICABalE2 * 1 +
          (ICABalD / 10 + ICABalD2 / 10)
        ).toString(),
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
      let baseVarMinE = await pd.getCurrencyAssetVarBase(toHex('ETH'));
      let amount =
        parseFloat(ICABalE) -
        1.5 *
          parseFloat(parseFloat(baseVarMinE[2]) + parseFloat(baseVarMinE[1]));
      await p1.internalLiquiditySwap(toHex('ETH'));
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);

      CABalE.toString().should.be.equal((ICABalE - amount).toString());
      CABalE2.toString().should.be.equal(
        (ICABalE2 * 1 + amount * 1).toString()
      );
      CABalD.toString().should.be.equal(ICABalD.toString());
      CABalD2.toString().should.be.equal(ICABalD2.toString());
    });

    it('12.43 ILT ETH to DAI', async function() {
      await cad.transfer(p2.address, toWei(50), {from: owner});
      await tf.transferCurrencyAsset(toHex('ETH'), owner, toWei(5));
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      await mcr.addMCRData(
        await getValue(
          (
            ICABalE * 1 +
            ICABalE2 * 1 +
            (ICABalD / 10 + ICABalD2 / 10)
          ).toString(),
          pd,
          mcr
        ),
        toWei(100),
        (
          ICABalE * 1 +
          ICABalE2 * 1 +
          (ICABalD / 10 + ICABalD2 / 10)
        ).toString(),
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
      let baseVarMinE = await pd.getCurrencyAssetVarBase(toHex('ETH'));

      let amount =
        1.5 *
          parseFloat(parseFloat(baseVarMinE[2]) + parseFloat(baseVarMinE[1])) -
        parseFloat(ICABalE);
      await p1.internalLiquiditySwap(toHex('ETH'));
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalE.toString().should.be.equal((ICABalE * 1 + amount * 1).toString());
      CABalE2.toString().should.be.equal(ICABalE2.toString());
      CABalD.toString().should.be.equal(ICABalD.toString());
      CABalD2.toString().should.be.equal(
        (
          ICABalD2 -
          (amount / 100) * (await pd.getCAAvgRate(toHex('DAI')))
        ).toString()
      );
    });

    it('12.44 RBT DAI to ETH amount > price slippage', async function() {
      await emock.removeEther(toWei(2087.96));
      await cad.transfer(p2.address, toWei(50), {from: owner});
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
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalE.toString().should.be.equal(ICABalE.toString());
      (CABalE2 / toWei(1))
        .toFixed(0)
        .should.be.equal(
          ((ICABalE2 * 1 + 5 * toWei(0.1)) / toWei(1)).toFixed(0)
        );
      CABalD.toString().should.be.equal(ICABalD.toString());
      (CABalD2 / toWei(1))
        .toFixed(1)
        .should.be.equal(((ICABalD2 * 1 - toWei(5)) / toWei(1)).toFixed(1));
    });

    it('12.45 Initial ELT(ETH->DAI) but at time of call back ELT(ETH->ETH)', async function() {
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      await p1.sendEther({from: owner, value: toWei(5)});
      await p1.upgradeInvestmentPool(cad.address);
      await p2.sendEther({from: owner, value: CABalE2});
      await cad.transfer(p2.address, (CABalD2 / 1 - toWei(50)).toString());
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        false
      );
      await p1.internalLiquiditySwap(toHex('ETH'));
      let p2Eth = await web3.eth.getBalance(p2.address);
      let p2DAI = await cad.balanceOf(p2.address);
      await p1.upgradeInvestmentPool(cad.address);
      await p2.sendEther({
        from: owner,
        value: (p2Eth / 1 - toWei(5)).toString()
      });
      await cad.transfer(p2.address, p2DAI);
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190307,
        false
      );

      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 2);
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      let baseVarMinE = await pd.getCurrencyAssetVarBase(toHex('ETH'));

      let amount =
        parseFloat(ICABalE) -
        1.5 *
          parseFloat(parseFloat(baseVarMinE[2]) + parseFloat(baseVarMinE[1]));
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalE.toString().should.be.equal((ICABalE - amount * 1).toString());
      CABalE2.toString().should.be.equal(
        (ICABalE2 * 1 + amount * 1).toString()
      );
      CABalD.toString().should.be.equal(ICABalD.toString());
      CABalD2.toString().should.be.equal(ICABalD2.toString());
    });
    it('12.46 ELT(ETH->DAI) amount > price slippage', async function() {
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      await p1.sendEther({from: owner, value: toWei(10)});
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190308,
        false
      );
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      await p1.internalLiquiditySwap(toHex('ETH'));
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      (CABalE / toWei(1))
        .toFixed(1)
        .toString()
        .should.be.equal(
          ((ICABalE - toWei(0.48)) / toWei(1)).toFixed(1).toString()
        );
      CABalE2.toString().should.be.equal(ICABalE2.toString());
      CABalD.toString().should.be.equal(ICABalD.toString());
      (CABalD2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalD2 * 1 + toWei(4.8) * 1) / toWei(1)).toFixed(0).toString()
        );
    });

    it('12.47 ELT(DAI->ETH) amount > price slippage', async function() {

      await emock.sendEther({from: owner, value: '17400000000036329'}); // fund exchange with 0.0174 ETH
      await p1.upgradeInvestmentPool(cad.address);
      await p2.sendEther({from: owner, value: CABalE2 / 1 - toWei(5)}); // initial ETH balance -5 ETH
      await cad.transfer(p2.address, CABalD2); // initial DAI balance
      await tf.transferCurrencyAsset(toHex('ETH'), owner, toWei(10)); // -10 ETH
      await cad.transfer(p1.address, toWei(10), {from: owner}); // +10 DAI

      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190309,
        false
      );

      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);

      const { baseMin: baseMinE, varMin: varMinE } = await pd.getCurrencyAssetVarBase(toHex('ETH'));
      const { baseMin: baseMinD, varMin: varMinD } = await pd.getCurrencyAssetVarBase(toHex('DAI'));

      let time = await latestTime();
      await increaseTimeTo((await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100);
      await p1.internalLiquiditySwap(toHex('DAI'));

      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      time = await latestTime();
      await increaseTimeTo((await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100);
      await p1.__callback(APIID, '');

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);

      CABalE.toString().should.be.equal(ICABalE.toString());
      CABalE2.toString().should.be.equal(
        (ICABalE2 * 1 + toWei(0.5) * 1).toString()
      );
      CABalD.toString().should.be.equal((ICABalD - toWei(5)).toString());
      CABalD2.toString().should.be.equal(ICABalD2.toString());
    });

    it('12.48 ILT(ETH->DAI) amount > price slippage', async function() {
      await tf.transferCurrencyAsset(toHex('ETH'), owner, toWei(3));
      await tf.transferCurrencyAsset(toHex('DAI'), owner, toWei(5));
      await cad.transfer(p2.address, toWei(5), {from: owner});

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

      const ICABalE = await web3.eth.getBalance(p1.address);
      const ICABalE2 = await web3.eth.getBalance(p2.address);
      const ICABalD = await cad.balanceOf(p1.address);
      const ICABalD2 = await cad.balanceOf(p2.address);

      await p1.internalLiquiditySwap(toHex('ETH'));
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );

      await p1.__callback(APIID, '');

      const CABalE = await web3.eth.getBalance(p1.address);
      const CABalE2 = await web3.eth.getBalance(p2.address);
      const CABalD = await cad.balanceOf(p1.address);
      const CABalD2 = await cad.balanceOf(p2.address);

      (CABalE / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalE * 1 + toWei(0.48) * 1) / toWei(1)).toFixed(0).toString()
        );

      CABalE2.toString().should.be.equal(ICABalE2.toString());
      CABalD.toString().should.be.equal(ICABalD.toString());
      (CABalD2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          (((ICABalD2 - toWei(4.8)) / toWei(1)) * 1).toFixed(0).toString()
        );
    });

    it('12.49 ILT(DAI->ETH) amount > price slippage', async function() {
      await emock.removeEther(toWei(1.52));
      await p2.sendEther({from: owner, value: toWei(5)});
      await p1.sendEther({
        from: owner,
        value: (
          toWei(6) * 1 -
          (await web3.eth.getBalance(p1.address))
        ).toString()
      });
      await tf.transferCurrencyAsset(toHex('DAI'), owner, toWei(5));
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
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      await p1.internalLiquiditySwap(toHex('DAI'));
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      (CABalE / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(((ICABalE / toWei(1)) * 1).toFixed(0).toString());
      (CABalE2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalE2 * 1 - toWei(0.4) * 1) / toWei(1)).toFixed(0).toString()
        );
      (CABalD / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalD * 1 + toWei(4) * 1) / toWei(1)).toFixed(0).toString()
        );
      (CABalD2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(((ICABalD2 / toWei(1)) * 1).toFixed(0).toString());
    });
    it('12.50 ILT(ETH->DAI) IA dont have enough amount', async function() {
      await emock.sendEther({from: owner, value: toWei(50000)});

      await p1.upgradeInvestmentPool(cad.address);
      await p2.sendEther({from: owner, value: CABalE2 / 1 - toWei(5)});
      await cad.transfer(p2.address, CABalD2);
      await pd.changeCurrencyAssetBaseMin(toHex('ETH'), toWei(11));

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
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      await p1.internalLiquiditySwap(toHex('ETH'));
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      (CABalE / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalE * 1 + toWei(7.06) * 1) / toWei(1)).toFixed(0).toString()
        );
      CABalE2.toString().should.be.equal(ICABalE2.toString());
      CABalD.toString().should.be.equal(ICABalD.toString());
      (CABalD2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalD2 - toWei(70.6) * 1) / toWei(1)).toFixed(0).toString()
        );
    });
    it('12.51 ILT(DAI->ETH) IA dont have enough amount', async function() {
      await p1.upgradeInvestmentPool(cad.address);
      await p2.sendEther({
        from: owner,
        value: (CABalE2 / 1 - toWei(5)).toString()
      });
      await cad.transfer(p2.address, CABalD2);
      await pd.changeCurrencyAssetBaseMin(toHex('DAI'), toWei(16));

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
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      await p1.internalLiquiditySwap(toHex('DAI'));
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      (CABalE / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(((ICABalE / toWei(1)) * 1).toFixed(0).toString());
      let checkCondition =
        parseFloat(((CABalE2 * 1) / toWei(1)).toFixed(0).toString()) ==
        parseFloat(
          ((ICABalE2 * 1 - toWei(1.14) * 1) / toWei(1)).toFixed(0).toString()
        );
      checkCondition.should.be.equal(true);
      ((CABalD * 1) / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalD * 1 + toWei(11.4) * 1) / toWei(1)).toFixed(0).toString()
        );
      (CABalD2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalD2 / toWei(1)).toFixed(0).toString());
    });
    it('12.52 ILT(DAI->ETH) IA with 0 ETH balance', async function() {
      await pd.changeCurrencyAssetBaseMin(toHex('DAI'), toWei(21));

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
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      await p1.internalLiquiditySwap(toHex('DAI'));
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      (CABalE / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalE / toWei(1)).toFixed(0).toString());
      (CABalE2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalE2 / toWei(1)).toFixed(0).toString());
      (CABalD / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalD / toWei(1)).toFixed(0).toString());
      (CABalD2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalD2 / toWei(1)).toFixed(0).toString());
    });
    it('12.53 Initial ILT(DAI->ETH) but at time of call back ILT(DAI->DAI)', async function() {
      await p2.sendEther({from: owner, value: toWei(5)});
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
      await p1.internalLiquiditySwap(toHex('DAI'));
      let p2ETH = await web3.eth.getBalance(p2.address);
      let p2DAI = await cad.balanceOf(p2.address);
      await p1.upgradeInvestmentPool(cad.address);
      await p2.sendEther({from: owner, value: p2ETH / 1 - toWei(5) * 1});
      await cad.transfer(p2.address, p2DAI);
      await cad.transfer(p2.address, toWei(30), {from: owner});
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190311,
        false
      );
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 2);
      time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      let baseVarMinE = await pd.getCurrencyAssetVarBase(toHex('DAI'));

      let amount =
        1.5 *
          parseFloat(parseFloat(baseVarMinE[2]) + parseFloat(baseVarMinE[1])) -
        parseFloat(ICABalD);
      await p1.__callback(APIID, '');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      (CABalE / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalE / toWei(1)).toFixed(0).toString());
      (CABalE2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalE2 / toWei(1)).toFixed(0).toString());
      (CABalD / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalD * 1 + amount / 1) / toWei(1)).toFixed(0).toString()
        );
      (CABalD2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalD2 * 1 - amount / 1) / toWei(1)).toFixed(0).toString()
        );
    });
  });
  describe('Should be able to delegate callback for', function() {
    it('12.54 Expire Cover ', async function() {
      let coverID;

      await cad.approve(p1.address, coverDetailsLess[1], {
        from: member1
      });
      await cad.transfer(member1, tokenDai);
      coverDetailsLess[4] = 7972408607001;
      var vrsdata = await getQuoteValues(
        coverDetailsLess,
        toHex('DAI'),
        coverPeriodLess,
        smartConAdd,
        qt.address
      );
      await p1.makeCoverUsingCA(
        smartConAdd,
        toHex('DAI'),
        coverDetailsLess,
        coverPeriodLess,
        vrsdata[0],
        vrsdata[1],
        vrsdata[2],
        {from: member1}
      );

      coverID = await qd.getAllCoversOfUser(member1);

      const validity = await qd.getValidityOfCover(coverID[0]);
      await increaseTimeTo(
        new BN(validity.toString()).add(new BN((2).toString()))
      );

      let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await p1.__callback(APIID, '');
      assert.equal(parseFloat(await qd.getCoverStatusNo(coverID)), 3);
    });
    it('12.55 Empty string res for unknown id', async function() {
      let APIID = '0x6c6f6c';
      await assertRevert(p1.__callback(APIID, ''));
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
      await tk.transfer(member1, toWei(75000));
      await tk.transfer(member2, toWei(75000));
      await tk.transfer(member3, toWei(75000));
      await tk.transfer(member4, toWei(75000));
      await gv.submitVote(pId, 1, {from: member1});
      await gv.submitVote(pId, 1, {from: member2});
      await gv.submitVote(pId, 1, {from: member3});
      await gv.submitVote(pId, 1, {from: member4});
      let time = await latestTime();
      await increaseTimeTo(time + 604800);
      await gv.closeProposal(pId);
      await gv.triggerAction(pId);
      let newAssetAdd = await pd.getInvestmentAssetAddress(toHex('MKR'));
      newAssetAdd.should.be.equal(mkr.address);
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 500],
        20190311,
        false
      );
      let newAssetRate = await pd.getIAAvgRate(toHex('MKR'));
      (newAssetRate / 1).should.be.equal(500);
    });
    it('12.57 ELT(DAI->MKR)', async function() {
      await pd.changeCurrencyAssetBaseMin('0x444149', toWei(15));
      await p2.sendEther({from: owner, value: toWei(5)});
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 500],
        20190311,
        false
      );
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      ICABalM = await mkr.balanceOf(p2.address);
      let baseVarMinE = await pd.getCurrencyAssetVarBase(toHex('DAI'));

      let amount =
        parseFloat(ICABalD) -
        1.5 *
          parseFloat(parseFloat(baseVarMinE[2]) + parseFloat(baseVarMinE[1]));
      await p1.internalLiquiditySwap(toHex('DAI'));
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
      let CAbalM;
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalM = await mkr.balanceOf(p2.address);
      (CABalE / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalE / toWei(1)).toFixed(0).toString());
      (CABalE2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalE2 / toWei(1)).toFixed(0).toString());
      (CABalD / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalD * 1 - amount / 1) / toWei(1)).toFixed(0).toString()
        );
      (CABalD2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalD2 / toWei(1)).toFixed(0).toString());
      (CABalM / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          (
            (ICABalM * 1 +
              amount /
                ((await pd.getIAAvgRate(toHex('DAI'))) /
                  (await pd.getIAAvgRate(toHex('MKR'))))) /
            toWei(1)
          )
            .toFixed(0)
            .toString()
        );
    });
    it('12.58 ILT(DAI->MKR)', async function() {
      await pd.changeCurrencyAssetBaseMin('0x444149', toWei(9));
      let mkrBal = await mkr.balanceOf(p2.address);
      await p1.upgradeInvestmentPool(cad.address);
      // await p2.sendEther({ from: owner, value: (CABalE2/1 -toWei(5)) });
      await cad.transfer(p2.address, CABalD2);
      await mkr.transfer(p2.address, mkrBal);
      await mkr.transfer(p2.address, toWei(50));
      await tf.transferCurrencyAsset(toHex('DAI'), owner, toWei(15));
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 500],
        20190311,
        false
      );
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      ICABalM = await mkr.balanceOf(p2.address);
      let baseVarMinE = await pd.getCurrencyAssetVarBase(toHex('DAI'));

      let amount =
        1.5 *
          parseFloat(parseFloat(baseVarMinE[2]) + parseFloat(baseVarMinE[1])) -
        parseFloat(ICABalD);
      await p1.internalLiquiditySwap(toHex('DAI'));
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

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
      (CABalE / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalE / toWei(1)).toFixed(0).toString());
      (CABalE2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalE2 / toWei(1)).toFixed(0).toString());
      (CABalD / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalD * 1 + amount / 1) / toWei(1)).toFixed(0).toString()
        );
      (CABalD2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalD2 / toWei(1)).toFixed(0).toString());
      (CABalM / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          (
            (ICABalM * 1 -
              amount /
                ((await pd.getIAAvgRate(toHex('DAI'))) /
                  (await pd.getIAAvgRate(toHex('MKR'))))) /
            toWei(1)
          )
            .toFixed(0)
            .toString()
        );
    });

    it('12.59 ILT(DAI->MKR) IA dont have enough amount', async function() {
      let emockM = await fac.getExchange(mkr.address);
      emock = await exchangeMock.at(emockM);
      await emock.sendEther({from: owner, value: toWei(1300)});
      let emockD = await fac.getExchange(cad.address);
      let emockDAI = await exchangeMock.at(emockD);
      await emockDAI.sendEther({from: owner, value: toWei(1300)});
      await pd.changeCurrencyAssetBaseMin('0x444149', toWei(66));
      await p1.upgradeInvestmentPool(cad.address);
      await cad.transfer(p2.address, CABalD2);
      await mkr.transfer(p2.address, (CABalM / 1 - toWei(20)).toString());
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 500],
        20190311,
        false
      );

      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      ICABalM = await mkr.balanceOf(p2.address);
      await p1.internalLiquiditySwap(toHex('DAI'));
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

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
      (CABalE / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalE / toWei(1)).toFixed(0).toString());
      (CABalE2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalE2 / toWei(1)).toFixed(0).toString());
      (CABalD / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalD * 1 + toWei(63) * 1) / toWei(1)).toFixed(0).toString()
        );
      (CABalD2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalD2 / toWei(1)).toFixed(0).toString());
      (CABalM / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalM * 1 - toWei(31.5)) / toWei(1)).toFixed(0).toString()
        );
    });

    it('12.60 ILT(DAI->MKR) amount > price slippage', async function() {
      emock.removeEther(await web3.eth.getBalance(emock.address));
      let emockD = await fac.getExchange(
        await pd.getInvestmentAssetAddress(toHex('DAI'))
      );
      emockDAI = await exchangeMock.at(emockD);
      emockDAI.removeEther(await web3.eth.getBalance(emockDAI.address));
      await emockDAI.sendEther({from: owner, value: toWei(80)});
      await emock.sendEther({from: owner, value: toWei(75)});
      await tf.transferCurrencyAsset(toHex('DAI'), owner, toWei(12.5));
      await mkr.transfer(p2.address, toWei(50));
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 500],
        20190311,
        false
      );
      let CABalE;
      let CABalD;
      let CABalE2;
      let CABalD2;
      let CAbalM;
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      ICABalM = await mkr.balanceOf(p2.address);
      await p1.internalLiquiditySwap(toHex('DAI'));
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
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
      (CABalE / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalE / toWei(1)).toFixed(0).toString());
      (CABalE2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalE2 / toWei(1)).toFixed(0).toString());
      (CABalD / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalD * 1 + toWei(30) * 1) / toWei(1)).toFixed(0).toString()
        );
      (CABalD2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalD2 / toWei(1)).toFixed(0).toString());
      (CABalM / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalM * 1 - toWei(15) * 1) / toWei(1)).toFixed(0).toString()
        );
    });

    it('12.61 ELT(DAI->MKR) amount > price slippage', async function() {
      await pd.changeCurrencyAssetBaseMin('0x444149', toWei(6));
      await p1.upgradeInvestmentPool(cad.address);
      await p2.sendEther({from: owner, value: CABalE2});
      await cad.transfer(p2.address, CABalD2);
      await mkr.transfer(p2.address, (CABalM / 1 - toWei(30)).toString());
      await p2.sendEther({from: owner, value: toWei(10)});
      await emock.sendEther({from: owner, value: toWei(3)});
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 500],
        20190311,
        false
      );

      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      ICABalM = await mkr.balanceOf(p2.address);
      let time = await latestTime();
      await increaseTimeTo(
        (await pd.liquidityTradeCallbackTime()) / 1 + time / 1 + 100
      );
      await p1.internalLiquiditySwap(toHex('DAI'));
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

      await assertRevert(p1.__callback(APIID, '')); // to cover else branch (if call comes before callback time)
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
      (CABalE / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalE / toWei(1)).toFixed(0).toString());
      (CABalE2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalE2 / toWei(1)).toFixed(0).toString());
      (CABalD / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalD * 1 - toWei(30) * 1) / toWei(1)).toFixed(0).toString()
        );
      (CABalD2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalD2 / toWei(1)).toFixed(0).toString());
      (CABalM / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalM * 1 + toWei(15) * 1) / toWei(1)).toFixed(0).toString()
        );
    });
    it('12.62 ILT(ETH->ETH) IA dont have sufficeint ETH', async function() {
      await pd.changeCurrencyAssetBaseMin(toHex('ETH'), toWei(21));
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 500],
        20190311,
        false
      );
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      ICABalM = await mkr.balanceOf(p2.address);
      await p1.internalLiquiditySwap(toHex('ETH'));

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalM = await mkr.balanceOf(p2.address);
      (CABalE / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalE / 1 + toWei(10) * 1) / toWei(1)).toFixed(0).toString()
        );
      (CABalE2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalE2 - toWei(10)) / toWei(1)).toFixed(0).toString()
        );
      (CABalD / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalD / toWei(1)).toFixed(0).toString());
      (CABalD2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalD2 / toWei(1)).toFixed(0).toString());
      (CABalM / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalM / toWei(1)).toFixed(0).toString());
    });
    it('12.63 ILT(DAI->DAI) IA dont have sufficeint ETH', async function() {
      await pd.changeCurrencyAssetBaseMin(toHex('DAI'), toWei(36));
      await tf.transferCurrencyAsset(toHex('DAI'), owner, toWei(50));
      await p1.upgradeInvestmentPool(cad.address);
      await cad.transfer(p2.address, CABalD2);
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 500],
        20190311,
        false
      );

      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);
      ICABalM = await mkr.balanceOf(p2.address);

      await p1.internalLiquiditySwap(toHex('DAI'));

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      CABalM = await mkr.balanceOf(p2.address);
      (CABalE / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalE / toWei(1)).toFixed(0).toString());
      (CABalE2 / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalE2 / toWei(1)).toFixed(0).toString());
      (CABalD / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal(
          ((ICABalD / 1 + toWei(17.9) * 1) / toWei(1)).toFixed(0).toString()
        );
      let checkCondition =
        parseFloat((CABalD2 / toWei(1)).toFixed(0).toString()) ==
        parseFloat(
          ((ICABalD2 - toWei(17.9) * 1) / toWei(1)).toFixed(0).toString()
        );
      checkCondition.should.be.equal(true);
      (CABalM / toWei(1))
        .toFixed(0)
        .toString()
        .should.be.equal((ICABalM / toWei(1)).toFixed(0).toString());
    });
  });

  describe('More basic cases', function() {
    it('12.64 RBT For 0 balance in risk pool', async function() {
      await p1.upgradeInvestmentPool(cad.address);
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190311,
        true
      );
      await tf.upgradeCapitalPool(cad.address);
      await tf.upgradeCapitalPool(cad.address);
      await mcr.addMCRData(
        await getValue(0, pd, mcr),
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
      await gv.categorizeProposal(pId, 15, 0);
      let actionHash = encode(
        'changeInvestmentAssetStatus(bytes4,bool)',
        toHex('DAI'),
        false
      );
      await gv.submitProposalWithSolution(pId, 'Inactive IA', actionHash, {
        from: member1
      });
      await gv.submitVote(pId, 1, {from: member1});
      await gv.submitVote(pId, 1, {from: member2});
      await gv.submitVote(pId, 1, {from: member3});
      await gv.submitVote(pId, 1, {from: member4});
      let time = await latestTime();
      await increaseTimeTo(time + 604800);
      await gv.closeProposal(pId);
      await gv.triggerAction(pId);
      (await pd.getInvestmentAssetStatus(toHex('DAI'))).should.be.equal(false);
      await p1.sendEther({from: owner, value: toWei(2)});
      await p2.saveIADetails(
        ['0x444149', '0x455448'],
        [100, 15517],
        20190103,
        false
      );
    });

    it('12.65 TransferEther should revert when called by other than govern', async function() {
      await assertRevert(p1.transferEther(toWei(1), owner));
    });
    it('12.66 should able to propose change in holding percentages', async function() {
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
      await gv.categorizeProposal(pId, 14, 0);
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
      await gv.submitVote(pId, 1, {from: member1});
      await gv.submitVote(pId, 1, {from: member2});
      await gv.submitVote(pId, 1, {from: member3});
      await gv.submitVote(pId, 1, {from: member4});
      let time = await latestTime();
      await increaseTimeTo(time + 604800);
      await gv.closeProposal(pId);
      await gv.triggerAction(pId);
      let initialPerc = await pd.getInvestmentAssetHoldingPerc(toHex('DAI'));
      (initialPerc[0] / 1).should.be.equal(100);
      (initialPerc[1] / 1).should.be.equal(1000);
    });
    it('12.67 should not be able to change holding percentages directly', async function() {
      let initialPerc = await pd.getInvestmentAssetHoldingPerc(toHex('DAI'));
      await assertRevert(
        pd.changeInvestmentAssetHoldingPerc('0x444149', 200, 300)
      );
      let finalPerc = await pd.getInvestmentAssetHoldingPerc(toHex('DAI'));
      initialPerc[0].toString().should.be.equal(finalPerc[0].toString());
      initialPerc[1].toString().should.be.equal(finalPerc[1].toString());
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
        toHex('MKR'),
        mkr.address,
        '10000000000000000000'
      );
      await gv.submitProposalWithSolution(pId, 'add CA', actionHash, {
        from: member1
      });
      await gv.submitVote(pId, 1, {from: member1});
      await gv.submitVote(pId, 1, {from: member2});
      await gv.submitVote(pId, 1, {from: member3});
      await gv.submitVote(pId, 1, {from: member4});
      let time = await latestTime();
      await increaseTimeTo(time + 604800);
      await gv.closeProposal(pId);
      await gv.triggerAction(pId);
      let varbase = await pd.getCurrencyAssetVarBase(toHex('MKR'));
      (varbase[1] / 1).should.be.equal(toWei(10) * 1);
      (varbase[2] / 1).should.be.equal(0);
      (await pd.getCurrencyAssetAddress(toHex('MKR'))).should.be.equal(
        mkr.address
      );
    });
    it('12.69 should not be able to add new currency asset directly', async function() {
      await assertRevert(
        pd.addCurrencyAssetCurrency('0x49434e', mkr.address, toWei(11))
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
        toHex('DAI'),
        member4
      );
      await gvProp(30, actionHash, mr, gv, 3);
      (await pd.getCurrencyAssetAddress(toHex('DAI'))).should.be.equal(member4);
    });
    it('12.73 should be able to propose new IA address and decimal by owner', async function() {
      let actionHash = encode(
        'changeInvestmentAssetAddressAndDecimal(bytes4,address,uint8)',
        toHex('DAI'),
        member3,
        16
      );
      await gvProp(32, actionHash, mr, gv, 3);
      (await pd.getInvestmentAssetAddress(toHex('DAI'))).should.be.equal(
        member3
      );
      ((await pd.getInvestmentAssetDecimals(toHex('DAI'))) / 1).should.be.equal(
        16
      );
    });
  });

  after(async function () {
    await revertSnapshot(snapshotId);
  });

});
