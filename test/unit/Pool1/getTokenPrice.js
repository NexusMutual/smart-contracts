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

describe('getTokenPrice', function () {

  it('calculates token spot price correctly', async function () {
    const { pool1, poolData, tokenData, mcr } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');
    const mcrRatio = initialAssetValue.muln(1e4).div(mcrEth);
    const daiRate = new BN('39459');
    const ethRate = new BN('100');

    await setupContractState(
      { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, poolData, tokenData },
    );
    const expectedPrice = getTokenSpotPrice(mcrRatio, mcrEth);
    const price = await pool1.getTokenPrice(hex('ETH'));
    assert.equal(price.toString(), expectedPrice.toFixed());
  });
});
