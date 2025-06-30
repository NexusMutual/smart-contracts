const { expect } = require('chai');
const { parseEther } = require('ethers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

describe('getEthForAsset', function () {
  it('return same amount of ethIn if the asset is eth', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;

    const ethIn = parseEther('1');
    const assetAmount = await pool.getEthForAsset('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', ethIn);
    expect(assetAmount).to.be.equal(ethIn);
  });

  it('returns correct value for non eth asset', async function () {
    const fixture = await loadFixture(setup);
    const { usdc, pool } = fixture;

    const amount = 1000000n;
    const assetAmount = await pool.getEthForAsset(usdc, amount);
    expect(assetAmount).to.be.equal(parseEther('1'));
  });
});
