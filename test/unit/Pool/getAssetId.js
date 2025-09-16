const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { ethers } = require('hardhat');

describe('getAssetId', function () {
  it('reverts if non asset address is passed', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const token = await ethers.deployContract('ERC20Mock');

    await expect(pool.getAssetId(token)).to.be.revertedWithCustomError(pool, 'AssetNotFound');
  });

  it('returns correct value for non eth asset', async function () {
    const fixture = await loadFixture(setup);
    const { usdc, pool } = fixture;

    const id = await pool.getAssetId(usdc);
    expect(id).to.be.equal(1);
  });
});
