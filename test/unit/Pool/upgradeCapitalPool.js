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
    );

    await master.upgradeCapitalPool(pool.address, newPool.address);

    const coverAssets = await pool.getCoverAssets();
    const investmentAssets = await pool.getInvestmentAssets();
    const newCoverAssets = await newPool.getCoverAssets();
    const newInvestmentAssets = await newPool.getInvestmentAssets();

    const ETH = await pool.ETH();
    for (let i; i < coverAssets.length; i++) {
      expect(investmentAssets[i]).to.be.equal(newInvestmentAssets[i]);
      expect(coverAssets[i]).to.be.equal(newCoverAssets[i]);
      if (coverAssets[i].assetAddress !== ETH) {
        expect(await pool.swapDetails(coverAssets[i].assetAddress)).to.be.equal(
          await newPool.swapDetails(coverAssets[i].assetAddress),
        );
      }
    }

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

    const coverAssets = await pool.getCoverAssets();
    const investmentAssets = await pool.getInvestmentAssets();
    const newCoverAssets = await newPool.getCoverAssets();
    const newInvestmentAssets = await newPool.getInvestmentAssets();

    const ETH = await pool.ETH();
    for (let i; i < coverAssets.length; i++) {
      expect(investmentAssets[i]).to.be.equal(newInvestmentAssets[i]);
      expect(coverAssets[i]).to.be.equal(newCoverAssets[i]);
      if (coverAssets[i].assetAddress !== ETH) {
        expect(await pool.swapDetails(coverAssets[i].assetAddress)).to.be.equal(
          await newPool.swapDetails(coverAssets[i].assetAddress),
        );
      }
    }

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
  });
});
