const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { AggregatorType, Assets } = require('../utils').constants;
const { toBytes8 } = require('../utils').helpers;

const { AddressZero, WeiPerEther } = ethers.constants;

describe('addAsset', function () {
  it('reverts when not called by goverance', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;

    await expect(pool.addAsset(AddressZero, true, '0', '1', '0')).to.be.revertedWith(
      'Caller is not authorized to govern',
    );

    await expect(pool.addAsset(AddressZero, false, '0', '1', '0')).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });

  it('reverts when asset address is zero address', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const [governance] = fixture.accounts.governanceContracts;

    await expect(pool.connect(governance).addAsset(AddressZero, false, '0', '1', '0')).to.be.revertedWith(
      'Pool: Asset is zero address',
    );
  });

  it('reverts when max < min', async function () {
    const fixture = await loadFixture(setup);
    const { pool, otherAsset } = fixture;
    const [governance] = fixture.accounts.governanceContracts;

    await expect(pool.connect(governance).addAsset(otherAsset.address, true, '1', '0', '0')).to.be.revertedWith(
      'Pool: max < min',
    );
  });

  it('reverts when max slippage ratio > 1', async function () {
    const fixture = await loadFixture(setup);
    const { pool, otherAsset } = fixture;
    const [governance] = fixture.accounts.governanceContracts;
    await expect(
      pool.connect(governance).addAsset(otherAsset.address, true, '0', '1', '10001' /* 100.01% */),
    ).to.be.revertedWith('Pool: Max slippage ratio > 1');

    // should work with slippage rate = 1
    await pool.connect(governance).addAsset(otherAsset.address, true, '0', '1', '10000');
  });

  it('reverts when asset exists', async function () {
    const fixture = await loadFixture(setup);
    const { pool, dai } = fixture;
    const [governance] = fixture.accounts.governanceContracts;

    await expect(pool.connect(governance).addAsset(dai.address, false, '0', '1', '0')).to.be.revertedWith(
      'Pool: Asset exists',
    );
  });

  it('reverts when asset lacks an oracle', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const [governance] = fixture.accounts.governanceContracts;

    const arbitraryAddress = '0x47ec31abc6b86e49933dC7B2969EBEbE3De662cA';

    await expect(pool.connect(governance).addAsset(arbitraryAddress, true, '0', '1', '0')).to.be.revertedWith(
      'Pool: PriceFeedOracle lacks aggregator for asset',
    );
  });

  it('should add assets setting min, max, slippage ratio, and their bool flags', async function () {
    const fixture = await loadFixture(setup);
    const { pool, dai, stETH, enzymeVault, st } = fixture;
    const { chainlinkDAI, chainlinkSteth, chainlinkEnzymeVault, chainlinkEthUsdAsset } = fixture;
    const [governance] = fixture.accounts.governanceContracts;

    const coverToken = await ethers.deployContract('ERC20Mock');
    const clCoverToken = await ethers.deployContract('ChainlinkAggregatorMock');
    await clCoverToken.setLatestAnswer(WeiPerEther);

    const investmentToken = await ethers.deployContract('ERC20Mock');
    const clInvestmentToken = await ethers.deployContract('ChainlinkAggregatorMock');
    await clInvestmentToken.setLatestAnswer(WeiPerEther);

    const priceFeedOracle = await ethers.deployContract('PriceFeedOracle', [
      [dai, stETH, enzymeVault, coverToken, investmentToken, { address: Assets.ETH }].map(c => c.address),
      [chainlinkDAI, chainlinkSteth, chainlinkEnzymeVault, clCoverToken, clInvestmentToken, chainlinkEthUsdAsset].map(
        c => c.address,
      ),
      [
        AggregatorType.ETH,
        AggregatorType.ETH,
        AggregatorType.ETH,
        AggregatorType.ETH,
        AggregatorType.ETH,
        AggregatorType.USD,
      ],
      [18, 18, 18, 18, 18, 18],
      st.address,
    ]);

    const assetsBefore = await pool.getAssets();

    await pool.connect(governance).updateAddressParameters(toBytes8('PRC_FEED'), priceFeedOracle.address);
    await pool.connect(governance).addAsset(coverToken.address, true, '1', '2', '3');
    await pool.connect(governance).addAsset(investmentToken.address, false, '4', '5', '6');

    const assets = await pool.getAssets();
    const [ethAsset, daiAsset, stEthAsset, enzymeAsset, coverAsset, investmentAsset] = assets;

    const coverAssetSwapDetails = await pool.getAssetSwapDetails(coverToken.address);
    const investmentAssetSwapDetails = await pool.getAssetSwapDetails(investmentToken.address);

    // initial assets should have not changed
    expect([ethAsset, daiAsset, stEthAsset, enzymeAsset]).to.be.deep.equal(assetsBefore);

    expect(coverAsset.assetAddress).to.be.equal(coverToken.address);
    expect(coverAsset.isCoverAsset).to.be.equal(true);
    expect(coverAsset.isAbandoned).to.be.equal(false);

    expect(coverAssetSwapDetails.minAmount).to.be.equal(1);
    expect(coverAssetSwapDetails.maxAmount).to.be.equal(2);
    expect(coverAssetSwapDetails.maxSlippageRatio).to.be.equal(3);
    expect(coverAssetSwapDetails.lastSwapTime).to.be.equal(0);

    expect(investmentAsset.assetAddress).to.be.equal(investmentToken.address);
    expect(investmentAsset.isCoverAsset).to.be.equal(false);
    expect(coverAsset.isAbandoned).to.be.equal(false);

    expect(investmentAssetSwapDetails.minAmount).to.be.equal(4);
    expect(investmentAssetSwapDetails.maxAmount).to.be.equal(5);
    expect(investmentAssetSwapDetails.maxSlippageRatio).to.be.equal(6);
    expect(investmentAssetSwapDetails.lastSwapTime).to.be.equal(0);
  });
});
