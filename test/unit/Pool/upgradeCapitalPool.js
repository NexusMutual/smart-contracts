const { ether } = require('@openzeppelin/test-helpers');
const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers').constants;
const { web3, artifacts } = require('hardhat');
const { assert, expect } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;

const {
  governanceContracts: [governance],
} = require('../utils').accounts;
const { BN } = web3.utils;

const PriceFeedOracle = artifacts.require('PriceFeedOracle');
const ChainlinkAggregatorMock = artifacts.require('ChainlinkAggregatorMock');
const Pool = artifacts.require('Pool');
const ERC20Mock = artifacts.require('ERC20Mock');
const ERC20NonRevertingMock = artifacts.require('ERC20NonRevertingMock');

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

    const chainlinkNewAsset = await ChainlinkAggregatorMock.new();
    await chainlinkNewAsset.setLatestAnswer(new BN((1e18).toString()));

    const coverToken = await ERC20Mock.new();
    const priceFeedOracle = await PriceFeedOracle.new(
      [dai.address, stETH.address, coverToken.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address],
      [18, 18, 18],
    );
    await pool.updateAddressParameters(hex('PRC_FEED'), priceFeedOracle.address, { from: governance });

    const ethAmount = ether('10000');
    const tokenAmount = ether('100000');
    await pool.sendTransaction({ value: ethAmount });

    await pool.addAsset(coverToken.address, 18, '0', '0', 100, true, {
      from: governance,
    });
    const tokens = [dai, stETH, coverToken];
    for (const token of tokens) {
      await token.mint(pool.address, tokenAmount);
    }

    const newPool = await Pool.new(
      master.address,
      priceFeedOracle.address,
      ZERO_ADDRESS, // we do not test swaps here
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

    const oldPoolBalance = await web3.eth.getBalance(pool.address);
    const newPoolBalance = await web3.eth.getBalance(newPool.address);
    assert.equal(oldPoolBalance.toString(), '0');
    assert.equal(newPoolBalance.toString(), ethAmount.toString());

    await verifyNewPoolAssets(pool, newPool, 0);
  });

  it('abandons marked assets on pool upgrade', async function () {
    const { pool, master, dai, stETH, chainlinkDAI, chainlinkSteth } = this;

    const ethAmount = ether('10000');
    const tokenAmount = ether('100000');
    await pool.sendTransaction({ value: ethAmount });

    const coverToken = await ERC20Mock.new();
    const nonRevertingERC20 = await ERC20NonRevertingMock.new();

    const chainlinkNewAsset = await ChainlinkAggregatorMock.new();
    await chainlinkNewAsset.setLatestAnswer(new BN((1e18).toString()));

    const priceFeedOracle = await PriceFeedOracle.new(
      [dai.address, stETH.address, coverToken.address, nonRevertingERC20.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address, chainlinkNewAsset.address],
      [18, 18, 18, 18],
    );
    await pool.updateAddressParameters(hex('PRC_FEED'), priceFeedOracle.address, { from: governance });

    await pool.addAsset(coverToken.address, 18, '0', '0', 100, true, {
      from: governance,
    });

    await pool.addAsset(nonRevertingERC20.address, 18, '0', '0', 100, true, {
      from: governance,
    });

    const tokens = [dai, stETH, coverToken];
    for (const token of tokens) {
      await token.mint(pool.address, tokenAmount);
    }

    const newPool = await Pool.new(
      master.address,
      priceFeedOracle.address,
      ZERO_ADDRESS, // we do not test swaps here
      [[], []],
      [[], []],
    );

    await stETH.blacklistSender(pool.address);

    await expectRevert(master.upgradeCapitalPool(pool.address, newPool.address), 'ERC20Mock: sender is blacklisted');

    await pool.setAssetsToAbandon([nonRevertingERC20.address], true, {
      from: governance,
    });
    await pool.setAssetsToAbandon([stETH.address], true, {
      from: governance,
    });

    await master.upgradeCapitalPool(pool.address, newPool.address);

    for (const token of tokens) {
      const oldPoolBalance = await token.balanceOf(pool.address);
      const newPoolBalance = await token.balanceOf(newPool.address);
      if (token.address === stETH.address) {
        // stETH is blacklisted and abandoned
        assert.equal(oldPoolBalance.toString(), tokenAmount.toString());
        assert.equal(newPoolBalance.toString(), '0');
      } else {
        assert.equal(oldPoolBalance.toString(), '0');
        assert.equal(newPoolBalance.toString(), tokenAmount.toString());
      }
    }

    const oldPoolBalance = await web3.eth.getBalance(pool.address);
    const newPoolBalance = await web3.eth.getBalance(newPool.address);
    assert.equal(oldPoolBalance.toString(), '0');
    assert.equal(newPoolBalance.toString(), ethAmount.toString());

    await verifyNewPoolAssets(pool, newPool, 0);
  });

  // test that can upgrade pool and add new assets at the same time
  it('upgrades pool and adds new assets', async function () {
    const { pool, master, dai, stETH, chainlinkDAI, chainlinkSteth } = this;

    const chainlinkNewAsset = await ChainlinkAggregatorMock.new();
    await chainlinkNewAsset.setLatestAnswer(new BN((1e18).toString()));

    const coverToken = await ERC20Mock.new();
    const priceFeedOracle = await PriceFeedOracle.new(
      [dai.address, stETH.address, coverToken.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address],
      [18, 18, 18],
    );
    await pool.updateAddressParameters(hex('PRC_FEED'), priceFeedOracle.address, { from: governance });

    const ethAmount = ether('10000');
    const tokenAmount = ether('100000');
    await pool.sendTransaction({ value: ethAmount });

    const tokens = [dai, stETH, coverToken];
    for (const token of tokens) {
      await token.mint(pool.address, tokenAmount);
    }

    const coverAsset = {
      assets: [{ assetAddress: coverToken.address, decimals: '18' }],
      swapDetails: [{ minAmount: '0', maxAmount: '0', maxSlippageRatio: 100, lastSwapTime: 0 }],
    };

    const newPool = await Pool.new(
      master.address,
      priceFeedOracle.address,
      ZERO_ADDRESS, // we do not test swaps here
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
