const { BigNumber } = require('ethers');
const { roundUpToNearestAllocationUnit, divCeil } = require('../../unit/StakingPool/helpers');
const { ETH_ASSET_ID } = require('./cover');

// Set assetToEthRate to 0 for ETH
async function assetToEthWithPrecisionLoss(pool, coverAmountInAsset, assetToEthRate, config) {
  let expectedAmountETH = coverAmountInAsset;

  // convert to ETH if there is an exchange rate
  if (!BigNumber.from(assetToEthRate).isZero()) {
    expectedAmountETH = roundUpToNearestAllocationUnit(
      BigNumber.from(assetToEthRate).mul(coverAmountInAsset).div(config.ONE_NXM),
      config.NXM_PER_ALLOCATION_UNIT,
    );
  }

  // Get NXM/ETH price
  const nxmEthPrice = await pool.getTokenPriceInAsset(ETH_ASSET_ID);

  // convert to NXM and back to ETH with same precision loss as contracts
  const coverAmountInNXM = roundUpToNearestAllocationUnit(
    divCeil(BigNumber.from(expectedAmountETH).mul(config.ONE_NXM), nxmEthPrice),
    config.NXM_PER_ALLOCATION_UNIT,
  );

  return coverAmountInNXM.mul(nxmEthPrice).div(config.ONE_NXM);
}
async function assetToNXM(pool, amountInAsset, assetID, config) {
  const nxmPriceInCoverAsset = BigNumber.from(await pool.getTokenPriceInAsset(assetID));
  const assetWithDecimals = BigNumber.from(amountInAsset).mul(config.ONE_NXM);
  const amountInNXMRaw = divCeil(assetWithDecimals, nxmPriceInCoverAsset);
  const amountInNXM = roundUpToNearestAllocationUnit(amountInNXMRaw, config.NXM_PER_ALLOCATION_UNIT);
  return amountInNXM;
}

async function NXMToAsset(pool, amountInNXM, assetID, config) {
  const nxmPriceInCoverAsset = BigNumber.from(await pool.getTokenPriceInAsset(assetID));
  const nxmWithDecimals = BigNumber.from(amountInNXM).mul(config.ONE_NXM);
  const amountInAssetRaw = divCeil(nxmWithDecimals, nxmPriceInCoverAsset);
  const amountInAsset = roundUpToNearestAllocationUnit(amountInAssetRaw, config.NXM_PER_ALLOCATION_UNIT);
  return amountInAsset;
}

// Converts amount in asset to NXM and back to asset with precision loss
async function assetWithPrecisionLoss(pool, amountInAsset, assetID, config) {
  const nxmPriceInCoverAsset = BigNumber.from(await pool.getTokenPriceInAsset(assetID));
  const nxmRoundedUp = BigNumber.from(amountInAsset).mul(config.ONE_NXM);
  const amountInNXMRaw = divCeil(nxmRoundedUp, nxmPriceInCoverAsset);
  const amountInNXM = roundUpToNearestAllocationUnit(amountInNXMRaw, config.NXM_PER_ALLOCATION_UNIT);
  return amountInNXM.mul(nxmPriceInCoverAsset).div(config.ONE_NXM);
}

module.exports = { assetToEthWithPrecisionLoss, assetWithPrecisionLoss, assetToNXM, NXMToAsset };
