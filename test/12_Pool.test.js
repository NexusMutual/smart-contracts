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
const Governance = artifacts.require('Governance');
const FactoryMock = artifacts.require('FactoryMock');

const { advanceBlock } = require('./utils/advanceToBlock');
const { assertRevert } = require('./utils/assertRevert');
const { ether } = require('./utils/ether');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');
const encode = require('./utils/encoder.js').encode;

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
    tc = await TokenController.deployed();
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
    describe('if owner', function() {
      describe('Change Minimum Cap', function() {
        it('12.1 should be able to change min cap', async function() {
          await pd.changeMinCap(ether(1), { from: owner });
          (await pd.minCap()).should.be.bignumber.equal(ether(1));
        });
      });
      describe('Change ShockParameter', function() {
        it('12.2 should be able to change ShockParameter', async function() {
          await pd.changeShockParameter(1, { from: owner });
          (await pd.shockParameter()).should.be.bignumber.equal(1);
        });
      });
      describe('Change C', function() {
        it('12.3 should be able to change C', async function() {
          await pd.changeC(1, { from: owner });
          (await pd.C()).should.be.bignumber.equal(1);
        });
      });
      describe('Change MCRTime', function() {
        it('12.4 should be able to change MCRTime', async function() {
          await pd.changeMCRTime(1, { from: owner });
          (await pd.mcrTime()).should.be.bignumber.equal(1);
        });
      });
      describe('Change MCRFailTime', function() {
        it('12.5 should be able to change MCRFailTime', async function() {
          await pd.changeMCRFailTime(1, { from: owner });
          (await pd.mcrFailTime()).should.be.bignumber.equal(1);
        });
      });
    });

    describe('if not owner', function() {
      describe('Change Minimum Cap', function() {
        it('12.6 should not be able to change min cap', async function() {
          await assertRevert(pd.changeMinCap(1, { from: notOwner }));
        });
      });
      describe('Change ShockParameter', function() {
        it('12.7 should not be able to change ShockParameter', async function() {
          await assertRevert(pd.changeShockParameter(1, { from: notOwner }));
        });
      });
      describe('Change C', function() {
        it('12.8 should not be able to change C', async function() {
          await assertRevert(pd.changeC(1, { from: notOwner }));
        });
      });
      describe('Change MCRTime', function() {
        it('12.9 should not be able to change MCRTime', async function() {
          await assertRevert(pd.changeMCRTime(1, { from: notOwner }));
        });
      });
      describe('Change MCRFailTime', function() {
        it('12.10 should not be able to change MCRFailTime', async function() {
          await assertRevert(pd.changeMCRFailTime(1, { from: notOwner }));
        });
      });
    });

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

    it('12.17 should not be able to change UniswapFactoryAddress if not owner', async function() {
      await assertRevert(
        p2.changeUniswapFactoryAddress(pd.address, { from: notOwner })
      );
    });
    it('12.18 should be able to transfer all investment asset to new address if owner', async function() {
      await p2.upgradeInvestmentPool(owner);
      await p2.upgradeInvestmentPool(owner);
      await p2.sendTransaction({ from: owner, value: 10 * 1e18 });
    });
    it('12.19 should be able to change Variation Percentage', async function() {
      await pd.changeVariationPercX100(400);
      (await pd.variationPercX100()).should.be.bignumber.equal(400);
    });
    it('12.20 should be able to change Uniswap Deadline time', async function() {
      await pd.changeUniswapDeadlineTime(duration.minutes(26));
      (await pd.uniswapDeadline()).should.be.bignumber.equal(
        duration.minutes(26)
      );
    });
    it('12.21 should be able to change liquidity Trade Callback Time', async function() {
      await pd.changeliquidityTradeCallbackTime(duration.hours(5));
      (await pd.liquidityTradeCallbackTime()).should.be.bignumber.equal(
        duration.hours(5)
      );
    });
    it('12.22 should be able to change Investment Asset rate time', async function() {
      await pd.changeIARatesTime(duration.hours(26));
      (await pd.iaRatesTime()).should.be.bignumber.equal(duration.hours(26));
    });
    it('12.23 should be able to set last Liquidity Trade Trigger', async function() {
      await pd.changeIARatesTime(duration.hours(26));
      (await pd.iaRatesTime()).should.be.bignumber.equal(duration.hours(26));
    });
    it('12.24 should be able to change Currency Asset address', async function() {
      await pd.changeCurrencyAssetAddress(newAsset, NEW_ADDRESS);
      (await pd.getCurrencyAssetAddress(newAsset)).should.equal(NEW_ADDRESS);
    });
    it('12.25 should be able to change Currency Asset Base Minimum', async function() {
      await pd.changeCurrencyAssetBaseMin(newAsset, 2);
      (await pd.getCurrencyAssetBaseMin(newAsset)).should.be.bignumber.equal(2);
    });
    it('12.26 should be able to change Currency Asset Var Minimum', async function() {
      await pd.changeCurrencyAssetVarMin(newAsset, 1);
      (await pd.getCurrencyAssetVarMin(newAsset)).should.be.bignumber.equal(1);
    });
    it('12.27 should be able to change Investment Asset address', async function() {
      await pd.changeInvestmentAssetAddress(newAsset, NEW_ADDRESS);
      (await pd.getInvestmentAssetAddress(newAsset)).should.equal(NEW_ADDRESS);
    });
    it('12.28 should be able to update Investment Asset Decimals', async function() {
      await pd.updateInvestmentAssetDecimals(newAsset, 19);
      (await pd.getInvestmentAssetDecimals(newAsset)).should.be.bignumber.equal(
        19
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

    it('12.30 should be able to get Currency asset details in single call', async function() {
      await p2.getCurrencyAssetDetails('0x455448');
    });

    it('12.31 should be able to get Currency asset details in single call', async function() {
      await p2.getCurrencyAssetDetails('0x444149');
    });

    it('12.32 should return Investment Asset Rank Details', async function() {
      const lastDate = await pd.getLastDate();
      await pd.getIARankDetailsByDate(lastDate);
    });
    it('12.33 should return data', async function() {
      const length = await pd.getApilCallLength();
      const myId = await pd.getApiCallIndex(length - 1);
      await pd.getApiCallDetails(myId);
      await pd.getDateUpdOfAPI(myId);
      await pd.getCurrOfApiId(myId);
      await pd.getDateUpdOfAPI(myId);
      await pd.getDateAddOfAPI(myId);
      await pd.getApiIdTypeOf(myId);
    });
  });

  describe('Liquidity', function() {
    it('12.34 Setting the testing parameters', async function() {
      await DSV.setRate(10 * 1e18);
      await pd.changeCurrencyAssetBaseMin('0x455448', 6 * 1e18);
      await pd.changeCurrencyAssetBaseMin('0x444149', 6 * 1e18);
      await p1.upgradeCapitalPool(owner);
      await p2.upgradeInvestmentPool(owner);
      await p1.transferCurrencyAsset('DAI', owner, 5 * 1e18);
      await p1.transferCurrencyAsset('ETH', owner, 5 * 1e18);
      await p2.transferInvestmentAsset('DAI', owner, 5 * 1e18);
      await p2.transferInvestmentAsset('ETH', owner, 5 * 1e18);
      await p1.sendTransaction({ from: owner, value: 20 * 1e18 });
      await cad.transfer(p1.address, 20 * 1e18);

      // console.log(await nxms.getLastEmergencyPause());
      // allMCRData.push(McrData(0, 0, 0, 0));

      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190125,
        false
      );
      await pd.changeVariationPercX100(100);
      let baseMinE = await pd.getCurrencyAssetBaseMin('0x455448');
      let baseMinD = await pd.getCurrencyAssetBaseMin('0x444149');
      let holdMinE = await pd.getInvestmentAssetMinHoldingPerc('0x455448');
      let holdMinD = await pd.getInvestmentAssetMinHoldingPerc('0x444149');
      let holdMaxE = await pd.getInvestmentAssetMaxHoldingPerc('0x455448');
      let holdMaxD = await pd.getInvestmentAssetMaxHoldingPerc('0x444149');
    });
    it('12.35 ELT ETH (No IA available at IA pool)', async function() {
      let ICABalE;
      let ICABalD;
      let ICABalE2;
      let ICABalD2;
      ICABalE = await web3.eth.getBalance(p1.address);
      ICABalE2 = await web3.eth.getBalance(p2.address);
      ICABalD = await cad.balanceOf(p1.address);
      ICABalD2 = await cad.balanceOf(p2.address);

      await p2.internalLiquiditySwap('ETH');

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

      await p2.internalLiquiditySwap('DAI');

      let FCABalE;
      let FCABalD;
      let FCABalE2;
      let FCABalD2;

      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      let exchangeDAI = await fac.getExchange(
        await pd.getInvestmentAssetAddress('DAI')
      );
      emock = await exchangeMock.at(exchangeDAI);
      await emock.sendTransaction({ from: notOwner, value: 2000 * 1e18 });
      await cad.transfer(emock.address, 200000 * 1e18);

      await p2.delegateCallBack(APIID);

      FCABalE = await web3.eth.getBalance(p1.address);
      FCABalE2 = await web3.eth.getBalance(p2.address);
      FCABalD = await cad.balanceOf(p1.address);
      FCABalD2 = await cad.balanceOf(p2.address);
      baseVarMinE = await pd.getCurrencyAssetVarBase('DAI');
      amount =
        parseFloat(CABalD) -
        1.5 *
          parseFloat(parseFloat(baseVarMinE[0]) + parseFloat(baseVarMinE[1]));

      FCABalE.should.be.bignumber.equal(CABalE);
      FCABalE2.should.be.bignumber.equal(
        amount / ((await pd.getCAAvgRate('DAI')) / 100) + CABalE2 * 1
      );
      FCABalD.should.be.bignumber.equal(CABalD - amount);
      FCABalD2.should.be.bignumber.equal(CABalD2);
    });
    it('12.36 RBT (ETH to ETH)', async function() {
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
    it('12.37 ILT(ETH->ETH)', async function() {
      await pd.changeCurrencyAssetBaseMin(
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
      await p2.internalLiquiditySwap('ETH');
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
    it('12.38 ELT(ETH->DAI)', async function() {
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
        (await pd.getCurrencyAssetBaseMin('ETH')) * 1 - 5 * 1e18
      );
      let baseVarMinE = await pd.getCurrencyAssetVarBase('ETH');
      let amount =
        parseFloat(ICABalE) -
        1.5 * (parseFloat(baseVarMinE[0]) + parseFloat(baseVarMinE[1]));
      await p2.internalLiquiditySwap('ETH');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await p2.delegateCallBack(APIID);
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

    it('12.39 ILT(DAI->DAI)', async function() {
      await pd.changeCurrencyAssetBaseMin(
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
      await p2.internalLiquiditySwap('DAI');
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

    it('12.40 ELT(DAI->DAI)', async function() {
      await p2.sendTransaction({ from: owner, value: 3 * 1e18 });
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        false
      );
      await pd.changeCurrencyAssetBaseMin(
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
      await p2.internalLiquiditySwap('DAI');
      let CABalE;
      let CABalD;
      let CABalE2;
      let CABalD2;
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      await p2.transferInvestmentAsset('ETH', owner, 3 * 1e18);
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

    it('12.41 RBT(DAI->ETH)', async function() {
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

    it('12.42 ELT(DAI->ETH)', async function() {
      await cad.transfer(p1.address, 10 * 1e18);
      let CABalE;
      let CABalD;
      let CABalE2;
      let CABalD2;
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
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
      await p2.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      await p2.delegateCallBack(APIID);

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });

    it('12.43 ILT DAI to ETH', async function() {
      await p2.sendTransaction({ from: owner, value: 5 * 1e18 });
      await p1.transferCurrencyAsset('DAI', owner, 5 * 1e18);
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

      let baseVarMinE = await pd.getCurrencyAssetVarBase('DAI');

      let amount1 =
        1.5 *
          parseFloat(parseFloat(baseVarMinE[0]) + parseFloat(baseVarMinE[1])) -
        parseFloat(CABalD);
      console.log(baseVarMinE, '-=-=-=-=', amount1);
      await p2.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      await p2.delegateCallBack(APIID);

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });

    it('12.44 ELT(ETH->ETH)', async function() {
      await p1.sendTransaction({ from: owner, value: 5 * 1e18 });
      await p2.transferInvestmentAsset('ETH', owner, 5 * 1e18);
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
      await p2.internalLiquiditySwap('ETH');
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });

    it('12.45 ILT ETH to DAI', async function() {
      await cad.transfer(p2.address, 50 * 1e18, { from: owner });
      await p1.transferCurrencyAsset('ETH', owner, 5 * 1e18);
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
      await p2.internalLiquiditySwap('ETH');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      await p2.delegateCallBack(APIID);

      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });

    it('12.46 RBT DAI to ETH amount > price slippage', async function() {
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
      await p2.delegateCallBack(APIID);
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });

    it('12.47 Initial ELT(ETH->DAI) but at time of call back ELT(ETH->ETH)', async function() {
      await p1.sendTransaction({ from: owner, value: 5 * 1e18 });
      await p2.transferInvestmentAsset('DAI', owner, 50 * 1e18);
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190129,
        false
      );
      await p2.internalLiquiditySwap('ETH');
      await p2.transferInvestmentAsset('ETH', owner, 5 * 1e18);
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
      await p2.delegateCallBack(APIID);
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });
    it('12.48 ELT(ETH->DAI) amount > price slippage', async function() {
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
      await p2.internalLiquiditySwap('ETH');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      await p2.delegateCallBack(APIID);
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });
    it('12.49 ELT(DAI->ETH) amount > price slippage', async function() {
      await emock.sendTransaction({ from: owner, value: 17400000000000000 });
      console.log(
        'emock---',
        parseFloat(await web3.eth.getBalance(emock.address))
      );
      await p2.transferInvestmentAsset('ETH', owner, 5 * 1e18);
      await p1.transferCurrencyAsset('ETH', owner, 10 * 1e18);
      await cad.transfer(p1.address, 10 * 1e18, { from: owner });
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190309,
        false
      );
      await p2.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      await p2.delegateCallBack(APIID);
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });
    it('12.50 ILT(ETH->DAI) amount > price slippage', async function() {
      // await emock.sendTransaction({ from: owner, value:  });
      console.log(
        'emock---',
        parseFloat(await web3.eth.getBalance(emock.address))
      );
      await p1.transferCurrencyAsset('ETH', owner, 3 * 1e18);
      await p1.transferCurrencyAsset('DAI', owner, 5 * 1e18);
      await cad.transfer(p2.address, 5 * 1e18, { from: owner });
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190309,
        false
      );
      await p2.internalLiquiditySwap('ETH');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      await p2.delegateCallBack(APIID);
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });
    it('12.51 ILT(DAI->ETH) amount > price slippage', async function() {
      await emock.sendEth(1520000000000000000);
      await p2.sendTransaction({ from: owner, value: 5 * 1e18 });
      await p1.sendTransaction({
        from: owner,
        value: 6 * 1e18 - (await web3.eth.getBalance(p1.address))
      });
      console.log(
        'emock---',
        parseFloat(await web3.eth.getBalance(emock.address))
      );
      await p1.transferCurrencyAsset('DAI', owner, 5 * 1e18);
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190310,
        false
      );
      await p2.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      await p2.delegateCallBack(APIID);
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });
    it('12.52 ILT(ETH->DAI) IA dont have enough amount', async function() {
      await emock.sendTransaction({ from: owner, value: 50000 * 1e18 });

      await p2.transferInvestmentAsset('ETH', owner, 5 * 1e18);
      await pd.changeCurrencyAssetBaseMin('ETH', 11 * 1e18);

      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190311,
        false
      );
      await p2.internalLiquiditySwap('ETH');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      await p2.delegateCallBack(APIID);
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });
    it('12.53 ILT(DAI->ETH) IA dont have enough amount', async function() {
      await p2.transferInvestmentAsset('ETH', owner, 5 * 1e18);
      await pd.changeCurrencyAssetBaseMin('DAI', 16 * 1e18);

      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190311,
        false
      );
      await p2.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      await p2.delegateCallBack(APIID);
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });
    it('12.54 ILT(DAI->ETH) IA with 0 ETH balance', async function() {
      await pd.changeCurrencyAssetBaseMin('DAI', 21 * 1e18);

      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190311,
        false
      );
      await p2.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      await p2.delegateCallBack(APIID);
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      CABalD = await cad.balanceOf(p1.address);
      CABalD2 = await cad.balanceOf(p2.address);
      console.log('CABalE', CABalE);
      console.log('CABalD', CABalD);
      console.log('CABalE2', CABalE2);
      console.log('CABalD2', CABalD2);
    });
    it('12.55 Initial ILT(DAI->ETH) but at time of call back ILT(DAI->DAI)', async function() {
      await p2.sendTransaction({ from: owner, value: 5 * 1e18 });
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190311,
        false
      );
      await p2.internalLiquiditySwap('DAI');
      await p2.transferInvestmentAsset('ETH', owner, 5 * 1e18);
      await cad.transfer(p2.address, 30 * 1e18, { from: owner });
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190311,
        false
      );
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 2);
      console.log(await pd.getApiIdTypeOf(APIID));
      await p2.delegateCallBack(APIID);
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
    it('12.56 Expire Cover ', async function() {
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
      await p2.delegateCallBack(APIID);
      assert.equal(parseFloat(await qd.getCoverStatusNo(coverID)), 3);
    });
    it('12.57 Empty string res for unknown id', async function() {
      let APIID = '0x6c6f6c';
      await p2.delegateCallBack(APIID);
    });
  });
  describe('Trade Conditions checked', function() {
    it('12.58 For iaRate = 0', async function() {
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
      await gv.categorizeProposal(pId, 12, 0);
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
    });
    it('12.59 ELT(DAI->MKR)', async function() {
      // console.log("hell yeah");
      await pd.changeCurrencyAssetBaseMin('0x444149', 15 * 1e18);
      // await pd.changeCurrencyAssetBaseMin('ETH', 11 * 1e18);
      // await p2.upgradeInvestmentPool(owner);
      // await p1.upgradeCapitalPool(owner);
      // await p1.sendTransaction({ from: owner, value: 13.06*1e18 });
      await p2.sendTransaction({ from: owner, value: 5 * 1e18 });
      // await cad.transfer(p1.address,31.5*1e18);
      // await cad.transfer(p2.address,17.9*1e18);
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 500],
        20190311,
        false
      );
      console.log(await pd.getIARankDetailsByDate(20190311));
      await p2.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
      await p2.delegateCallBack(APIID);
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
    it('12.60 ILT(DAI->MKR)', async function() {
      // console.log("hell yeah");
      await pd.changeCurrencyAssetBaseMin('0x444149', 9 * 1e18);
      // await pd.changeCurrencyAssetBaseMin('ETH', 11 * 1e18);
      await mkr.transfer(p2.address, 50 * 1e18);
      await p2.transferInvestmentAsset('ETH', owner, 5 * 1e18);
      await p1.transferCurrencyAsset('DAI', owner, 15 * 1e18);
      await p2.saveIADetails(
        ['0x455448', '0x444149', '0x4d4b52'],
        [100, 1000, 2000],
        20190311,
        false
      );
      console.log(await pd.getIARankDetailsByDate(20190311));
      await p2.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));
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
      console.log(parseFloat(await pd.getCurrencyAssetBaseMin('DAI')));
      console.log(parseFloat(await pd.getCurrencyAssetBaseMin('ETH')));
      await p2.delegateCallBack(APIID);

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

    it('12.61 ILT(DAI->MKR) IA dont have enough amount', async function() {
      let emockM = await fac.getExchange(
        await pd.getInvestmentAssetAddress('MKR')
      );
      emock = await exchangeMock.at(emockM);
      await emock.sendTransaction({ from: owner, value: 1300 * 1e18 });
      console.log(parseFloat(await web3.eth.getBalance(emock.address)));
      let emockD = await fac.getExchange(
        await pd.getInvestmentAssetAddress('DAI')
      );
      let emockDAI = await exchangeMock.at(emockD);
      await emockDAI.sendTransaction({ from: owner, value: 1300 * 1e18 });
      console.log(parseFloat(await web3.eth.getBalance(emockDAI.address)));
      // console.log("hell yeah");
      await pd.changeCurrencyAssetBaseMin('0x444149', 66 * 1e18);
      // await pd.changeCurrencyAssetBaseMin('ETH', 11 * 1e18);
      await p2.transferInvestmentAsset('MKR', owner, 20 * 1e18);
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
      await p2.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));

      console.log(parseFloat(await pd.getCurrencyAssetBaseMin('DAI')));
      console.log(parseFloat(await pd.getCurrencyAssetBaseMin('ETH')));
      await p2.delegateCallBack(APIID);

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
      // console.log(parseFloat(await p2.a()));
    });

    it('12.62 ILT(DAI->MKR) amount > price slippage', async function() {
      emock.sendEth(await web3.eth.getBalance(emock.address));
      let emockD = await fac.getExchange(
        await pd.getInvestmentAssetAddress('DAI')
      );
      emockDAI = exchangeMock.at(emockD);
      emockDAI.sendEth(await web3.eth.getBalance(emockDAI.address));
      await emockDAI.sendTransaction({ from: owner, value: 80 * 1e18 });
      await emock.sendTransaction({ from: owner, value: 75 * 1e18 });
      await p1.transferCurrencyAsset('DAI', owner, 12.5 * 1e18);
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
      await p2.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));

      console.log(parseFloat(await pd.getCurrencyAssetBaseMin('DAI')));
      console.log(parseFloat(await pd.getCurrencyAssetBaseMin('ETH')));
      await p2.delegateCallBack(APIID);

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
      // console.log(parseFloat(await p2.a()));
    });

    it('12.63 ELT(DAI->MKR) amount > price slippage', async function() {
      await pd.changeCurrencyAssetBaseMin('0x444149', 6 * 1e18);
      await p2.transferInvestmentAsset('MKR', owner, 30 * 1e18);
      await p2.sendTransaction({ from: owner, value: 10 * 1e18 });
      await emock.sendTransaction({ from: owner, value: 3 * 1e18 });
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
      await p2.internalLiquiditySwap('DAI');
      var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      console.log(await pd.getApiIdTypeOf(APIID));

      console.log(parseFloat(await pd.getCurrencyAssetBaseMin('DAI')));
      console.log(parseFloat(await pd.getCurrencyAssetBaseMin('ETH')));
      await p2.delegateCallBack(APIID);

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
    it('12.64 RBT For 0 balance in risk pool', async function() {
      await p2.upgradeInvestmentPool(owner);
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190311,
        true
      );
      await p1.upgradeCapitalPool(owner);
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
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190311,
        false
      );
    });

    it('12.65 TransferEther should revert when called by other than govern', async function() {
      await assertRevert(p1.transferEther(1e18, owner));
    });
  });
});
