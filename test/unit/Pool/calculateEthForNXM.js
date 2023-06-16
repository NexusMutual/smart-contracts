const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

const { toDecimal, calculateEthForNXMRelativeError, percentageBigNumber, calculatePurchasedTokensWithFullIntegral } =
  require('../utils').tokenPrice;
const { DIVISION_BY_ZERO } = require('../utils').errors;

const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const maxRelativeError = toDecimal(0.0006);

function errorMessage({ ethOut, expectedEthOut, relativeError }) {
  return `Resulting eth value ${ethOut.toString()} is not close enough to expected ${expectedEthOut.toFixed()}
       Relative error: ${relativeError}`;
}

describe('calculateEthForNXM', function () {
  let fixture;
  beforeEach(async function () {
    fixture = await loadFixture(setup);
  });

  it('reverts when mcrEth = 0', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther('0');
    const totalAssetValue = parseEther('160000');

    await expect(pool.calculateEthForNXM(parseEther('1'), totalAssetValue, mcrEth)).to.be.revertedWithPanic(
      DIVISION_BY_ZERO,
    );
  });

  it('reverts when sellValue > 5% * mcrEth', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther('160000');
    const totalAssetValue = percentageBigNumber(mcrEth, 200);
    const buyValue = percentageBigNumber(mcrEth, 5);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);

    await expect(
      pool.calculateEthForNXM(tokenValue.mul(BigNumber.from(2)), totalAssetValue, mcrEth),
    ).to.be.revertedWith('Pool: Sales worth more than 5% of MCReth are not allowed');
  });

  it('calculates at mcrEth = 7k, MCR% = 100%, sellValue = 5% * mcrEth', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther('7000');
    const totalAssetValue = mcrEth;
    const buyValue = percentageBigNumber(mcrEth, 5);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue.add(buyValue), mcrEth);
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);
    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage({ ethOut, expectedEthOut, relativeError }),
    );
  });

  it('calculates at mcrEth = 7k, MCR% = 400%, sellValue = 5% * mcrEth', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther('7000');
    const totalAssetValue = percentageBigNumber(mcrEth, 400);
    const buyValue = percentageBigNumber(mcrEth, 5);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue.add(buyValue), mcrEth);
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);

    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage({ ethOut, expectedEthOut, relativeError }),
    );
  });

  it('calculates at mcrEth = 160k, MCR% = 100%, sellValue = 1% * mcrEth', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther('160000');
    const totalAssetValue = percentageBigNumber(mcrEth, 100);
    const buyValue = percentageBigNumber(mcrEth, 1);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue.add(buyValue), mcrEth);
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);

    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage({ ethOut, expectedEthOut, relativeError }),
    );
  });

  it('calculates at mcrEth = 160k, MCR% = 400%, sellValue = 1% * mcrEth', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther('160000');
    const totalAssetValue = percentageBigNumber(mcrEth, 400);
    const buyValue = percentageBigNumber(mcrEth, 1);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue.add(buyValue), mcrEth);
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);

    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage({ ethOut, expectedEthOut, relativeError }),
    );
  });

  it('calculates at mcrEth = 160k, MCR% = 600%, sellValue = 1% * mcrEth', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther('160000');
    const totalAssetValue = percentageBigNumber(mcrEth, 600);
    const buyValue = percentageBigNumber(mcrEth, 1);

    const { tokens: tokenValue } = calculatePurchasedTokensWithFullIntegral(totalAssetValue, buyValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(
      BigNumber.from(tokenValue.toFixed()),
      totalAssetValue.add(buyValue),
      mcrEth,
    );
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);

    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage({ ethOut, expectedEthOut, relativeError }),
    );
  });

  it('calculates at mcrEth = 160k, MCR% = 150%, sellValue = 5% * mcrEth (high spread)', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther('160000');
    const totalAssetValue = percentageBigNumber(mcrEth, 150);
    const buyValue = percentageBigNumber(mcrEth, 5);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue.add(buyValue), mcrEth);
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);

    // spread increases for high purchases
    const maxRelativeError = toDecimal(0.05);
    expect(toDecimal(ethOut.toString()).lte(expectedEthOut)).to.be.equal(
      true,
      `${ethOut.toString()} > ${expectedEthOut.toFixed()}`,
    );

    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage({ ethOut, expectedEthOut, relativeError }),
    );
  });

  it('calculates at mcrEth = 1e9, MCR% = 100%, sellValue = 1% * mcrEth', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther((1e9).toString());
    const totalAssetValue = percentageBigNumber(mcrEth, 400);
    const buyValue = percentageBigNumber(mcrEth, 1);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue.add(buyValue), mcrEth);
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);

    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage({ ethOut, expectedEthOut, relativeError }),
    );
  });

  it('calculates at mcrEth = 1e9, MCR% = 600%, sellValue = 1% * mcrEth', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther((1e9).toString());
    const totalAssetValue = percentageBigNumber(mcrEth, 600);
    const buyValue = percentageBigNumber(mcrEth, 1);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue.add(buyValue), mcrEth);
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);

    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage({ ethOut, expectedEthOut, relativeError }),
    );
  });

  it('calculates at mcrEth = 1e9, MCR% = 150%, sellValue = 5% * mcrEth (high spread)', async function () {
    const { pool } = fixture;

    const mcrEth = parseEther((1e9).toString());
    const totalAssetValue = percentageBigNumber(mcrEth, 150);
    const buyValue = percentageBigNumber(mcrEth, 5);

    const tokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
    const ethOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue.add(buyValue), mcrEth);
    const { expectedEthOut, relativeError } = calculateEthForNXMRelativeError(buyValue, ethOut);

    // spread increases for high purchases
    const maxRelativeError = toDecimal(0.05);
    expect(toDecimal(ethOut.toString()).lte(expectedEthOut)).to.be.equal(
      true,
      `${ethOut.toString()} > ${expectedEthOut.toFixed()}`,
    );

    expect(relativeError.lt(maxRelativeError)).to.be.equal(
      true,
      errorMessage({ ethOut, expectedEthOut, relativeError }),
    );
  });
});
