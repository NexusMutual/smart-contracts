const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { parseEther } = ethers.utils;

describe('transferAsset', function () {
  it('transfers added ERC20 asset to destination', async function () {
    const fixture = await loadFixture(setup);
    const { pool, otherAsset } = fixture;
    const {
      governanceContracts: [governance],
      nonMembers: [destination],
    } = fixture.accounts;

    const tokenAmount = parseEther('100000');
    await pool.connect(governance).addAsset(otherAsset.address, true, '0', '0', 100 /* 1% */);
    await otherAsset.mint(pool.address, tokenAmount);

    const amountToTransfer = tokenAmount.div(2);

    await pool.connect(governance).transferAsset(otherAsset.address, destination.address, amountToTransfer);
    const destinationBalance = await otherAsset.balanceOf(destination.address);
    expect(destinationBalance).to.eq(amountToTransfer);

    const poolBalance = await otherAsset.balanceOf(pool.address);
    expect(poolBalance).to.eq(tokenAmount.sub(amountToTransfer));
  });

  it('transfers arbitrary ERC20 asset in the Pool to destination', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const {
      governanceContracts: [governance],
      nonMembers: [destination],
    } = fixture.accounts;

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const tokenAmount = parseEther('100000');
    const otherToken = await ERC20Mock.deploy();
    await otherToken.mint(pool.address, tokenAmount);

    const amountToTransfer = tokenAmount.div(2);

    await pool.connect(governance).transferAsset(otherToken.address, destination.address, amountToTransfer);
    const destinationBalance = await otherToken.balanceOf(destination.address);
    expect(destinationBalance).to.eq(amountToTransfer);

    const poolBalance = await otherToken.balanceOf(pool.address);
    expect(poolBalance).to.eq(tokenAmount.sub(amountToTransfer));
  });

  it('transfers entire balance of arbitrary ERC20 asset in the Pool if amount < balance', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const {
      governanceContracts: [governance],
      nonMembers: [destination],
    } = fixture.accounts;

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const tokenAmount = parseEther('100000');
    const otherToken = await ERC20Mock.deploy();

    await otherToken.mint(pool.address, tokenAmount);
    const amountToTransfer = tokenAmount.add(1);

    await pool.connect(governance).transferAsset(otherToken.address, destination.address, amountToTransfer);

    const destinationBalance = await otherToken.balanceOf(destination.address);
    expect(destinationBalance).to.eq(tokenAmount);

    const poolBalance = await otherToken.balanceOf(pool.address);
    expect(poolBalance).to.eq(0);
  });

  it('reverts on asset transfer if asset maxAmount > 0', async function () {
    const fixture = await loadFixture(setup);
    const { pool, otherAsset } = fixture;
    const {
      governanceContracts: [governance],
      nonMembers: [destination],
    } = fixture.accounts;

    const tokenAmount = parseEther('100000');
    await pool.connect(governance).addAsset(otherAsset.address, true, '0', '1', 100 /* 1% */);
    await otherAsset.mint(pool.address, tokenAmount);
    await expect(
      pool.connect(governance).transferAsset(otherAsset.address, destination.address, tokenAmount),
    ).to.be.revertedWith('Pool: Max not zero');
  });

  it('reverts on asset transfer if caller is not authorized to govern', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const {
      governanceContracts: [governance],
      nonMembers: [destination],
    } = fixture.accounts;

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const tokenAmount = parseEther('100000');
    const otherToken = await ERC20Mock.deploy();
    await otherToken.mint(pool.address, tokenAmount);
    await expect(
      pool.connect(governance).transferAsset(otherToken.address, destination.address, tokenAmount),
      'Caller is not authorized to govern',
    );
  });
});
