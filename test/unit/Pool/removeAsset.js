const { ethers } = require('hardhat');
const { expect } = require('chai');
const { toBytes8 } = require('../utils').helpers;
const { parseEther } = ethers.utils;

const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

describe('removeAsset', function () {
  it('reverts when not called by goverance', async function () {
    const { pool } = this;

    await expect(pool.removeAsset(1, true)).to.be.revertedWith('Caller is not authorized to govern');

    await expect(pool.removeAsset(1, false)).to.be.revertedWith('Caller is not authorized to govern');
  });

  it('reverts when asset does not exist', async function () {
    const { pool } = this;
    const [governance] = this.accounts.governanceContracts;

    // Remove dai
    await pool.connect(governance).removeAsset(1, true);

    // Try to remove dai again (it should be deprecated)
    await expect(pool.connect(governance).removeAsset(1, true)).to.be.revertedWith('Pool: Cover asset is deprecated');

    // Try to remove an unexisting investment asset
    await expect(pool.connect(governance).removeAsset(1, false)).to.be.revertedWith(
      'Pool: Investment asset does not exist',
    );
  });

  it.skip('should correctly remove the asset with its minAmount, maxAmount, and slippage ratio', async function () {
    const { pool, dai, stETH, chainlinkDAI, chainlinkSteth } = this;
    const [governance] = this.accounts.governanceContracts;

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');

    const coverToken = await ERC20Mock.deploy();
    const investmentToken = await ERC20Mock.deploy();

    const chainlinkNewAsset = await ChainlinkAggregatorMock.deploy();
    await chainlinkNewAsset.setLatestAnswer(parseEther('1'));

    const priceFeedOracle = await PriceFeedOracle.deploy(
      [dai.address, stETH.address, coverToken.address, investmentToken.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address, chainlinkNewAsset.address],
      [18, 18, 18, 18],
    );

    await pool.connect(governance).updateAddressParameters(toBytes8('PRC_FEED'), priceFeedOracle.address);

    {
      // add token as cover asset
      await pool.connect(governance).addAsset(coverToken.address, 18, '1', '2', '3', true);
      await coverToken.mint(pool.address, parseEther('100'));

      const expectedCoverAssets = [ETH, dai.address, coverToken.address];
      const coverAssets = await pool.getCoverAssets();
      expect(coverAssets.map(x => x.assetAddress)).to.be.deep.equal(expectedCoverAssets, 'Unexpected assets found');
    }

    {
      // add token as investment asset
      await pool.connect(governance).addAsset(investmentToken.address, 18, '1', '2', '3', false);

      const expectedInvestmentAssets = [stETH.address, investmentToken.address];
      const investmentAssets = await pool.getInvestmentAssets();
      expect(investmentAssets.map(x => x.assetAddress)).to.be.deep.equal(
        expectedInvestmentAssets,
        'Unexpected assets found',
      );
    }

    {
      // remove DAI

      {
        const deprecatedCoverAssetsBitmap = await pool.deprecatedCoverAssetsBitmap();
        expect(deprecatedCoverAssetsBitmap).to.be.equal(0, 'Unexpected deprecated cover assets bitmap');
      }

      await pool.connect(governance).removeAsset(1, true);

      const assetDetails = await pool.getAssetSwapDetails(dai.address);
      const { minAmount, maxAmount, maxSlippageRatio, lastSwapTime } = assetDetails;

      expect(minAmount).to.be.equal(0);
      expect(maxAmount).to.be.equal(0);
      expect(maxSlippageRatio).to.be.equal(0);
      expect(lastSwapTime).to.be.equal(0);

      const expectedCoverAssets = [ETH, dai.address, coverToken.address];
      const coverAssets = await pool.getCoverAssets();
      expect(coverAssets.map(x => x.assetAddress)).to.be.deep.equal(expectedCoverAssets, 'Unexpected assets found');

      {
        const deprecatedCoverAssetsBitmap = await pool.deprecatedCoverAssetsBitmap();
        expect(deprecatedCoverAssetsBitmap).to.be.equal(0b10, 'Unexpected deprecated cover assets bitmap');
      }

      const expectedInvestmentAssets = [stETH.address, investmentToken.address];
      const investmentAssets = await pool.getInvestmentAssets();
      expect(investmentAssets.map(x => x.assetAddress)).to.be.deep.equal(
        expectedInvestmentAssets,
        'Unexpected assets found',
      );
    }

    {
      // check that cover token swap details were unaffected by dai removal
      const assetDetails = await pool.getAssetSwapDetails(coverToken.address);
      const { minAmount, maxAmount, maxSlippageRatio, lastSwapTime } = assetDetails;

      expect(minAmount).to.be.equal(1);
      expect(maxAmount).to.be.equal(2);
      expect(maxSlippageRatio).to.be.equal(3);
      expect(lastSwapTime).to.be.equal(0);
    }

    {
      // remove investment token
      await pool.connect(governance).removeAsset(1, false);

      const assetDetails = await pool.getAssetSwapDetails(investmentToken.address);
      const { minAmount, maxAmount, maxSlippageRatio, lastSwapTime } = assetDetails;

      expect(minAmount).to.be.equal(0);
      expect(maxAmount).to.be.equal(0);
      expect(maxSlippageRatio).to.be.equal(0);
      expect(lastSwapTime).to.be.equal(0);

      const expectedInvestmentAssets = [stETH.address];
      const investmentAssets = await pool.getInvestmentAssets();
      expect(investmentAssets.map(x => x.assetAddress)).to.be.deep.equal(
        expectedInvestmentAssets,
        'Unexpected assets found',
      );
    }

    {
      // check that stETH was not affected by the investment token removal
      const assetDetails = await pool.getAssetSwapDetails(stETH.address);
      const { minAmount, maxAmount, maxSlippageRatio, lastSwapTime } = assetDetails;

      expect(minAmount).to.be.equal(parseEther('24360'));
      expect(maxAmount).to.be.equal(parseEther('32500'));
      expect(maxSlippageRatio).to.be.equal(0);
      // this value is currently hardcoded in the Pool's constructor
      expect(lastSwapTime).to.be.equal(1633425218);

      const expectedInvestmentAssets = [stETH.address];
      const investmentAssets = await pool.getInvestmentAssets();
      expect(investmentAssets.map(x => x.assetAddress)).to.be.deep.equal(
        expectedInvestmentAssets,
        'Unexpected assets found',
      );
    }
  });
});
