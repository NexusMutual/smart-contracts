const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');

const { parseEther, parseUnits } = ethers;
const { Assets, PoolAsset, AggregatorType } = nexus.constants;
const { getInternalPrice } = nexus.protocol;
const { BigIntMath } = nexus.helpers;

describe('Pool functions', function () {
  it('getInternalTokenPriceInAsset returns spot price for all assets', async function () {
    const fixture = await loadFixture(setup);
    const {
      pool,
      ramm,
      tokenController,
      chainlinkEthUsd,
      chainlinkDAI,
      chainlinkUSDC,
      chainlinkSteth,
      chainlinkReth,
      chainlinkEnzymeVault,
      chainlinkCbBTC,
      safeTracker,
    } = fixture.contracts;

    const timestamp = await time.latest();
    const expectedTokenPriceInEth = await getInternalPrice(ramm, pool, tokenController, timestamp);
    const ethUsdRate = await chainlinkEthUsd.latestAnswer();
    const ethOracle = { latestAnswer: () => ethers.parseEther('1') };

    const assetTests = [
      { assetId: PoolAsset.ETH, name: 'ETH', oracle: ethOracle, decimals: 18 },
      { assetId: PoolAsset.DAI, name: 'DAI', oracle: chainlinkDAI, decimals: 18 },
      { assetId: PoolAsset.stETH, name: 'stETH', oracle: chainlinkSteth, decimals: 18 },
      { assetId: PoolAsset.NXMTY, name: 'NXMTY', oracle: chainlinkEnzymeVault, decimals: 18 },
      { assetId: PoolAsset.rETH, name: 'rETH', oracle: chainlinkReth, decimals: 18 },
      { assetId: PoolAsset.SafeTracker, name: 'SafeTracker', oracle: safeTracker, decimals: 18 },
      { assetId: PoolAsset.USDC, name: 'USDC', oracle: chainlinkUSDC, decimals: 6 },
      { assetId: PoolAsset.cbBTC, name: 'cbBTC', oracle: chainlinkCbBTC, rateType: AggregatorType.USD, decimals: 8 },
    ];

    for (const testCase of assetTests) {
      const actualTokenPrice = await pool.getInternalTokenPriceInAsset(testCase.assetId);
      const assetRate = await testCase.oracle.latestAnswer();

      let expectedTokenPrice = expectedTokenPriceInEth; // rateType is ETH by default
      if (testCase.rateType === AggregatorType.USD) {
        // convert ETH rate to USD rate if USD rateType
        expectedTokenPrice = (expectedTokenPrice * ethUsdRate) / parseEther('1');
      }

      const expectedPrice = (expectedTokenPrice * parseUnits('1', testCase.decimals)) / assetRate;
      const errMessage = `${testCase.name} token price mismatch. Expected: ${expectedPrice}, Got: ${actualTokenPrice}`;

      expect(actualTokenPrice).to.be.equal(expectedPrice, errMessage);
    }
  });

  it('getPoolValueInEth calculates pool value correctly', async function () {
    const fixture = await loadFixture(setup);
    const { pool, dai, usdc, stETH, rETH, safeTracker, enzymeVault, cbBTC } = fixture.contracts;

    const totalAssetValue = await pool.getPoolValueInEth();
    const poolAssets = await pool.getAssets();
    const ethAsset = {
      target: Assets.ETH,
      balanceOf: address => ethers.provider.getBalance(address),
    };

    const expectedAssets = [ethAsset, dai, stETH, enzymeVault, rETH, safeTracker, usdc, cbBTC];
    const expectedAssetAddresses = expectedAssets.map(({ target }) => target);

    // verify all expected assets are present
    const poolAssetAddresses = poolAssets.map(([assetAddress]) => assetAddress);
    expectedAssetAddresses.forEach(addr => expect(poolAssetAddresses).to.include(addr));

    // get all asset balances and convert to ETH values
    const assetValuesInEth = await Promise.all(
      expectedAssets.map(async asset => {
        const balance = await asset.balanceOf(pool.target);
        return asset.target === Assets.ETH ? balance : pool.getEthForAsset(asset.target, balance);
      }),
    );

    expect(totalAssetValue).to.be.equal(BigIntMath.sum(assetValuesInEth));
  });

  it('getMCRRatio calculates MCR ratio correctly', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture.contracts;

    const totalAssetValue = await pool.getPoolValueInEth();
    const mcr = await pool.getMCR();

    expect(totalAssetValue).to.be.gt(0n);
    expect(mcr).to.be.gt(0n);

    const MCR_RATIO_DECIMALS = await pool.MCR_RATIO_DECIMALS();
    const mcrRatio = await pool.getMCRRatio();
    const expectedMcrRatio = (totalAssetValue * 10n ** MCR_RATIO_DECIMALS) / mcr;

    expect(mcrRatio).to.be.gt(0n);
    expect(mcrRatio).to.be.equal(expectedMcrRatio);
  });
});
