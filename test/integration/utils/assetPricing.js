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

// Replicates the amount stored when buying cover with asset other than NXM
async function assetWithPrecisionLoss(pool, amountInAsset, assetID, config) {
  const nxmPriceInCoverAsset = await pool.getTokenPriceInAsset(assetID);
  const amountInNXM = roundUpToNearestAllocationUnit(
    divCeil(amountInAsset.mul(config.ONE_NXM), nxmPriceInCoverAsset),
    config.NXM_PER_ALLOCATION_UNIT,
  );
  return amountInNXM.mul(nxmPriceInCoverAsset).div(config.ONE_NXM);
}

module.exports = { assetToEthWithPrecisionLoss, assetWithPrecisionLoss };
