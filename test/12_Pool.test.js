const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolData');
const DAI = artifacts.require('MockDAI');
const testtt = artifacts.require('ExchangeMock');
const MCR = artifacts.require('MCR');
const DSValue = artifacts.require('DSValueMock');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const NXMToken = artifacts.require('NXMToken');
const TokenController = artifacts.require('TokenController');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');

const { advanceBlock } = require('./utils/advanceToBlock');
const { assertRevert } = require('./utils/assertRevert');
const { ether } = require('./utils/ether');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');

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

contract('Pool', function([owner, notOwner, member1, member2]) {
  before(async function() {
    await advanceBlock();
    p1 = await Pool1.deployed();
    p2 = await Pool2.deployed();
    pd = await PoolData.deployed();
    cad = await DAI.deployed();
    emock = await testtt.deployed();
    mcr = await MCR.deployed();
    DSV = await DSValue.deployed();
    qd = await QuotationDataMock.deployed();
    nxms = await NXMaster.deployed();
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    tk = await NXMToken.deployed();
    tf = await TokenFunctions.deployed();
    tc = await TokenController.deployed();
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
  });

  describe('PoolData', function() {
    describe('if owner', function() {
      describe('Change Minimum Cap', function() {
        it('should be able to change min cap', async function() {
          await pd.changeMinCap(ether(1), { from: owner });
          (await pd.minCap()).should.be.bignumber.equal(ether(1));
        });
      });
      describe('Change ShockParameter', function() {
        it('should be able to change ShockParameter', async function() {
          await pd.changeShockParameter(1, { from: owner });
          (await pd.shockParameter()).should.be.bignumber.equal(1);
        });
      });
      describe('Change C', function() {
        it('should be able to change C', async function() {
          await pd.changeC(1, { from: owner });
          (await pd.C()).should.be.bignumber.equal(1);
        });
      });
      describe('Change MCRTime', function() {
        it('should be able to change MCRTime', async function() {
          await pd.changeMCRTime(1, { from: owner });
          (await pd.mcrTime()).should.be.bignumber.equal(1);
        });
      });
      describe('Change MCRFailTime', function() {
        it('should be able to change MCRFailTime', async function() {
          await pd.changeMCRFailTime(1, { from: owner });
          (await pd.mcrFailTime()).should.be.bignumber.equal(1);
        });
      });
    });

    describe('if not owner', function() {
      describe('Change Minimum Cap', function() {
        it('should not be able to change min cap', async function() {
          await assertRevert(pd.changeMinCap(1, { from: notOwner }));
        });
      });
      describe('Change ShockParameter', function() {
        it('should not be able to change ShockParameter', async function() {
          await assertRevert(pd.changeShockParameter(1, { from: notOwner }));
        });
      });
      describe('Change C', function() {
        it('should not be able to change C', async function() {
          await assertRevert(pd.changeC(1, { from: notOwner }));
        });
      });
      describe('Change MCRTime', function() {
        it('should not be able to change MCRTime', async function() {
          await assertRevert(pd.changeMCRTime(1, { from: notOwner }));
        });
      });
      describe('Change MCRFailTime', function() {
        it('should not be able to change MCRFailTime', async function() {
          await assertRevert(pd.changeMCRFailTime(1, { from: notOwner }));
        });
      });
    });

    describe('Misc', function() {
      it('should return true if notarise address', async function() {
        (await pd.isnotarise(owner)).should.equal(true);
      });
      it('should return false if not notarise address', async function() {
        (await pd.isnotarise(notOwner)).should.equal(false);
      });
      it('should not be able to change master address', async function() {
        await assertRevert(
          pd.changeMasterAddress(pd.address, { from: notOwner })
        );
      });
      it('should not be able to add Currency', async function() {
        await assertRevert(pd.addCurrency('0x4c4f4c', { from: notOwner }));
        // await pd.A();
        // await pd.getLastMCREther();
        // await pd.getLastVfull();
      });
    });

    it('should return correct data', async function() {
      await pd.getAllCurrencies();
      const caIndex = await pd.getAllCurrenciesLen();
      (await pd.getCurrenciesByIndex(caIndex - 1)).should.equal(CA_DAI);
      await pd.getAllInvestmentCurrencies();
      const iaIndex = await pd.getInvestmentCurrencyLen();
      (await pd.getInvestmentCurrencyByIndex(iaIndex - 1)).should.equal(CA_DAI);
    });
    it('should not be able to add new Currency Asset', async function() {
      await assertRevert(
        pd.addCurrencyAssetCurrency(newAsset, ZERO_ADDRESS, 1)
      );
    });
    it('should not be able to add new Investment Asset', async function() {
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

    it('should not be able to change UniswapFactoryAddress if not owner', async function() {
      await assertRevert(
        p2.changeUniswapFactoryAddress(pd.address, { from: notOwner })
      );
    });
    it('should be able to transfer all investment asset to new address if owner', async function() {
      await p2.upgradeInvestmentPool(owner);
      await p2.upgradeInvestmentPool(owner);
      await p2.sendTransaction({ from: owner, value: 10 * 1e18 });
    });
    it('should be able to change Variation Percentage', async function() {
      await pd.changeVariationPercX100(400);
      (await pd.variationPercX100()).should.be.bignumber.equal(400);
    });
    it('should be able to change Uniswap Deadline time', async function() {
      await pd.changeUniswapDeadlineTime(duration.minutes(26));
      (await pd.uniswapDeadline()).should.be.bignumber.equal(
        duration.minutes(26)
      );
    });
    it('should be able to change liquidity Trade Callback Time', async function() {
      await pd.changeliquidityTradeCallbackTime(duration.hours(5));
      (await pd.liquidityTradeCallbackTime()).should.be.bignumber.equal(
        duration.hours(5)
      );
    });
    it('should be able to change Investment Asset rate time', async function() {
      await pd.changeIARatesTime(duration.hours(26));
      (await pd.iaRatesTime()).should.be.bignumber.equal(duration.hours(26));
    });
    it('should be able to set last Liquidity Trade Trigger', async function() {
      await pd.changeIARatesTime(duration.hours(26));
      (await pd.iaRatesTime()).should.be.bignumber.equal(duration.hours(26));
    });
    it('should be able to change Currency Asset address', async function() {
      await pd.changeCurrencyAssetAddress(newAsset, NEW_ADDRESS);
      (await pd.getCurrencyAssetAddress(newAsset)).should.equal(NEW_ADDRESS);
    });
    it('should be able to change Currency Asset Base Minimum', async function() {
      await pd.changeCurrencyAssetBaseMin(newAsset, 2);
      (await pd.getCurrencyAssetBaseMin(newAsset)).should.be.bignumber.equal(2);
    });
    it('should be able to change Currency Asset Var Minimum', async function() {
      await pd.changeCurrencyAssetVarMin(newAsset, 1);
      (await pd.getCurrencyAssetVarMin(newAsset)).should.be.bignumber.equal(1);
    });
    it('should be able to change Investment Asset address', async function() {
      await pd.changeInvestmentAssetAddress(newAsset, NEW_ADDRESS);
      (await pd.getInvestmentAssetAddress(newAsset)).should.equal(NEW_ADDRESS);
    });
    it('should be able to update Investment Asset Decimals', async function() {
      await pd.updateInvestmentAssetDecimals(newAsset, 19);
      (await pd.getInvestmentAssetDecimals(newAsset)).should.be.bignumber.equal(
        19
      );
    });

    it('should not be able to call saveIADetails if not notarise', async function() {
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

    it('should be able to get Currency asset details in single call', async function() {
      await p2.getCurrencyAssetDetails('0x455448');
    });

    it('should be able to get Currency asset details in single call', async function() {
      await p2.getCurrencyAssetDetails('0x444149');
    });

    it('should return Investment Asset Rank Details', async function() {
      const lastDate = await pd.getLastDate();
      await pd.getIARankDetailsByDate(lastDate);
    });
    it('should return data', async function() {
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
    it('Setting the testing parameters', async function() {
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
    it('ELT ETH (No IA available at IA pool)', async function() {
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
    it('RBT (ETH to ETH)', async function() {
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
    it('ILT(ETH->ETH)', async function() {
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
    it('ELT(ETH->DAI)', async function() {
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

    it('ILT(DAI->DAI)', async function() {
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

    it('ELT(DAI->DAI)', async function() {
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

    it('RBT(DAI->ETH)', async function() {
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

    it('ELT(DAI->ETH)', async function() {
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

    it('ILT DAI to ETH', async function() {
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

    it('ELT(ETH->ETH)', async function() {
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

    it('ILT ETH to DAI', async function() {
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
  });

  describe('Should be able to delegate callback for', function() {
    it('Expire Cover ', async function() {
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
    it('Empty string res for unknown id', async function() {
      let lol_APIID = '0x6c6f6c'; // lol
      await p2.delegateCallBack(lol_APIID);
    });
  });
  describe('Trade Conditions checked', function() {
    it('For iaRate = 0', async function() {
      await p2.saveIADetails(['0x455448', '0x444149'], [0, 0], 20190125, true);
    });
  });
  describe('RBT for total risk balance 0', function() {
    it('Successful', async function() {
      pd.pushMCRData(0, 0, 0, 0);
      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 1000],
        20190125,
        true
      );
    });
  });
});
