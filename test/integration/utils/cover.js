const { ethers } = require('hardhat');

const { parseEther, parseUnits } = ethers.utils;
const { AddressZero } = ethers.constants;

const ETH_ASSET_ID = 0;
const DAI_ASSET_ID = 1;
const STETH_ASSET_ID = 2;
const ENZYME_ASSET_ID = 3;
const USDC_ASSET_ID = 4;

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

module.exports = {
  buyCover,
  transferCoverAsset,
  ETH_ASSET_ID,
  DAI_ASSET_ID,
  STETH_ASSET_ID,
  ENZYME_ASSET_ID,
  USDC_ASSET_ID,
};
