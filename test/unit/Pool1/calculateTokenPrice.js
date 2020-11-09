const { web3 } = require('hardhat');
const { assert } = require('chai');
const { getTokenSpotPrice } = require('../utils').tokenPrice;
const { hex } = require('../utils').helpers;
const BN = web3.utils.BN;
const { accounts } = require('../utils');
const { setupContractState } = require('./utils');

const {
  nonMembers: [fundSource],
} = accounts;

describe('calculateTokenPrice', function () {

  it('calculates token spot price correctly', async function () {
    const { mcr, pool1, poolData, tokenData } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');
    const mcrPercentage = initialAssetValue.muln(1e4).div(mcrEth);
    const daiRate = new BN('39459');
    const ethRate = new BN('100');

    await setupContractState(
      { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, poolData, tokenData },
    );
    const expectedPrice = getTokenSpotPrice(mcrPercentage, mcrEth);
    const price = await mcr.calculateTokenPrice(hex('ETH'));
    assert.equal(price.toString(), expectedPrice.toFixed());
  });
});
