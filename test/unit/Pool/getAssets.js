const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

describe('getAssets', function () {
  it('reverts if non asset address is passed', async function () {
    const fixture = await loadFixture(setup);
    const { pool, usdc } = fixture;

    const assets = await pool.getAssets();

    expect(assets.length).to.equal(3);
    expect(assets[1].assetAddress).to.equal(usdc.target);
    expect(assets[1].isCoverAsset).to.equal(true);
    expect(assets[1].isAbandoned).to.equal(false);
  });
});
