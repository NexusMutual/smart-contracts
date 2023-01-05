const { ethers } = require('hardhat');
const { expect } = require('chai');
const { AddressZero, WeiPerEther } = ethers.constants;
const { parseEther } = ethers.utils;
const { hex } = require('../utils').helpers;

describe('addAsset', function () {
  it('reverts when not called by goverance', async function () {
    const { pool, otherAsset } = this;

    await expect(pool.addAsset(otherAsset.address, 18, '0', '1', '0', false)).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
    await expect(pool.addAsset(otherAsset.address, 18, '0', '1', '0', true)).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });

  it('reverts when asset address is zero address', async function () {
    const { pool } = this;
    const [governance] = this.accounts.governanceContracts;

    await expect(pool.connect(governance).addAsset(AddressZero, 18, '0', '1', '0', false)).to.be.revertedWith(
      'Pool: Asset is zero address',
    );

    await expect(pool.connect(governance).addAsset(AddressZero, 18, '0', '1', '0', true)).to.be.revertedWith(
      'Pool: Asset is zero address',
    );
  });

  it('reverts when max < min', async function () {
    const { pool, otherAsset } = this;
    const [governance] = this.accounts.governanceContracts;

    await expect(pool.connect(governance).addAsset(otherAsset.address, 18, '1', '0', '0', true)).to.be.revertedWith(
      'Pool: max < min',
    );
    await expect(pool.connect(governance).addAsset(otherAsset.address, 18, '1', '0', '0', false)).to.be.revertedWith(
      'Pool: max < min',
    );
  });

  it('reverts when max slippage ratio > 1', async function () {
    const { pool, otherAsset } = this;
    const [governance] = this.accounts.governanceContracts;
    await expect(
      pool.connect(governance).addAsset(otherAsset.address, 18, '0', '1', '10001' /* 100.01% */, false),
    ).to.be.revertedWith('Pool: Max slippage ratio > 1');

    // should work with slippage rate = 1
    await pool.connect(governance).addAsset(otherAsset.address, 18, '0', '1', '10000', false);
  });

  it('reverts when asset exists', async function () {
    const { pool, dai } = this;
    const [governance] = this.accounts.governanceContracts;

    await expect(pool.connect(governance).addAsset(dai.address, 18, '0', '1', '0', false)).to.be.revertedWith(
      'Pool: Asset exists',
    );
    await expect(pool.connect(governance).addAsset(dai.address, 18, '0', '1', '0', true)).to.be.revertedWith(
      'Pool: Asset exists',
    );
  });

  it('reverts when asset lacks an oracle', async function () {
    const { pool } = this;
    const [governance] = this.accounts.governanceContracts;

    const arbitraryAddress = '0x47ec31abc6b86e49933dC7B2969EBEbE3De662cA';

    await expect(pool.connect(governance).addAsset(arbitraryAddress, 18, '0', '1', '0', true)).to.be.revertedWith(
      'Pool: Asset lacks oracle',
    );
  });

  it('should correctly add the asset with its min, max, and slippage ratio', async function () {
    const { pool, dai, stETH, chainlinkDAI, chainlinkSteth } = this;
    const [governance] = this.accounts.governanceContracts;

    const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const token = await ERC20Mock.deploy();

    const chainlinkNewAsset = await ChainlinkAggregatorMock.deploy();
    await chainlinkNewAsset.setLatestAnswer(WeiPerEther);
    const priceFeedOracle = await PriceFeedOracle.deploy(
      [dai.address, stETH.address, token.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address],
      [18, 18, 18],
    );

    await pool.connect(governance).updateAddressParameters(hex('PRC_FEED'), priceFeedOracle.address);

    await pool.connect(governance).addAsset(token.address, 18, '1', '2', '3', true);
    await token.mint(pool.address, parseEther('100'));

    const assetDetails = await pool.getAssetSwapDetails(token.address);
    const { minAmount, maxAmount, maxSlippageRatio } = assetDetails;

    expect(minAmount).to.be.equal(1);
    expect(maxAmount).to.be.equal(2);
    expect(maxSlippageRatio).to.be.equal(3);
  });

  it('should correctly add the asset to either investment or cover asset arrays', async function () {
    const { pool, dai, stETH, chainlinkDAI, chainlinkSteth } = this;
    const [governance] = this.accounts.governanceContracts;

    const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');

    const coverAsset = await ERC20Mock.deploy();
    const investmentAsset = await ERC20Mock.deploy();

    const chainlinkNewAsset = await ChainlinkAggregatorMock.deploy();
    await chainlinkNewAsset.setLatestAnswer(WeiPerEther);

    const priceFeedOracle = await PriceFeedOracle.deploy(
      [dai.address, stETH.address, coverAsset.address, investmentAsset.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address, chainlinkNewAsset.address],
      [18, 18, 18, 18],
    );

    await pool.connect(governance).updateAddressParameters(hex('PRC_FEED'), priceFeedOracle.address);

    // Cover asset
    {
      const token = coverAsset;
      await pool.connect(governance).addAsset(token.address, 18, '1', '2', '3', true);
      const coverAssets = await pool.getCoverAssets();
      const investmentAssets = await pool.getInvestmentAssets();
      expect(coverAssets[coverAssets.length - 1].assetAddress).to.be.equal(token.address);
      expect(coverAssets[coverAssets.length - 1].decimals).to.be.equal(18);
      const insertedInInvestmentAssets = !!investmentAssets.find(x => x.assetAddress === token.address);
      expect(insertedInInvestmentAssets).to.be.equal(false);
    }

    // Investment asset
    {
      const token = investmentAsset;
      await pool.connect(governance).addAsset(token.address, 8, '4', '5', '6', false);
      const coverAssets = await pool.getCoverAssets();
      const investmentAssets = await pool.getInvestmentAssets();
      expect(investmentAssets[investmentAssets.length - 1].assetAddress).to.be.equal(token.address);
      expect(investmentAssets[investmentAssets.length - 1].decimals).to.be.equal(8);
      const insertedInCoverAssets = !!coverAssets.find(x => x.assetAddress === token.address);
      expect(insertedInCoverAssets).to.be.equal(false);
    }
  });
});
