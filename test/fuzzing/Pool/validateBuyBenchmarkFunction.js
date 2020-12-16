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
 * @param Vt0
 * @param deltaETH
 * @param MCReth
 * @param stepSize
 * @returns {*}
 */
function calculateBuyTokensWithSmallRectangles (Vt0, deltaETH, MCReth, stepSize) {

  Vt0 = toDecimal(Vt0).div(1e18);
  deltaETH = toDecimal(deltaETH).div(1e18);
  MCReth = toDecimal(MCReth).div(1e18);
  stepSize = stepSize ? toDecimal(stepSize).div(1e18) : Decimal(0.01);
  const Vt1 = Vt0.add(deltaETH);
  let previousV;
  let currentV = Vt0;
  let previousPrice;
  let totalTokens = Decimal(0);

  let iterations = 0;
  while (deltaETH.gt('0')) {
    const MCRPerc = currentV.div(MCReth);
    const currentPrice = getPriceDecimal(MCRPerc, MCReth);
    if (previousPrice && previousV) {
      const averagePrice = currentPrice.add(previousPrice).div(2);
      const deltaTokens = currentV.sub(previousV).div(averagePrice);
      totalTokens = totalTokens.add(deltaTokens);
    }
    previousV = currentV;
    previousPrice = currentPrice;
    currentV = currentV.add(stepSize);
    deltaETH = deltaETH.sub(stepSize);
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

      const initialAssetValue = mcrEth.mul(new BN(3)).div(new BN(4));
      let buyValue = ether('0.01');
      const buyValueUpperBound = mcrEth.div(new BN(20));
      const poolBalanceStep = mcrEth.div(new BN(4));
      const maxRelativeError = Decimal(0.0020);
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

          const stepSize = buyValue.divn(1000);
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
       Relative error: ${relativeError}`,
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
