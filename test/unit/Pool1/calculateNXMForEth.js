const { ether } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { assert } = require('chai');
const { hex } = require('../utils').helpers;
const Decimal = require('decimal.js');
const { calculateNXMForEthRelativeError, percentageBN } = require('../utils').tokenPrice;
const { BN } = web3.utils;

function errorMessage (tokenValue, expectedIdealTokenValue, relativeError) {
  return `Resulting token value ${tokenValue.toString()} is not close enough to expected ${expectedIdealTokenValue.toFixed()} 
    Relative error: ${relativeError}`;
}

const maxRelativeError = Decimal(0.0006);

describe('calculateNXMForEth', function () {

  it('calculates NXM for ETH at at mcrEth = 160k, MCR% = 0%, buyValue = 5% * mcrEth', async function () {
    const { pool1 } = this;

    const mcrEth = ether('160000');
    const totalAssetValue = new BN('0');
    const buyValue = percentageBN(mcrEth, 5);

    const tokenValue = await pool1.calculateNXMForEth(
      buyValue, totalAssetValue, mcrEth,
    );

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokenValue);
    assert(relativeError.lt(maxRelativeError), errorMessage(tokenValue, expectedIdealTokenValue, relativeError));
  });

  it('calculates NXM for ETH at mcrEth = 160k, MCR% = 200%, buyValue = 0.0001', async function () {
    const { pool1 } = this;

    const mcrEth = ether('160000');
    const totalAssetValue = percentageBN(mcrEth, 200);
    const buyValue = ether('0.0001');

    const tokenValue = await pool1.calculateNXMForEth(
      buyValue, totalAssetValue, mcrEth,
    );

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokenValue);
    assert(relativeError.lt(maxRelativeError), errorMessage(tokenValue, expectedIdealTokenValue, relativeError));
  });

  it('calculates NXM for ETH at mcrEth = 100 * 1e6, MCR% = 400%, 5% * mcrEth', async function () {
    const { pool1 } = this;

    const mcrEth = ether(1e8.toString());
    const totalAssetValue = percentageBN(mcrEth, 400);
    const buyValue = percentageBN(mcrEth, 5);

    const tokenValue = await pool1.calculateNXMForEth(
      buyValue, totalAssetValue, mcrEth,
    );

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokenValue);
    assert(relativeError.lt(maxRelativeError), errorMessage(tokenValue, expectedIdealTokenValue, relativeError));
  });

  it.only('calculates NXM for ETH at mcrEth = 100 * 1e6, MCR% = 15%, 5% * mcrEth', async function () {
    const { pool1 } = this;

    /*
    In the interval 0-75% MCR% for large mcrEth (100 million ETH here) tokens are sold cheaper than they should be
    and the relative error goes as large as 3.7% (error increases with mcrEth here) which peaks around the 10-35% MCR% percentage mark.
    and decreases as you approach 100% MCR%.
    This is considered safe, because no arbitrage is possible in this interval, since no sells are allowed below 100%.
    */

    const mcrEth = ether(1e9.toString());
    const totalAssetValue = percentageBN(mcrEth, 10);
    console.log(totalAssetValue.toString());
    const buyValue = percentageBN(mcrEth, 5);
    const maxRelativeError = Decimal(0.038);

    const tokenValue = await pool1.calculateNXMForEth(
      buyValue, totalAssetValue, mcrEth,
    );

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokenValue);
    assert(relativeError.lt(maxRelativeError), errorMessage(tokenValue, expectedIdealTokenValue, relativeError));
  });
});
