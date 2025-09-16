const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

describe('setAssetDetails', function () {
  it('reverts if the caller is not Governor contract', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;

    await expect(pool.setAssetDetails(0, true, false)).to.be.revertedWithCustomError(pool, 'Unauthorized');
  });

  it('reverts if asset does not exist', async function () {
    const fixture = await loadFixture(setup);
    const { pool, governor } = fixture;

    await expect(pool.connect(governor).setAssetDetails(3, true, false)).to.be.revertedWithCustomError(
      pool,
      'InvalidAssetId',
    );
  });

  it('sets asset details', async function () {
    const fixture = await loadFixture(setup);
    const { pool, governor } = fixture;

    const assetDetailsBefore = await pool.assets(0);
    await pool.connect(governor).setAssetDetails(0, false, true);
    const assetDetailsAfter = await pool.assets(0);

    expect(assetDetailsBefore.isCoverAsset).not.to.be.equal(assetDetailsAfter.isCoverAsset);
    expect(assetDetailsBefore.isAbandoned).not.to.be.equal(assetDetailsAfter.isAbandoned);
    expect(assetDetailsAfter.isAbandoned).to.be.equal(true);
    expect(assetDetailsAfter.isCoverAsset).to.be.equal(false);
  });
});
