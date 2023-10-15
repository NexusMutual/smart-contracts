const { ethers } = require('hardhat');
const { daysToSeconds } = require('../../../lib/helpers');
const { BigNumber } = require('ethers');

const { parseEther, parseUnits } = ethers.utils;
const { AddressZero } = ethers.constants;

const ETH_ASSET_ID = 0;
const DAI_ASSET_ID = 1;
const STETH_ASSET_ID = 2;
const ENZYME_ASSET_ID = 3;
const USDC_ASSET_ID = 4;
const PRICE_DENOMINATOR = 10000;

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

  const premiumInNxm = coverNXMAmount.mul(price).div(PRICE_DENOMINATOR).mul(period).div(daysToSeconds(365));

  const premiumInAsset = premiumInNxm.mul(rate).div(parseEther('1'));

  return { premiumInNxm, premiumInAsset };
}

function assetAmountToNXMAmount(amount, rate, allocationUnit) {
  const nxmAmount = amount.mul(parseEther('1')).div(rate);

  const coverNXMAmount = nxmAmount.mod(allocationUnit).eq(0)
    ? nxmAmount
    : nxmAmount.div(allocationUnit).add(1).mul(allocationUnit);

  return coverNXMAmount;
}
async function calculateEditPremium({
  amount,
  period,
  extraPeriod,
  timestampAtEditTime,
  startOfPreviousSegment,
  increasedAmount,
  ethRate,
  productBumpedPrice,
  NXM_PER_ALLOCATION_UNIT,
  coverAmountInNXM = BigNumber.from(1),
  totalCoverAmountInNXM = BigNumber.from(1),
}) {
  // adding 1 to account for block.timestamp = timestampAtEditTime + 1 at transaction time
  const remainingPeriod = BigNumber.from(period).sub(
    BigNumber.from(timestampAtEditTime).add(1).sub(startOfPreviousSegment),
  );

  const newPeriod = remainingPeriod.add(extraPeriod);

  const oldSegmentAmountInNXMRepriced = assetAmountToNXMAmount(amount, ethRate, NXM_PER_ALLOCATION_UNIT)
    .mul(coverAmountInNXM)
    .div(totalCoverAmountInNXM);

  const increasedAmountInNXM = assetAmountToNXMAmount(increasedAmount, ethRate, NXM_PER_ALLOCATION_UNIT);

  const extraAmount = increasedAmountInNXM.sub(oldSegmentAmountInNXMRepriced);

  const { premiumInNxm } = calculatePremium(
    increasedAmount,
    ethRate,
    newPeriod,
    productBumpedPrice,
    NXM_PER_ALLOCATION_UNIT,
  );

  function calculateExtraPremium(fullPremium) {
    return fullPremium
      .mul(extraAmount.gt(0) ? extraAmount : BigNumber.from(0))
      .mul(remainingPeriod)
      .div(increasedAmountInNXM)
      .div(newPeriod)
      .add(fullPremium.mul(extraPeriod).div(newPeriod));
  }

  const extraPremiumInNXM = calculateExtraPremium(premiumInNxm);

  const extraPremium = extraPremiumInNXM.mul(ethRate).div(parseEther('1'));

  return { extraPremium, extraPremiumInNXM, newPeriod };
}

module.exports = {
  buyCover,
  transferCoverAsset,
  calculatePremium,
  calculateEditPremium,
  ETH_ASSET_ID,
  DAI_ASSET_ID,
  STETH_ASSET_ID,
  ENZYME_ASSET_ID,
  USDC_ASSET_ID,
};
