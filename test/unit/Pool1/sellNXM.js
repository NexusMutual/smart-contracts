const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { assert } = require('chai');
const { BN } = web3.utils;
const Decimal = require('decimal.js');
const { accounts } = require('../utils');
const { setupContractState } = require('./utils');
const setup = require('./setup');
const { calculatePurchasedTokensWithFullIntegral, assertSell } = require('../utils').tokenPrice;

const {
  nonMembers: [fundSource],
  members: [memberOne],
} = accounts;

const sellSpread = 0.025 * 10000;

async function assertSellValues (
  { initialAssetValue, mcrEth, maxPercentage, daiRate, ethRate, poolBalanceStep, mcr, maxRelativeError,
    pool1, token, buyValue, poolData, tokenData, tokenController, chainlinkAggregators, isLessThanExpectedEthOut },
) {
  let { totalAssetValue, mcrRatio, a, c, tokenExponent } = await setupContractState(
    { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, token, buyValue, poolData, tokenData, chainlinkAggregators },
  );

  let highestRelativeError = 0;
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
      { member: memberOne, tokensReceived, buyValue, maxRelativeError, pool1, tokenController, token, isLessThanExpectedEthOut }
    );

    await pool1.sendTransaction({
      from: fundSource,
      value: poolBalanceStep,
    });
    totalAssetValue = await pool1.getPoolValueInEth();
    mcrRatio = await pool1.getMCRRatio();
  }

  console.log({ highestRelativeError: highestRelativeError.toString() });
}

describe('sellNXM', function () {

  const daiRate = new BN('39459');
  const ethRate = new BN('100');

  /*
    tests sells for percentages higher than 400% because anyone can send ETH to the pool, increase total value in the
    pool without receiving any tokens in the pool.
   */
  const maxPercentage = 650;

  it('reverts on sales that decrease the MCR% below 100%', async function () {
    const { pool1, poolData, token, tokenData, mcr, chainlinkAggregators } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    await setupContractState(
      { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, poolData, tokenData, chainlinkAggregators },
    );

    const tokenAmountToSell = ether('1000');
    await token.mint(memberOne, tokenAmountToSell);

    await expectRevert(
      pool1.sellNXM(tokenAmountToSell, '0', { from: memberOne }),
      `MCR% cannot fall below 100%`,
    );
  });

  it('reverts on sales worth more than 5% of MCReth', async function () {
    const { pool1, poolData, token, tokenData, mcr, chainlinkAggregators } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    await setupContractState(
      { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, token, poolData, tokenData, chainlinkAggregators },
    );

    const buyValue = mcrEth.div(new BN(20));
    for (let i = 0; i < 2; i++) {
      await pool1.buyNXM('1', { from: memberOne, value: buyValue });
    }
    const entireBalance = await token.balanceOf(memberOne);
    await expectRevert(
      pool1.sellNXM(entireBalance, '0', { from: memberOne }),
      `Sales worth more than 5% of MCReth are not allowed`,
    );
  });

  it('reverts on sales that exceed member balance', async function () {
    const { pool1, poolData, token, tokenData, mcr, chainlinkAggregators } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    await setupContractState(
      { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, token, poolData, tokenData, chainlinkAggregators },
    );

    const buyValue = mcrEth.div(new BN(20));
    await pool1.buyNXM('1', { from: memberOne, value: buyValue });

    const entireBalance = await token.balanceOf(memberOne);
    await expectRevert(
      pool1.sellNXM(entireBalance.addn(1), '0', { from: memberOne }),
      `Not enough balance`,
    );
  });

  it('burns tokens from member in exchange for 0.01 ETH for mcrEth = 160k', async function () {
    const { pool1, poolData, token, tokenData, mcr, tokenController, chainlinkAggregators } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('0.01');
    const poolBalanceStep = mcrEth.div(new BN(2));
    const maxRelativeError = Decimal(0.0001);

    await assertSellValues({
      initialAssetValue,
      mcrEth,
      maxPercentage,
      buyValue,
      poolBalanceStep,
      maxRelativeError,
      mcr,
      pool1,
      token,
      poolData,
      daiRate,
      ethRate,
      tokenData,
      tokenController,
      chainlinkAggregators
    });
  });

  it('burns tokens from member in exchange for 1 ETH for mcrEth = 160k', async function () {
    const { pool1, poolData, token, tokenData, mcr, tokenController, chainlinkAggregators } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('1');
    const poolBalanceStep = mcrEth.div(new BN(2));
    const maxRelativeError = Decimal(0.0005);

    await assertSellValues({
      initialAssetValue,
      mcrEth,
      maxPercentage,
      buyValue,
      poolBalanceStep,
      maxRelativeError,
      mcr,
      pool1,
      token,
      poolData,
      daiRate,
      ethRate,
      tokenData,
      tokenController,
      chainlinkAggregators
    });
  });

  it('burns tokens from member in exchange for 1k ETH for mcrEth = 160k', async function () {
    const { pool1, poolData, token, tokenData, mcr, tokenController, chainlinkAggregators } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('1000');
    const poolBalanceStep = mcrEth.div(new BN(2));
    const maxRelativeError = Decimal(0.0005);

    await assertSellValues({
      initialAssetValue,
      mcrEth,
      maxPercentage,
      buyValue,
      poolBalanceStep,
      maxRelativeError,
      mcr,
      pool1,
      token,
      poolData,
      daiRate,
      ethRate,
      tokenData,
      tokenController,
      chainlinkAggregators
    });
  });

  it('burns tokens from member in exchange for 5% of mcrEth for mcrEth = 160k', async function () {
    const { pool1, poolData, token, tokenData, mcr, tokenController, chainlinkAggregators } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = mcrEth.div(new BN(20));
    const poolBalanceStep = mcrEth.div(new BN(2));
    const maxRelativeError = Decimal(0.06);

    await assertSellValues({
      isLessThanExpectedEthOut: true,
      initialAssetValue,
      mcrEth,
      maxPercentage,
      buyValue,
      poolBalanceStep,
      maxRelativeError,
      mcr,
      pool1,
      token,
      poolData,
      daiRate,
      ethRate,
      tokenData,
      tokenController,
      chainlinkAggregators
    });
  });
});
