const { ethers } = require('hardhat');
const { expect } = require('chai');
const { hex } = require('../utils').helpers;
const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;

describe('upgradeCapitalPool', function () {
  it('moves pool funds to new pool', async function () {
    const { pool, master, dai, stETH, chainlinkDAI, chainlinkSteth } = this;
    const {
      defaultSender: admin,
      governanceContracts: [governance],
    } = this.accounts;

    const [ChainlinkAggregatorMock, ERC20Mock, PriceFeedOracle, Pool] = await Promise.all([
      ethers.getContractFactory('ChainlinkAggregatorMock'),
      ethers.getContractFactory('ERC20Mock'),
      ethers.getContractFactory('PriceFeedOracle'),
      ethers.getContractFactory('Pool'),
    ]);

    const chainlinkNewAsset = await ChainlinkAggregatorMock.deploy();
    await chainlinkNewAsset.setLatestAnswer(BigNumber.from((1e18).toString()));

    const coverToken = await ERC20Mock.deploy();
    const priceFeedOracle = await PriceFeedOracle.deploy(
      [dai.address, stETH.address, coverToken.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address],
      [18, 18, 18],
    );
    await pool.connect(governance).updateAddressParameters(hex('PRC_FEED'.padEnd(8, '\0')), priceFeedOracle.address);

    const ethAmount = parseEther('10000');
    const tokenAmount = parseEther('100000');
    await governance.sendTransaction({ value: ethAmount, to: pool.address });

    await pool.connect(governance).addAsset(coverToken.address, 18, '0', '0', 100, true);
    const tokens = [dai, stETH, coverToken];
    for (const token of tokens) {
      await token.mint(pool.address, tokenAmount);
    }

    const newPool = await Pool.deploy(
      admin.address,
      AddressZero,
      AddressZero, // we do not test swaps here
      dai.address,
      stETH.address,
    );

    await master.upgradeCapitalPool(pool.address, newPool.address);

    for (const token of tokens) {
      const oldPoolBalance = await token.balanceOf(pool.address);
      const newPoolBalance = await token.balanceOf(newPool.address);
      expect(oldPoolBalance).to.equal(0);
      expect(newPoolBalance).to.equal(tokenAmount);
    }

    const oldPoolBalance = await ethers.provider.getBalance(pool.address);
    const newPoolBalance = await ethers.provider.getBalance(newPool.address);
    expect(oldPoolBalance).to.equal(0);
    expect(newPoolBalance).to.equal(ethAmount);
  });

  it('abandons marked assets on pool upgrade', async function () {
    const { pool, master, dai, stETH, chainlinkDAI, chainlinkSteth } = this;
    const {
      defaultSender: admin,
      governanceContracts: [governance],
    } = this.accounts;

    const ethAmount = parseEther('10000');
    const tokenAmount = parseEther('100000');
    await governance.sendTransaction({ value: ethAmount, to: pool.address });

    const [ChainlinkAggregatorMock, ERC20Mock, ERC20NonRevertingMock, PriceFeedOracle, Pool] = await Promise.all([
      ethers.getContractFactory('ChainlinkAggregatorMock'),
      ethers.getContractFactory('ERC20Mock'),
      ethers.getContractFactory('ERC20NonRevertingMock'),
      ethers.getContractFactory('PriceFeedOracle'),
      ethers.getContractFactory('Pool'),
    ]);

    const coverToken = await ERC20Mock.deploy();
    const nonRevertingERC20 = await ERC20NonRevertingMock.deploy();

    const chainlinkNewAsset = await ChainlinkAggregatorMock.deploy();
    await chainlinkNewAsset.setLatestAnswer(BigNumber.from((1e18).toString()));

    const priceFeedOracle = await PriceFeedOracle.deploy(
      [dai.address, stETH.address, coverToken.address, nonRevertingERC20.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address, chainlinkNewAsset.address],
      [18, 18, 18, 18],
    );
    await pool.connect(governance).updateAddressParameters(hex('PRC_FEED'.padEnd(8, '\0')), priceFeedOracle.address);

    await pool.connect(governance).addAsset(coverToken.address, 18, '0', '0', 100, true);

    await pool.connect(governance).addAsset(nonRevertingERC20.address, 18, '0', '0', 100, true);

    const tokens = [dai, stETH, coverToken];
    for (const token of tokens) {
      await token.mint(pool.address, tokenAmount);
    }

    const newPool = await Pool.deploy(
      admin.address,
      AddressZero,
      AddressZero, // we do not test swaps here
      dai.address,
      stETH.address,
    );

    await stETH.blacklistSender(pool.address);

    await expect(master.upgradeCapitalPool(pool.address, newPool.address)).to.be.revertedWith(
      'ERC20Mock: sender is blacklisted',
    );

    await pool.connect(governance).setAssetsToAbandon([nonRevertingERC20.address], true);
    await pool.connect(governance).setAssetsToAbandon([stETH.address], true);

    await master.upgradeCapitalPool(pool.address, newPool.address);

    for (const token of tokens) {
      const oldPoolBalance = await token.balanceOf(pool.address);
      const newPoolBalance = await token.balanceOf(newPool.address);
      if (token.address === stETH.address) {
        // stETH is blacklisted and abandoned
        expect(oldPoolBalance).to.be.equal(tokenAmount);
        expect(newPoolBalance).to.be.equal(0);
      } else {
        expect(oldPoolBalance).to.be.equal(0);
        expect(newPoolBalance).to.be.equal(tokenAmount);
      }
    }

    const oldPoolBalance = await ethers.provider.getBalance(pool.address);
    const newPoolBalance = await ethers.provider.getBalance(newPool.address);
    expect(oldPoolBalance).to.be.equal(0);
    expect(newPoolBalance).to.be.equal(ethAmount);
  });
});
