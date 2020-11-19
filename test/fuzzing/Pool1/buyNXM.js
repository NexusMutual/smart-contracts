
const { ether, expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { assert } = require('chai');
const { BN } = web3.utils;
const Decimal = require('decimal.js');
const { accounts } = require('../utils');
const { setupContractState, assertBuy } = require('./utils');
const { hex } = require('../utils').helpers;
const snapshot = require('../utils').snapshot;
const setup = require('./setup');

const {
  nonMembers: [fundSource],
  members: [member1],
} = accounts;

const Pool1 = artifacts.require('Pool1');
const MCR = artifacts.require('MCR');

async function assertBuyValues (
  { initialAssetValue, mcrEth, maxPercentage, daiRate, ethRate, poolBalanceStep, mcr, pool1, token, buyValue, poolData, tokenData, maxRelativeError, chainlinkAggregators },
) {
  let { a, c, tokenExponent, totalAssetValue, mcrRatio } = await setupContractState(
    { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, token, buyValue, poolData, tokenData, chainlinkAggregators },
  );

  while (mcrRatio <= maxPercentage * 100) {
    console.log({ totalAssetValue: totalAssetValue.toString(), mcrPercentage: mcrRatio.toString() });
    await assertBuy({ member: member1, buyValue, mcrEth, totalAssetValue, maxRelativeError, tokenExponent, c, a, pool1, token });

    if (buyValue.lt(poolBalanceStep)) {
      const extraStepValue = poolBalanceStep.sub(buyValue);
      await pool1.sendTransaction({
        from: fundSource,
        value: extraStepValue,
      });
    }

    totalAssetValue = await pool1.getPoolValueInEth();
    mcrRatio = await pool1.getMCRRatio();
  }
}

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
        const snapshotId = await snapshot.takeSnapshot();
        console.log({
          buyValue: buyValue.toString(),
          mcrEth: mcrEth.toString(),
        });
        await assertBuyValues({
          initialAssetValue,
          mcrEth,
          maxPercentage,
          buyValue,
          poolBalanceStep,
          mcr,
          pool1,
          token,
          poolData,
          daiRate,
          ethRate,
          tokenData,
          maxRelativeError,
          chainlinkAggregators,
        });
        await snapshot.revertToSnapshot(snapshotId);

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
