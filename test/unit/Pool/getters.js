const { assert } = require('chai');
const { ether } = require('@openzeppelin/test-helpers');
const { calculateMCRRatio } = require('../utils').tokenPrice;
const { percentageBN } = require('../utils').tokenPrice;

describe('getters', function () {

  describe('getEthForNXM', function () {
    it('returns value as calculated by calculateEthForNXM', async function () {
      const { pool, poolData } = this;

      const mcrEth = ether('160000');
      const totalAssetValue = percentageBN(mcrEth, 150);
      const tokenValue = ether('1');

      const mcrRatio = calculateMCRRatio(totalAssetValue, mcrEth);
      await poolData.setLastMCR(mcrRatio, mcrEth, totalAssetValue, Date.now());
      await pool.sendTransaction({ value: totalAssetValue });

      const expectedEthOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue, mcrEth);
      const ethOut = await pool.getEthForNXM(tokenValue);
      assert.equal(ethOut.toString(), expectedEthOut.toString());
    });
  });

  describe('getNXMForEth', function () {
    it('returns value as calculated by calculateNXMForEth', async function () {
      const { pool, poolData } = this;

      const mcrEth = ether('160000');
      const totalAssetValue = percentageBN(mcrEth, 150);
      const buyValue = ether('10');

      const mcrRatio = calculateMCRRatio(totalAssetValue, mcrEth);
      await poolData.setLastMCR(mcrRatio, mcrEth, totalAssetValue, Date.now());
      await pool.sendTransaction({ value: totalAssetValue });

      const expectedTokenValue = await pool.calculateNXMForEth(
        buyValue, totalAssetValue, mcrEth,
      );
      const tokenValue = await pool.getNXMForEth(buyValue);
      assert.equal(tokenValue.toString(), expectedTokenValue.toString());
    });
  });

  describe('getWei', function () {
    it('returns value as calculated by calculateEthForNXM', async function () {
      const { pool, poolData } = this;

      const mcrEth = ether('160000');
      const totalAssetValue = percentageBN(mcrEth, 150);
      const tokenValue = ether('1');

      const mcrRatio = calculateMCRRatio(totalAssetValue, mcrEth);
      await poolData.setLastMCR(mcrRatio, mcrEth, totalAssetValue, Date.now());
      await pool.sendTransaction({ value: totalAssetValue });

      const expectedEthOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue, mcrEth);
      const ethOut = await pool.getWei(tokenValue);
      assert.equal(ethOut.toString(), expectedEthOut.toString());
    });
  });
});
