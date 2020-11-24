const { web3 } = require('hardhat');
const { assert } = require('chai');
const { calculateMCRRatio } = require('../utils').tokenPrice;
const { BN } = web3.utils;

describe('getMCRRatio', function () {

  it('gets MCR ratio value', async function () {
    const { pool1, poolData } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');
    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);

    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, Date.now());
    await pool1.sendTransaction({ value: initialAssetValue });

    const expectedMCRRatio = initialAssetValue.muln(10000).div(mcrEth);
    const calculatedMCRRatio = await pool1.getMCRRatio();

    assert.equal(calculatedMCRRatio.toString(), expectedMCRRatio.toString());
  });

});
