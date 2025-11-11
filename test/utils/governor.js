const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { nexus } = require('hardhat');

const { Choice } = nexus.constants;

/**
 * Helper function to execute a governance proposal through the full lifecycle
 * @param {Object} governor - Governor contract instance
 * @param {Array} abMembers - Array of advisory board member signers
 * @param {Array} txs - Array of transaction objects to execute
 * @param {string} description - Optional proposal description
 * @returns {Promise<BigInt>} The executed proposal ID
 */
async function executeGovernorProposal(governor, abMembers, txs, description = 'Governor Proposal') {
  const [proposer] = abMembers;
  await governor.connect(proposer).propose(txs, description);
  const proposalId = await governor.proposalCount();

  for (const voter of abMembers.slice(0, 3)) {
    await governor.connect(voter).vote(proposalId, Choice.For);
  }

  const VOTING_PERIOD = await governor.VOTING_PERIOD();
  const TIMELOCK_PERIOD = await governor.TIMELOCK_PERIOD();
  await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD);

  await governor.connect(proposer).execute(proposalId);

  return proposalId;
}

module.exports = {
  executeGovernorProposal,
};

