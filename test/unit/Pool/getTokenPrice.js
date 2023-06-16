const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { getTokenSpotPrice } = require('../utils').tokenPrice;
const { PoolAsset } = require('../utils').constants;
const { setEtherBalance } = require('../utils').evm;

const { BigNumber } = ethers;
const { parseEther } = ethers.utils;

describe('getTokenPrice', function () {
  let fixture;
  beforeEach(async function () {
    fixture = await loadFixture(setup);
  });

  it('calculates token price correctly in ETH', async function () {
    const { pool, mcr } = fixture;

    const initialAssetValue = BigNumber.from('210959924071154460525457');
    const mcrEth = BigNumber.from('162424730681679380000000');

    await mcr.setMCR(mcrEth);
    await setEtherBalance(pool.address, initialAssetValue);

    const expectedPrice = getTokenSpotPrice(initialAssetValue, mcrEth);
    const price = await pool.getTokenPriceInAsset(PoolAsset.ETH);
    expect(price).to.equal(expectedPrice.toString());
  });

  it('calculates token price correctly in DAI', async function () {
    const { pool, chainlinkDAI, mcr } = fixture;

    const initialAssetValue = BigNumber.from('210959924071154460525457');
    const mcrEth = BigNumber.from('162424730681679380000000');
    const ethToDaiRate = parseEther('394.59');
    const daiToEthRate = BigNumber.from(10).pow(36).div(ethToDaiRate);

    await mcr.setMCR(mcrEth);
    await setEtherBalance(pool.address, initialAssetValue);

    await chainlinkDAI.setLatestAnswer(daiToEthRate);

    const expectedEthPrice = getTokenSpotPrice(initialAssetValue, mcrEth);
    const expectedPrice = BigNumber.from(expectedEthPrice.toFixed()).mul(parseEther('1')).div(daiToEthRate);
    const price = await pool.getTokenPriceInAsset(PoolAsset.DAI);
    expect(price).to.equal(expectedPrice);
  });

  it('reverts if asset is unknown', async function () {
    const { pool, mcr, chainlinkDAI } = fixture;

    const initialAssetValue = BigNumber.from('210959924071154460525457');
    const mcrEth = BigNumber.from('162424730681679380000000');
    const ethToDaiRate = parseEther('394.59');
    const daiToEthRate = BigNumber.from(10).pow(36).div(ethToDaiRate);

    await mcr.setMCR(mcrEth);
    await setEtherBalance(pool.address, initialAssetValue);

    await chainlinkDAI.setLatestAnswer(daiToEthRate);

    await expect(pool.getTokenPriceInAsset(PoolAsset.unknown)).to.be.revertedWith('Pool: Unknown cover asset');
  });
});
