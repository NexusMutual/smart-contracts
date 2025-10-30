const { ethers } = require('hardhat');
const { parseEther } = ethers.utils;
const { setNextBlockTime, mineNextBlock, increaseTime } = require('../../utils/evm');
const { BigNumber } = ethers;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

async function voteClaim({ claimId, verdict, ic, cd, cr, voter }) {
  await ic.submitCAVote(claimId, BigNumber.from(verdict), { from: voter });

  const minVotingTime = await cd.minVotingTime();
  await increaseTime(minVotingTime.addn(1));

  const voteStatusBefore = await ic.checkVoteClosing(claimId);
  assert.equal(voteStatusBefore.toString(), '1', 'should allow vote closing');

  await cr.closeClaim(claimId);
  const voteStatusAfter = await ic.checkVoteClosing(claimId);
  assert.equal(voteStatusAfter.toString(), '-1', 'voting should be closed');
}

async function acceptClaim({ staker, assessmentStakingAmount, as, assessmentId }) {
  const payoutCooldown = (await as.getPayoutCooldown()).toNumber();
  await as.connect(staker).stake(assessmentStakingAmount);

  await as.connect(staker).castVotes([assessmentId], [true], ['Assessment data hash'], 0);

  const { poll } = await as.assessments(assessmentId);
  const futureTime = poll.end + payoutCooldown;

  await setTime(futureTime);
}

async function rejectClaim({ approvingStaker, rejectingStaker, as, assessmentId }) {
  const assessmentStakingAmountForApproval = parseEther('1000');
  const assessmentStakingAmountForRejection = parseEther('2000');
  const payoutCooldown = (await as.getPayoutCooldown()).toNumber();
  await as.connect(approvingStaker).stake(assessmentStakingAmountForApproval);

  await as.connect(approvingStaker).castVotes([assessmentId], [true], ['Assessment data hash'], 0);

  await as.connect(rejectingStaker).stake(assessmentStakingAmountForRejection);
  await as.connect(rejectingStaker).castVotes([assessmentId], [false], ['Assessment data hash'], 0);

  const { poll } = await as.assessments(assessmentId);
  const futureTime = poll.end + payoutCooldown;

  await setTime(futureTime);
}

module.exports = { voteClaim, acceptClaim, rejectClaim };
