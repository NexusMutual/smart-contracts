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
    const { pool1, poolData, tokenData, mcr, chainlinkAggregators } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');
    const mcrRatio = initialAssetValue.muln(1e4).div(mcrEth);
    const ethToDaiRate = new BN((394.59 * 1e18).toString());
    const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);
    const ethRate = new BN('100');

    await setupContractState(
      { fundSource, initialAssetValue, mcrEth, daiRate: daiToEthRate, ethRate, mcr, pool1, poolData, tokenData, chainlinkAggregators },
    );
    const expectedPrice = getTokenSpotPrice(mcrRatio, mcrEth);
    const poolValue = await pool1.getPoolValueInEth();
    assert.equal(poolValue.toString(), initialAssetValue.toString());
  });
});
