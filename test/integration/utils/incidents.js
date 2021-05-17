const { web3 } = require('hardhat');
const { expectEvent } = require('@openzeppelin/test-helpers');

const {
  constants: { ProposalCategory },
} = require('../utils');

const addIncident = async (
  contracts,
  members,
  protocolId,
  incidentDate,
  priceBefore,
) => {
  const { gv } = contracts;
  const proposalId = await gv.getProposalLength();
  await gv.createProposal('', '', '', ProposalCategory.addIncident);
  await gv.categorizeProposal(proposalId, ProposalCategory.addIncident, 0);

  await gv.submitProposalWithSolution(
    proposalId,
    'ipfshash',
    web3.eth.abi.encodeParameters(
      ['address', 'uint', 'uint'],
      [protocolId, incidentDate, priceBefore],
    ),
  );

  for (const member of members) {
    await gv.submitVote(proposalId, 1, { from: member });
  }

  const closeTx = await gv.closeProposal(proposalId);
  expectEvent(closeTx, 'ActionSuccess', { proposalId });

  const proposal = await gv.proposal(proposalId);
  assert.equal(proposal[2].toNumber(), 3, 'proposal status != accepted');
};

module.exports = { addIncident };
