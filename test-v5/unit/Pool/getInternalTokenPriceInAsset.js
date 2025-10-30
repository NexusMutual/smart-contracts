const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { PoolAsset } = require('../utils').constants;

const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { WeiPerEther } = ethers.constants;

describe('getInternalTokenPriceInAsset', function () {
  it('calculates token price correctly in ETH', async function () {
    const fixture = await loadFixture(setup);
    const { pool, ramm } = fixture;
    const expectedPrice = await ramm.getInternalPrice();
    const price = await pool.getInternalTokenPriceInAsset(PoolAsset.ETH);
    expect(price).to.equal(expectedPrice.toString());
  });

  it('calculates token price correctly in DAI', async function () {
    const fixture = await loadFixture(setup);
    const { pool, chainlinkDAI, ramm } = fixture;

    const ethToDaiRate = parseEther('394.59');
    const daiToEthRate = BigNumber.from(10).pow(36).div(ethToDaiRate);
    await chainlinkDAI.setLatestAnswer(daiToEthRate);

    const expectedEthPrice = await ramm.getInternalPrice();
    const expectedPrice = BigNumber.from(expectedEthPrice).mul(WeiPerEther).div(daiToEthRate);
    const price = await pool.getInternalTokenPriceInAsset(PoolAsset.DAI);
    expect(price).to.equal(expectedPrice);
  });

  it('reverts if asset is unknown', async function () {
    const fixture = await loadFixture(setup);
    const { pool, chainlinkDAI } = fixture;

    const ethToDaiRate = parseEther('394.59');
    const daiToEthRate = BigNumber.from(10).pow(36).div(ethToDaiRate);
    await chainlinkDAI.setLatestAnswer(daiToEthRate);

    const inexistentAsset = 2 ** 16;
    await expect(pool.getInternalTokenPriceInAsset(inexistentAsset)).to.be.revertedWith('Pool: Unknown cover asset');
  });
});
