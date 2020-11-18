const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { assert } = require('chai');
const { BN } = web3.utils;
const Decimal = require('decimal.js');
const { accounts } = require('../utils');
const { Role } = require('../utils').constants;
const { setupContractState } = require('./utils');
const setup = require('./setup');
const { calculatePurchasedTokensWithFullIntegral, assertSell, calculateMCRRatio, percentageBN } = require('../utils').tokenPrice;
const snapshot = require('../utils').snapshot;

const Pool1MockMember = artifacts.require('Pool1MockMember');

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

describe('sellNXM', function () {

  const daiRate = new BN('39459');
  const ethRate = new BN('100');

  const maxPercentage = 650;

  it('reverts on sales that decrease the MCR% below 100%', async function () {
    const { pool1, poolData, token } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);

    const tokenAmountToSell = ether('1000');
    await token.mint(memberOne, tokenAmountToSell);

    await expectRevert(
      pool1.sellNXM(tokenAmountToSell, '0', { from: memberOne }),
      `MCR% cannot fall below 100%`,
    );
  });

  it('reverts on sales worth more than 5% of MCReth', async function () {
    const { pool1, poolData, token } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);

    const buyValue = percentageBN(mcrEth, 5);
    await pool1.buyNXM('1', { from: memberOne, value: buyValue });
    await pool1.buyNXM('1', { from: memberOne, value: buyValue });

    const entireBalance = await token.balanceOf(memberOne);
    await expectRevert(
      pool1.sellNXM(entireBalance, '0', { from: memberOne }),
      `Sales worth more than 5% of MCReth are not allowed`,
    );
  });

  it('reverts on sales that exceed member balance', async function () {
    const { pool1, poolData, token } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);

    const buyValue = percentageBN(mcrEth, 5);
    await pool1.buyNXM('1', { from: memberOne, value: buyValue });

    const entireBalance = await token.balanceOf(memberOne);
    await expectRevert(
      pool1.sellNXM(entireBalance.addn(1), '0', { from: memberOne }),
      `Not enough balance`,
    );
  });

  it('reverts on sales from member that is a contract whose fallback function reverts', async function () {
    const { pool1, poolData, token, master, tokenController } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = percentageBN(mcrEth, 150);

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);

    const contractMember = await Pool1MockMember.new(pool1.address, token.address, tokenController.address);
    await master.enrollMember(contractMember.address, Role.Member);

    const tokensToSell = ether('1');
    await token.mint(contractMember.address, tokensToSell);

    await expectRevert(
      contractMember.sellNXM(tokensToSell),
      'Pool: Sell transfer failed',
    );
  });

  it('burns tokens from member in exchange for ETH worth 1% of mcrEth', async function () {
    const { pool1, poolData, token, tokenController } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);
    const member = memberOne;

    const buyValue = percentageBN(mcrEth, 1);
    await pool1.buyNXM('1', { from: member, value: buyValue });
    const tokensToSell = await token.balanceOf(member);

    const expectedEthValue = await pool1.getEthForNXM(tokensToSell);

    await token.approve(tokenController.address, tokensToSell, {
      from: member,
    });
    const balancePreSell = await web3.eth.getBalance(member);
    const nxmBalancePreSell = await token.balanceOf(member);
    const sellTx = await pool1.sellNXM(tokensToSell, expectedEthValue, {
      from: member,
    });
    const nxmBalancePostSell = await token.balanceOf(member);
    const balancePostSell = await web3.eth.getBalance(member);

    const nxmBalanceDecrease = nxmBalancePreSell.sub(nxmBalancePostSell);
    assert(nxmBalanceDecrease.toString(), tokensToSell.toString());

    const { gasPrice } = await web3.eth.getTransaction(sellTx.receipt.transactionHash);
    const ethSpentOnGas = new BN(sellTx.receipt.gasUsed).mul(new BN(gasPrice));
    const ethOut = new BN(balancePostSell).sub(new BN(balancePreSell)).add(ethSpentOnGas);

    assert(ethOut.toString(), expectedEthValue.toString());
  });

  it.skip('burns tokens from member in exchange for 5% of mcrEth for mcrEth varying from mcrEth=8k to mcrEth=100 million', async function () {
    const { pool1, poolData, token, tokenData, mcr, tokenController, chainlinkAggregators } = this;

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
