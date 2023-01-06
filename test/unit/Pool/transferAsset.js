const { ethers } = require('hardhat');
const { expect } = require('chai');
const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { toBytes8 } = require('../utils').helpers;

describe('transferAsset', function () {
  before(async function () {
    const { pool, dai, stETH, chainlinkDAI, chainlinkSteth } = this;
    const {
      governanceContracts: [governance],
    } = this.accounts;

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');

    const otherToken = await ERC20Mock.deploy();
    const chainlinkNewAsset = await ChainlinkAggregatorMock.deploy();
    await chainlinkNewAsset.setLatestAnswer(BigNumber.from((1e18).toString()));

    const priceFeedOracle = await PriceFeedOracle.deploy(
      [dai.address, stETH.address, otherToken.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address],
      [18, 18, 18],
    );

    await pool.connect(governance).updateAddressParameters(toBytes8('PRC_FEED'), priceFeedOracle.address);

    this.otherToken = otherToken;
  });

  it('transfers added ERC20 asset to destination', async function () {
    const { pool, otherToken } = this;
    const {
      governanceContracts: [governance],
      nonMembers: [destination],
    } = this.accounts;

    const tokenAmount = parseEther('100000');
    await pool.connect(governance).addAsset(otherToken.address, 18, '0', '0', 100 /* 1% */, true);
    await otherToken.mint(pool.address, tokenAmount);

    const amountToTransfer = tokenAmount.div(2);

    await pool.connect(governance).transferAsset(otherToken.address, destination.address, amountToTransfer);
    const destinationBalance = await otherToken.balanceOf(destination.address);
    expect(destinationBalance).to.eq(amountToTransfer);

    const poolBalance = await otherToken.balanceOf(pool.address);
    expect(poolBalance).to.eq(tokenAmount.sub(amountToTransfer));
  });

  it('transfers arbitrary ERC20 asset in the Pool to destination', async function () {
    const { pool } = this;
    const {
      governanceContracts: [governance],
      nonMembers: [destination],
    } = this.accounts;

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
    const { pool } = this;
    const {
      governanceContracts: [governance],
      nonMembers: [destination],
    } = this.accounts;

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
    const { pool, otherToken } = this;
    const {
      governanceContracts: [governance],
      nonMembers: [destination],
    } = this.accounts;

    const tokenAmount = parseEther('100000');
    await pool.connect(governance).addAsset(otherToken.address, 18, '0', '1', 100 /* 1% */, true);
    await otherToken.mint(pool.address, tokenAmount);
    await expect(
      pool.connect(governance).transferAsset(otherToken.address, destination.address, tokenAmount),
    ).to.be.revertedWith('Pool: Max not zero');
  });

  it('reverts on asset transfer if caller is not authorized to govern', async function () {
    const { pool } = this;
    const {
      governanceContracts: [governance],
      nonMembers: [destination],
    } = this.accounts;

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
