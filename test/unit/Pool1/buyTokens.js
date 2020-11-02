const { ether, expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');
const { hex } = require('../utils').helpers;
const { calculatePurchasedTokensWithFullIntegral, calculatePurchasedTokens } = require('../utils').tokenPrice;
const { BN } = web3.utils;
const Decimal = require('decimal.js');
const { accounts } = require('../utils');
const { setupContractState } = require('./utils');

const {
  nonMembers: [fundSource],
  members: [memberOne],
} = accounts;

const maxRelativeError = Decimal(0.0006);

async function assertBuyValues(
  { initialAssetValue, mcrEth, maxPercentage, daiRate, ethRate, poolBalanceStep, mcr, pool1, token, buyValue, poolData, tokenData }
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

    const tx = await pool1.buyTokens(preEstimatedTokenBuyValue, {
      from: memberOne,
      value: buyValue
    });
    const postBuyBalance = await token.balanceOf(memberOne);
    const tokensReceived = postBuyBalance.sub(preBuyBalance);

    const { tokens: expectedIdealTokenValue } = calculatePurchasedTokensWithFullIntegral(
      totalAssetValue, buyValue, mcrEth, c, a.mul(new BN(1e13.toString())), tokenExponent
    );

    const { tokens: expectedTokenValue } = calculatePurchasedTokens(
      totalAssetValue, buyValue, mcrEth, c, a.mul(new BN(1e13.toString())), tokenExponent
    );
    assert.equal(tokensReceived.toString(), expectedTokenValue.toString());

    const tokensReceivedDecimal = Decimal(tokensReceived.toString());
    const relativeError = expectedIdealTokenValue.sub(tokensReceivedDecimal).abs().div(expectedIdealTokenValue);
    highestRelativeError = Math.max(relativeError.toNumber(), highestRelativeError);
    console.log({ relativeError: relativeError.toString() });
    assert(
      relativeError.lt(maxRelativeError),
      `Resulting token value ${tokensReceivedDecimal.toFixed()} is not close enough to expected ${expectedIdealTokenValue.toFixed()}
       Relative error: ${relativeError}`
    );

    if (buyValue.lt(poolBalanceStep)) {
      const extraStepValue = poolBalanceStep.sub(buyValue);
      await pool1.sendTransaction({
        from: fundSource,
        value: extraStepValue
      });
    }

    ({ totalAssetValue, mcrPercentage } = await mcr.calVtpAndMCRtp());
  }

  console.log({ highestRelativeError: highestRelativeError.toString() });
}

describe.only('buyTokens', function () {

  const daiRate = new BN('39459');
  const ethRate = new BN('100');
  const maxPercentage = 400;

  it('reverts on purchase higher than of 5% ETH of mcrEth', async function () {
    const { pool1, poolData, token, tokenData, mcr } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = mcrEth.div(new BN(20)).add(ether('1000'));
    await setupContractState(
      { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, token, buyValue, poolData, tokenData }
    );

    await expectRevert(
      pool1.buyTokens('1', { from: memberOne, value: buyValue }),
      `Purchases worth higher than 5% of MCReth are not allowed`
    );
  });

  it('reverts on purchase where the bought tokens are below min expected out token amount', async function () {
    const { pool1, poolData, token, tokenData, mcr } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('1000');
    await setupContractState(
      { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, token, buyValue, poolData, tokenData }
    );

    const pool1Balance = await web3.eth.getBalance(pool1.address);
    const preEstimatedTokenBuyValue = await mcr.getTokenBuyValue(pool1Balance, buyValue);
    await expectRevert(
      pool1.buyTokens(preEstimatedTokenBuyValue.add(new BN(1)), { from: memberOne, value: buyValue }),
      `boughtTokens is less than minTokensBought`
    );
  });

  it.only('reverts on purchase if current MCR% exceeds 400%', async function () {
    const { pool1, poolData, token, tokenData, mcr } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth.mul(new BN(4)).add(new BN(1e20.toString()));
    const buyValue = mcrEth.div(new BN(20)).add(ether('1000'));

    await setupContractState(
      { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, token, buyValue, poolData, tokenData }
    );

    await expectRevert(
      pool1.buyTokens('1', { from: memberOne, value: buyValue }),
      `Cannot purchase if MCR% > 400%`
    );
  });

  it('mints bought tokens to member in exchange of 100 ETH for mcrEth = 16k', async function () {
    const { pool1, poolData, token, tokenData, mcr } = this;

    const mcrEth = ether('16000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('100');
    const poolBalanceStep = ether('1000');

    await assertBuyValues({
      initialAssetValue, mcrEth, maxPercentage, buyValue, poolBalanceStep,
      mcr, pool1, token, poolData, daiRate, ethRate, tokenData
    });
  });

  it('mints bought tokens to member in exchange of 0.01 ETH for mcrEth = 160k', async function () {
    const { pool1, poolData, token, tokenData, mcr } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('0.01');
    const poolBalanceStep = ether('10000');

    await assertBuyValues({
      initialAssetValue, mcrEth, maxPercentage, buyValue, poolBalanceStep,
      mcr, pool1, token, poolData, daiRate, ethRate, tokenData
    });
  });


  it('mints bought tokens to member in exchange of 1000 ETH for mcrEth = 160k', async function () {
    const { pool1, poolData, token, tokenData, mcr } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('1000');
    const poolBalanceStep = ether('10000');

    await assertBuyValues({
      initialAssetValue, mcrEth, maxPercentage, buyValue, poolBalanceStep,
      mcr, pool1, token, poolData, daiRate, ethRate, tokenData
    });
  });

  it('mints bought tokens to member in exchange of 1000 ETH for mcrEth = 320k', async function () {
    const { pool1, poolData, token, tokenData, mcr } = this;

    const mcrEth = ether('320000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('1000');
    const poolBalanceStep = ether('20000');

    await assertBuyValues({
      initialAssetValue, mcrEth, maxPercentage, buyValue, poolBalanceStep,
      mcr, pool1, token, poolData, daiRate, ethRate, tokenData
    });
  });

  it('mints bought tokens to member in exchange of 5% ETH of mcrEth for mcrEth = 160k', async function () {
    const { pool1, poolData, token, tokenData, mcr } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = mcrEth.div(new BN(20));
    const poolBalanceStep = ether('10000');

    await assertBuyValues({
      initialAssetValue, mcrEth, maxPercentage, buyValue, poolBalanceStep,
      mcr, pool1, token, poolData, daiRate, ethRate, tokenData
    });
  });

  it('mints bought tokens to member in exchange of 5% ETH for mcrEth = 320k', async function () {
    const { pool1, poolData, token, tokenData, mcr } = this;

    const mcrEth = ether('320000');
    const initialAssetValue = mcrEth;
    const buyValue = mcrEth.div(new BN(20));
    const poolBalanceStep = ether('20000');

    await assertBuyValues({
      initialAssetValue, mcrEth, maxPercentage, buyValue, poolBalanceStep,
      mcr, pool1, token, poolData, daiRate, ethRate, tokenData
    });
  });

  it('mints bought tokens to member in exchange of 5% ETH for mcrEth = 1 million', async function () {
    const { pool1, poolData, token, tokenData, mcr } = this;

    const mcrEth = ether('1000000');
    const initialAssetValue = mcrEth;
    const buyValue = mcrEth.div(new BN(20));
    const poolBalanceStep = ether('60000');

    await assertBuyValues({
      initialAssetValue, mcrEth, maxPercentage, buyValue, poolBalanceStep,
      mcr, pool1, token, poolData, daiRate, ethRate, tokenData
    });
  });

  it('mints bought tokens to member in exchange of 5% ETH for mcrEth = 10 million', async function () {
    const { pool1, poolData, token, tokenData, mcr } = this;

    const mcrEth = ether('10000000');
    const initialAssetValue = mcrEth;
    const buyValue = mcrEth.div(new BN(20));
    const poolBalanceStep = ether('60000');

    await assertBuyValues({
      initialAssetValue, mcrEth, maxPercentage, buyValue, poolBalanceStep,
      mcr, pool1, token, poolData, daiRate, ethRate, tokenData
    });
  });
});

