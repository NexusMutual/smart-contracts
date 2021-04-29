const { web3 } = require('hardhat');
const { assert } = require('chai');
const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { getTokenSpotPrice, calculateMCRRatio } = require('../utils').tokenPrice;
const { accounts } = require('../utils');

const { BN } = web3.utils;
const { nonMembers: [fundSource] } = accounts;

const UNKNOWN_ASSET = '0x0000000000000000000000000000000000000001';

describe('getTokenPrice', function () {

  it('calculates token price correctly in ETH', async function () {
    const { pool, poolData } = this;
    const ETH = await pool.ETH();

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, Date.now());
    await pool.sendTransaction({ from: fundSource, value: initialAssetValue });

    const expectedPrice = getTokenSpotPrice(initialAssetValue, mcrEth);
    const price = await pool.getTokenPrice(ETH);
    assert.equal(price.toString(), expectedPrice.toFixed());
  });

  it('calculates token price correctly in DAI', async function () {
    const { pool, poolData, chainlinkDAI, dai } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');
    const ethToDaiRate = new BN((394.59 * 1e18).toString());
    const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, Date.now());
    await pool.sendTransaction({ from: fundSource, value: initialAssetValue });

    await chainlinkDAI.setLatestAnswer(daiToEthRate);

    const expectedEthPrice = getTokenSpotPrice(initialAssetValue, mcrEth);
    const expectedPrice = new BN(expectedEthPrice.toFixed()).mul(ether('1')).div(daiToEthRate);
    const price = await pool.getTokenPrice(dai.address);
    assert.equal(price.toString(), expectedPrice.toString());
  });

  it('reverts if asset is unknown', async function () {
    const { pool, poolData, chainlinkDAI, dai } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');
    const ethToDaiRate = new BN((394.59 * 1e18).toString());
    const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, Date.now());
    await pool.sendTransaction({ from: fundSource, value: initialAssetValue });

    await chainlinkDAI.setLatestAnswer(daiToEthRate);

    await expectRevert(
      pool.getTokenPrice(UNKNOWN_ASSET),
      'PriceFeedOracle: Unknown asset',
    );
  });
});
