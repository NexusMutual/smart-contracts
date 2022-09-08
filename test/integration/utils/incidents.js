const { web3 } = require('hardhat');
const { expectEvent, time } = require('@openzeppelin/test-helpers');

const {
  constants: { ProposalCategory },
  helpers: { hex },
} = require('../utils');

const addIncident = async (contracts, members, protocolId, incidentDate, priceBefore) => {
  const { gv, pc } = contracts;
  const proposalId = await gv.getProposalLength();
  await gv.createProposal('', '', '', 0);
  await gv.categorizeProposal(proposalId, ProposalCategory.addIncident, 0);

  await gv.submitProposalWithSolution(
    proposalId,
    'ipfshash',
    web3.eth.abi.encodeParameters(['address', 'uint', 'uint'], [protocolId, incidentDate, priceBefore]),
  );

  for (const member of members) {
    await gv.submitVote(proposalId, 1, { from: member });
  }

  const { 5: closingTime } = await pc.category(ProposalCategory.addIncident);
  await time.increase(closingTime.addn(1).toString());
  await gv.closeProposal(proposalId, { from: members[0] });

  const { val: speedBumpHours } = await gv.getUintParameters(hex('ACWT'));
  await time.increase(speedBumpHours.muln(3600).addn(1).toString());
  const triggerTx = await gv.triggerAction(proposalId);

  expectEvent(triggerTx, 'ActionSuccess', { proposalId });

  const proposal = await gv.proposal(proposalId);
  assert.equal(proposal[2].toNumber(), 3, 'proposal status != accepted');
};

const withdrawAssets = async (contracts, members, asset, destination, amount) => {
  const { gv } = contracts;
  const proposalId = await gv.getProposalLength();
  await gv.createProposal('', '', '', 0);
  await gv.categorizeProposal(proposalId, ProposalCategory.withdrawAsset, 0);

  await gv.submitProposalWithSolution(
    proposalId,
    'ipfshash',
    web3.eth.abi.encodeParameters(['address', 'address', 'uint'], [asset, destination, amount]),
  );

  for (const member of members) {
    await gv.submitVote(proposalId, 1, { from: member });
  }

  const closeTx = await gv.closeProposal(proposalId, { from: members[0] });
  expectEvent(closeTx, 'ActionSuccess', { proposalId });

  const proposal = await gv.proposal(proposalId);
  assert.equal(proposal[2].toNumber(), 3, 'proposal status != accepted');
};

module.exports = { addIncident, withdrawAssets };
