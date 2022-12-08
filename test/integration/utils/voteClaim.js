const { web3,
  ethers
} = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { daysToSeconds } = require('../../../lib/helpers');
const { parseEther } = ethers.utils;
const {
  setNextBlockTime,
  mineNextBlock
} = require('../../utils/evm');
const { toBN } = web3.utils;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

async function voteClaim({ claimId, verdict, cl, cd, cr, voter }) {
  await cl.submitCAVote(claimId, toBN(verdict), { from: voter });

  const minVotingTime = await cd.minVotingTime();
  await time.increase(minVotingTime.addn(1));

  const voteStatusBefore = await cl.checkVoteClosing(claimId);
  assert.equal(voteStatusBefore.toString(), '1', 'should allow vote closing');

  await cr.closeClaim(claimId);
  const voteStatusAfter = await cl.checkVoteClosing(claimId);
  assert.equal(voteStatusAfter.toString(), '-1', 'voting should be closed');
}


async function acceptClaim({ staker, assessmentStakingAmount, as }) {
  const { payoutCooldownInDays } = await as.config();
  await as.connect(staker).stake(assessmentStakingAmount);

  await as.connect(staker).castVotes([0], [true], ['Assessment data hash'], 0);

  const { poll } = await as.assessments(0);
  const futureTime = poll.end + daysToSeconds(payoutCooldownInDays);

  await setTime(futureTime);
}

async function rejectClaim({ approvingStaker, rejectingStaker, as }) {
  const assessmentStakingAmountForApproval = parseEther('1000');
  const assessmentStakingAmountForRejection = parseEther('2000');
  const { payoutCooldownInDays } = await as.config();
  await as.connect(approvingStaker).stake(assessmentStakingAmountForApproval);

  await as.connect(approvingStaker).castVotes([0], [true], ['Assessment data hash'], 0);

  await as.connect(rejectingStaker).stake(assessmentStakingAmountForRejection);
  await as.connect(rejectingStaker).castVotes([0], [false], ['Assessment data hash'], 0);

  const { poll } = await as.assessments(0);
  const futureTime = poll.end + daysToSeconds(payoutCooldownInDays);

  await setTime(futureTime);
}

module.exports = { voteClaim, acceptClaim, rejectClaim };
