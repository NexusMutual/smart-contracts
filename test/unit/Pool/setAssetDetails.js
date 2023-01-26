const { expect } = require('chai');

describe('setAssetDetails', function () {
  it('reverts when not called by goverance', async function () {
    const { pool } = this;
    await expect(pool.setAssetDetails(0, false, false)).to.be.revertedWith('Caller is not authorized to govern');
  });

  it('reverts when asset does not exist', async function () {
    const { pool } = this;
    const [governance] = this.accounts.governanceContracts;

    const assets = await pool.getAssets();
    const nextAssetId = assets.length;

    await expect(
      pool.connect(governance).setAssetDetails(nextAssetId, false, false), // assetId out of bounds
    ).to.be.revertedWith('Pool: Asset does not exist');
  });

  it('marks asset as cover asset, or abandoned', async function () {
    const [governance] = this.accounts.governanceContracts;
    const pool = this.pool.connect(governance);

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
