const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { parseEther } = ethers.utils;
const { toBytes8 } = require('../utils').helpers;

describe('transferAssetToSwapOperator', function () {
  it('transfers added ERC20 asset to swap operator', async function () {
    const fixture = await loadFixture(setup);
    const { pool, otherAsset } = fixture;
    const {
      governanceContracts: [governance],
      nonMembers: [arbitraryCaller],
    } = fixture.accounts;

    const tokenAmount = parseEther('100000');
    await pool.connect(governance).addAsset(otherAsset.address, true, '0', '0', 100 /* 1% */);
    await otherAsset.mint(pool.address, tokenAmount);

    const amountToTransfer = tokenAmount.div(2);

    const tempSwapOperator = arbitraryCaller;
    await pool.connect(governance).updateAddressParameters(toBytes8('SWP_OP'), tempSwapOperator.address);

    await pool.connect(tempSwapOperator).transferAssetToSwapOperator(otherAsset.address, amountToTransfer);
    const destinationBalance = await otherAsset.balanceOf(tempSwapOperator.address);
    expect(destinationBalance).to.eq(amountToTransfer);

    const poolBalance = await otherAsset.balanceOf(pool.address);
    expect(poolBalance).to.eq(tokenAmount.sub(amountToTransfer));
  });

  it('revers if not called by swap operator', async function () {
    const fixture = await loadFixture(setup);
    const { pool, otherAsset } = fixture;
    const {
      governanceContracts: [governance],
      nonMembers: [arbitraryCaller],
    } = fixture.accounts;

    const tokenAmount = parseEther('100000');
    await pool.connect(governance).addAsset(otherAsset.address, true, '0', '0', 100 /* 1% */);
    await otherAsset.mint(pool.address, tokenAmount);

    const amountToTransfer = tokenAmount.div(2);

    await expect(
      pool.connect(arbitraryCaller).transferAssetToSwapOperator(otherAsset.address, amountToTransfer),
    ).to.be.revertedWith('Pool: Not swapOperator');
  });
});
