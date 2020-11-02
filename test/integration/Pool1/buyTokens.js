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
  coverHolder,
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

async function concludeClaimWithOraclize ({ cl, pd, cd, p1, now, expectedClaimStatusNumber }) {

  const claimId = (await cd.actualClaimLength()) - 1;
  const minVotingTime = await cd.minVotingTime();
  const minTime = new BN(minVotingTime.toString()).add(
    new BN(now.toString()),
  );

  await time.increaseTo(
    new BN(minTime.toString()).add(new BN('2')),
  );

  const actualVoteClosingBefore = await cl.checkVoteClosing(claimId);
  assert.equal(actualVoteClosingBefore.toString(), '1');

  const APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
  await p1.__callback(APIID, '');
  const newCStatus = await cd.getClaimStatusNumber(claimId);
  assert.equal(newCStatus[1].toString(), expectedClaimStatusNumber);

  const actualVoteClosingAfter = await cl.checkVoteClosing(claimId);
  assert.equal(actualVoteClosingAfter.toString(), '-1');
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

  it('claim is accepted for contract whose staker that staked on multiple contracts', async function () {

    const { ps, tk, td, qd, cl, mcr, tc } = this;
  });
});
