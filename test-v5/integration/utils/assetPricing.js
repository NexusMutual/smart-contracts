const { BigNumber } = require('ethers');
const { divCeil } = require('../utils').bnMath;
const { roundUpToNearestAllocationUnit } = require('../../unit/StakingPool/helpers');

// Set assetToEthRate to 0 for ETH
async function assetToEthWithPrecisionLoss(coverAmountInAsset, assetToEthRate, config, nxmEthPrice) {
  let expectedAmountETH = coverAmountInAsset;

  // convert to ETH if there is an exchange rate
  if (!BigNumber.from(assetToEthRate).isZero()) {
    expectedAmountETH = roundUpToNearestAllocationUnit(
      BigNumber.from(assetToEthRate).mul(coverAmountInAsset).div(config.ONE_NXM),
      config.NXM_PER_ALLOCATION_UNIT,
    );
  }

  // convert to NXM and back to ETH with same precision loss as contracts
  const coverAmountInNXM = roundUpToNearestAllocationUnit(
    divCeil(BigNumber.from(expectedAmountETH).mul(config.ONE_NXM), nxmEthPrice),
    config.NXM_PER_ALLOCATION_UNIT,
  );

  return coverAmountInNXM.mul(nxmEthPrice).div(config.ONE_NXM);
}

// Replicates the amount stored when buying cover with asset other than NXM
async function assetWithPrecisionLoss(pool, amountInAsset, assetID, config) {
  const nxmPriceInCoverAsset = await pool.getInternalTokenPriceInAsset(assetID);
  const amountInNXM = roundUpToNearestAllocationUnit(
    divCeil(amountInAsset.mul(config.ONE_NXM), nxmPriceInCoverAsset),
    config.NXM_PER_ALLOCATION_UNIT,
  );
  return amountInNXM.mul(nxmPriceInCoverAsset).div(config.ONE_NXM);
}

module.exports = {
  assetToEthWithPrecisionLoss,
  assetWithPrecisionLoss,
};
