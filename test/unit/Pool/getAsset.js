const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

describe('getAsset', function () {
  it('reverts when not with invalid asset id', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;

    await expect(pool.getAsset(1)).to.be.revertedWithCustomError(pool, 'InvalidAssetId');
  });

  it('returns asset details', async function () {
    const fixture = await loadFixture(setup);
    const { pool, usdc } = fixture;

    const asset = await pool.getAsset(0);
    expect(asset.assetAddress).to.be.equal(usdc.target);
  });
});
