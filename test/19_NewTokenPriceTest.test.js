const MCR = artifacts.require('MCR');
const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolData');
const DAI = artifacts.require('MockDAI');
const NXMToken = artifacts.require('NXMToken');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const TokenController = artifacts.require('TokenController');
const TokenFunctions = artifacts.require('TokenFunctionMock');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');

const CA_ETH = '0x45544800';
const CA_DAI = '0x44414900';
const UNLIMITED_ALLOWANCE = 4500 * 1e18;

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
    nxms = await NXMaster.deployed();
    tf = await TokenFunctions.deployed();
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    tc = await TokenController.at(await nxms.getLatestAddress('TC'));
  });

  describe('Token Price Calculation', function() {
    let tp_eth;
    let tp_dai;

    before(async function() {
      await mr.addMembersBeforeLaunch([], []);
      (await mr.launched()).should.be.equal(true);
      await mr.payJoiningFee(notOwner, {
        from: notOwner,
        value: 2000000000000000
      });
      await p1.upgradeInvestmentPool(owner);
      await tf.upgradeCapitalPool(owner);
      await p1.sendTransaction({ from: owner, value: 90000000000000000000 });
      await mr.kycVerdict(notOwner, true);
      await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: owner });
      await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: notOwner });
      await mcr.addMCRData(
        9000,
        100 * 1e18,
        90000000000000000000,
        ['0x455448', '0x444149'],
        [100, 15517],
        20190219
      );

      // await pd.changeC(5203349);
      // await pd.changeA(1948);
      console.log(await pd.c());
      console.log(await pd.a());
    });
    it('19.1 single tranche 0.1ETH', async function() {
      let dataaa = await pd.getTokenPriceDetails('ETH');
      let x = await tk.balanceOf(notOwner);
      let expectedNXM = await p1.getToken(100000000000000000);
      await p1.buyToken({ from: notOwner, value: 100000000000000000 });
      let y = await tk.balanceOf(notOwner);
      console.log('single tranche 0.1ETH ==> ', parseFloat(y - x) / 1e18);
      ((y - x) / 1e18).toFixed(2).should.be.bignumber.equal(5.13);
    });
    it('19.2 multiple tranches 100ETH', async function() {
      let x = await tk.balanceOf(notOwner);
      await p1.buyToken({
        from: notOwner,
        value: 100000000000000000000
      });
      let y = await tk.balanceOf(notOwner);
      console.log('multiple tranches 100ETH ==> ', parseFloat(y - x) / 1e18);
      ((y - x) / 1e18).toFixed(2).should.be.bignumber.equal(5114.54);
    });
  });

  describe('Token Price Calculation2', function() {
    let tp_eth;
    let tp_dai;

    before(async function() {
      await p1.upgradeInvestmentPool(owner);
      await tf.upgradeCapitalPool(owner);
      await p1.sendTransaction({ from: owner, value: 10 * 1e18 });
      await mcr.addMCRData(
        1000,
        100 * 1e18,
        10 * 1e18,
        ['0x455448', '0x444149'],
        [100, 14800],
        20190219
      );

      console.log(await pd.c());
      console.log(await pd.a());
    });
    it('19.3 single tranches 15 times Buy tokens', async function() {
      let x;
      let y;
      let cost = 10 * 1e18;
      for (let i = 0; cost < 180 * 1e18; i++) {
        cost = cost + i * 10 * 1e18;
        console.log(
          'token rate 1ETH =  ',
          1e18 / parseFloat(await mcr.calculateTokenPrice('ETH'))
        );
        x = await tk.balanceOf(notOwner);
        await p1.buyToken({ from: notOwner, value: cost });
        y = await tk.balanceOf(notOwner);
        console.log(
          'tranche ',
          cost / 1e18,
          ' ETH ==> ',
          parseFloat(y - x) / 1e18
        );
      }
    });
    it('19.4 tranches Buy more tokens', async function() {
      await p1.upgradeInvestmentPool(owner);
      await tf.upgradeCapitalPool(owner);
      await p1.sendTransaction({ from: owner, value: 607740647349100000000 });
      await mcr.addMCRData(
        202,
        30000 * 1e18,
        607740647349100000000,
        ['0x455448', '0x444149'],
        [100, 15517],
        20190219
      );
      let x;
      let y;
      let cost = 15 * 1e18;
      console.log(
        'token rate 1ETH =  ',
        1e18 / parseFloat(await mcr.calculateTokenPrice('ETH'))
      );
      x = await tk.balanceOf(notOwner);
      await p1.buyToken({ from: notOwner, value: cost });
      y = await tk.balanceOf(notOwner);
      console.log(
        'tranche ',
        cost / 1e18,
        ' ETH ==> ',
        parseFloat(y - x) / 1e18
      );

      cost = 35 * 1e18;
      console.log(
        'token rate 1ETH =  ',
        1e18 / parseFloat(await mcr.calculateTokenPrice('ETH'))
      );
      x = await tk.balanceOf(notOwner);
      await p1.buyToken({ from: notOwner, value: cost });
      y = await tk.balanceOf(notOwner);
      console.log(
        'tranche ',
        cost / 1e18,
        ' ETH ==> ',
        parseFloat(y - x) / 1e18
      );

      cost = 600 * 1e18;
      console.log(
        'token rate 1ETH =  ',
        1e18 / parseFloat(await mcr.calculateTokenPrice('ETH'))
      );
      x = await tk.balanceOf(notOwner);
      await p1.buyToken({ from: notOwner, value: cost });
      y = await tk.balanceOf(notOwner);
      console.log(
        'tranche ',
        cost / 1e18,
        ' ETH ==> ',
        parseFloat(y - x) / 1e18
      );

      cost = 5000 * 1e18;
      console.log(
        'token rate 1ETH =  ',
        1e18 / parseFloat(await mcr.calculateTokenPrice('ETH'))
      );
    });
    it('19.5 Should revert while buying or 0  ETH', async function() {
      await assertRevert(p1.buyToken({ value: 0 }));
    });
  });

  describe('Token Selling', function() {
    it('19.6 Max sellable token will 0 if mcr percentage is less than 100', async function() {
      parseFloat(await mcr.getMaxSellTokens()).should.be.equal(0);
    });
    it('19.7 sell more than 1000 NXMs', async function() {
      let poolBal = await mcr.calVtpAndMCRtp();
      await mcr.addMCRData(
        20000,
        100 * 1e18,
        poolBal[0],
        ['0x455448', '0x444149'],
        [100, 15517],
        20190219
      );
      let initialBalNXM = await tk.balanceOf(owner);
      await p1.sellNXMTokens(1500 * 1e18);
      let finalBalNXM = await tk.balanceOf(owner);

      (finalBalNXM / 1).should.be.equal(initialBalNXM / 1 - 1500 * 1e18);
    });
    it('19.6 Max sellable token will 0 if pool balance is less than 1.5 times of basemin', async function() {
      await tf.upgradeCapitalPool(owner);
      parseFloat(await mcr.getMaxSellTokens()).should.be.equal(0);
    });
  });
});
