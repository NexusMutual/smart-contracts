const { ether } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { assert } = require('chai');
const { hex } = require('../utils').helpers;
const Decimal = require('decimal.js');
const { calculatePurchasedTokens, calculatePurchasedTokensWithFullIntegral, calculateNXMForEthRelativeError } = require('../utils').tokenPrice;
const { BN } = web3.utils;

function errorMessage (tokenValue, expectedIdealTokenValue, relativeError) {
  return `Resulting token value ${tokenValue.toString()} is not close enough to expected ${expectedIdealTokenValue.toFixed()} 
    Relative error: ${relativeError}`;
}

describe('calculateNXMForEth', function () {
  it('calculates token value received for an increment in total assets correctly', async function () {
    const { pool1, poolData, tokenData } = this;

    const { _a: a, _c: c } = await poolData.getTokenPriceDetails(hex('ETH'));
    const tokenExponent = await tokenData.tokenExponent();

    const mcrEth = new BN('162424730681679380000000');
    const initialAssetValue = new BN('210959924071154460525457');
    const deltaEth = ether('1000');

    const tokenValue = await pool1.calculateNXMForEth(
      deltaEth, initialAssetValue, mcrEth,
    );

    const { tokens: expectedtokenValue } = calculatePurchasedTokens(
      initialAssetValue, deltaEth, mcrEth
    );

    assert.equal(tokenValue.toString(), expectedtokenValue.toString());
  });

  it('calculates NXM for ETH at totalAssetValue = 0', async function () {
    const { pool1, poolData, tokenData } = this;

    const { _a: a, _c: c } = await poolData.getTokenPriceDetails(hex('ETH'));
    const tokenExponent = await tokenData.tokenExponent();

    const mcrEth = new BN('162424730681679380000000');
    const initialAssetValue = new BN('0');
    const deltaEth = ether('1000');

    const tokenValue = await pool1.calculateNXMForEth(
      deltaEth, initialAssetValue, mcrEth,
    );

    const { tokens: expectedtokenValue } = calculatePurchasedTokens(
      initialAssetValue.add(new BN(1)), deltaEth, mcrEth, c, a.mul(new BN(1e13.toString())), tokenExponent,
    );

    assert.equal(tokenValue.toString(), expectedtokenValue.toString());
  });

  it.only('calculates NXM for ETH at mcrEth = 160k, MCR% = 200%, buyValue = 0.0001', async function () {
    const { pool1 } = this;

    const mcrEth = ether('160000');
    const totalAssetValue = mcrEth.mul(new BN(2));
    const buyValue = ether('0.0001');
    const maxRelativeError = Decimal(0.0006);

    const tokenValue = await pool1.calculateNXMForEth(
      buyValue, totalAssetValue, mcrEth,
    );

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokenValue);
    assert(relativeError.lt(maxRelativeError), errorMessage(tokenValue, expectedIdealTokenValue, relativeError));
  });
});
