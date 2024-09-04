async function pushCoverNotes({ tc }, item) {
  const { member, coverIds, lockReasonIndexes } = item;
  await tc.withdrawCoverNote(member, coverIds, lockReasonIndexes);
}

async function pushClaimsAssessment({ tc }, items) {
  const members = items.map(item => item.member);
  await tc.withdrawClaimAssessmentTokens(members, { gasLimit: '15000000' });
}

async function pushV1StakingStake({ ps }, item) {
  await ps.withdrawForUser(item.member);
}

async function pushV1StakingRewards({ ps }, item) {
  await ps.withdrawReward(item.member);
}

module.exports = {
  pushCoverNotes,
  pushClaimsAssessment,
  pushV1StakingStake,
  pushV1StakingRewards,
};
