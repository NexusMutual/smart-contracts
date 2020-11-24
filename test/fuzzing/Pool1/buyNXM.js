
const { ether, expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { assert } = require('chai');
const { BN } = web3.utils;
const Decimal = require('decimal.js');
const { accounts } = require('../utils');
const { calculatePurchasedTokensWithFullIntegral, calculateMCRRatio } = require('../../unit/utils').tokenPrice;
const { hex } = require('../utils').helpers;
const snapshot = require('../utils').snapshot;
const setup = require('./setup');

const {
  nonMembers: [fundSource],
  members: [member1],
} = accounts;

const Pool1 = artifacts.require('Pool1');
const MCR = artifacts.require('MCR');

async function setupAll () {
  this.contracts = await setup({ MCR, Pool1 });
}

describe('buyNXM', function () {

  before(setupAll);

  const daiRate = new BN('39459');
  const ethRate = new BN('100');
  const maxPercentage = 400;

  it('mints bought tokens to member in exchange of 5% ETH of mcrEth for mcrEth varying from mcrEth=8k to mcrEth=100 million', async function () {
    const { pool1, poolData, token, tokenData, mcr, chainlinkAggregators } = this.contracts;

    let mcrEth = ether('8000');
    const upperBound = ether(1e8.toString());
    while (true) {

      const initialAssetValue = mcrEth.mul(new BN(3)).div(new BN(4));
      let buyValue = ether('0.01');
      const buyValueUpperBound = mcrEth.div(new BN(20));
      const poolBalanceStep = mcrEth.div(new BN(4));
      const maxRelativeError = Decimal(0.0015);
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
          const nxmOut = await pool1.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);

          const { tokens: expectedIdealTokenValue } = calculatePurchasedTokensWithFullIntegral(
            totalAssetValue, buyValue, mcrEth,
          );
          const nxmOutDecimal = Decimal(nxmOut.toString());
          const relativeError = expectedIdealTokenValue.sub(nxmOutDecimal).abs().div(expectedIdealTokenValue);
          console.log({ relativeError: relativeError.toString() });
          assert(
            relativeError.lt(maxRelativeError),
            `Resulting token value ${nxmOutDecimal.toFixed()} is not close enough to expected ${expectedIdealTokenValue.toFixed()}
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
