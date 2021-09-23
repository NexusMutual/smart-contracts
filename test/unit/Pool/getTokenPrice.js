const { web3 } = require('hardhat');
const { assert } = require('chai');
const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { getTokenSpotPrice, calculateMCRRatio } = require('../utils').tokenPrice;
const { accounts, constants } = require('../utils');
const { PoolAsset } = constants;

const { BN } = web3.utils;
const {
  nonMembers: [fundSource],
} = accounts;

describe('getTokenPrice', function () {
  it('calculates token price correctly in ETH', async function () {
    const { pool, mcr } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');

    await mcr.setMCR(mcrEth);
    await pool.sendTransaction({ from: fundSource, value: initialAssetValue });

    const expectedPrice = getTokenSpotPrice(initialAssetValue, mcrEth);
    const price = await pool.getTokenPrice(PoolAsset.ETH);
    assert.equal(price.toString(), expectedPrice.toFixed());
  });

  it('calculates token price correctly in DAI', async function () {
    const { pool, chainlinkDAI, dai, mcr } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');
    const ethToDaiRate = new BN((394.59 * 1e18).toString());
    const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);

    await mcr.setMCR(mcrEth);
    await pool.sendTransaction({ from: fundSource, value: initialAssetValue });

    await chainlinkDAI.setLatestAnswer(daiToEthRate);

    const expectedEthPrice = getTokenSpotPrice(initialAssetValue, mcrEth);
    const expectedPrice = new BN(expectedEthPrice.toFixed()).mul(ether('1')).div(daiToEthRate);
    const price = await pool.getTokenPrice(PoolAsset.DAI);
    assert.equal(price.toString(), expectedPrice.toString());
  });

  it('reverts if asset is unknown', async function () {
    const { pool, mcr, chainlinkDAI, dai } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');
    const ethToDaiRate = new BN((394.59 * 1e18).toString());
    const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);

    await mcr.setMCR(mcrEth);
    await pool.sendTransaction({ from: fundSource, value: initialAssetValue });

    await chainlinkDAI.setLatestAnswer(daiToEthRate);

    await expectRevert(pool.getTokenPrice(PoolAsset.unknown), 'Pool: Unknown asset');
  });
});
