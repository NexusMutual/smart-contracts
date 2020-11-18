
const { ether } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { assertSell } = require('../utils').tokenPrice;
const { BN } = web3.utils;
const Decimal = require('decimal.js');
const { accounts } = require('../utils');
const { setupContractState } = require('./utils');
const { hex } = require('../utils').helpers;
const snapshot = require('../utils').snapshot;
const setup = require('./setup');

const {
  nonMembers: [fundSource],
  members: [memberOne],
} = accounts;

const Pool1 = artifacts.require('Pool1');
const MCR = artifacts.require('MCR');

async function assertSellValues (
  { initialAssetValue, mcrEth, maxPercentage, daiRate, ethRate, poolBalanceStep, mcr, maxRelativeError,
    pool1, token, buyValue, poolData, tokenData, tokenController, chainlinkAggregators, isLessThanExpectedEthOut },
) {
  let { totalAssetValue, mcrRatio, a, c, tokenExponent } = await setupContractState(
    { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, token, buyValue, poolData, tokenData, chainlinkAggregators },
  );

  while (mcrRatio < maxPercentage * 100) {
    console.log({ totalAssetValue: totalAssetValue.toString(), mcrPercentage: mcrRatio.toString() });
    const preEstimatedTokenBuyValue = await pool1.getNXMForEth(buyValue);

    const preBuyBalance = await token.balanceOf(memberOne);

    let tokensReceived;
    if (mcrRatio <= 400 * 100) {
      await pool1.buyNXM(preEstimatedTokenBuyValue, {
        from: memberOne,
        value: buyValue,
      });
      const postBuyBalance = await token.balanceOf(memberOne);
      tokensReceived = postBuyBalance.sub(preBuyBalance);
    } else {
      // cannot buy past upper MCR% treshold. Can only send ether to the pool.
      await pool1.sendTransaction({
        from: fundSource,
        value: buyValue,
      });

      // mint ideal number of tokens
      const { tokens: idealTokensReceived } = calculatePurchasedTokensWithFullIntegral(
        totalAssetValue, buyValue, mcrEth, c, a.mul(new BN(1e13.toString())), tokenExponent,
      );
      tokensReceived = new BN(idealTokensReceived.toFixed());
      await token.mint(memberOne, tokensReceived);
    }

    await assertSell(
      { member: memberOne, tokensToSell: tokensReceived, buyValue, maxRelativeError, pool1, tokenController, token, isLessThanExpectedEthOut },
    );

    await pool1.sendTransaction({
      from: fundSource,
      value: poolBalanceStep,
    });
    totalAssetValue = await pool1.getPoolValueInEth();
    mcrRatio = await pool1.getMCRRatio();
  }
}

async function setupAll () {
  this.contracts = await setup({ MCR, Pool1 });
}

describe.only('sellNXM', function () {

  before(setupAll);

  const daiRate = new BN('39459');
  const ethRate = new BN('100');
  const maxPercentage = 400;

  it('burns tokens from member in exchange for 5% of mcrEth for mcrEth varying from mcrEth=8k to mcrEth=100 million', async function () {
    const { pool1, poolData, token, tokenData, mcr, tokenController, chainlinkAggregators } = this.contracts;

    let mcrEth = ether('8000');
    const upperBound = ether(1e8.toString());
    while (true) {

      const initialAssetValue = mcrEth;
      let buyValue = ether('0.1');
      const buyValueUpperBound = mcrEth.div(new BN(100)); // 1% of MCReth
      const poolBalanceStep = mcrEth.div(new BN(4));
      const maxRelativeError = Decimal(0.002);

      while (true) {
        const snapshotId = await snapshot.takeSnapshot();
        console.log({
          buyValue: buyValue.toString(),
          mcrEth: mcrEth.toString(),
        });
        await assertSellValues({
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
          tokenController,
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
