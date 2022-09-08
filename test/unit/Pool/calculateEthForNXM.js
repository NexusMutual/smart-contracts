const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const Decimal = require('decimal.js');
const { assert } = require('chai');
const { calculateEthForNXMRelativeError, percentageBN, calculatePurchasedTokensWithFullIntegral } =
  require('../utils').tokenPrice;

const { BN } = web3.utils;
const maxRelativeError = Decimal(0.0006);

function errorMessage({ ethOut, expectedEthOut, relativeError }) {
  return `Resulting eth value ${ethOut.toString()} is not close enough to expected ${expectedEthOut.toFixed()}
       Relative error: ${relativeError}`;
}

describe('calculateEthForNXM', function () {
  it('reverts when mcrEth = 0', async function () {
    const { pool } = this;

    const mcrEth = ether('0');
    const totalAssetValue = ether('160000');

    await expectRevert.unspecified(pool.calculateEthForNXM(ether('1'), totalAssetValue, mcrEth));
  });

  it('reverts when sellValue > 5% * mcrEth', async function () {
    const { pool } = this;

    const mcrEth = ether('160000');
    const totalAssetValue = percentageBN(mcrEth, 200);
    const buyValue = percentageBN(mcrEth, 5);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);

    await expectRevert.unspecified(pool.calculateEthForNXM(tokenValue.mul(new BN(2)), totalAssetValue, mcrEth));
  });

  it('calculates at mcrEth = 7k, MCR% = 100%, sellValue = 5% * mcrEth', async function () {
    const { pool } = this;

    const mcrEth = ether('7000');
    const totalAssetValue = mcrEth;
    const buyValue = percentageBN(mcrEth, 5);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue.add(buyValue), mcrEth);
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);

    assert(relativeError.lt(maxRelativeError), errorMessage({ ethOut, expectedEthOut, relativeError }));
  });

  it('calculates at mcrEth = 7k, MCR% = 400%, sellValue = 5% * mcrEth', async function () {
    const { pool } = this;

    const mcrEth = ether('7000');
    const totalAssetValue = percentageBN(mcrEth, 400);
    const buyValue = percentageBN(mcrEth, 5);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue.add(buyValue), mcrEth);
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);

    assert(relativeError.lt(maxRelativeError), errorMessage({ ethOut, expectedEthOut, relativeError }));
  });

  it('calculates at mcrEth = 160k, MCR% = 100%, sellValue = 1% * mcrEth', async function () {
    const { pool } = this;

    const mcrEth = ether('160000');
    const totalAssetValue = percentageBN(mcrEth, 100);
    const buyValue = percentageBN(mcrEth, 1);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue.add(buyValue), mcrEth);
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);

    assert(relativeError.lt(maxRelativeError), errorMessage({ ethOut, expectedEthOut, relativeError }));
  });

  it('calculates at mcrEth = 160k, MCR% = 400%, sellValue = 1% * mcrEth', async function () {
    const { pool } = this;

    const mcrEth = ether('160000');
    const totalAssetValue = percentageBN(mcrEth, 400);
    const buyValue = percentageBN(mcrEth, 1);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue.add(buyValue), mcrEth);
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);

    assert(relativeError.lt(maxRelativeError), errorMessage({ ethOut, expectedEthOut, relativeError }));
  });

  it('calculates at mcrEth = 160k, MCR% = 600%, sellValue = 1% * mcrEth', async function () {
    const { pool } = this;

    const mcrEth = ether('160000');
    const totalAssetValue = percentageBN(mcrEth, 600);
    const buyValue = percentageBN(mcrEth, 1);

    const { tokens: tokenValue } = calculatePurchasedTokensWithFullIntegral(totalAssetValue, buyValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(new BN(tokenValue.toFixed()), totalAssetValue.add(buyValue), mcrEth);
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);

    assert(relativeError.lt(maxRelativeError), errorMessage({ ethOut, expectedEthOut, relativeError }));
  });

  it('calculates at mcrEth = 160k, MCR% = 150%, sellValue = 5% * mcrEth (high spread)', async function () {
    const { pool } = this;

    const mcrEth = ether('160000');
    const totalAssetValue = percentageBN(mcrEth, 150);
    const buyValue = percentageBN(mcrEth, 5);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue.add(buyValue), mcrEth);
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);

    // spread increases for high purchases
    const maxRelativeError = Decimal(0.05);
    assert(Decimal(ethOut.toString()).lte(expectedEthOut), `${ethOut.toString()} > ${expectedEthOut.toFixed()}`);

    assert(relativeError.lt(maxRelativeError), errorMessage({ ethOut, expectedEthOut, relativeError }));
  });

  it('calculates at mcrEth = 1e9, MCR% = 100%, sellValue = 1% * mcrEth', async function () {
    const { pool } = this;

    const mcrEth = ether((1e9).toString());
    const totalAssetValue = percentageBN(mcrEth, 400);
    const buyValue = percentageBN(mcrEth, 1);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue.add(buyValue), mcrEth);
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);

    assert(relativeError.lt(maxRelativeError), errorMessage({ ethOut, expectedEthOut, relativeError }));
  });

  it('calculates at mcrEth = 1e9, MCR% = 600%, sellValue = 1% * mcrEth', async function () {
    const { pool } = this;

    const mcrEth = ether((1e9).toString());
    const totalAssetValue = percentageBN(mcrEth, 600);
    const buyValue = percentageBN(mcrEth, 1);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue.add(buyValue), mcrEth);
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);

    assert(relativeError.lt(maxRelativeError), errorMessage({ ethOut, expectedEthOut, relativeError }));
  });

  it('calculates at mcrEth = 1e9, MCR% = 150%, sellValue = 5% * mcrEth (high spread)', async function () {
    const { pool } = this;

    const mcrEth = ether((1e9).toString());
    const totalAssetValue = percentageBN(mcrEth, 150);
    const buyValue = percentageBN(mcrEth, 5);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue.add(buyValue), mcrEth);
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);

    // spread increases for high purchases
    const maxRelativeError = Decimal(0.05);
    assert(Decimal(ethOut.toString()).lte(expectedEthOut), `${ethOut.toString()} > ${expectedEthOut.toFixed()}`);

    assert(relativeError.lt(maxRelativeError), errorMessage({ ethOut, expectedEthOut, relativeError }));
  });
});
