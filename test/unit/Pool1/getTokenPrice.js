const { web3 } = require('hardhat');
const { assert } = require('chai');
const { ether } = require('@openzeppelin/test-helpers');
const { getTokenSpotPrice, calculateMCRRatio } = require('../utils').tokenPrice;
const { accounts } = require('../utils');

const { BN } = web3.utils;
const { nonMembers: [fundSource] } = accounts;

describe('getTokenPrice', function () {

  it('calculates token price correctly in ETH', async function () {
    const { pool1, poolData } = this;
    const ETH = await pool1.ETH();

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, Date.now());
    await pool1.sendTransaction({ from: fundSource, value: initialAssetValue });

    const expectedPrice = getTokenSpotPrice(initialAssetValue, mcrEth);
    const price = await pool1.getTokenPrice(ETH);
    assert.equal(price.toString(), expectedPrice.toFixed());
  });

  it('calculates token price correctly in DAI', async function () {
    const { pool1, poolData, chainlinkDAI, dai } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');
    const ethToDaiRate = new BN((394.59 * 1e18).toString());
    const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, Date.now());
    await pool1.sendTransaction({ from: fundSource, value: initialAssetValue });

    await chainlinkDAI.setLatestAnswer(daiToEthRate);

    const expectedEthPrice = getTokenSpotPrice(initialAssetValue, mcrEth);
    const expectedPrice = new BN(expectedEthPrice.toFixed()).mul(ether('1')).div(daiToEthRate);
    const price = await pool1.getTokenPrice(dai.address);
    assert.equal(price.toString(), expectedPrice.toString());
  });
});
