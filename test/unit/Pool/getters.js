const { ethers } = require('hardhat');
const { expect } = require('chai');
const { parseEther } = ethers.utils;
const { percentageBigNumber } = require('../utils').tokenPrice;

describe('getters', function () {
  describe('getEthForNXM', function () {
    it('returns value as calculated by calculateEthForNXM', async function () {
      const { pool, mcr } = this;
      const [member] = this.accounts.members;

      const mcrEth = parseEther('160000');
      const totalAssetValue = percentageBigNumber(mcrEth, 150);
      const tokenValue = parseEther('1');

      await mcr.setMCR(mcrEth);
      await member.sendTransaction({ to: pool.address, value: totalAssetValue });

      const expectedEthOut = await pool.calculateEthForNXM(tokenValue, totalAssetValue, mcrEth);
      const ethOut = await pool.getEthForNXM(tokenValue);
      expect(ethOut).to.equal(expectedEthOut);
    });
  });

  describe('getNXMForEth', function () {
    it('returns value as calculated by calculateNXMForEth', async function () {
      const { pool, mcr } = this;
      const [member] = this.accounts.members;

      const mcrEth = parseEther('160000');
      const totalAssetValue = percentageBigNumber(mcrEth, 150);
      const buyValue = parseEther('10');

      await mcr.setMCR(mcrEth);
      await member.sendTransaction({ to: pool.address, value: totalAssetValue });

      const expectedTokenValue = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
      const tokenValue = await pool.getNXMForEth(buyValue);
      expect(tokenValue).to.equal(expectedTokenValue);
    });
  });
});
