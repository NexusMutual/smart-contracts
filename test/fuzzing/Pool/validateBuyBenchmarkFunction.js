const { ether } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { BN } = web3.utils;
const Decimal = require('decimal.js');
const {
  calculatePurchasedTokensWithFullIntegral,
  calculateMCRRatio,
  percentageBN,
  sellSpread,
  toDecimal,
} = require('../utils').tokenPrice;

const Pool = artifacts.require('Pool');
const MCR = artifacts.require('MCR');

/**
 *
 * Calculate the amount of tokens to be minted in exchange for deltaEthWei by
 * using the re-computed token spot price every stepSizeWei worth of ETH.
 * The stepSizeWei lower is, the more accurate the computation becomes.
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

function getPriceDecimal (mcrPercentage, mcrEth) {
  const A = 0.01028;
  const C = 5800000;
  const tokenExponent = 4;
  return toDecimal(A).add(toDecimal(mcrEth).div(C).mul(toDecimal(mcrPercentage).pow(tokenExponent)));
}

/**
 *  The purpose of this test is to evaluate the benchmarking function calculatePurchasedTokensWithFullIntegral
 *  used throughout the tests for measuring the accuracy of the NXM buy calculations. The benchmarking
 *  function is used because it executes quicker than other evaluations and it was automatically generated
 *  by the https://www.wolframalpha.com/ engine.
 *
 *  The rectangles method is used to approximate the value of tokens to be minted by making stepSize leaps
 *  in the ETH value being exchanged for NXM and recalculating the token spot price at each point and
 *  calculating the NXM to be minted in exchange for that stepSize chunk of ETH. Thus it makes for a valid standard
 *  for the benchmarking function if the stepSize has a low value (picked ethIn / 5000 as the stepSize)
 *
 */
describe('calculatePurchasedTokensWithFullIntegral', function () {

  const maxPercentage = 400;

  it('calculates minted tokens roughly equal to the small ETH rectangles method of mcrEth for mcrEth varying from mcrEth=8k to mcrEth=100 million', async function () {

    let mcrEth = ether('8000');
    const upperBound = ether(1e8.toString());
    while (true) {

      const initialAssetValue = mcrEth.mul(new BN(3)).div(new BN(4)); // 75% MCR%
      let ethIn = ether('0.01');
      const ethInUpperBound = mcrEth.div(new BN(20));
      const poolBalanceStep = mcrEth.div(new BN(4));
      const maxRelativeError = Decimal(0.0003);
      while (true) {
        console.log({
          ethIn: ethIn.toString(),
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
            ethIn: ethIn.toString(),
          });

          /*
            stepSize is dynamically calculated as a function of the ethIn. The lower it is the better in terms
            of approximation accuracy.
           */
          const stepSize = ethIn.divn(5000);
          const expectedNXMOut = calculateBuyTokensWithSmallRectangles(
            initialAssetValue,
            ethIn,
            mcrEth,
            stepSize,
          ).mul(1e18);
          const { tokens: nxmOut } = calculatePurchasedTokensWithFullIntegral(initialAssetValue, ethIn, mcrEth);

          const nxmOutDecimal = Decimal(nxmOut.toString());
          const relativeError = expectedNXMOut.sub(nxmOutDecimal).abs().div(expectedNXMOut);
          console.log({ relativeError: relativeError.toString() });
          assert(
            relativeError.lt(maxRelativeError),
            `Resulting token value ${nxmOutDecimal.toFixed()} is not close enough to expected ${expectedNXMOut.toFixed()}
             Relative error: ${relativeError}.
             Params: initialAssetValue = ${initialAssetValue.toString()}
             ethIn = ${ethIn.toString()}
             mcrEth = ${mcrEth.toString()}
             stepSize = ${stepSize.toString()}
             `,
          );

          totalAssetValue = totalAssetValue.add(poolBalanceStep);
          mcrRatio = calculateMCRRatio(totalAssetValue, mcrEth);
        }
        if (ethIn.eq(ethInUpperBound)) {
          break;
        }
        ethIn = BN.min(ethIn.mul(new BN(2)), ethInUpperBound);
      }

      if (mcrEth.eq(upperBound)) {
        break;
      }
      mcrEth = BN.min(mcrEth.mul(new BN(2)), upperBound);
    }
  });
});
