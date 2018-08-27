const NXMToken1 = artifacts.require('NXMToken1');
const NXMTokenData = artifacts.require('NXMTokenData');
const Pool1 = artifacts.require('Pool1');
const MCR = artifacts.require('MCR');
const owner = web3.eth.accounts[0];
const member = web3.eth.accounts[1];
const receiver = web3.eth.accounts[2];
const ETH = '0x455448';

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

let nxmtk1;
let P1;
let m1;
let td;

describe('Contract: Pool1', function() {
  this.timeout(0);
  const P_18 = new BigNumber(1e18);
  const tokenAmount = new BigNumber(1e19);
  const sellTokens = new BigNumber(1.6);
  before(function() {
    NXMToken1.deployed()
      .then(function(instance) {
        nxmtk1 = instance;
        return Pool1.deployed();
      })
      .then(function(instance) {
        P1 = instance;
        return MCR.deployed();
      })
      .then(function(instance) {
        m1 = instance;
        return NXMTokenData.deployed();
      })
      .then(function(instance) {
        td = instance;
      });
  });
  it('should able to buy tokens', async function() {
    const initialTokenBalance = (await nxmtk1.totalBalanceOf(member)).div(P_18);
    const initialPoolBalance = (await P1.getEtherPoolBalance()).div(P_18);
    const initialTotalSupply = (await td.totalSupply()).div(P_18);
    await P1.buyTokenBegin({ from: member, value: tokenAmount });
    const tokenPrice = await m1.calculateTokenPrice(ETH);
    const tokens = tokenAmount.div(tokenPrice); //in decimals
    const newTokenBalance = initialTokenBalance.plus(tokens).toFixed(1);
    const newPoolBalance = initialPoolBalance
      .plus(tokenAmount.div(P_18))
      .toFixed(1);
    const newTotalSupply = initialTotalSupply.plus(tokens).toFixed(1);
    newPoolBalance.should.be.bignumber.equal(
      (await P1.getEtherPoolBalance()).div(P_18).toFixed(1)
    );
    newTokenBalance.should.be.bignumber.equal(
      (await nxmtk1.totalBalanceOf(member)).div(P_18).toFixed(1)
    );
    newTotalSupply.should.equal((await td.totalSupply()).div(P_18).toFixed(1));
  });

  it('should able to sell tokens', async function() {
    const initialTokenBalance = (await nxmtk1.totalBalanceOf(member)).div(P_18);
    const sellPrice = (await m1.calculateTokenPrice(ETH)).times(
      new BigNumber(0.975)
    );
    const initialPoolBalance = (await P1.getEtherPoolBalance()).div(P_18);
    const initialTotalSupply = (await td.totalSupply()).div(P_18);
    const initialMemberETHBalance = (await web3.eth.getBalance(member)).div(
      P_18
    );
    await P1.sellNXMTokens(sellTokens.times(P_18), { from: member });
    const sellTokensWorth = sellPrice.div(P_18).times(sellTokens);
    const newPoolBalance = initialPoolBalance.minus(sellTokensWorth).toFixed(1);
    const newTokenBalance = initialTokenBalance.minus(sellTokens).toFixed(1);
    const newTotalSupply = initialTotalSupply.minus(sellTokens).toFixed(1);
    const newMemberETHBalance = initialMemberETHBalance
      .plus(sellTokensWorth)
      .toFixed(0);
    newTokenBalance.should.be.bignumber.equal(
      (await nxmtk1.totalBalanceOf(member)).div(P_18).toFixed(1)
    );
    newTotalSupply.should.equal((await td.totalSupply()).div(P_18).toFixed(1));
    newMemberETHBalance.should.be.bignumber.equal(
      (await web3.eth.getBalance(member)).div(P_18).toFixed(0)
    );
    newPoolBalance.should.be.bignumber.equal(
      (await P1.getEtherPoolBalance()).div(P_18).toFixed(1)
    );
  });
});
