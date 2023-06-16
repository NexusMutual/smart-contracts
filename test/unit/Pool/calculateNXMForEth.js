const { ethers } = require('hardhat');
const { expect } = require('chai');
const Decimal = require('decimal.js');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { calculateNXMForEthRelativeError, percentageBigNumber } = require('../utils').tokenPrice;
const { DIVISION_BY_ZERO } = require('../utils').errors;
const { BigNumber } = ethers;
const { parseEther } = ethers.utils;

function errorMessage(tokenValue, expectedIdealTokenValue, relativeError) {
  return (
    `Resulting token value ${tokenValue.toString()} ` +
    `is not close enough to expected ${expectedIdealTokenValue.toFixed()} 
    Relative error: ${relativeError}; extra tokens: ${Decimal(tokenValue.toString())
      .sub(expectedIdealTokenValue)
      .toString()}`
  );
}

const maxRelativeError = Decimal(0.0006);

describe('calculateNXMForEth', function () {
  let fixture;
  beforeEach(async function () {
    fixture = await loadFixture(setup);
  });

  it('reverts when mcrEth = 0', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther('0');
    const totalAssetValue = BigNumber.from('160000');
    const buyValue = percentageBigNumber(mcrEth, 5);

    await expect(pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth)).to.be.revertedWithPanic(DIVISION_BY_ZERO);
  });

  it('reverts when purchase value > 5% * mcrEth', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther('160000');
    const totalAssetValue = mcrEth;
    const buyValue = percentageBigNumber(mcrEth, 6);

    await expect(pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth)).to.be.revertedWith(
      'Pool: Purchases worth higher than 5% of MCReth are not allowed',
    );
  });

  it('calculates at mcrEth = 7k, MCR% = 0%, buyValue = 5% * mcrEth', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther('7000');
    const totalAssetValue = BigNumber.from('0');
    const buyValue = percentageBigNumber(mcrEth, 5);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(
      totalAssetValue,
      buyValue,
      mcrEth,
      tokenValue,
    );
    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage(tokenValue, expectedIdealTokenValue, relativeError),
    );
  });

  it('calculates at mcrEth = 7k, MCR% = 400%, buyValue = 5% * mcrEth', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther('7000');
    const totalAssetValue = percentageBigNumber(mcrEth, 400);
    const buyValue = percentageBigNumber(mcrEth, 5);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(
      totalAssetValue,
      buyValue,
      mcrEth,
      tokenValue,
    );
    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage(tokenValue, expectedIdealTokenValue, relativeError),
    );
  });

  it('calculates at mcrEth = 160k, MCR% = 150%, buyValue = 0.00001', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther('160000');
    const totalAssetValue = percentageBigNumber(mcrEth, 150);
    const buyValue = parseEther('0.00001');

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(
      totalAssetValue,
      buyValue,
      mcrEth,
      tokenValue,
    );
    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage(tokenValue, expectedIdealTokenValue, relativeError),
    );
  });

  it('calculates at mcrEth = 160k, MCR% = 0%, buyValue = 5% * mcrEth', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther('160000');
    const totalAssetValue = BigNumber.from(0);
    const buyValue = percentageBigNumber(mcrEth, 5);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(
      totalAssetValue,
      buyValue,
      mcrEth,
      tokenValue,
    );
    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage(tokenValue, expectedIdealTokenValue, relativeError),
    );
  });

  it('calculates at mcrEth = 160k, MCR% = 100%, buyValue = 5% * mcrEth', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther('160000');
    const totalAssetValue = percentageBigNumber(mcrEth, 100);
    const buyValue = percentageBigNumber(mcrEth, 5);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(
      totalAssetValue,
      buyValue,
      mcrEth,
      tokenValue,
    );
    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage(tokenValue, expectedIdealTokenValue, relativeError),
    );
  });

  it('calculates at mcrEth = 160k, MCR% = 150%, buyValue = 5% * mcrEth', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther('160000');
    const totalAssetValue = percentageBigNumber(mcrEth, 150);
    const buyValue = percentageBigNumber(mcrEth, 5);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(
      totalAssetValue,
      buyValue,
      mcrEth,
      tokenValue,
    );
    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage(tokenValue, expectedIdealTokenValue, relativeError),
    );
  });

  it('calculates at mcrEth = 160k, MCR% = 400%, buyValue = 5% * mcrEth', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther('160000');
    const totalAssetValue = percentageBigNumber(mcrEth, 400);
    const buyValue = percentageBigNumber(mcrEth, 5);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(
      totalAssetValue,
      buyValue,
      mcrEth,
      tokenValue,
    );
    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage(tokenValue, expectedIdealTokenValue, relativeError),
    );
  });

  it('calculates at mcrEth = 1e9, MCR% = 400%, buyValue = 0.001', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther((1e9).toString());
    const totalAssetValue = percentageBigNumber(mcrEth, 400);
    const buyValue = parseEther('0.001');
    // NOTE: relative error increase for low buyValue at extremely high mcrEth and MCR%
    const maxRelativeError = Decimal(0.0025);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(
      totalAssetValue,
      buyValue,
      mcrEth,
      tokenValue,
    );
    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage(tokenValue, expectedIdealTokenValue, relativeError),
    );
  });

  it('calculates at mcrEth = 1e9, MCR% = 400%, buyValue = 5% * mcrEth', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther((1e9).toString());
    const totalAssetValue = percentageBigNumber(mcrEth, 400);
    const buyValue = percentageBigNumber(mcrEth, 5);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(
      totalAssetValue,
      buyValue,
      mcrEth,
      tokenValue,
    );
    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage(tokenValue, expectedIdealTokenValue, relativeError),
    );
  });

  it('calculates at mcrEth = 1e9, MCR% = 15%, buyValue = 5% * mcrEth', async function () {
    const { pool } = fixture;

    // In the interval 0-75% MCR% for large mcrEth (100 million ETH here) tokens are sold cheaper than they should be
    // and the relative error goes as large as 3.7% (error increases with mcrEth here) which peaks around
    // the 10-35% MCR% percentage mark and decreases as you approach 100% MCR%.
    // This is considered safe because no arbitrage is possible in this interval, since no sells are allowed below 100%.

    const mcrEth = parseEther((1e9).toString());
    const totalAssetValue = percentageBigNumber(mcrEth, 10);
    const buyValue = percentageBigNumber(mcrEth, 5);
    const maxRelativeError = Decimal(0.038);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);

    const { relativeError, expectedIdealTokenValue } = calculateNXMForEthRelativeError(
      totalAssetValue,
      buyValue,
      mcrEth,
      tokenValue,
    );
    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage(tokenValue, expectedIdealTokenValue, relativeError),
    );
  });
});
