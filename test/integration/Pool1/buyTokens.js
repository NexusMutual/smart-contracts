const { accounts, web3 } = require('@openzeppelin/test-environment');
const { ether, time, expectEvent } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { BN, toBN } = web3.utils;

const { buyCover } = require('../utils/buyCover');
const { hex } = require('../utils').helpers;
const snapshot = require('../utils').snapshot;
const setup = require('../setup');

const [
  member1, member2, member3,
  staker1, staker2, staker3, staker4, staker5, staker6, staker7, staker8, staker9, staker10,
  coverHolder, fundSource
] = accounts;

const tokensLockedForVoting = ether('200');
const validity = 360 * 24 * 60 * 60; // 360 days
const UNLIMITED_ALLOWANCE = toBN('2').pow(toBN('256')).subn(1);
const initialMemberFunds = ether('2500');

async function initMembers () {

  const { mr, tk, tc } = this;

  this.allStakers = [staker1, staker2, staker3, staker4, staker5, staker6, staker7, staker8, staker9, staker10];
  const members = [member1, member2, member3, ...this.allStakers, coverHolder];

  for (const member of members) {
    await mr.payJoiningFee(member, { from: member, value: ether('0.002') });
    await mr.kycVerdict(member, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member });
    await tk.transfer(member, initialMemberFunds);
  }

  for (const member of members) {
    await tc.lock(hex('CLA'), tokensLockedForVoting, validity, { from: member });
  }

  this.allMembers = members;
}

async function submitMemberVotes ({ cd, td, cl, voteValue, maxVotingMembers }) {

  const claimId = (await cd.actualClaimLength()) - 1;
  const initialCAVoteTokens = await cd.getCaClaimVotesToken(claimId);
  const baseMembers = [member1, member2, member3];
  const voters = maxVotingMembers ? baseMembers.slice(0, maxVotingMembers) : baseMembers;

  for (const member of voters) {
    await cl.submitCAVote(claimId, voteValue, { from: member });
  }

  const finalCAVoteTokens = await cd.getCaClaimVotesToken(claimId);
  const actualVoteTokensDiff = finalCAVoteTokens[1] - initialCAVoteTokens[1];
  const expectedVoteTokensDiff = tokensLockedForVoting * voters.length;
  assert.equal(actualVoteTokensDiff, expectedVoteTokensDiff);

  const allVotes = await cd.getAllVotesForClaim(claimId);
  const expectedVotes = allVotes[1].length;
  assert.equal(voters.length, expectedVotes);

  const isBooked = await td.isCATokensBooked(member1);
  assert.isTrue(isBooked);
}

async function getContractState(

) {

}

async function assertBuyValues(
  { initialAssetValue, mcrEth, maxPercentage, daiRate, ethRate, poolBalanceStep, mcr, pool1, token, buyValue, poolData, tokenData }
) {
  let { a, c, tokenExponent, totalAssetValue, mcrPercentage } = await getContractState(
    { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, token, buyValue, poolData, tokenData }
  );

  let highestRelativeError = 0;
  while (mcrPercentage < maxPercentage * 100) {
    console.log({ totalAssetValue: totalAssetValue.toString(), mcrPercentage: mcrPercentage.toString() });

    const pool1Balance = await web3.eth.getBalance(pool1.address);

    const preEstimatedTokenBuyValue = await mcr.getTokenBuyValue(pool1Balance, buyValue);

    const preBuyBalance = await token.balanceOf(memberOne);

    await pool1.buyTokens(preEstimatedTokenBuyValue, {
      from: memberOne,
      value: buyValue
    });
    const postBuyBalance = await token.balanceOf(memberOne);
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

  before(setup);
  before(initMembers);

  beforeEach(async function () {
    this.snapshotId = await snapshot.takeSnapshot();
  });

  afterEach(async function () {
    await snapshot.revertToSnapshot(this.snapshotId);
  });

  it('mints tokens for member in exchange of ETH', async function () {

    const { ps, tk, td, qd, cl, mcr, tc, p1 } = this;
  });
});
