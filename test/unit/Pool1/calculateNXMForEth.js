const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { assert } = require('chai');
const { hex } = require('../utils').helpers;
const Decimal = require('decimal.js');
const { calculateNXMForEthRelativeError, percentageBN } = require('../utils').tokenPrice;
const { BN } = web3.utils;

function errorMessage (tokenValue, expectedIdealTokenValue, relativeError) {
  return `Resulting token value ${tokenValue.toString()} is not close enough to expected ${expectedIdealTokenValue.toFixed()} 
    Relative error: ${relativeError}; extra tokens: ${Decimal(tokenValue.toString()).sub(expectedIdealTokenValue).toString()}`;
}

const maxRelativeError = Decimal(0.0006);

describe.only('calculateNXMForEth', function () {

  it('reverts when mcrEth = 0', async function () {
    const { pool1 } = this;

    const mcrEth = ether('0');
    const totalAssetValue = new BN('160000');
    const buyValue = percentageBN(mcrEth, 5);

    await expectRevert.unspecified(pool1.calculateNXMForEth(
      buyValue, totalAssetValue, mcrEth,
    ));
  });

  it('calculates NXM for ETH at at mcrEth = 7k, MCR% = 0%, buyValue = 5% * mcrEth', async function () {
    const { pool1 } = this;

    const mcrEth = ether('7000');
    const totalAssetValue = new BN('0');
    const buyValue = percentageBN(mcrEth, 5);

    const tokenValue = await pool1.calculateNXMForEth(
      buyValue, totalAssetValue, mcrEth,
    );

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokenValue);
    assert(relativeError.lt(maxRelativeError), errorMessage(tokenValue, expectedIdealTokenValue, relativeError));
  });

  it('calculates NXM for ETH at at mcrEth = 7k, MCR% = 400%, buyValue = 5% * mcrEth', async function () {
    const { pool1 } = this;

    const mcrEth = ether('7000');
    const totalAssetValue = percentageBN(mcrEth, 400);
    const buyValue = percentageBN(mcrEth, 5);

    const tokenValue = await pool1.calculateNXMForEth(
      buyValue, totalAssetValue, mcrEth,
    );

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokenValue);
    assert(relativeError.lt(maxRelativeError), errorMessage(tokenValue, expectedIdealTokenValue, relativeError));
  });

  it('calculates NXM for ETH at mcrEth = 160k, MCR% = 150%, buyValue = 0.00001', async function () {
    const { pool1 } = this;

    const mcrEth = ether('160000');
    const totalAssetValue = percentageBN(mcrEth, 150);
    const buyValue = ether('0.00001');

    const tokenValue = await pool1.calculateNXMForEth(
      buyValue, totalAssetValue, mcrEth,
    );

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokenValue);
    assert(relativeError.lt(maxRelativeError), errorMessage(tokenValue, expectedIdealTokenValue, relativeError));
  });

  it('calculates NXM for ETH at mcrEth = 160k, MCR% = 0%, buyValue = 5% * mcrEth', async function () {
    const { pool1 } = this;

    const mcrEth = ether('160000');
    const totalAssetValue = new BN(0);
    const buyValue = percentageBN(mcrEth, 5);

    const tokenValue = await pool1.calculateNXMForEth(
      buyValue, totalAssetValue, mcrEth,
    );

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokenValue);
    assert(relativeError.lt(maxRelativeError), errorMessage(tokenValue, expectedIdealTokenValue, relativeError));
  });

  it('calculates NXM for ETH at mcrEth = 160k, MCR% = 100%, buyValue = 5% * mcrEth', async function () {
    const { pool1 } = this;

    const mcrEth = ether('160000');
    const totalAssetValue = percentageBN(mcrEth, 100);
    const buyValue = percentageBN(mcrEth, 5);

    const tokenValue = await pool1.calculateNXMForEth(
      buyValue, totalAssetValue, mcrEth,
    );

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokenValue);
    assert(relativeError.lt(maxRelativeError), errorMessage(tokenValue, expectedIdealTokenValue, relativeError));
  });

  it('calculates NXM for ETH at mcrEth = 160k, MCR% = 150%, buyValue = 5% * mcrEth', async function () {
    const { pool1 } = this;

    const mcrEth = ether('160000');
    const totalAssetValue = percentageBN(mcrEth, 150);
    const buyValue = percentageBN(mcrEth, 5);

    const tokenValue = await pool1.calculateNXMForEth(
      buyValue, totalAssetValue, mcrEth,
    );

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokenValue);
    assert(relativeError.lt(maxRelativeError), errorMessage(tokenValue, expectedIdealTokenValue, relativeError));
  });

  it('calculates NXM for ETH at mcrEth = 160k, MCR% = 400%, buyValue = 5% * mcrEth', async function () {
    const { pool1 } = this;

    const mcrEth = ether('160000');
    const totalAssetValue = percentageBN(mcrEth, 400);
    const buyValue = percentageBN(mcrEth, 5);

    const tokenValue = await pool1.calculateNXMForEth(
      buyValue, totalAssetValue, mcrEth,
    );

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokenValue);
    assert(relativeError.lt(maxRelativeError), errorMessage(tokenValue, expectedIdealTokenValue, relativeError));
  });

  it('calculates NXM for ETH at mcrEth = 1e9, MCR% = 400%, buyValue = 0.001', async function () {
    const { pool1 } = this;

    const mcrEth = ether(1e9.toString());
    const totalAssetValue = percentageBN(mcrEth, 400);
    const buyValue = ether('0.001');
    // NOTE: relative error increase for low buyValue at extremely high mcrEth and MCR%
    const maxRelativeError = Decimal(0.0025);

    const tokenValue = await pool1.calculateNXMForEth(
      buyValue, totalAssetValue, mcrEth,
    );

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokenValue);
    assert(relativeError.lt(maxRelativeError), errorMessage(tokenValue, expectedIdealTokenValue, relativeError));
  });

  it('calculates NXM for ETH at mcrEth = 1e9, MCR% = 400%, buyValue = 5% * mcrEth', async function () {
    const { pool1 } = this;

    const mcrEth = ether(1e9.toString());
    const totalAssetValue = percentageBN(mcrEth, 400);
    const buyValue = percentageBN(mcrEth, 5);

    const tokenValue = await pool1.calculateNXMForEth(
      buyValue, totalAssetValue, mcrEth,
    );

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokenValue);
    assert(relativeError.lt(maxRelativeError), errorMessage(tokenValue, expectedIdealTokenValue, relativeError));
  });

  it('calculates NXM for ETH at mcrEth = 1e9, MCR% = 15%, buyValue = 5% * mcrEth', async function () {
    const { pool1 } = this;

    /*
    In the interval 0-75% MCR% for large mcrEth (100 million ETH here) tokens are sold cheaper than they should be
    and the relative error goes as large as 3.7% (error increases with mcrEth here) which peaks around the 10-35% MCR% percentage mark.
    and decreases as you approach 100% MCR%.
    This is considered safe, because no arbitrage is possible in this interval, since no sells are allowed below 100%.
    */

    const mcrEth = ether(1e9.toString());
    const totalAssetValue = percentageBN(mcrEth, 10);
    const buyValue = percentageBN(mcrEth, 5);
    const maxRelativeError = Decimal(0.038);

    const tokenValue = await pool1.calculateNXMForEth(
      buyValue, totalAssetValue, mcrEth,
    );

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokenValue);
    assert(relativeError.lt(maxRelativeError), errorMessage(tokenValue, expectedIdealTokenValue, relativeError));
  });
});
