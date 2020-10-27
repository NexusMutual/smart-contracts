const { ether, expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');
const accounts = require('../utils').accounts;
const { getTokenSpotPrice } = require('../utils').tokenPrice;
const BN = web3.utils.BN;

describe('calculateTokenSpotPrice', function () {

  it.only('calculates token spot price correctly', async function () {
    const { mcr } = this;

    const mcrEth = new BN('162424730681679380000000');
    const mcrPercentage = new BN('13134');


    const expectedPrice = getTokenSpotPrice(mcrPercentage, mcrEth);
    const price = await mcr.calculateTokenSpotPrice(mcrPercentage, mcrEth);
    assert(price.toString(), expectedPrice);
  });
});
