const { web3 } = require('hardhat');
const { assert } = require('chai');
const { BN } = web3.utils;

describe('getMCRRatio', function () {
  it('gets MCR ratio value', async function () {
    const { pool, mcr } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');

    await mcr.setMCR(mcrEth);
    await pool.sendTransaction({ value: initialAssetValue });

    const expectedMCRRatio = initialAssetValue.muln(10000).div(mcrEth);
    const calculatedMCRRatio = await pool.getMCRRatio();

    assert.equal(calculatedMCRRatio.toString(), expectedMCRRatio.toString());
  });
});
