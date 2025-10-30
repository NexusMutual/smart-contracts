const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

describe('getInternalTokenPriceInAsset', function () {
  it('reverts if invalid asset id is passed', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;

    await expect(pool.getInternalTokenPriceInAsset(3)).to.be.revertedWithCustomError(pool, 'InvalidAssetId');
  });

  it('returns correct internal price in asset', async function () {
    const fixture = await loadFixture(setup);
    const { pool, ramm } = fixture;

    const price = await ramm.getInternalPrice();
    const assetAmount = await pool.getInternalTokenPriceInAsset(1);
    expect(price / 10n ** 12n).to.be.equal(assetAmount); // decimal difference between eth and usdc is 12
  });
});
