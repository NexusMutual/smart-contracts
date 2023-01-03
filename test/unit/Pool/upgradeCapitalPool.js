const { ethers } = require('hardhat');
const { expect } = require('chai');
const { hex } = require('../utils').helpers;
const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;

describe('upgradeCapitalPool', function () {
  async function verifyNewPoolAssets(pool, newPool, numAssetsAdded) {
    const [coverAssets, investmentAssets, newCoverAssets, newInvestmentAssets, ETH] = await Promise.all([
      pool.getCoverAssets(),
      pool.getInvestmentAssets(),
      newPool.getCoverAssets(),
      newPool.getInvestmentAssets(),
      pool.ETH(),
    ]);

    expect(coverAssets[0].assetAddress).to.be.equal(ETH);
    expect(coverAssets.length + investmentAssets.length + numAssetsAdded).to.be.equal(
      newInvestmentAssets.length + newCoverAssets.length,
    );

    for (let i = 0; i < coverAssets.length; i++) {
      expect(coverAssets[i].assetAddress).to.be.equal(newCoverAssets[i].assetAddress);
      const [swapDetails, swapDetailsNew] = await Promise.all([
        pool.swapDetails(coverAssets[i].assetAddress),
        newPool.swapDetails(coverAssets[i].assetAddress),
      ]);
      expect(swapDetails[i]).to.be.equal(swapDetailsNew[i]);
    }

    for (let i; i < investmentAssets.length; i++) {
      expect(investmentAssets[i]).to.be.equal(newInvestmentAssets[i]);
      const [swapDetails, swapDetailsNew] = await Promise.all([
        pool.swapDetails(coverAssets[i].assetAddress),
        newPool.swapDetails(coverAssets[i].assetAddress),
      ]);
      expect(swapDetails[i]).to.be.equal(swapDetailsNew[i]);
    }
  }

  it('moves pool funds to new pool', async function () {
    const { pool, master, dai, stETH, chainlinkDAI, chainlinkSteth } = this;
    const {
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
      master.address,
      priceFeedOracle.address,
      AddressZero, // we do not test swaps here
      [[], []],
      [[], []],
    );

    await master.upgradeCapitalPool(pool.address, newPool.address);

    for (const token of tokens) {
      const oldPoolBalance = await token.balanceOf(pool.address);
      const newPoolBalance = await token.balanceOf(newPool.address);
      assert.equal(oldPoolBalance.toString(), '0');
      assert.equal(newPoolBalance.toString(), tokenAmount.toString());
    }

    const oldPoolBalance = await ethers.provider.getBalance(pool.address);
    const newPoolBalance = await ethers.provider.getBalance(newPool.address);
    assert.equal(oldPoolBalance.toString(), '0');
    assert.equal(newPoolBalance.toString(), ethAmount.toString());

    await verifyNewPoolAssets(pool, newPool, 0);
  });

  it('abandons marked assets on pool upgrade', async function () {
    const { pool, master, dai, stETH, chainlinkDAI, chainlinkSteth } = this;
    const {
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
      master.address,
      priceFeedOracle.address,
      AddressZero, // we do not test swaps here
      [[], []],
      [[], []],
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

    await verifyNewPoolAssets(pool, newPool, 0);
  });

  // test that can upgrade pool and add new assets at the same time
  it('upgrades pool and adds new assets', async function () {
    const { pool, master, dai, stETH, chainlinkDAI, chainlinkSteth } = this;
    const {
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

    const tokens = [dai, stETH, coverToken];
    for (const token of tokens) {
      await token.mint(pool.address, tokenAmount);
    }

    const coverAsset = {
      assets: [{ assetAddress: coverToken.address, decimals: 18 }],
      swapDetails: [{ minAmount: 0, maxAmount: 0, maxSlippageRatio: 100, lastSwapTime: 0 }],
    };

    const newPool = await Pool.deploy(
      master.address,
      priceFeedOracle.address,
      AddressZero, // we do not test swaps here
      coverAsset,
      [[], []],
    );

    await master.upgradeCapitalPool(pool.address, newPool.address);

    await verifyNewPoolAssets(pool, newPool, 1);
    // new asset should be added after previous pool assets
    const coverAssetsNew = await newPool.getCoverAssets();
    const newAsset = coverAssetsNew[coverAssetsNew.length - 1];
    expect(newAsset.assetAddress).to.be.eq(coverAsset.assets[0].assetAddress);
    expect(newAsset.decimals).to.be.eq(coverAsset.assets[0].decimals);
  });
});
