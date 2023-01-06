const { ethers } = require('hardhat');
const { expect } = require('chai');
const { toBytes8 } = require('../utils').helpers;

const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;

describe('upgradeCapitalPool', function () {
  it('moves pool funds to new pool', async function () {
    const { pool, master, dai, stETH, chainlinkDAI, chainlinkSteth } = this;
    const [governance] = this.accounts.governanceContracts;
    const { defaultSender } = this.accounts;

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
    const Pool = await ethers.getContractFactory('Pool');

    const chainlinkNewAsset = await ChainlinkAggregatorMock.deploy();
    await chainlinkNewAsset.setLatestAnswer(parseEther('1'));

    const coverToken = await ERC20Mock.deploy();
    const priceFeedOracle = await PriceFeedOracle.deploy(
      [dai.address, stETH.address, coverToken.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address],
      [18, 18, 18],
    );
    await pool.connect(governance).updateAddressParameters(toBytes8('PRC_FEED'), priceFeedOracle.address);

    const ethAmount = parseEther('10000');
    const tokenAmount = parseEther('100000');
    await governance.sendTransaction({ value: ethAmount, to: pool.address });

    await pool.connect(governance).addAsset(coverToken.address, 18, '0', '0', 100, true);
    const tokens = [dai, stETH, coverToken];
    for (const token of tokens) {
      await token.mint(pool.address, tokenAmount);
    }

    const newPool = await Pool.deploy(
      defaultSender.address,
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
    const [governance] = this.accounts.governanceContracts;
    const { defaultSender } = this.accounts;

    const ethAmount = parseEther('10000');
    const tokenAmount = parseEther('100000');
    await governance.sendTransaction({ value: ethAmount, to: pool.address });

    const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const ERC20NonRevertingMock = await ethers.getContractFactory('ERC20NonRevertingMock');
    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
    const Pool = await ethers.getContractFactory('Pool');

    const coverToken = await ERC20Mock.deploy();
    const nonRevertingERC20 = await ERC20NonRevertingMock.deploy();

    const chainlinkNewAsset = await ChainlinkAggregatorMock.deploy();
    await chainlinkNewAsset.setLatestAnswer(parseEther('1'));

    const priceFeedOracle = await PriceFeedOracle.deploy(
      [dai.address, stETH.address, coverToken.address, nonRevertingERC20.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address, chainlinkNewAsset.address],
      [18, 18, 18, 18],
    );
    await pool.connect(governance).updateAddressParameters(toBytes8('PRC_FEED'), priceFeedOracle.address);

    await pool.connect(governance).addAsset(coverToken.address, 18, '0', '0', 100, true);

    await pool.connect(governance).addAsset(nonRevertingERC20.address, 18, '0', '0', 100, true);

    const tokens = [dai, stETH, coverToken];
    for (const token of tokens) {
      await token.mint(pool.address, tokenAmount);
    }

    const newPool = await Pool.deploy(
      defaultSender.address,
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
