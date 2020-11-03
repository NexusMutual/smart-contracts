const { web3 } = require('hardhat');
const { assert } = require('chai');
const { getTokenSpotPrice } = require('../utils').tokenPrice;
const BN = web3.utils.BN;

describe('calculateTokenSpotPrice', function () {

  it('calculates token spot price correctly', async function () {
    const { mcr } = this;

    const mcrEth = new BN('162424730681679380000000');
    const mcrPercentage = new BN('13134');

    const expectedPrice = getTokenSpotPrice(mcrPercentage, mcrEth);
    const price = await mcr.calculateTokenSpotPrice(mcrPercentage, mcrEth);
    assert.equal(price.toString(), expectedPrice.toFixed());
  });
});
