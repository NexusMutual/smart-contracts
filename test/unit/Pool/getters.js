const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

const setup = require('./setup');
const { parseEther } = ethers.utils;
const { percentageBigNumber } = require('../utils').tokenPrice;

describe('getters', function () {
  let fixture;
  beforeEach(async function () {
    fixture = await loadFixture(setup);
  });

  describe('getEthForNXM', function () {
    it('returns value as calculated by calculateEthForNXM', async function () {
      const { pool, mcr } = fixture;
      const [member] = fixture.accounts.members;

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
      const { pool, mcr } = fixture;
      const [member] = fixture.accounts.members;

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
