const { accounts, web3 } = require('hardhat');
const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { BN, toBN } = web3.utils;
const Decimal = require('decimal.js');
const { calculatePurchasedTokensWithFullIntegral, calculatePurchasedTokens } = require('../utils').tokenPrice;

const { buyCover } = require('../utils/buyCover');
const { hex } = require('../utils').helpers;
const [, member1, member2, member3, fundSource, nonMember1] = accounts;

const tokensLockedForVoting = ether('200');
const validity = 360 * 24 * 60 * 60; // 360 days
const UNLIMITED_ALLOWANCE = toBN('2').pow(toBN('256')).subn(1);
const initialMemberFunds = ether('2500');
const sellSpread = 0.025 * 10000;

async function initMembers () {

  const { mr, tk, tc } = this.contracts;
  const members = [member1, member2, member3];

  for (const member of members) {
    await mr.payJoiningFee(member, { from: member, value: ether('0.002') });
    await mr.kycVerdict(member, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member });
    await tk.transfer(member, initialMemberFunds);
  }

  for (const member of members) {
    await tc.lock(hex('CLA'), tokensLockedForVoting, validity, { from: member });
  }
}

async function getContractState (
  { poolData, tokenData, pool1 },
) {
  const { _a: a, _c: c } = await poolData.getTokenPriceDetails(hex('ETH'));
  const tokenExponent = await tokenData.tokenExponent();
  const mcrEth = await poolData.getLastMCREther();

  const totalAssetValue = await pool1.getPoolValueInEth();
  const mcrRatio = await pool1.getMCRRatio();
  return { a, c, tokenExponent, totalAssetValue, mcrRatio, mcrEth };
}

async function assertBuyAndSellValues (
  { maxPercentage, poolBalanceStep, buyValue, maxRelativeError, mcr, pool1, token, poolData, tokenData, tokenController, isLessThanExpectedEthOut },
) {
  let { a, c, tokenExponent, totalAssetValue, mcrRatio, mcrEth } = await getContractState(
    { poolData, tokenData, pool1 },
  );

  let highestRelativeError = 0;
  while (mcrRatio < maxPercentage * 100) {
    console.log({ totalAssetValue: totalAssetValue.toString(), mcrPercentage: mcrRatio.toString() });

    const preEstimatedTokenBuyValue = await pool1.getNXMForEth(buyValue);

    const preBuyBalance = await token.balanceOf(member1);

    await pool1.buyNXM(preEstimatedTokenBuyValue, {
      from: member1,
      value: buyValue,
    });
    const postBuyBalance = await token.balanceOf(member1);
    const tokensReceived = postBuyBalance.sub(preBuyBalance);

    const { tokens: expectedIdealTokenValue } = calculatePurchasedTokensWithFullIntegral(
      totalAssetValue, buyValue, mcrEth, c, a.mul(new BN(1e13.toString())), tokenExponent,
    );

    const { tokens: expectedTokenValue } = calculatePurchasedTokens(
      totalAssetValue, buyValue, mcrEth, c, a.mul(new BN(1e13.toString())), tokenExponent,
    );
    assert.equal(tokensReceived.toString(), expectedTokenValue.toString());

    const tokensReceivedDecimal = Decimal(tokensReceived.toString());
    const relativeError = expectedIdealTokenValue.sub(tokensReceivedDecimal).abs().div(expectedIdealTokenValue);
    highestRelativeError = Math.max(relativeError.toNumber(), highestRelativeError);
    console.log({ relativeError: relativeError.toString() });
    assert(
      relativeError.lt(maxRelativeError),
      `Resulting token value ${tokensReceivedDecimal.toFixed()} is not close enough to expected ${expectedIdealTokenValue.toFixed()}
       Relative error: ${relativeError}`,
    );

    const precomputedEthValue = await pool1.getEthForNXM(tokensReceived);
    console.log({
      precomputedEthValue: precomputedEthValue.toString(),
      postBuyBalance: postBuyBalance.toString(),
      tokensReceived: tokensReceived.toString(),
    });

    await token.approve(tokenController.address, tokensReceived, {
      from: member1,
    });
    const balancePreSell = await web3.eth.getBalance(member1);
    const sellTx = await pool1.sellNXM(tokensReceived, precomputedEthValue, {
      from: member1,
    });

    const { gasPrice } = await web3.eth.getTransaction(sellTx.receipt.transactionHash);
    const ethSpentOnGas = Decimal(sellTx.receipt.gasUsed).mul(Decimal(gasPrice));
    console.log({ gasSpentOnTx: ethSpentOnGas.toString() });

    const balancePostSell = await web3.eth.getBalance(member1);
    const sellEthReceived = Decimal(balancePostSell).sub(Decimal(balancePreSell)).add(ethSpentOnGas);

    const expectedEthOut = Decimal(buyValue.toString()).mul(10000 - sellSpread).div(10000);

    const relativeErrorForSell = expectedEthOut.sub(sellEthReceived).abs().div(expectedEthOut);
    highestRelativeError = Math.max(relativeErrorForSell.toNumber(), highestRelativeError);
    console.log({ relativeError: relativeErrorForSell.toString() });
    if (isLessThanExpectedEthOut) {
      assert(sellEthReceived.lt(expectedEthOut), `${sellEthReceived.toFixed()} is greater than ${expectedEthOut.toFixed()}`);
    }
    assert(
      relativeErrorForSell.lt(maxRelativeError),
      `Resulting eth value ${sellEthReceived.toFixed()} is not close enough to expected ${expectedEthOut.toFixed()}
       Relative error: ${relativeErrorForSell}`,
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

describe('buyNXM and sellNXM', function () {

  this.timeout(0);
  this.slow(5000);
  beforeEach(initMembers);

  it('reverts for non-member', async function () {
    const { p1: pool1 } = this.contracts;

    const buyValue = ether('10');
    await expectRevert(
      pool1.buyNXM('0', { from: nonMember1, value: buyValue }),
      'Not member',
    );
  });

  it('mints tokens for member in exchange of ETH', async function () {

    const { tk: token, td: tokenData, mcr, p1: pool1, pd: poolData, tk: tokenController } = this.contracts;

    const maxPercentage = 400;
    const poolBalanceStep = ether('30000');
    const buyValue = ether('1000');
    const maxRelativeError = Decimal(0.0006);
    await assertBuyAndSellValues(
      { maxPercentage, poolBalanceStep, buyValue, mcr, pool1, token, poolData, tokenData, tokenController, maxRelativeError },
    );
  });
});
