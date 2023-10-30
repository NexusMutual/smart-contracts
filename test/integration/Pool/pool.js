const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setEtherBalance } = require('../../utils/evm');
const { getInternalPrice } = require('../../utils/internalPrice');
const { ETH_ASSET_ID } = require('../utils/cover');
const { stake } = require('../utils/staking');
const { daysToSeconds } = require('../../../lib/helpers');
const { PoolAsset } = require('../../../lib/constants');
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
