const MCR = artifacts.require('MCR');
const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolData');
const DAI = artifacts.require('MockDAI');
const NXMToken = artifacts.require('NXMToken');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const DSValue = artifacts.require('DSValueMock');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const TokenFunctions = artifacts.require('TokenFunctionMock');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');

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
    nxms = await NXMaster.deployed();
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    p2 = await Pool2.deployed();
    DSV = await DSValue.deployed();
    qd = await QuotationDataMock.deployed();
    tf = await TokenFunctions.deployed();
  });

  describe('Initial MCR cap test cases', function() {
    it('11.1 post mcr before launch should not affect initialMCRCap', async function() {
      let cap = await pd.capReached();
      await mcr.addMCRData(
        18000,
        100 * 1e18,
        2 * 1e18,
        ['0x455448', '0x444149'],
        [100, 65407],
        20181011
      );
      (await pd.capReached()).should.be.bignumber.equal(cap);
    });
    describe('After launch', function() {
      before(async function() {
        await mr.addMembersBeforeLaunch([], []);
        (await mr.launched()).should.be.equal(true);
      });

      it('11.2 After launch cap should not be set until it reached 100 for 1st time', async function() {
        await mcr.addMCRData(
          1800,
          100 * 1e18,
          2 * 1e18,
          ['0x455448', '0x444149'],
          [100, 65407],
          20181011
        );
        (await pd.capReached()).should.be.bignumber.equal(0);
      });

      it('11.3 After launch cap should be set to 2 if not reached 100% for 1st time till 30 days', async function() {
        let time = await latestTime();
        time = time + (await duration.days(30));
        await increaseTimeTo(time);
        await mcr.addMCRData(
          1800,
          100 * 1e18,
          2 * 1e18,
          ['0x455448', '0x444149'],
          [100, 65407],
          20181011
        );
        (await pd.capReached()).should.be.bignumber.equal(2);
      });

      it('11.4 After launch cap should not be set to 2 if reached 100% for 1st time on 30th day', async function() {
        await mcr.addMCRData(
          18000,
          100 * 1e18,
          2 * 1e18,
          ['0x455448', '0x444149'],
          [100, 65407],
          20181011
        );
        (await pd.capReached()).should.be.bignumber.equal(1);
      });
    });
  });

  describe('Calculation of V(tp) and MCR(tp)', function() {
    let cal_vtp;
    let cal_mcrtp;

    before(async function() {
      await mcr.addMCRData(
        18000,
        100 * 1e18,
        2 * 1e18,
        ['0x455448', '0x444149'],
        [100, 15517],
        20190103
      );
      await cad.transfer(p1.address, ether(600));
      balance_DAI = await cad.balanceOf(p1.address);
      balance_ETH = await web3.eth.getBalance(p1.address);
      balance_ETH = balance_ETH.plus(await p1.getInvestmentAssetBalance());
    });

    it('11.5 should return correct V(tp) price', async function() {
      const price_dai = await pd.getCAAvgRate(CA_DAI);
      cal_vtp = balance_DAI.mul(100).div(price_dai);
      cal_vtp = cal_vtp.plus(balance_ETH);
      cal_vtp
        .toFixed(0)
        .should.be.bignumber.equal((await mcr.calVtpAndMCRtp())[0]);
    });

    it('11.6 should return correct MCR(tp) price', async function() {
      const lastMCR = await pd.getLastMCR();
      cal_mcrtp = cal_vtp.mul(lastMCR[0]).div(lastMCR[2]);
      cal_mcrtp
        .toFixed(0)
        .should.be.bignumber.equal((await mcr.calVtpAndMCRtp())[1]);
    });
  });

  describe('Token Price Calculation', function() {
    let tp_eth;
    let tp_dai;

    before(async function() {
      const tpd = await pd.getTokenPriceDetails(CA_ETH);
      const tc = (await tk.totalSupply()).div(1e18);
      const sf = tpd[0].div(1e5);
      const C = tpd[1];
      const Curr3DaysAvg = tpd[2];
      const mcrtp = (await mcr.calVtpAndMCRtp())[1];
      const mcrtpSquare = mcrtp.times(mcrtp).div(1e8);
      const mcrEth = (await pd.getLastMCREther()).div(1e18);
      const tp = sf.plus(
        mcrEth
          .div(C)
          .times(mcrtpSquare)
          .times(mcrtpSquare)
      );
      tp_eth = tp.times(Curr3DaysAvg.div(100));
      tp_dai = tp.times((await pd.getCAAvgRate(CA_DAI)).div(100));
    });
    it('11.7 should return correct Token price in ETH', async function() {
      tp_eth
        .toFixed(4)
        .should.be.bignumber.equal(
          (await mcr.calculateTokenPrice(CA_ETH)).div(1e18).toFixed(4)
        );
    });
    it('11.8 should return correct Token price in DAI', async function() {
      tp_dai
        .toFixed(4)
        .should.be.bignumber.equal(
          (await mcr.calculateTokenPrice(CA_DAI)).div(1e18).toFixed(4)
        );
    });
  });

  describe('Misc', function() {
    it('11.15 should not be able to change master address', async function() {
      await assertRevert(
        mcr.changeMasterAddress(mcr.address, { from: notOwner })
      );
    });
    it('11.16 should not be able to add mcr data if not notarise', async function() {
      await assertRevert(
        mcr.addMCRData(
          18000,
          100 * 1e18,
          2 * 1e18,
          ['0x455448', '0x444149'],
          [100, 65407],
          20181011,
          { from: notOwner }
        )
      );
    });
    it('11.17 add mcr when vf > vtp', async function() {
      await mcr.addMCRData(
        18000,
        100 * 1e18,
        35833333333333330000,
        ['0x455448', '0x444149'],
        [100, 65407],
        20181011,
        { from: owner }
      );
    });
    it('11.18 getAllSumAssurance function should skip calcualation for currency with rate 0', async function() {
      await DSV.setRate(0);
      let allSA = await mcr.getAllSumAssurance();
      (await qd.getTotalSumAssured('ETH')).should.be.bignumber.equal(allSA);
    });
    it('11.19 calVtpAndMCRtp function should skip calcualation for currency with rate 0', async function() {
      let vtp = await mcr.calVtpAndMCRtp();
      CABalE = await web3.eth.getBalance(p1.address);
      CABalE2 = await web3.eth.getBalance(p2.address);
      vtp[0].should.be.bignumber.equal(CABalE.plus(CABalE2));
    });
    it('11.20 mcrTp should be 0 if vFull is 0', async function() {
      await mcr.addMCRData(
        18000,
        100 * 1e18,
        0,
        ['0x455448', '0x444149'],
        [100, 65407],
        20181011,
        { from: owner }
      );
      let vtp = await mcr.calVtpAndMCRtp();

      (vtp[1] / 1).should.be.equal(0);
    });
    it('11.21 mcr if vtp is 0', async function() {
      await tf.upgradeCapitalPool(owner);
      await p1.upgradeInvestmentPool(owner);
      await mcr.addMCRData(
        18000,
        100 * 1e18,
        0,
        ['0x455448', '0x444149'],
        [100, 65407],
        20181011,
        { from: owner }
      );
      let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      let timeINC =
        (await pd.getDateAddOfAPI(APIID)) / 1 +
        (await pd.mcrFailTime()) / 1 +
        100;
      await increaseTimeTo(timeINC);
      await p1.__callback(APIID, '');
    });
    it('11.21 rebalancing trade if total risk balance is 0', async function() {
      await p1.sendTransaction({ from: owner, value: 2 * 1e18 });

      await p2.saveIADetails(
        ['0x455448', '0x444149'],
        [100, 15517],
        20190103,
        true
      );
    });
    it('11.21 if mcr fails and retry after new mcr posted', async function() {
      await tf.upgradeCapitalPool(owner);
      await p1.upgradeInvestmentPool(owner);
      await mcr.addMCRData(
        18000,
        100 * 1e18,
        0,
        ['0x455448', '0x444149'],
        [100, 65407],
        20181012,
        { from: owner }
      );
      let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      await mcr.addMCRData(
        18000,
        100 * 1e18,
        100 * 1e18,
        ['0x455448', '0x444149'],
        [100, 65407],
        20181013,
        { from: owner }
      );
      await p1.__callback(APIID, ''); // to cover else branch (if call comes before callback time)
      let timeINC =
        (await pd.getDateAddOfAPI(APIID)) / 1 +
        (await pd.mcrFailTime()) / 1 +
        100;
      await increaseTimeTo(timeINC);
      await p1.__callback(APIID, '');
    });

    it('11.22 get orcalise call details', async function() {
      let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
      let curr = await pd.getCurrOfApiId(APIID);
      let id = await pd.getApiCallIndex(1);
      let dateUPD = await pd.getDateUpdOfAPI(APIID);
      let details = await pd.getApiCallDetails(APIID);
    });
  });
});
