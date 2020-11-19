const { web3 } = require('hardhat');
const { assert } = require('chai');
const { ether } = require('@openzeppelin/test-helpers');
const { getTokenSpotPrice, calculateMCRRatio } = require('../utils').tokenPrice;
const { hex } = require('../utils').helpers;
const BN = web3.utils.BN;
const { accounts } = require('../utils');

const {
  nonMembers: [fundSource],
} = accounts;

describe('getTokenPrice', function () {

  it('calculates token price correctly in ETH', async function () {
    const { pool1, poolData } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, Date.now());
    await pool1.sendTransaction({ from: fundSource, value: initialAssetValue });

    const expectedPrice = getTokenSpotPrice(initialAssetValue, mcrEth);
    const price = await pool1.getTokenPrice(hex('ETH'));
    assert.equal(price.toString(), expectedPrice.toFixed());
  });

  it('calculates token price correctly in DAI', async function () {
    const { pool1, poolData, chainlinkAggregators } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');
    const ethToDaiRate = new BN((394.59 * 1e18).toString());
    const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, Date.now());
    await pool1.sendTransaction({ from: fundSource, value: initialAssetValue });

    await chainlinkAggregators['DAI'].setLatestAnswer(daiToEthRate);

    const expectedEthPrice = getTokenSpotPrice(initialAssetValue, mcrEth);
    const expectedPrice = new BN(expectedEthPrice.toFixed()).mul(ether('1')).div(daiToEthRate);
    const price = await pool1.getTokenPrice(hex('DAI'));
    assert.equal(price.toString(), expectedPrice.toString());
  });
});
