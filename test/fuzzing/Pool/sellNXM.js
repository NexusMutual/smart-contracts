const { ether } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { BN } = web3.utils;
const Decimal = require('decimal.js');
const setup = require('./setup');

const {
  calculatePurchasedTokensWithFullIntegral,
  calculateMCRRatio,
  percentageBN,
  sellSpread,
} = require('../utils').tokenPrice;

const Pool = artifacts.require('Pool');
const MCR = artifacts.require('MCR');

async function setupAll () {
  this.contracts = await setup({ MCR, Pool });
}

describe('sellNXM', function () {

  before(setupAll);

  const maxPercentage = 400;

  it('burns tokens from member in exchange for 5% of mcrEth for mcrEth varying from mcrEth=8k to mcrEth=100 million', async function () {
    const { pool } = this.contracts;

    let mcrEth = ether('8000');
    const upperBound = ether(1e8.toString());
    while (true) {

      const initialAssetValue = percentageBN(mcrEth, 100);
      let buyValue = ether('0.1');
      const buyValueUpperBound = mcrEth.div(new BN(100)); // 1% of MCReth
      const poolBalanceStep = mcrEth.div(new BN(4));
      const maxRelativeError = Decimal(0.002);

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
            totalAssetValue: totalAssetValue.toString(),
            mcrPercentage: mcrRatio.toString(),
          });

          let nxmOut;
          if (mcrRatio.lt(new BN(maxPercentage).muln(400))) {
            nxmOut = await pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);
          } else {
            const nxmOutDecimal = calculatePurchasedTokensWithFullIntegral(initialAssetValue, buyValue, mcrEth);
            nxmOut = new BN(nxmOutDecimal.toString());
          }

          const totalAssetValueAtSellTime = totalAssetValue.add(buyValue);
          const ethOutBN = await pool.calculateEthForNXM(nxmOut, totalAssetValueAtSellTime, mcrEth);
          const ethOut = Decimal(ethOutBN.toString());

          const expectedEthOut = Decimal(buyValue.toString()).mul(Decimal(1).sub(sellSpread));

          const relativeErrorForSell = expectedEthOut.sub(ethOut).abs().div(expectedEthOut);
          console.log({ relativeError: relativeErrorForSell.toString() });

          assert(
            relativeErrorForSell.lt(maxRelativeError),
            `Resulting eth value ${ethOut.toFixed()} is not close enough to expected ${expectedEthOut.toFixed()}
              Relative error: ${relativeErrorForSell}`,
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
