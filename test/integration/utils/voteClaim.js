const { web3 } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { toBN } = web3.utils;

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

module.exports = { voteClaim };
