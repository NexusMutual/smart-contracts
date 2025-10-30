const { nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { ETH } = nexus.constants.Assets;

const setup = require('./setup');

describe('getAssets', function () {
  it('retrieves the assets', async function () {
    const fixture = await loadFixture(setup);
    const { pool, usdc, cbBTC } = fixture;

    const assets = await pool.getAssets();
    const [ethAsset, usdcAsset, cbBTCAsset] = assets;

    expect(assets.length).to.equal(3);

    expect(ethAsset.assetAddress).to.equal(ETH);
    expect(ethAsset.isCoverAsset).to.equal(true);
    expect(ethAsset.isAbandoned).to.equal(false);

    expect(usdcAsset.assetAddress).to.equal(usdc.target);
    expect(usdcAsset.isCoverAsset).to.equal(true);
    expect(usdcAsset.isAbandoned).to.equal(false);

    expect(cbBTCAsset.assetAddress).to.equal(cbBTC.target);
    expect(cbBTCAsset.isCoverAsset).to.equal(true);
    expect(cbBTCAsset.isAbandoned).to.equal(false);
  });
});
