const { web3 } = require('hardhat');
const { assert } = require('chai');
const { ether } = require('@openzeppelin/test-helpers');
const { calculateMCRRatio } = require('../utils').tokenPrice;
const { hex } = require('../utils').helpers;
const BN = web3.utils.BN;
const { accounts } = require('../utils');

const {
  nonMembers: [fundSource],
} = accounts;

describe('getPoolValueInEth', function () {
  it('gets total value of ETH and DAI assets in the pool', async function () {
    const { pool1, poolData, chainlinkAggregators, dai } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');
    const ethToDaiRate = new BN((394.59 * 1e18).toString());
    const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);
    const daiAmount = ether('10000');

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);
    await chainlinkAggregators['DAI'].setLatestAnswer(daiToEthRate);

    await dai.mint(pool1.address, daiAmount);
    const expectedPoolValue = initialAssetValue.add(daiAmount.mul(daiToEthRate).div(ether('1')));
    const poolValue = await pool1.getPoolValueInEth();
    assert.equal(poolValue.toString(), expectedPoolValue.toString());
  });
});
