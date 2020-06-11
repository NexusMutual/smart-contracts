const MCR = artifacts.require('MCR');
const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolDataMock');
const DAI = artifacts.require('MockDAI');
const NXMToken = artifacts.require('NXMToken');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMasterMock');
const TokenController = artifacts.require('TokenController');
const TokenFunctions = artifacts.require('TokenFunctionMock');

const {assertRevert} = require('./utils/assertRevert');
const {advanceBlock} = require('./utils/advanceToBlock');
const {ether, toHex, toWei} = require('./utils/ethTools');
const getValue = require('./utils/getMCRPerThreshold.js').getValue;

const CA_ETH = '0x45544800';
const CA_DAI = '0x44414900';
const UNLIMITED_ALLOWANCE = toWei(4500);

let mcr;
let pd;
let tk;
let p1;
let balance_DAI;
let balance_ETH;
let nxms;
let mr;
let cad;
let p2;
let tc;
let tf;
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
    p2 = await Pool2.deployed();
    p1 = await Pool1.deployed();
    pd = await PoolData.deployed();
    cad = await DAI.deployed();
    nxms = await NXMaster.at(await pd.ms());
    tf = await TokenFunctions.deployed();
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    tc = await TokenController.at(await nxms.getLatestAddress(toHex('TC')));
  });

  describe('Token Price Calculation', function() {
    let tp_eth;
    let tp_dai;

    before(async function() {
      await mr.addMembersBeforeLaunch([], []);
      (await mr.launched()).should.be.equal(true);
      await mr.payJoiningFee(notOwner, {
        from: notOwner,
        value: toWei(0.002)
      });
      await p1.upgradeInvestmentPool(DAI.address);
      await tf.upgradeCapitalPool(DAI.address);
      await p1.sendEther({from: owner, value: toWei(5500)});
      await mr.kycVerdict(notOwner, true);
      await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: owner});
      await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: notOwner});
      await mcr.addMCRData(
        9000,
        toWei(100),
        toWei(90),
        ['0x455448', '0x444149'],
        [100, 15517],
        20190219
      );
      await tf.transferCurrencyAsset(toHex('ETH'), owner, toWei(5500 - 90));
    });
    it('19.1 single tranche 0.1ETH', async function() {
      let dataaa = await pd.getTokenPriceDetails(toHex('ETH'));
      let x = await tk.balanceOf(notOwner);
      let expectedNXM = await p1.getToken(toWei(0.1));
      await p1.buyToken({from: notOwner, value: toWei(0.1)});
      let y = await tk.balanceOf(notOwner);
      console.log('single tranche 0.1ETH ==> ', parseFloat(y - x) / toWei(1));
      ((y - x) / toWei(1))
        .toFixed(2)
        .toString()
        .should.be.equal((5.13).toString());
    });
    it('19.2 multiple tranches 100ETH', async function() {
      let x = await tk.balanceOf(notOwner);
      await p1.buyToken({
        from: notOwner,
        value: toWei(100)
      });
      let y = await tk.balanceOf(notOwner);
      console.log(
        'multiple tranches 100ETH ==> ',
        parseFloat(y - x) / toWei(1)
      );
      ((y - x) / toWei(1))
        .toFixed(2)
        .toString()
        .should.be.equal((5114.54).toString());
    });
  });

  describe('Token Price Calculation2', function() {
    let tp_eth;
    let tp_dai;

    before(async function() {
      await p1.upgradeInvestmentPool(DAI.address);
      await tf.upgradeCapitalPool(DAI.address);
      await p1.sendEther({from: owner, value: toWei(10)});
      await mcr.addMCRData(
        1000,
        toWei(100),
        toWei(10),
        ['0x455448', '0x444149'],
        [100, 14800],
        20190219
      );
    });
    it('19.3 single tranches 15 times Buy tokens', async function() {
      let x;
      let y;
      let cost = toWei(10);
      for (let i = 0; cost < toWei(180); i++) {
        cost = cost / 1 + (i / 1) * toWei(10);
        console.log(
          'token rate 1ETH =  ',
          toWei(1) / parseFloat(await mcr.calculateTokenPrice(toHex('ETH')))
        );
        x = await tk.balanceOf(notOwner);
        await p1.buyToken({from: notOwner, value: cost});
        y = await tk.balanceOf(notOwner);
        console.log(
          'tranche ',
          cost / toWei(1),
          ' ETH ==> ',
          parseFloat(y - x) / toWei(1)
        );
      }
    });
    it('19.4 tranches Buy more tokens', async function() {
      await p1.upgradeInvestmentPool(DAI.address);
      await tf.upgradeCapitalPool(DAI.address);
      await p1.sendEther({from: owner, value: toWei(607.7406473491)});
      await mcr.addMCRData(
        202,
        toWei(30000),
        toWei(607.7406473491),
        ['0x455448', '0x444149'],
        [100, 15517],
        20190219
      );
      let x;
      let y;
      let cost = toWei(15);
      console.log(
        'token rate 1ETH =  ',
        toWei(1) / parseFloat(await mcr.calculateTokenPrice(toHex('ETH')))
      );
      x = await tk.balanceOf(notOwner);
      await p1.buyToken({from: notOwner, value: cost});
      y = await tk.balanceOf(notOwner);
      console.log(
        'tranche ',
        cost / toWei(1),
        ' ETH ==> ',
        parseFloat(y - x) / toWei(1)
      );

      cost = toWei(35);
      console.log(
        'token rate 1ETH =  ',
        toWei(1) / parseFloat(await mcr.calculateTokenPrice(toHex('ETH')))
      );
      x = await tk.balanceOf(notOwner);
      await p1.buyToken({from: notOwner, value: cost});
      y = await tk.balanceOf(notOwner);
      console.log(
        'tranche ',
        cost / toWei(1),
        ' ETH ==> ',
        parseFloat(y - x) / toWei(1)
      );

      cost = toWei(600);
      console.log(
        'token rate 1ETH =  ',
        toWei(1) / parseFloat(await mcr.calculateTokenPrice(toHex('ETH')))
      );
      x = await tk.balanceOf(notOwner);
      await p1.buyToken({from: notOwner, value: cost});
      y = await tk.balanceOf(notOwner);
      console.log(
        'tranche ',
        cost / toWei(1),
        ' ETH ==> ',
        parseFloat(y - x) / toWei(1)
      );

      cost = toWei(5000);
      console.log(
        'token rate 1ETH =  ',
        toWei(1) / parseFloat(await mcr.calculateTokenPrice(toHex('ETH')))
      );
    });
    it('19.5 Should revert while buying or 0  ETH', async function() {
      await assertRevert(p1.buyToken({value: 0}));
    });
  });

  describe('Token Selling', function() {
    it('19.6 Max sellable token will 0 if mcr percentage is less than 100', async function() {
      parseFloat(await mcr.getMaxSellTokens()).should.be.equal(0);
    });
    it('19.7 sell more than 1000 NXMs', async function() {
      await p1.sendEther({from: owner, value: toWei(11000)});
      let poolBal = await mcr.calVtpAndMCRtp();
      await mcr.addMCRData(
        20000,
        toWei(100),
        poolBal[0],
        ['0x455448', '0x444149'],
        [100, 15517],
        20190219
      );
      await tf.transferCurrencyAsset(toHex('ETH'), owner, toWei(11000));
      let initialBalNXM = await tk.balanceOf(owner);
      await p1.sellNXMTokens(toWei(1500));
      let finalBalNXM = await tk.balanceOf(owner);

      (finalBalNXM / 1).should.be.equal(initialBalNXM / 1 - toWei(1500));
    });
    it('19.6 Max sellable token will 0 if pool balance is less than 1.5 times of basemin', async function() {
      await tf.upgradeCapitalPool(DAI.address);
      parseFloat(await mcr.getMaxSellTokens()).should.be.equal(0);
    });
  });
});
