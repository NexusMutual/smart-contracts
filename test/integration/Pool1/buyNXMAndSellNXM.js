const { accounts, web3 } = require('hardhat');
const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { BN, toBN } = web3.utils;
const Decimal = require('decimal.js');
const {
  assertBuy,
  assertSell
} = require('../utils').tokenPrice;

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
  { maxPercentage, poolBalanceStep, buyValue, maxRelativeError, pool1, token, poolData, tokenData, tokenController, isLessThanExpectedEthOut },
) {
  let { a, c, tokenExponent, totalAssetValue, mcrRatio, mcrEth } = await getContractState(
    { poolData, tokenData, pool1 },
  );

  while (mcrRatio < maxPercentage * 100) {
    console.log({ totalAssetValue: totalAssetValue.toString(), mcrPercentage: mcrRatio.toString() });

    const tokensReceived = await assertBuy({
      member: member1, totalAssetValue, mcrEth, buyValue, c, a, tokenExponent, maxRelativeError, pool1, token
    });

    await assertSell({
      member: member1, tokensReceived, buyValue, maxRelativeError, pool1, tokenController, token, isLessThanExpectedEthOut
    });

    await pool1.sendTransaction({
      from: fundSource,
      value: poolBalanceStep,
    });

    totalAssetValue = await pool1.getPoolValueInEth();
    mcrRatio = await pool1.getMCRRatio();
  }
}

describe.only('buyNXM and sellNXM', function () {

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
