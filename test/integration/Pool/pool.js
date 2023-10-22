const { ethers } = require('hardhat');
const { assert } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setEtherBalance } = require('../../utils/evm');
const { ETH_ASSET_ID } = require('../utils/cover');
const { daysToSeconds } = require('../../../lib/helpers');
const { stake } = require('../utils/staking');

const setup = require('../setup');

const { parseEther } = ethers.utils;
const { MaxUint256 } = ethers.constants;
const { BigNumber } = ethers;

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
  // TODO: fix this test
  // it.skip('getInternalTokenPriceInAsset returns spot price for all assets', async function () {
  //   const fixture = await loadFixture(tokenPriceSetup);
  //   const { p1: pool, mcr } = fixture.contracts;
  //   const { ethToDaiRate } = fixture.rates;
  //
  //   const ethTokenPrice = await pool.getInternalTokenPriceInAsset(0);
  //   const daiTokenPrice = await pool.getInternalTokenPriceInAsset(1);
  //
  //   const totalAssetValue = await pool.getPoolValueInEth();
  //   const mcrEth = await mcr.getMCR();
  //   const expectedEthTokenPrice = BigNumber.from(getTokenSpotPrice(totalAssetValue, mcrEth).toString());
  //
  //   const ethPriceDiff = ethTokenPrice.sub(expectedEthTokenPrice).abs();
  //   assert(
  //     ethPriceDiff.lte(BigNumber.from(1)),
  //     `token price ${ethTokenPrice.toString()} not close enough to ${expectedEthTokenPrice.toString()}`,
  //   );
  //
  //   const expectedDaiPrice = BigNumber.from(ethToDaiRate / 100).mul(expectedEthTokenPrice);
  //   const daiPriceDiff = daiTokenPrice.sub(expectedDaiPrice);
  //   assert(
  //     daiPriceDiff.lte(BigNumber.from(10000)), // negligible amount of wei
  //     `DAI token price ${daiTokenPrice.toString()} not close enough to ${expectedDaiPrice.toString()}`,
  //   );
  // });

  it('getPoolValueInEth calculates pool value correctly', async function () {
    const fixture = await loadFixture(tokenPriceSetup);
    const { p1: pool, dai } = fixture.contracts;
    const { daiToEthRate } = fixture.rates;

    const poolBalance = BigNumber.from(await ethers.provider.getBalance(pool.address));
    const daiBalance = await dai.balanceOf(pool.address);
    const expectedDAiValueInEth = daiToEthRate.mul(daiBalance).div(parseEther('1'));
    const expectedTotalAssetValue = poolBalance.add(expectedDAiValueInEth);
    const totalAssetValue = await pool.getPoolValueInEth();
    assert(totalAssetValue.toString(), expectedTotalAssetValue.toString());
  });

  it('getMCRRatio calculates MCR ratio correctly', async function () {
    const fixture = await loadFixture(tokenPriceSetup);
    const { p1: pool } = fixture.contracts;
    const mcrRatio = await pool.getMCRRatio();
    assert.equal(mcrRatio.toString(), '22000'); // ETH + DAI + USDC
  });
});
