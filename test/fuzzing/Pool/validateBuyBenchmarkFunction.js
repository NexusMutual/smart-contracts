const { ether } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { BN } = web3.utils;
const Decimal = require('decimal.js');
const {
  calculatePurchasedTokensWithFullIntegral,
  calculateMCRRatio,
  percentageBN,
  sellSpread,
  toDecimal
} = require('../utils').tokenPrice;

const Pool = artifacts.require('Pool');
const MCR = artifacts.require('MCR');
const SwapAgent = artifacts.require('SwapAgent');

/**
 *
 * @param initialAssetValueWei
 * @param deltaEthWei
 * @param mcrEthWei
 * @param stepSizeWei
 * @returns {*}
 */
function calculateBuyTokensWithSmallRectangles (initialAssetValueWei, deltaEthWei, mcrEthWei, stepSizeWei) {

  const initialAssetValue = toDecimal(initialAssetValueWei).div(1e18);
  let deltaEth = toDecimal(deltaEthWei).div(1e18);
  const mcrEth = toDecimal(mcrEthWei).div(1e18);
  const stepSize = stepSizeWei ? toDecimal(stepSizeWei).div(1e18) : Decimal(0.01);
  let previousAssetValue;
  let currentAssetValue = initialAssetValue;
  let previousPrice;
  let totalTokens = Decimal(0);

  let iterations = 0;
  while (deltaEth.gt('0')) {
    const mcrPercentage = currentAssetValue.div(mcrEth);
    const currentPrice = getPriceDecimal(mcrPercentage, mcrEth);
    if (previousPrice && previousAssetValue) {
      const averagePrice = currentPrice.add(previousPrice).div(2);
      const deltaTokens = currentAssetValue.sub(previousAssetValue).div(averagePrice);
      totalTokens = totalTokens.add(deltaTokens);
    }
    previousAssetValue = currentAssetValue;
    previousPrice = currentPrice;
    currentAssetValue = currentAssetValue.add(stepSize);
    deltaEth = deltaEth.sub(stepSize);
    iterations++;
  }

  return totalTokens;
}

function getPriceDecimal (MCRPerc, MCReth) {
  const A = 0.01028;
  const C = 5800000;
  const tokenExponent = 4;
  return Decimal(A).add(Decimal(MCReth).div(C).mul(Decimal(MCRPerc).pow(tokenExponent)));
}

describe('calculatePurchasedTokensWithFullIntegral', function () {

  const maxPercentage = 400;

  it.only('mints bought tokens to member in exchange of 5% ETH of mcrEth for mcrEth varying from mcrEth=8k to mcrEth=100 million', async function () {

    let mcrEth = ether('8000');
    const upperBound = ether(1e8.toString());
    while (true) {

      const initialAssetValue = mcrEth.mul(new BN(3)).div(new BN(4)); // 75% MCR%
      let buyValue = ether('0.01');
      const buyValueUpperBound = mcrEth.div(new BN(20));
      const poolBalanceStep = mcrEth.div(new BN(4));
      const maxRelativeError = Decimal(0.0003);
      while (true) {
        console.log({
          buyValue: buyValue.toString(),
          mcrEth: mcrEth.toString(),
          initialAssetValue: initialAssetValue.toString(),
        });

        let totalAssetValue = initialAssetValue;
        let mcrRatio = calculateMCRRatio(totalAssetValue, mcrEth);
        console.log({
          mcrRatio: mcrRatio.toString(),
        });
        while (mcrRatio.lt(new BN(maxPercentage).muln(100))) {
          console.log({
            mcrRatio: mcrRatio.toString(),
            mcrEth: mcrEth.toString(),
            totalAssetValue: totalAssetValue.toString(),
            buyValue: totalAssetValue.toString(),
          });

          const stepSize = buyValue.divn(5000);
          const expectedNXMOut = calculateBuyTokensWithSmallRectangles(
            initialAssetValue,
            buyValue,
            mcrEth,
            stepSize
          ).mul(1e18);
          const { tokens: nxmOut } = calculatePurchasedTokensWithFullIntegral(initialAssetValue, buyValue, mcrEth);

          const nxmOutDecimal = Decimal(nxmOut.toString());
          const relativeError = expectedNXMOut.sub(nxmOutDecimal).abs().div(expectedNXMOut);
          console.log({ relativeError: relativeError.toString() });
          assert(
            relativeError.lt(maxRelativeError),
            `Resulting token value ${nxmOutDecimal.toFixed()} is not close enough to expected ${expectedNXMOut.toFixed()}
             Relative error: ${relativeError}.
             Params: initialAssetValue = ${initialAssetValue.toString()}
             buyValue = ${buyValue.toString()}
             mcrEth = ${mcrEth.toString()}
             stepSize = ${stepSize.toString()}
             `,
          );

          totalAssetValue = totalAssetValue.add(poolBalanceStep);
          mcrRatio = calculateMCRRatio(totalAssetValue, mcrEth);
        }
        if (buyValue.eq(buyValueUpperBound)) {
          break;
        }
        buyValue = BN.min(buyValue.mul(new BN(2)), buyValueUpperBound);
      }

      if (mcrEth.eq(upperBound)) {
        break;
      }
      mcrEth = BN.min(mcrEth.mul(new BN(2)), upperBound);
    }
  });
});
