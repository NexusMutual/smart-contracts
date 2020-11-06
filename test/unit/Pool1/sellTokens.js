const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { assert } = require('chai');
const { BN } = web3.utils;
const Decimal = require('decimal.js');
const { accounts } = require('../utils');
const { setupContractState } = require('./utils');

const {
  nonMembers: [fundSource],
  members: [memberOne],
} = accounts;

const sellSpread = 0.025 * 10000;

async function assertSellValues(
  { initialAssetValue, mcrEth, maxPercentage, daiRate, ethRate, poolBalanceStep, mcr, maxRelativeError,
    pool1, token, buyValue, poolData, tokenData, tokenController, isLessThanExpectedEthOut }
) {
  let { a, c, tokenExponent, totalAssetValue, mcrPercentage } = await setupContractState(
    { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, token, buyValue, poolData, tokenData }
  );

  let highestRelativeError = 0;
  while (mcrPercentage < maxPercentage * 100) {
    console.log({ totalAssetValue: totalAssetValue.toString(), mcrPercentage: mcrPercentage.toString() });

    const pool1Balance = await web3.eth.getBalance(pool1.address);

    const preEstimatedTokenBuyValue = await mcr.getTokenBuyValue(pool1Balance, buyValue);

    const preBuyBalance = await token.balanceOf(memberOne);

    await pool1.buyTokens(preEstimatedTokenBuyValue, {
      from: memberOne,
      value: buyValue
    });
    const postBuyBalance = await token.balanceOf(memberOne);
    const tokensReceived = postBuyBalance.sub(preBuyBalance);

    const minEthOut = buyValue.mul(new BN(10000 - (sellSpread + 10))).div(new BN(10000));

    const precomputedEthValue = await mcr.getTokenSellValue(tokensReceived);
    console.log({ precomputedEthValue: precomputedEthValue.toString(),
      postBuyBalance: postBuyBalance.toString(),
      tokensReceived: tokensReceived.toString(),
      minEthOut: minEthOut.toString()
    });

    await token.approve(tokenController.address, tokensReceived, {
      from: memberOne
    });
    const balancePreSell = await web3.eth.getBalance(memberOne);
    const sellTx = await pool1.sellTokens(tokensReceived, precomputedEthValue, {
      from: memberOne
    });

    const { gasPrice } = await web3.eth.getTransaction(sellTx.receipt.transactionHash);
    const ethSpentOnGas = Decimal(sellTx.receipt.gasUsed).mul(Decimal(gasPrice));
    console.log({ gasSpentOnTx: ethSpentOnGas.toString() });

    const balancePostSell = await web3.eth.getBalance(memberOne);
    const sellEthReceived = Decimal(balancePostSell).sub(Decimal(balancePreSell)).add(ethSpentOnGas);

    const expectedEthOut = Decimal(buyValue.toString()).mul(10000 - sellSpread).div(10000);

    const relativeError = expectedEthOut.sub(sellEthReceived).abs().div(expectedEthOut);
    highestRelativeError = Math.max(relativeError.toNumber(), highestRelativeError);
    console.log({ relativeError: relativeError.toString() });
    if (isLessThanExpectedEthOut) {
      assert(sellEthReceived.lt(expectedEthOut), `${sellEthReceived.toFixed()} is greater than ${expectedEthOut.toFixed()}`);
    }
    assert(
      relativeError.lt(maxRelativeError),
      `Resulting eth value ${sellEthReceived.toFixed()} is not close enough to expected ${expectedEthOut.toFixed()}
       Relative error: ${relativeError}`
    );

    await pool1.sendTransaction({
      from: fundSource,
      value: poolBalanceStep
    });

    ({ totalAssetValue, mcrPercentage } = await mcr.calVtpAndMCRtp());
  }

  console.log({ highestRelativeError: highestRelativeError.toString() });
}

describe('sellTokens', function () {

  const daiRate = new BN('39459');
  const ethRate = new BN('100');
  const maxPercentage = 400;

  it('reverts on sales that decrease the MCR% below 100%', async function () {
    const { pool1, poolData, token, tokenData, mcr } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    await setupContractState(
      { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, poolData, tokenData }
    );

    const tokenAmountToSell = ether('1000');
    await token.mint(memberOne, tokenAmountToSell);

    await expectRevert(
      pool1.sellTokens(tokenAmountToSell, '0', { from: memberOne }),
      `MCR% cannot fall below 100%`
    );
  });

  it('reverts on sales worth more than 5% of MCReth', async function () {
    const { pool1, poolData, token, tokenData, mcr } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    await setupContractState(
      { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, token, poolData, tokenData }
    );

    const buyValue = mcrEth.div(new BN(20));
    for (let i = 0; i < 2; i++) {
      await pool1.buyTokens('1', { from: memberOne, value: buyValue });
    }
    const entireBalance = await token.balanceOf(memberOne);
    await expectRevert(
      pool1.sellTokens(entireBalance, '0', { from: memberOne }),
      `Sales worth more than 5% of MCReth are not allowed`
    );
  });

  it('reverts on sales that exceed member balance', async function () {
    const { pool1, poolData, token, tokenData, mcr } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    await setupContractState(
      { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, token, poolData, tokenData }
    );

    const buyValue = mcrEth.div(new BN(20));
    await pool1.buyTokens('1', { from: memberOne, value: buyValue });

    const entireBalance = await token.balanceOf(memberOne);
    await expectRevert(
      pool1.sellTokens(entireBalance.addn(1), '0', { from: memberOne }),
      `Not enough balance`
    );
  });

  it('burns tokens from member in exchange for 0.01 ETH for mcrEth = 160k', async function () {
    const { pool1, poolData, token, tokenData, mcr, tokenController } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('0.01');
    const poolBalanceStep = ether('20000');
    const maxRelativeError = Decimal(0.0001);

    await assertSellValues({
      initialAssetValue, mcrEth, maxPercentage, buyValue, poolBalanceStep, maxRelativeError,
      mcr, pool1, token, poolData, daiRate, ethRate, tokenData, tokenController
    });
  });

  it('burns tokens from member in exchange for 1 ETH for mcrEth = 160k', async function () {
    const { pool1, poolData, token, tokenData, mcr, tokenController } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('1');
    const poolBalanceStep = ether('20000');
    const maxRelativeError = Decimal(0.0005);

    await assertSellValues({
      initialAssetValue, mcrEth, maxPercentage, buyValue, poolBalanceStep, maxRelativeError,
      mcr, pool1, token, poolData, daiRate, ethRate, tokenData, tokenController
    });
  });

  it('burns tokens from member in exchange for 1k ETH for mcrEth = 160k', async function () {
    const { pool1, poolData, token, tokenData, mcr, tokenController } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('1000');
    const poolBalanceStep = ether('20000');
    const maxRelativeError = Decimal(0.0005);

    await assertSellValues({
      initialAssetValue, mcrEth, maxPercentage, buyValue, poolBalanceStep, maxRelativeError,
      mcr, pool1, token, poolData, daiRate, ethRate, tokenData, tokenController
    });
  });

  it('burns tokens from member in exchange for 5% of mcrEth for mcrEth = 160k', async function () {
    const { pool1, poolData, token, tokenData, mcr, tokenController } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = mcrEth.div(new BN(20));
    const poolBalanceStep = ether('20000');
    const maxRelativeError = Decimal(0.06);

    await assertSellValues({
      initialAssetValue, mcrEth, maxPercentage, buyValue, poolBalanceStep, maxRelativeError, isLessThanExpectedEthOut: true,
      mcr, pool1, token, poolData, daiRate, ethRate, tokenData, tokenController
    });
  });
});

