const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { assert } = require('chai');
const { getTokenSpotPrice } = require('../utils').tokenPrice;
const { BN } = web3.utils;

describe('calculateTokenSpotPrice', function () {
  it('calculates token spot price correctly', async function () {
    const { pool } = this;

    const mcrEth = ether('162424');
    const totalAssetValue = ether('200000');

    const expectedPrice = getTokenSpotPrice(totalAssetValue, mcrEth);
    const price = await pool.calculateTokenSpotPrice(totalAssetValue, mcrEth);
    assert(
      new BN(expectedPrice.toString()).sub(price).lte(new BN(1)),
      `expectedPrice ${expectedPrice.toFixed()} - price ${price.toString()} > 1 wei`,
    );
  });

  it('calculates token spot price correctly for totalAssetValue = 0', async function () {
    const { pool } = this;

    const mcrEth = ether('162424');
    const totalAssetValue = ether('0');

    const expectedPrice = getTokenSpotPrice(totalAssetValue, mcrEth);
    const price = await pool.calculateTokenSpotPrice(totalAssetValue, mcrEth);
    assert.equal(price.toString(), expectedPrice.toFixed());
  });

  it('should revert when mcrEth = 0', async function () {
    const { pool } = this;
    const mcrEth = ether('0');
    const totalAssetValue = ether('200000');

    await expectRevert.unspecified(pool.calculateTokenSpotPrice(totalAssetValue, mcrEth));
  });
});
