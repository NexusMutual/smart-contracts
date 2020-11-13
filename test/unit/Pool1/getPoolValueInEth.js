const { web3 } = require('hardhat');
const { assert } = require('chai');
const { ether } = require('@openzeppelin/test-helpers');
const { getTokenSpotPrice } = require('../utils').tokenPrice;
const { hex } = require('../utils').helpers;
const BN = web3.utils.BN;
const { accounts } = require('../utils');
const { setupContractState } = require('./utils');

const {
  nonMembers: [fundSource],
} = accounts;

describe('getPoolValueInEth', function () {
  it.only('calculates total pool value correctly', async function () {
    const { pool1, poolData, tokenData, mcr, chainlinkAggregators, dai } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');
    const ethToDaiRate = new BN((394.59 * 1e18).toString());
    const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);
    const ethRate = new BN('100');
    const daiAmount = ether('10000');

    await setupContractState(
      { fundSource, initialAssetValue, mcrEth, daiRate: daiToEthRate, ethRate, mcr, pool1, poolData, tokenData, chainlinkAggregators },
    );

    await dai.mint(pool1.address, daiAmount);
    const expectedPoolValue = initialAssetValue.add(daiAmount.mul(daiToEthRate).div(ether('1')));
    const poolValue = await pool1.getPoolValueInEth();
    assert.equal(poolValue.toString(), expectedPoolValue.toString());
  });
});
