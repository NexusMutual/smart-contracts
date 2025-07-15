const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

describe('getInternalTokenPriceInAssetAndUpdateTwap', function () {
  it('reverts if invalid asset id is passed', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;

    await expect(pool.getInternalTokenPriceInAssetAndUpdateTwap(1)).to.be.revertedWithCustomError(
      pool,
      'InvalidAssetId',
    );
  });

  it('returns correct internal price in asset', async function () {
    const fixture = await loadFixture(setup);
    const { pool, ramm } = fixture;

    const price = await ramm.getInternalPrice();
    const assetAmount = await pool.getInternalTokenPriceInAssetAndUpdateTwap.staticCall(0);
    await pool.getInternalTokenPriceInAssetAndUpdateTwap(0);
    expect(price / 10n ** 12n).to.be.equal(assetAmount); // decimal difference between eth and usdc is 12
  });
});
