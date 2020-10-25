const { ether, expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');
const { hex } = require('../utils').helpers;
const { calculatePurchasedTokensWithFullIntegral, calculatePurchasedTokens } = require('../utils').tokenPrice;
const { BN } = web3.utils;
const Decimal = require('decimal.js');
const { accounts } = require('../utils');

const {
  nonMembers: [fundSource],
  members: [memberOne],
} = accounts;

const maxRelativeError = Decimal(0.001);

async function assertBuyValues(
  { initialAssetValue, mcrEth, maxPercentage, daiRate, ethRate, mcr, pool1, token, buyValue, poolData, tokenData }
  ) {
  const { _a: a, _c: c } = await poolData.getTokenPriceDetails(hex('ETH'));
  const tokenExponent = await tokenData.tokenExponent();
  const mcrPercentagex100 = initialAssetValue.mul(new BN(10000)).div(mcrEth);

  await pool1.sendTransaction({
    from: fundSource,
    value: initialAssetValue
  });

  await poolData.setAverageRate(hex('ETH'), ethRate);
  await poolData.setAverageRate(hex('DAI'), daiRate);

  const date = new Date().getTime();
  await poolData.setLastMCR(mcrPercentagex100, mcrEth, initialAssetValue, date);

  let { totalAssetValue, mcrPercentage } = await mcr.getTotalAssetValueAndMCRPercentage();
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

    const { tokens: expectedIdealTokenValue } = calculatePurchasedTokensWithFullIntegral(
      totalAssetValue, buyValue, mcrEth, c, a.mul(new BN(1e13.toString())), tokenExponent
    );

    const { tokens: expectedTokenValue }  = calculatePurchasedTokens(
      totalAssetValue, buyValue, mcrEth, c, a.mul(new BN(1e13.toString())), tokenExponent
    );
    assert.equal(tokensReceived.toString(), expectedTokenValue.toString());

    const tokensReceivedDecimal = Decimal(tokensReceived.toString());
    const relativeError = expectedIdealTokenValue.sub(tokensReceivedDecimal).div(expectedIdealTokenValue);
    assert(
      relativeError.lt(maxRelativeError),
      `Resulting token value ${tokensReceivedDecimal.toFixed()} is not close enough to expected ${expectedIdealTokenValue.toFixed()}`
    );

    ({ totalAssetValue, mcrPercentage } = await mcr.getTotalAssetValueAndMCRPercentage());
  }
}

describe('buyTokens', function () {

  const daiRate = new BN('39459');
  const ethRate = new BN('100');
  const maxPercentage = 400;

  it('mints bought tokens to member in exchange of ETH', async function () {
    const { pool1, poolData, token, tokenData, mcr } = this;

    const mcrEth = new BN('162424730681679380000000');
    const initialAssetValue = new BN('210959924071154460525457');
    const buyValue = ether('1000');

    await assertBuyValues(
      { initialAssetValue, mcrEth, maxPercentage, buyValue, mcr, pool1, token, poolData, daiRate, ethRate, tokenData }
      );
  });
});

