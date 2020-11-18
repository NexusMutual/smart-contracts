const { accounts, web3 } = require('hardhat');
const { ether, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { BN, toBN } = web3.utils;
const Decimal = require('decimal.js');
const {
  assertBuy,
  assertSell
} = require('../utils').tokenPrice;

const { buyCover } = require('../utils/buyCover');
const { hex } = require('../utils').helpers;
const [, member1, member2, member3, coverHolder, fundSource, nonMember1] = accounts;

const tokensLockedForVoting = ether('200');
const validity = 360 * 24 * 60 * 60; // 360 days
const UNLIMITED_ALLOWANCE = toBN('2').pow(toBN('256')).subn(1);
const initialMemberFunds = ether('2500');
const sellSpread = 0.025 * 10000;

const coverTemplate = {
  amount: 1, // 1 eth
  price: '3000000000000000', // 0.003 eth
  priceNXM: '1000000000000000000', // 1 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('ETH'),
  period: 60,
  contractAddress: '0xc0ffeec0ffeec0ffeec0ffeec0ffeec0ffee0000',
};

async function initMembers () {

  const { mr, tk, tc } = this.contracts;
  const members = [member1, member2, member3, coverHolder];

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
      member: member1, tokensToSell: tokensReceived, buyValue, maxRelativeError, pool1, tokenController, token, isLessThanExpectedEthOut
    });

    await pool1.sendTransaction({
      from: fundSource,
      value: poolBalanceStep,
    });

    totalAssetValue = await pool1.getPoolValueInEth();
    mcrRatio = await pool1.getMCRRatio();
  }
}

describe('Token price functions', function () {

  this.timeout(0);
  this.slow(5000);
  beforeEach(initMembers);

  it('getPoolValueInEth calculates pool value correctly', async function () {
    const { p1: pool1, dai } = this.contracts;
    const { daiToEthRate } = this.rates;

    const pool1Balance = new BN(await web3.eth.getBalance(pool1.address));
    const daiBalance = await dai.balanceOf(pool1.address);
    const expectedDAiValueInEth = daiToEthRate.mul(daiBalance).div(ether('1'));
    const expectedTotalAssetValue = pool1Balance.add(expectedDAiValueInEth);
    const totalAssetValue = await pool1.getPoolValueInEth();
    assert(totalAssetValue.toString(), expectedTotalAssetValue.toString());
  });

  it('getMCRRatio calculates MCR ratio correctly', async function () {
    const { p1: pool1 } = this.contracts;
    const mcrRatio = await pool1.getMCRRatio();
    assert.equal(mcrRatio.toString(), '21333');
  });

  it('buyNXM reverts for non-member', async function () {
    const { p1: pool1 } = this.contracts;

    const buyValue = ether('10');
    await expectRevert(
      pool1.buyNXM('0', { from: nonMember1, value: buyValue }),
      'Not member',
    );
  });

  it('SELLNXM reverts for non-member', async function () {
    const { p1: pool1 } = this.contracts;

    await expectRevert(
      pool1.sellNXM('1', '0', { from: nonMember1 }),
      'Not member',
    );
  });

  it('sellNXM reverts if member does not have enough NXM balance', async function () {
    const { p1: pool1, tk: token } = this.contracts;
    const memberBalance = await token.balanceOf(member1);

    await expectRevert(
      pool1.sellNXM(memberBalance.addn(1), '0', { from: member1 }),
      'Pool: Not enough balance',
    );
  });

  it('sellNXM reverts for member if tokens are locked for member vote', async function () {
    const { cd: claimsData, cl: claims, qd: quotationData, mr: memberRoles, p1: pool1, tk: token, master } = this.contracts;
    const cover = { ...coverTemplate };

    const buyValue = ether('1000');
    await pool1.buyNXM('0', {
      from: member1,
      value: buyValue,
    });

    const boughtTokenAmount = await token.balanceOf(member1);

    await buyCover({ ...this.contracts, cover, coverHolder });
    const [coverId] = await quotationData.getAllCoversOfUser(coverHolder);
    await claims.submitClaim(coverId, { from: coverHolder });
    const claimId = (await claimsData.actualClaimLength()).subn(1);

    // create a consensus not reached situation, 66% accept vs 33% deny
    await claims.submitCAVote(claimId, '1', { from: member1 });
    await claims.submitCAVote(claimId, '-1', { from: member2 });
    await claims.submitCAVote(claimId, '1', { from: member3 });

    const maxVotingTime = await claimsData.maxVotingTime();
    await time.increase(maxVotingTime.addn(1));

    await master.closeClaim(claimId); // trigger changeClaimStatus
    const voteStatusAfter = await claims.checkVoteClosing(claimId);
    assert(voteStatusAfter.eqn(0), 'voting should not be closed');

    const { statno: claimStatusCA } = await claimsData.getClaimStatusNumber(claimId);
    assert.strictEqual(
      claimStatusCA.toNumber(), 4,
      'claim status should be 4 (ca consensus not reached, pending mv)',
    );

    await claims.submitMemberVote(claimId, '1', { from: member1 });
    await expectRevert(
      pool1.sellNXM(boughtTokenAmount, '0', { from: member1 }),
      'Pool: NXM tokens are locked for voting',
    );
    await time.increase(maxVotingTime.addn(1));
    await master.closeClaim(claimId);
  });

  it('legacy getWei is equivalent to getEthForNXM', async function () {
    const { p1: pool1, tk: token } = this.contracts;

    const memberBalance = await token.balanceOf(member1);
    const tokensToSell = BN.min(ether('1'), memberBalance);

    const legacyWeiAmount = await pool1.getWei(tokensToSell);
    const ethForNXM = await pool1.getEthForNXM(tokensToSell);

    assert(legacyWeiAmount.toString(), ethForNXM.toString())
  });

  it('mints tokens for member in exchange of ETH with buyNXM and burns tokens for ETH with sellNXM', async function () {

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
