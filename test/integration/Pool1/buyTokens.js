const { accounts, web3 } = require('hardhat');
const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { BN, toBN } = web3.utils;
const Decimal = require('decimal.js');
const { calculatePurchasedTokensWithFullIntegral, calculatePurchasedTokens } = require('../utils').tokenPrice;

const { buyCover } = require('../utils/buyCover');
const { hex } = require('../utils').helpers;
const snapshot = require('../utils').snapshot;
const setup = require('../setup');

const [, member1, member2, member3, fundSource, nonMember1] = accounts;

const tokensLockedForVoting = ether('200');
const validity = 360 * 24 * 60 * 60; // 360 days
const UNLIMITED_ALLOWANCE = toBN('2').pow(toBN('256')).subn(1);
const initialMemberFunds = ether('2500');

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

async function getContractState(
  { mcr, poolData, tokenData }
) {
  const { _a: a, _c: c } = await poolData.getTokenPriceDetails(hex('ETH'));
  const tokenExponent = await tokenData.tokenExponent();
  const mcrEth = await poolData.getLastMCREther();

  const { totalAssetValue, mcrPercentage } = await mcr.calVtpAndMCRtp();
  return { a, c, tokenExponent, totalAssetValue, mcrPercentage, mcrEth };
}

async function assertBuyValues(
  { maxPercentage, poolBalanceStep, buyValue, maxRelativeError, mcr, pool1, token, poolData, tokenData }
) {
  let { a, c, tokenExponent, totalAssetValue, mcrPercentage, mcrEth } = await getContractState(
    { mcr, poolData, tokenData }
  );

  let highestRelativeError = 0;
  while (mcrPercentage < maxPercentage * 100) {
    console.log({ totalAssetValue: totalAssetValue.toString(), mcrPercentage: mcrPercentage.toString() });

    const pool1Balance = await web3.eth.getBalance(pool1.address);

    const preEstimatedTokenBuyValue = await mcr.getTokenBuyValue(pool1Balance, buyValue);

    const preBuyBalance = await token.balanceOf(member1);

    await pool1.buyTokens(preEstimatedTokenBuyValue, {
      from: member1,
      value: buyValue
    });
    const postBuyBalance = await token.balanceOf(member1);
    const tokensReceived = postBuyBalance.sub(preBuyBalance);

    const { tokens: expectedIdealTokenValue } = calculatePurchasedTokensWithFullIntegral(
      totalAssetValue, buyValue, mcrEth, c, a.mul(new BN(1e13.toString())), tokenExponent
    );

    const { tokens: expectedTokenValue } = calculatePurchasedTokens(
      totalAssetValue, buyValue, mcrEth, c, a.mul(new BN(1e13.toString())), tokenExponent
    );
    assert.equal(tokensReceived.toString(), expectedTokenValue.toString());

    const tokensReceivedDecimal = Decimal(tokensReceived.toString());
    const relativeError = expectedIdealTokenValue.sub(tokensReceivedDecimal).abs().div(expectedIdealTokenValue);
    highestRelativeError = Math.max(relativeError.toNumber(), highestRelativeError);
    console.log({ relativeError: relativeError.toString() });
    assert(
      relativeError.lt(maxRelativeError),
      `Resulting token value ${tokensReceivedDecimal.toFixed()} is not close enough to expected ${expectedIdealTokenValue.toFixed()}
       Relative error: ${relativeError}`
    );

    if (buyValue.lt(poolBalanceStep)) {
      const extraStepValue = poolBalanceStep.sub(buyValue);
      await pool1.sendTransaction({
        from: fundSource,
        value: extraStepValue
      });
    }

    ({ totalAssetValue, mcrPercentage } = await mcr.calVtpAndMCRtp());
  }

  console.log({ highestRelativeError: highestRelativeError.toString() });
}

describe('buyTokens', function () {

  this.timeout(0);
  this.slow(5000);
  beforeEach(initMembers);

  it('reverts for non-member', async function () {
    const { p1: pool1 } = this.contracts;

    const buyValue = ether('10');
    await expectRevert(
      pool1.buyTokens('0', { from: nonMember1, value: buyValue }),
      'Not member'
    );
  });

  it('mints tokens for member in exchange of ETH', async function () {

    const { tk: token, td: tokenData, mcr, p1: pool1, pd: poolData } = this.contracts;

    const maxPercentage = 400;
    const poolBalanceStep = ether('30000');
    const buyValue = ether('1000');
    const maxRelativeError = Decimal(0.0006);
    await assertBuyValues(
      { maxPercentage, poolBalanceStep, buyValue, mcr, pool1, token, poolData, tokenData, maxRelativeError }
    );
  });
});
