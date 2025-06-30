const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

describe('getAssets', function () {
  it('reverts if non asset address is passed', async function () {
    const fixture = await loadFixture(setup);
    const { pool, usdc } = fixture;

    const assets = await pool.getAssets();

    expect(assets.length).to.equal(1);
    expect(assets[0].assetAddress).to.equal(usdc.target);
    expect(assets[0].isCoverAsset).to.equal(true);
    expect(assets[0].isAbandoned).to.equal(false);
  });
});
