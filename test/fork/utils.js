const { time, expectEvent } = require('@openzeppelin/test-helpers');

async function submitGovernanceProposal (categoryId, actionData, members, gv) {

  const id = await gv.getProposalLength();
  console.log(`Creating proposal ${id}`);

  const from = members[0];
  await gv.createProposal('', '', '', 0, { from });
  await gv.categorizeProposal(id, categoryId, 0, { from });
  await gv.submitProposalWithSolution(id, '', actionData, { from });

  for (let i = 0; i < 3; i++) {
    await gv.submitVote(id, 1, { from: members[i] });
  }

  await time.increase(604800);
  const closeTx = await gv.closeProposal(id, { from });
  expectEvent(closeTx, 'ActionSuccess', { proposalId: id });

  const proposal = await gv.proposal(id);
  assert.equal(proposal[2].toNumber(), 3);
}

async function submitMemberVoteGovernanceProposal (categoryId, actionData, members, gv) {

  const id = await gv.getProposalLength();
  console.log(`Creating proposal ${id}`);

  const from = members[0];
  await gv.createProposal('', '', '', 0, { from });
  await gv.categorizeProposal(id, categoryId, 0, { from });
  await gv.submitProposalWithSolution(id, '', actionData, { from });

  for (let i = 0; i < 3; i++) {
    await gv.submitVote(id, 1, { from: members[i] });
  }

  await time.increase(604800);
  const closeTx = await gv.closeProposal(id, { from });
  expectEvent(closeTx, 'ProposalAccepted', { proposalId: id });

  await time.increase(24 * 3600);
  const triggerTx = await gv.triggerAction(id);
  expectEvent(triggerTx, 'ActionSuccess', { proposalId: id });

  const proposal = await gv.proposal(id);
  assert.equal(proposal[2].toNumber(), 3);
}

module.exports = {
  submitGovernanceProposal,
  submitMemberVoteGovernanceProposal,
};
