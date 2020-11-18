const { web3 } = require('hardhat');
const { assert } = require('chai');
const { ether } = require('@openzeppelin/test-helpers');
const { calculateMCRRatio } = require('../utils').tokenPrice;
const { hex } = require('../utils').helpers;
const BN = web3.utils.BN;
const { accounts } = require('../utils');
const Decimal = require('decimal.js');

const {
  nonMembers: [fundSource],
} = accounts;

describe('getMCRRatio', function () {
  it('gets MCR ratio value', async function () {
    const { pool1, poolData } = this;

    const initialAssetValue = new BN('210959924071154460525457');
    const mcrEth = new BN('162424730681679380000000');
    const ethToDaiRate = new BN((394.59 * 1e18).toString());
    const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);
    const ethRate = new BN('100');

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);

    const expectedMCRRatio = Decimal(initialAssetValue.toString())
      .div(Decimal(mcrEth.toString())).mul(10000).floor();
    const calculatedMCRRatio = await pool1.getMCRRatio();
    assert.equal(calculatedMCRRatio.toString(), expectedMCRRatio.toString());
  });
});
