const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { parseEther } = ethers.utils;
const { percentageBigNumber } = require('../utils').tokenPrice;

describe('getters', function () {
  describe('getEthForNXM', function () {
    it('returns value as calculated by calculateEthForNXM', async function () {
      const fixture = await loadFixture(setup);
      const { pool } = fixture;

      // in the mock ramm, 1 NXM = 1 ETH
      const tokenAmount = parseEther('1');
      const ethOut = await pool.getEthForNXM(tokenAmount);
      expect(ethOut).to.equal(tokenAmount);
    });
  });

  describe('getNXMForEth', function () {
    it('returns value as calculated by calculateNXMForEth', async function () {
      const fixture = await loadFixture(setup);
      const { pool, mcr } = fixture;

      // in the mock ramm, 1 NXM = 1 ETH
      const tokenAmount = parseEther('1');
      const nxmOut = await pool.getEthForNXM(tokenAmount);
      expect(nxmOut).to.equal(tokenAmount);
    });
  });
});
