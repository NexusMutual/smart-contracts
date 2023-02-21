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
  const nxmPriceInCoverAsset = await pool.getTokenPriceInAsset(ETH_ASSET_ID);

  // convert to NXM and back to ETH with same precision loss as contracts
  const coverAmountInNXM = roundUpToNearestAllocationUnit(
    divCeil(BigNumber.from(expectedAmountETH).mul(config.ONE_NXM), nxmPriceInCoverAsset),
    config.NXM_PER_ALLOCATION_UNIT,
  );

  return coverAmountInNXM.mul(nxmPriceInCoverAsset).div(config.ONE_NXM);
}

module.exports = { assetToEthWithPrecisionLoss };
