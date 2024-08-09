const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setEtherBalance } = require('../../utils/evm');
const { getInternalPrice } = require('../../utils/rammCalculations');
const { ETH_ASSET_ID } = require('../utils/cover');
const { stake } = require('../utils/staking');
const { daysToSeconds } = require('../../../lib/helpers');
const { PoolAsset } = require('../../../lib/constants');
const setup = require('../setup');

const { parseEther, parseUnits } = ethers.utils;
const { MaxUint256 } = ethers.constants;
const { BigNumber } = ethers;

const ETH_ASSET = { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' };

const ethCoverTemplate = {
  productId: 0, // DEFAULT_PRODUCT
  coverAsset: ETH_ASSET_ID, // ETH
  period: daysToSeconds(30), // 30 days
  gracePeriod: daysToSeconds(30),
  amount: parseEther('1'),
  priceDenominator: 10000,
  coverId: 0,
  segmentId: 0,
  incidentId: 0,
  assessmentId: 0,
};

async function tokenPriceSetup() {
  const fixture = await loadFixture(setup);
  const { tk, stakingPool1: stakingPool, tc } = fixture.contracts;
  const [member1] = fixture.accounts.members;

  const operator = await tk.operator();
  await setEtherBalance(operator, parseEther('10000000'));
  await tk.connect(await ethers.getImpersonatedSigner(operator)).mint(member1.address, parseEther('1000000000000'));

  await tk.connect(member1).approve(tc.address, MaxUint256);
  await stake({
    contracts: fixture.contracts,
    stakingPool,
    staker: member1,
    productId: ethCoverTemplate.productId,
    period: daysToSeconds(60),
    gracePeriod: daysToSeconds(30),
    amount: parseEther('1000000'),
  });

  return fixture;
}

describe('Pool functions', function () {
  it('getInternalTokenPriceInAsset returns spot price for all assets', async function () {
    const fixture = await loadFixture(tokenPriceSetup);
    const { p1: pool, mcr, tc, ra } = fixture.contracts;
    const { ethToDaiRate } = fixture.rates;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const expectedTokenPriceInEth = await getInternalPrice(ra, pool, tc, mcr, timestamp);
    const expectedTokenPriceInDai = BigNumber.from(ethToDaiRate / 100).mul(expectedTokenPriceInEth);

    const ethTokenPrice = await pool.getInternalTokenPriceInAsset(PoolAsset.ETH);
    const daiTokenPrice = await pool.getInternalTokenPriceInAsset(PoolAsset.DAI);

    expect(ethTokenPrice).to.be.equal(expectedTokenPriceInEth);
    expect(daiTokenPrice).to.be.equal(expectedTokenPriceInDai);
  });

  it('getPoolValueInEth calculates pool value correctly', async function () {
    const fixture = await loadFixture(tokenPriceSetup);
    const { p1: pool, dai, usdc, stETH, rETH, st, enzymeVault } = fixture.contracts;
    const { daiToEthRate, usdcToEthRate, nxmtyToEthRate } = fixture.rates;
    const { USDC_DECIMALS } = fixture.config;

    const totalAssetValue = await pool.getPoolValueInEth();
    const poolBalance = BigNumber.from(await ethers.provider.getBalance(pool.address));

    // NOTE: any new pool assets must be added here
    const allAssets = [dai, stETH, enzymeVault, usdc, rETH, st];
    const poolAssets = (await pool.getAssets()).map(asset => asset[0]);
    expect(poolAssets).to.be.lengthOf([ETH_ASSET, ...allAssets].length);
    [ETH_ASSET, ...allAssets].forEach(asset => expect(poolAssets).to.include(asset.address));

    const balancePromises = allAssets.map(asset => asset.balanceOf(pool.address));
    const [daiBal, stEthBal, nxmtyBal, usdcBal, rEthBal, stBal] = await Promise.all(balancePromises);

    const expectedDaiValueInEth = daiToEthRate.mul(daiBal).div(parseEther('1'));
    const expectedUsdcValueInEth = usdcToEthRate.mul(usdcBal).div(parseUnits('1', USDC_DECIMALS));
    const expectedNxmtyValueInEth = nxmtyToEthRate.mul(nxmtyBal).div(parseEther('1'));

    const expectedTotalAssetValue = poolBalance
      .add(expectedDaiValueInEth)
      .add(expectedUsdcValueInEth)
      .add(expectedNxmtyValueInEth)
      .add(stEthBal)
      .add(rEthBal)
      .add(stBal);
    expect(totalAssetValue.toString()).to.be.equal(expectedTotalAssetValue.toString());
  });

  it('getMCRRatio calculates MCR ratio correctly', async function () {
    const fixture = await loadFixture(tokenPriceSetup);
    const { p1: pool, mcr } = fixture.contracts;

    const MCR_RATIO_DECIMALS = 4;
    const totalAssetValue = await pool.getPoolValueInEth();
    const mcrEth = await mcr.getMCR();
    const expectedMcrRatio = totalAssetValue.mul(BigNumber.from(10).pow(MCR_RATIO_DECIMALS)).div(mcrEth);

    const mcrRatio = await pool.getMCRRatio();
    expect(mcrRatio).to.be.equal(expectedMcrRatio);
  });
});
