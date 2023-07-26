const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

describe('setAssetDetails', function () {
  it('reverts when not called by goverance', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    await expect(pool.setAssetDetails(0, false, false)).to.be.revertedWith('Caller is not authorized to govern');
  });

  it('reverts when asset does not exist', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const [governance] = fixture.accounts.governanceContracts;

    const assets = await pool.getAssets();
    const nextAssetId = assets.length;

    await expect(
      pool.connect(governance).setAssetDetails(nextAssetId, false, false), // assetId out of bounds
    ).to.be.revertedWith('Pool: Asset does not exist');
  });

  it('marks asset as cover asset, or abandoned', async function () {
    const fixture = await loadFixture(setup);
    const [governance] = fixture.accounts.governanceContracts;
    const pool = fixture.pool.connect(governance);

    const assets = await pool.getAssets();
    const lastAssetId = assets.length - 1;

    await pool.setAssetDetails(lastAssetId, false, false);
    expect((await pool.getAsset(lastAssetId)).isCoverAsset).to.be.equal(false);
    expect((await pool.getAsset(lastAssetId)).isAbandoned).to.be.equal(false);

    await pool.setAssetDetails(lastAssetId, true, false);
    expect((await pool.getAsset(lastAssetId)).isCoverAsset).to.be.equal(true);
    expect((await pool.getAsset(lastAssetId)).isAbandoned).to.be.equal(false);

    await pool.setAssetDetails(lastAssetId, false, true);
    expect((await pool.getAsset(lastAssetId)).isCoverAsset).to.be.equal(false);
    expect((await pool.getAsset(lastAssetId)).isAbandoned).to.be.equal(true);

    await pool.setAssetDetails(lastAssetId, true, true);
    expect((await pool.getAsset(lastAssetId)).isCoverAsset).to.be.equal(true);
    expect((await pool.getAsset(lastAssetId)).isAbandoned).to.be.equal(true);

    await expect(
      pool.connect(governance).setAssetDetails(lastAssetId + 1, false, false), // assetId out of bounds
    ).to.be.revertedWith('Pool: Asset does not exist');
  });
});
