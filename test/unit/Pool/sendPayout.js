const { ethers } = require('hardhat');
const { parseEther } = ethers.utils;
const { expect } = require('chai');
const { PoolAsset } = require('../../../lib/constants');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

describe('sendPayout', function () {
  it('transfers ERC20 payout to destination', async function () {
    const fixture = await loadFixture(setup);
    const { pool, dai } = fixture;
    const {
      internalContracts: [internal],
      generalPurpose: [destination],
    } = fixture.accounts;

    const tokenAmount = parseEther('100000');
    await dai.mint(pool.address, tokenAmount);

    const amountToTransfer = tokenAmount.div(2);

    await pool.connect(internal).sendPayout(PoolAsset.DAI, destination.address, amountToTransfer);
    const destinationBalance = await dai.balanceOf(destination.address);
    expect(destinationBalance).to.be.equal(amountToTransfer);

    const poolBalance = await dai.balanceOf(pool.address);
    expect(poolBalance).to.be.equal(tokenAmount.sub(amountToTransfer));
  });

  it('transfers ETH payout to destination', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const {
      internalContracts: [internal],
      nonMembers: [destination, fundSource],
    } = fixture.accounts;

    const ethAmount = parseEther('10000');
    await fundSource.sendTransaction({ to: pool.address, value: ethAmount });

    const amountToTransfer = ethAmount.div(2);

    const destinationBalancePrePayout = await ethers.provider.getBalance(destination.address);
    await pool.connect(internal).sendPayout(PoolAsset.ETH, destination.address, amountToTransfer);
    const destinationBalance = await ethers.provider.getBalance(destination.address);
    expect(destinationBalance.sub(destinationBalancePrePayout)).to.be.equal(amountToTransfer);

    const poolBalance = await ethers.provider.getBalance(pool.address);
    expect(poolBalance).to.be.equal(ethAmount.sub(amountToTransfer));
  });
});
