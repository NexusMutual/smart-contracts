const { ethers } = require('hardhat');
const { expect } = require('chai');
const { getTokenSpotPrice } = require('../utils').tokenPrice;
const { BigNumber } = ethers;
const { parseEther } = ethers.utils;

describe('calculateTokenSpotPrice', function () {
  it('calculates token spot price correctly', async function () {
    const { pool } = this;

    const mcrEth = parseEther('162424');
    const totalAssetValue = parseEther('200000');

    const expectedPrice = getTokenSpotPrice(totalAssetValue, mcrEth);
    const price = await pool.calculateTokenSpotPrice(totalAssetValue, mcrEth);
    expect(BigNumber.from(expectedPrice.toString()).sub(price).lte(BigNumber.from(1))).to.be.equal(
      true,
      `expectedPrice ${expectedPrice.toFixed()} - price ${price.toString()} > 1 wei`,
    );
  });

  it('calculates token spot price correctly for totalAssetValue = 0', async function () {
    const { pool } = this;

    const mcrEth = parseEther('162424');
    const totalAssetValue = parseEther('0');

    const expectedPrice = getTokenSpotPrice(totalAssetValue, mcrEth);
    const price = await pool.calculateTokenSpotPrice(totalAssetValue, mcrEth);
    expect(price.toString()).to.be.equal(expectedPrice.toString());
  });

  it('should revert when mcrEth = 0', async function () {
    const { pool } = this;
    const mcrEth = parseEther('0');
    const totalAssetValue = parseEther('200000');

    await expect(pool.calculateTokenSpotPrice(totalAssetValue, mcrEth)).to.be.revertedWithPanic();
  });
});
