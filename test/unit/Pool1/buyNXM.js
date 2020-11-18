const { ether, expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { assert } = require('chai');
const { assertBuy, calculateMCRRatio, percentageBN } = require('../utils').tokenPrice;
const { BN } = web3.utils;
const Decimal = require('decimal.js');
const { accounts } = require('../utils');
const { setupContractState } = require('./utils');
const { hex } = require('../utils').helpers;
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

  it('reverts on purchase with msg.value = 0', async function () {
    const { pool1, poolData } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = new BN('0');

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);

    await expectRevert(
      pool1.buyNXM('1', { from: member1, value: buyValue }),
      `Pool: ethIn > 0`,
    );
  });

  it('reverts on purchase higher than of 5% ETH of mcrEth', async function () {
    const { pool1, poolData } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = mcrEth.div(new BN(20)).add(ether('1000'));

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);

    await expectRevert(
      pool1.buyNXM('1', { from: member1, value: buyValue }),
      `Purchases worth higher than 5% of MCReth are not allowed`,
    );
  });

  it('reverts on purchase where the bought tokens are below min expected out token amount', async function () {
    const { pool1, poolData } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('1000');

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);

    const preEstimatedTokenBuyValue = await pool1.getNXMForEth(buyValue);
    await expectRevert(
      pool1.buyNXM(preEstimatedTokenBuyValue.add(new BN(1)), { from: member1, value: buyValue }),
      `tokensOut is less than minTokensOut`,
    );
  });

  it('reverts on purchase if current MCR% exceeds 400%', async function () {
    const { pool1, poolData } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth.mul(new BN(4)).add(new BN(1e20.toString()));
    const buyValue = mcrEth.div(new BN(20)).add(ether('1000'));

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);

    await expectRevert(
      pool1.buyNXM('1', { from: member1, value: buyValue }),
      `Cannot purchase if MCR% > 400%`,
    );
  });

  it('reverts when MCReth is 0', async function () {
    const { pool1, poolData } = this;

    const mcrEth = ether('0');
    const initialAssetValue = ether('160000');
    const buyValue = mcrEth.div(new BN(20));

    const mcrRatio = new BN('0');
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);

    await expectRevert.unspecified(pool1.buyNXM('1', { from: member1, value: buyValue }));
  });

  it('mints expected number of tokens to member in exchange of 5% of MCReth for mcrEth = 160k and MCR% = 150%', async function () {
    const { pool1, poolData, token } = this;
    const mcrEth = ether('160000');
    const initialAssetValue = percentageBN(mcrEth, 150);
    const buyValue = mcrEth.div(new BN(20));

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);

    const expectedTokensReceived = await pool1.calculateNXMForEth(
      buyValue, initialAssetValue, mcrEth,
    );

    const member = member1;
    const preBuyBalance = await token.balanceOf(member);
    const tx = await pool1.buyNXM('0', {
      from: member,
      value: buyValue,
    });
    const postBuyBalance = await token.balanceOf(member);
    const tokensReceived = postBuyBalance.sub(preBuyBalance);
    console.log(tx.receipt.gasUsed);

    assert.equal(tokensReceived.toString(), expectedTokensReceived.toString());

    await expectEvent(tx, 'NXMBought', {
      member,
      ethIn: buyValue.toString(),
      nxmOut: expectedTokensReceived.toString(),
    });
  });
});
