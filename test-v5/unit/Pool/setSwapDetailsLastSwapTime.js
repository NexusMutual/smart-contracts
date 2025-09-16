const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { parseEther } = ethers.utils;

const { toBytes8 } = require('../utils').helpers;

describe('setSwapDetailsLastSwapTime', function () {
  it('set last swap time for asset', async function () {
    const fixture = await loadFixture(setup);
    const { pool, otherAsset } = fixture;
    const {
      governanceContracts: [governance],
      members: [member],
    } = fixture.accounts;

    const tokenAmount = parseEther('100000');
    await pool.connect(governance).addAsset(otherAsset.address, true, '0', '0', 100);
    await otherAsset.mint(pool.address, tokenAmount);

    const lastSwapTime = 11512651;

    await pool.connect(governance).updateAddressParameters(toBytes8('SWP_OP'), member.address);

    await pool.connect(member).setSwapDetailsLastSwapTime(otherAsset.address, lastSwapTime);

    const swapDetails = await pool.swapDetails(otherAsset.address);
    expect(swapDetails.lastSwapTime).to.equal(lastSwapTime);
  });

  it('revers if not called by swap operator', async function () {
    const fixture = await loadFixture(setup);
    const { pool, otherAsset } = fixture;
    const {
      governanceContracts: [governance],
      members: [arbitraryCaller],
    } = fixture.accounts;

    const tokenAmount = parseEther('100000');
    await pool.connect(governance).addAsset(otherAsset.address, true, '0', '0', 100);
    await otherAsset.mint(pool.address, tokenAmount);

    const lastSwapTime = '11512651';

    await expect(
      pool.connect(arbitraryCaller).setSwapDetailsLastSwapTime(otherAsset.address, lastSwapTime),
    ).to.be.revertedWith('Pool: Not swapOperator');
  });
});
