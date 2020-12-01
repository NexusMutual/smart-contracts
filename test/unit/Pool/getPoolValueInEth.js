const { web3 } = require('hardhat');
const { assert } = require('chai');
const { ether } = require('@openzeppelin/test-helpers');
const { calculateMCRRatio } = require('../utils').tokenPrice;
const { BN } = web3.utils;

const { nonMembers: [fundSource] } = require('../utils').accounts;

describe('getPoolValueInEth', function () {
  it('gets total value of ETH and DAI assets in the pool', async function () {
    const { pool, poolData, chainlinkDAI, dai } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');
    const ethToDaiRate = new BN((394.59 * 1e18).toString());
    const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);
    await chainlinkDAI.setLatestAnswer(daiToEthRate);

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, Date.now());
    await pool.sendTransaction({ from: fundSource, value: initialAssetValue });

    const daiAmount = ether('10000');
    await dai.mint(pool.address, daiAmount);

    const expectedPoolValue = initialAssetValue.add(daiAmount.mul(daiToEthRate).div(ether('1')));
    const poolValue = await pool.getPoolValueInEth();
    assert.equal(poolValue.toString(), expectedPoolValue.toString());
  });
});
