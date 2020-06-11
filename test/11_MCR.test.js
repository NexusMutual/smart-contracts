const MCR = artifacts.require('MCR');
const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolDataMock');
const DAI = artifacts.require('MockDAI');
const NXMToken = artifacts.require('NXMToken');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMasterMock');
const DSValue = artifacts.require('NXMDSValueMock');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const TokenFunctions = artifacts.require('TokenFunctionMock');

const {assertRevert} = require('./utils/assertRevert');
const {advanceBlock} = require('./utils/advanceToBlock');
const {ether, toHex, toWei} = require('./utils/ethTools');
const {increaseTimeTo, duration} = require('./utils/increaseTime');
const {latestTime} = require('./utils/latestTime');
const getValue = require('./utils/getMCRPerThreshold.js').getValue;

const CA_ETH = '0x45544800';
const CA_DAI = '0x44414900';

let mcr;
let pd;
let tk;
let p1;
let p2;
let mr;
let nxms;
let DSV;
let qd;
let tf;
let balance_DAI;
let balance_ETH;
const BN = web3.utils.BN;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('MCR', function([owner, notOwner]) {
  before(async function() {
    await advanceBlock();
    mcr = await MCR.deployed();
    tk = await NXMToken.deployed();
    p1 = await Pool1.deployed();
    pd = await PoolData.deployed();
    cad = await DAI.deployed();
    nxms = await NXMaster.at(await pd.ms());
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    p2 = await Pool2.deployed();
    DSV = await DSValue.deployed();
    qd = await QuotationDataMock.deployed();
    tf = await TokenFunctions.deployed();
  });

  describe('Initial MCR cap test cases', function() {
    it('Testing new threshold condition with standard values', async function() {
      let thresholdValues = await mcr.getThresholdValues(
        new BN(toWei(7072).toString()),
        new BN(toWei(7060).toString()),
        new BN((2218).toString()),
        new BN((7).toString())
      );
      thresholdValues[0].toString().should.be.equal(new BN(9184).toString());
      thresholdValues[1].toString().should.be.equal(new BN(12123).toString());
      let thresholdValues1 = await mcr.getThresholdValues(
        new BN(toWei(7072).toString()),
        new BN(toWei(7060).toString()),
        new BN((20000).toString()),
        new BN((7).toString())
      );
      thresholdValues1[0].toString().should.be.equal(new BN(7072).toString());
      thresholdValues1[1].toString().should.be.equal(new BN(12123).toString());
      thresholdValues2 = await mcr.getThresholdValues(
        new BN('9127095013938829399629'.toString()),
        new BN(toWei(9127).toString()),
        new BN((4856).toString()),
        new BN((7).toString())
      );
      thresholdValues2[0].toString().should.be.equal(new BN(11853).toString());
      thresholdValues2[1].toString().should.be.equal(new BN(15646).toString());
    });
    it('11.1 post mcr before launch should not affect initialMCRCap', async function() {
      let cap = await pd.capReached();
      await mcr.addMCRData(
        18000,
        toWei(100),
        toWei(2),
        ['0x455448', '0x444149'],
        [100, 65407],
        20181011
      );
      ((await mcr.variableMincap()) / 1e18)
        .toString()
        .should.be.equal((70).toString());
      (await pd.capReached()).toString().should.be.equal(cap.toString());
    });
    describe('After launch', function() {
      before(async function() {
        await mr.addMembersBeforeLaunch([], []);
        (await mr.launched()).should.be.equal(true);
      });

      it('11.2 After launch cap should not be set until it reached 100 for 1st time', async function() {
        await mcr.addMCRData(
          1800,
          toWei(100),
          toWei(2),
          ['0x455448', '0x444149'],
          [100, 65407],
          20181011
        );
        ((await mcr.variableMincap()) / 1e18)
          .toString()
          .should.be.equal((70).toString());
        (await pd.capReached()).toString().should.be.equal((0).toString());
      });

      it('11.4 After launch cap should be set to 1 if reached 100% for 1st time on 30th day', async function() {
        await mcr.addMCRData(
          18000,
          toWei(100),
          toWei(2),
          ['0x455448', '0x444149'],
          [100, 65407],
          20181011
        );
        ((await mcr.variableMincap()) / 1e18)
          .toString()
          .should.be.equal((140.7).toString());
        (await pd.capReached()).toString().should.be.equal((1).toString());
      });
    });
  });

  describe('Calculation of V(tp) and MCR(tp)', function() {
    let cal_vtp;
    let cal_mcrtp;

    before(async function() {
      await mcr.addMCRData(
        18000,
        toWei(100),
        toWei(2),
        ['0x455448', '0x444149'],
        [100, 15517],
        20190103
      );
      ((await mcr.variableMincap()) / 1e18)
        .toString()
        .should.be.equal((212.107).toString());
      await cad.transfer(p1.address, ether(600));
      balance_DAI = await cad.balanceOf(p1.address);
      balance_ETH = await web3.eth.getBalance(p1.address);
      balance_ETH = new BN(balance_ETH.toString()).add(
        new BN((await p1.getInvestmentAssetBalance()).toString())
      );
    });

    it('11.5 should return correct V(tp) price', async function() {
      const price_dai = await pd.getCAAvgRate(CA_DAI);
      cal_vtp = new BN(balance_DAI.toString())
        .mul(new BN((100).toString()))
        .div(new BN(price_dai.toString()));
      cal_vtp = new BN(cal_vtp.toString()).add(new BN(balance_ETH.toString()));
      cal_vtp
        .toString()
        .should.be.equal((await mcr.calVtpAndMCRtp())[0].toString());
    });

    it('11.6 should return correct MCR(tp) price', async function() {
      const lastMCR = await pd.getLastMCR();
      cal_mcrtp = new BN(cal_vtp.toString())
        .mul(new BN(lastMCR[0].toString()))
        .div(new BN(lastMCR[2].toString()));
      cal_mcrtp
        .toString()
        .should.be.equal((await mcr.calVtpAndMCRtp())[1].toString());
    });
  });

  describe('Token Price Calculation', function() {
    let tp_eth;
    let tp_dai;

    before(async function() {
      const tpd = await pd.getTokenPriceDetails(CA_ETH);
      // const tc = (await tk.totalSupply()).div(toWei(1));
      const sf = parseFloat(tpd[0].toString()) / 100000;

      const C = tpd[1];
      const Curr3DaysAvg = tpd[2];
      const mcrtp = (await mcr.calVtpAndMCRtp())[1];
      const mcrtpSquare = new BN(mcrtp.toString())
        .mul(new BN(mcrtp.toString()))
        .div(new BN((100000000).toString()));

      const mcrEth = new BN((await pd.getLastMCREther()).toString()).div(
        new BN(toWei(1).toString())
      );
      const tp =
        sf +
        (parseFloat(mcrEth.toString()) / parseFloat(C.toString())) *
          parseFloat(mcrtpSquare.toString()) *
          parseFloat(mcrtpSquare.toString());

      tp_eth = tp * (parseFloat(Curr3DaysAvg.toString()) / 100);
      tp_dai =
        tp * (parseFloat((await pd.getCAAvgRate(CA_DAI)).toString()) / 100);
    });
    it('11.7 should return correct Token price in ETH', async function() {
      parseInt(tp_eth / 1000)
        .toString()
        .should.be.equal(
          parseInt(
            new BN((await mcr.calculateTokenPrice(CA_ETH)).toString())
              .div(new BN(toWei(1).toString()))
              .toString() / 1000
          ).toString()
        );
    });
    it('11.8 should return correct Token price in DAI', async function() {
      parseInt(tp_dai / 1e6)
        .toString()
        .should.be.equal(
          parseInt(
            new BN((await mcr.calculateTokenPrice(CA_DAI)).toString())
              .div(new BN(toWei(1).toString()))
              .toString() / 1e6
          ).toString()
        );
    });
  });

  describe('Misc', function() {
    it('11.15 should not be able to change master address', async function() {
      await assertRevert(
        mcr.changeMasterAddress(mcr.address, {from: notOwner})
      );
    });
    it('11.16 should not be able to add mcr data if not notarise', async function() {
      await assertRevert(
        mcr.addMCRData(
          18000,
          toWei(100),
          toWei(2),
          ['0x455448', '0x444149'],
          [100, 65407],
          20181011,
          {from: notOwner}
        )
      );
    });
    it('11.17 add mcr when vf > vtp', async function() {
      await mcr.addMCRData(
        18000,
        toWei(100),
        toWei(35.83333333333333),
        ['0x455448', '0x444149'],
        [100, 65407],
        20181011,
        {from: owner}
      );
      ((await mcr.variableMincap()) / 1e18)
        .toString()
        .should.be.equal((284.22807).toString());
    });
    it('11.18 getAllSumAssurance function should skip calcualation for currency with rate 0', async function() {
      await DSV.setZeroRate(true);
      let allSA = await mcr.getAllSumAssurance();
      (await qd.getTotalSumAssured(toHex('ETH')))
        .toString()
        .should.be.equal(allSA.toString());
    });
    it('11.19 calVtpAndMCRtp function should skip calcualation for currency with rate 0', async function() {
      let vtp = await mcr.calVtpAndMCRtp();
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      vtp[0]
        .toString()
        .should.be.equal(
          new BN(CABalE.toString()).add(new BN(CABalE2.toString())).toString()
        );
    });
    it('11.20 mcrTp should be 0 if vFull is 0', async function() {
      await mcr.addMCRData(
        await getValue(0, pd, mcr),
        toWei(100),
        0,
        ['0x455448', '0x444149'],
        [100, 65407],
        20181011,
        {from: owner}
      );
      ((await mcr.variableMincap()) / 1e18)
        .toString()
        .should.be.equal((284.22807).toString());
      let vtp = await mcr.calVtpAndMCRtp();

      (vtp[1] / 1).should.be.equal(0);
    });
    it('11.21 mcr if vtp is 0', async function() {
      await tf.upgradeCapitalPool(cad.address);
      await p1.upgradeInvestmentPool(cad.address);
      await mcr.addMCRData(
        18000,
        toWei(100),
        0,
        ['0x455448', '0x444149'],
        [100, 65407],
        20181011,
        {from: owner}
      );
      ((await mcr.variableMincap()) / 1e18)
        .toString()
        .should.be.equal((357.0703507).toString());
      let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      let timeINC =
        (await pd.getDateAddOfAPI(APIID)) / 1 +
        (await pd.mcrFailTime()) / 1 +
        100;
      await increaseTimeTo(timeINC);
      await p1.__callback(APIID, '');
    });
    it('11.22 rebalancing trade if total risk balance is 0', async function() {
      await p1.sendEther({from: owner, value: toWei(2)});

      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 15517],
        20190103,
        true
      );
    });
    it('11.23 if mcr fails and retry after new mcr posted', async function() {
      await tf.upgradeCapitalPool(cad.address);
      await p1.upgradeInvestmentPool(cad.address);
      await mcr.addMCRData(
        18000,
        toWei(100),
        0,
        ['0x455448', '0x444149'],
        [100, 65407],
        20181012,
        {from: owner}
      );
      ((await mcr.variableMincap()) / 1e18)
        .toString()
        .should.be.equal((430.64105420699997).toString());
      let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await mcr.addMCRData(
        18000,
        toWei(100),
        toWei(100),
        ['0x455448', '0x444149'],
        [100, 65407],
        20181013,
        {from: owner}
      );
      ((await mcr.variableMincap()) / 1e18)
        .toString()
        .should.be.equal((504.94746474907004).toString());
      await assertRevert(p1.__callback(APIID, '')); // to cover else branch (if call comes before callback time)
      let timeINC =
        (await pd.getDateAddOfAPI(APIID)) / 1 +
        (await pd.mcrFailTime()) / 1 +
        100;
      await increaseTimeTo(timeINC);
      await p1.__callback(APIID, '');
    });

    it('11.24 get orcalise call details', async function() {
      let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      let curr = await pd.getCurrOfApiId(APIID);
      let id = await pd.getApiCallIndex(1);
      let dateUPD = await pd.getDateUpdOfAPI(APIID);
      let details = await pd.getApiCallDetails(APIID);
    });
    it('should not be able to update capital model parameters directly', async function() {
      await assertRevert(mcr.updateUintParameters('0x49434e', 12));
    });
  });
});
