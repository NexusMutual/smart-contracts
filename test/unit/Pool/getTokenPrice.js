const { ethers } = require('hardhat');
const { expect } = require('chai');
const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { getTokenSpotPrice } = require('../utils').tokenPrice;
const { constants } = require('../utils');
const { PoolAsset } = constants;

describe('getTokenPrice', function () {
  it('calculates token price correctly in ETH', async function () {
    const { pool, mcr } = this;
    const {
      nonMembers: [fundSource],
    } = this.accounts;

    const initialAssetValue = BigNumber.from('210959924071154460525457');
    const mcrEth = BigNumber.from('162424730681679380000000');

    await mcr.setMCR(mcrEth);
    await fundSource.sendTransaction({ to: pool.address, value: initialAssetValue });

    const expectedPrice = getTokenSpotPrice(initialAssetValue, mcrEth);
    const price = await pool.getTokenPrice(PoolAsset.ETH);
    assert.equal(price.toString(), expectedPrice.toFixed());
  });

  it('calculates token price correctly in DAI', async function () {
    const { pool, chainlinkDAI, mcr } = this;
    const {
      nonMembers: [fundSource],
    } = this.accounts;

    const initialAssetValue = BigNumber.from('210959924071154460525457');
    const mcrEth = BigNumber.from('162424730681679380000000');
    const ethToDaiRate = BigNumber.from((394.59 * 1e18).toString());
    const daiToEthRate = BigNumber.from(10).pow(BigNumber.from(36)).div(ethToDaiRate);

    await mcr.setMCR(mcrEth);
    await fundSource.sendTransaction({ to: pool.address, value: initialAssetValue });

    await chainlinkDAI.setLatestAnswer(daiToEthRate);

    const expectedEthPrice = getTokenSpotPrice(initialAssetValue, mcrEth);
    const expectedPrice = BigNumber.from(expectedEthPrice.toFixed()).mul(parseEther('1')).div(daiToEthRate);
    const price = await pool.getTokenPrice(PoolAsset.DAI);
    expect(price).to.equal(expectedPrice);
  });

  it('reverts if asset is unknown', async function () {
    const { pool, mcr, chainlinkDAI } = this;
    const {
      nonMembers: [fundSource],
    } = this.accounts;

    const initialAssetValue = BigNumber.from('210959924071154460525457');
    const mcrEth = BigNumber.from('162424730681679380000000');
    const ethToDaiRate = BigNumber.from((394.59 * 1e18).toString());
    const daiToEthRate = BigNumber.from(10).pow(BigNumber.from(36)).div(ethToDaiRate);

    await mcr.setMCR(mcrEth);
    await fundSource.sendTransaction({ to: pool.address, value: initialAssetValue });

    await chainlinkDAI.setLatestAnswer(daiToEthRate);

    await expect(pool.getTokenPrice(PoolAsset.unknown)).to.be.revertedWith('Pool: Unknown cover asset');
  });
});
