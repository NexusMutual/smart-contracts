const { ethers } = require('hardhat');

const { daysToSeconds } = require('../../../lib/helpers');

const { parseEther, parseUnits } = ethers.utils;
const { AddressZero } = ethers.constants;

const ETH_ASSET_ID = 0;
const DAI_ASSET_ID = 1;
const STETH_ASSET_ID = 2;
const ENZYME_ASSET_ID = 3;
const USDC_ASSET_ID = 4;
const COVER_PRICE_DENOMINATOR = 10000;

async function buyCover({
  amount,
  productId,
  coverAsset,
  period,
  cover,
  coverBuyer,
  targetPrice,
  priceDenominator,
  expectedPremium = 0,
}) {
  // Buy Cover
  if (!expectedPremium) {
    expectedPremium = amount.mul(targetPrice).div(priceDenominator);
  }

  await cover.connect(coverBuyer).buyCover(
    {
      owner: coverBuyer.address,
      coverId: 0,
      productId,
      coverAsset,
      amount,
      period,
      maxPremiumInAsset: expectedPremium,
      paymentAsset: coverAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
    },
    [{ poolId: 1, coverAmountInAsset: amount }],
    { value: coverAsset === ETH_ASSET_ID ? expectedPremium : 0 },
  );
}

async function transferCoverAsset({ tokenOwner, coverBuyer, asset, cover }) {
  const decimals = await asset.decimals();
  const amount = parseUnits('100', decimals);

  await asset.connect(tokenOwner).transfer(coverBuyer.address, amount);
  await asset.connect(coverBuyer).approve(cover.address, amount);
}

function calculatePremium(amount, rate, period, price, allocationUnit) {
  const nxmAmount = amount.mul(parseEther('1')).div(rate);

  const coverNXMAmount = nxmAmount.mod(allocationUnit).eq(0)
    ? nxmAmount
    : nxmAmount.div(allocationUnit).add(1).mul(allocationUnit);

  const premiumInNxm = coverNXMAmount.mul(price).div(COVER_PRICE_DENOMINATOR).mul(period).div(daysToSeconds(365));

  const premiumInAsset = premiumInNxm.mul(rate).div(parseEther('1'));

  return { premiumInNxm, premiumInAsset, coverNXMAmount };
}

module.exports = {
  buyCover,
  transferCoverAsset,
  calculatePremium,
  ETH_ASSET_ID,
  DAI_ASSET_ID,
  STETH_ASSET_ID,
  ENZYME_ASSET_ID,
  USDC_ASSET_ID,
};
