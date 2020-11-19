const { web3 } = require('hardhat');
const { assert } = require('chai');
const { ether } = require('@openzeppelin/test-helpers');
const { calculateMCRRatio } = require('../utils').tokenPrice;
const { percentageBN } = require('../utils').tokenPrice;
const { accounts } = require('../utils');

const {
  nonMembers: [fundSource],
} = accounts;

describe('getters', function () {

  describe('getEthForNXM', function () {
    it('returns value as calculated by calculateEthForNXM', async function () {
      const { pool1, poolData } = this;

      const mcrEth = ether('160000');
      const totalAssetValue = percentageBN(mcrEth, 150);
      const tokenValue = ether('1');

      const mcrRatio = calculateMCRRatio(totalAssetValue, mcrEth);
      await pool1.sendTransaction({
        from: fundSource,
        value: totalAssetValue,
      });
      const date = new Date().getTime();
      await poolData.setLastMCR(mcrRatio, mcrEth, totalAssetValue, date);

      const expectedEthOut = await pool1.calculateEthForNXM(
        tokenValue, totalAssetValue, mcrEth,
      );
      const ethOut = await pool1.getEthForNXM(tokenValue);
      assert.equal(ethOut.toString(), expectedEthOut.toString());
    });
  });

  describe('getNXMForEth', function () {
    it('returns value as calculated by calculateNXMForEth', async function () {
      const { pool1, poolData } = this;

      const mcrEth = ether('160000');
      const totalAssetValue = percentageBN(mcrEth, 150);
      const buyValue = ether('10');

      const mcrRatio = calculateMCRRatio(totalAssetValue, mcrEth);
      await pool1.sendTransaction({
        from: fundSource,
        value: totalAssetValue,
      });
      const date = new Date().getTime();
      await poolData.setLastMCR(mcrRatio, mcrEth, totalAssetValue, date);

      const expectedTokenValue = await pool1.calculateNXMForEth(
        buyValue, totalAssetValue, mcrEth,
      );
      const tokenValue = await pool1.getNXMForEth(buyValue);
      assert.equal(tokenValue.toString(), expectedTokenValue.toString());
    });
  });

  describe('getWei', function () {
    it('returns value as calculated by calculateEthForNXM', async function () {
      const { pool1, poolData } = this;

      const mcrEth = ether('160000');
      const totalAssetValue = percentageBN(mcrEth, 150);
      const tokenValue = ether('1');

      const mcrRatio = calculateMCRRatio(totalAssetValue, mcrEth);
      await pool1.sendTransaction({
        from: fundSource,
        value: totalAssetValue,
      });
      const date = new Date().getTime();
      await poolData.setLastMCR(mcrRatio, mcrEth, totalAssetValue, date);

      const expectedEthOut = await pool1.calculateEthForNXM(
        tokenValue, totalAssetValue, mcrEth,
      );
      const ethOut = await pool1.getWei(tokenValue);
      assert.equal(ethOut.toString(), expectedEthOut.toString());
    });
  });
});
