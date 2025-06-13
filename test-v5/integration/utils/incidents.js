const { ethers } = require('hardhat');
const { defaultAbiCoder } = ethers.utils;

const {
  constants: { ProposalCategory },
  helpers: { hex },
  evm: { increaseTime },
} = require('../utils');
const { expect } = require('chai');

const addIncident = async (contracts, members, protocolId, incidentDate, priceBefore) => {
  const { gv, pc } = contracts;
  const proposalId = await gv.getProposalLength();
  await gv.createProposal('', '', '', 0);
  await gv.categorizeProposal(proposalId, ProposalCategory.addIncident, 0);

  await gv.submitProposalWithSolution(
    proposalId,
    'ipfshash',
    defaultAbiCoder.encode(['address', 'uint', 'uint'], [protocolId, incidentDate, priceBefore]),
  );

  for (const member of members) {
    await gv.submitVote(proposalId, 1, { from: member });
  }

  const { 5: closingTime } = await pc.category(ProposalCategory.addIncident);
  await increaseTime(closingTime.addn(1).toString());
  await gv.closeProposal(proposalId, { from: members[0] });

  const { val: speedBumpHours } = await gv.getUintParameters(hex('ACWT'));
  await increaseTime(speedBumpHours.muln(3600).addn(1).toString());

  await expect(gv.triggerAction(proposalId)).to.emit(gv, 'ActionSuccess').withArgs(proposalId);

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
    defaultAbiCoder.encode(['address', 'address', 'uint'], [asset, destination, amount]),
  );

  for (const member of members) {
    await gv.submitVote(proposalId, 1, { from: member });
  }

  await expect(gv.closeProposal(proposalId, { from: members[0] }))
    .to.emit(gv, 'ActionSuccess')
    .withArgs(proposalId);

  const proposal = await gv.proposal(proposalId);
  assert.equal(proposal[2].toNumber(), 3, 'proposal status != accepted');
};

module.exports = { addIncident, withdrawAssets };
