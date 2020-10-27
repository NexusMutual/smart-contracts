const { ether, expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');
const { hex } = require('../utils').helpers;
const { calculatePurchasedTokensWithFullIntegral, calculatePurchasedTokens } = require('../utils').tokenPrice;
const { BN } = web3.utils;


describe('calculateTokenBuyValue', function () {
  it.only('calculates token  price for a change in total assets correctly', async function () {
    const { mcr, poolData, tokenData } = this;

    const { _a: a, _c: c } = await poolData.getTokenPriceDetails(hex('ETH'));
    const tokenExponent = await tokenData.tokenExponent();

    const mcrEth = new BN('162424730681679380000000');
    const initialAssetValue = new BN('210959924071154460525457');
    const deltaEth = ether('1000');

    const tokenValue = await mcr.calculateTokenBuyValue(
      deltaEth, initialAssetValue, mcrEth
    );

    const { tokens: expectedtokenValue } = calculatePurchasedTokens(
      initialAssetValue, deltaEth, mcrEth, c, a.mul(new BN(1e13.toString())), tokenExponent
    );

    assert.equal(tokenValue.toString(), expectedtokenValue.toString());
  });
});
