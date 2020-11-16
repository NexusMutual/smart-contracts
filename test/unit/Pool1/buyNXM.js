const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { assert } = require('chai');
const { calculatePurchasedTokensWithFullIntegral, calculatePurchasedTokens, assertBuy } = require('../utils').tokenPrice;
const { BN } = web3.utils;
const Decimal = require('decimal.js');
const { accounts } = require('../utils');
const { setupContractState } = require('./utils');
const snapshot = require('../utils').snapshot;

const {
  nonMembers: [fundSource],
  members: [member1],
} = accounts;

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

describe('buyNXM', function () {

  const daiRate = new BN('39459');
  const ethRate = new BN('100');
  const maxPercentage = 400;

  it('reverts on purchase higher than of 5% ETH of mcrEth', async function () {
    const { pool1, poolData, token, tokenData, mcr, chainlinkAggregators } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = mcrEth.div(new BN(20)).add(ether('1000'));
    await setupContractState(
      { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, token, buyValue, poolData, tokenData, chainlinkAggregators },
    );

    await expectRevert(
      pool1.buyNXM('1', { from: member1, value: buyValue }),
      `Purchases worth higher than 5% of MCReth are not allowed`,
    );
  });

  it('reverts on purchase where the bought tokens are below min expected out token amount', async function () {
    const { pool1, poolData, token, tokenData, mcr, chainlinkAggregators } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('1000');
    await setupContractState(
      { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, token, buyValue, poolData, tokenData, chainlinkAggregators },
    );

    const preEstimatedTokenBuyValue = await pool1.getNXMForEth(buyValue);
    await expectRevert(
      pool1.buyNXM(preEstimatedTokenBuyValue.add(new BN(1)), { from: member1, value: buyValue }),
      `tokensOut is less than minTokensOut`,
    );
  });

  it('reverts on purchase if current MCR% exceeds 400%', async function () {
    const { pool1, poolData, token, tokenData, mcr, chainlinkAggregators } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth.mul(new BN(4)).add(new BN(1e20.toString()));
    const buyValue = mcrEth.div(new BN(20)).add(ether('1000'));

    await setupContractState(
      { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, token, buyValue, poolData, tokenData, chainlinkAggregators },
    );

    await expectRevert(
      pool1.buyNXM('1', { from: member1, value: buyValue }),
      `Cannot purchase if MCR% > 400%`,
    );
  });

  it('mints bought to tokens to member in exchange of 100 ETH for initialAssetValue = 0 and mcrEth = 16k', async function () {
    const { pool1, poolData, token, tokenData, mcr, chainlinkAggregators } = this;
    const mcrEth = ether('7000');
    const initialAssetValue = new BN('0');
    const buyValue = mcrEth.div(new BN(20));
    const maxRelativeError = Decimal(0.0006);

    const { a, c, tokenExponent, totalAssetValue } = await setupContractState(
      { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, token, buyValue, poolData, tokenData, chainlinkAggregators },
    );
    await assertBuy({ member: member1, buyValue, mcrEth, totalAssetValue, maxRelativeError, tokenExponent, c, a, pool1, token });
  });

  it('mints bought tokens to member in exchange of 0.0001 ETH for mcrEth = 160k', async function () {
    const { pool1, poolData, token, tokenData, mcr, chainlinkAggregators } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth.div(new BN(2));
    const buyValue = ether('0.0001');
    const poolBalanceStep = mcrEth.div(new BN(2));
    const maxRelativeError = Decimal(0.0006);

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
      chainlinkAggregators
    });
  });

  it('mints bought tokens to member in exchange of 5% ETH of mcrEth for mcrEth = 16k', async function () {
    const { pool1, poolData, token, tokenData, mcr, chainlinkAggregators } = this;

    const mcrEth = ether('16000');
    const initialAssetValue = mcrEth;
    const buyValue = mcrEth.div(new BN(20));
    const poolBalanceStep = mcrEth.div(new BN(2));
    const maxRelativeError = Decimal(0.0006);

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
      chainlinkAggregators
    });
  });

  it('mints bought tokens to member in exchange of 5% ETH of mcrEth for mcrEth = 160k', async function () {
    const { pool1, poolData, token, tokenData, mcr, chainlinkAggregators } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = mcrEth.div(new BN(20));
    const poolBalanceStep = mcrEth.div(new BN(2));
    const maxRelativeError = Decimal(0.0006);

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
      chainlinkAggregators
    });
  });

  it('mints bought tokens to member in exchange of 5% ETH for mcrEth = 320k', async function () {
    const { pool1, poolData, token, tokenData, mcr, chainlinkAggregators } = this;

    const mcrEth = ether('320000');
    const initialAssetValue = mcrEth;
    const buyValue = mcrEth.div(new BN(20));
    const poolBalanceStep = mcrEth.div(new BN(2));
    const maxRelativeError = Decimal(0.0006);

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
      chainlinkAggregators
    });
  });

  it('mints bought tokens to member in exchange of 5% ETH for mcrEth = 10 million', async function () {
    const { pool1, poolData, token, tokenData, mcr, chainlinkAggregators } = this;

    const mcrEth = ether(1e8.toString());
    const initialAssetValue = mcrEth;
    const buyValue = mcrEth.div(new BN(20));
    const poolBalanceStep = mcrEth.div(new BN(2));
    const maxRelativeError = Decimal(0.001);

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
      chainlinkAggregators
    });
  });

  it('mints bought tokens to member in exchange of 5% of mcrEth for mcrEth = 100 million and initialAssetValue = 0 up to 75% MCR%', async function () {
    const { pool1, poolData, token, tokenData, mcr, chainlinkAggregators } = this;
    /*
      In the interval 0-75% MCR% for large mcrEth (100 million ETH here) tokens are sold cheaper than they should be
      and the relative error goes as large as 4.4% (error increases with mcrEth here) which peaks around the 15-35% MCR% percentage mark.
      and decreases as you approach 100% MCR%.
      This is considered safe, because no arbitrage is possible in this interval, since no sells are allowed below 100%.
     */
    const mcrEth = ether(1e8.toString());
    const initialAssetValue = new BN(0);
    const buyValue = mcrEth.div(new BN(20));
    const poolBalanceStep = mcrEth.div(new BN(32));
    // IMPORTANT: max relative error here is 4.4%
    const maxRelativeError = Decimal(0.044);
    const maxPercentage = 50;

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
      chainlinkAggregators
    });
  });

  it('mints bought tokens to member in exchange of 5% ETH of mcrEth for mcrEth varying from mcrEth=8k to mcrEth=1 billion', async function () {
    const { pool1, poolData, token, tokenData, mcr, chainlinkAggregators } = this;

    let mcrEth = ether('8000');
    const upperBound = ether(1e9.toString());
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
          mcrEth: mcrEth.toString()
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
          chainlinkAggregators
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
