const { hex, daysToSeconds } = require('../../lib').helpers;
const { increaseTime } = require('./evm');
const { expect } = require('chai');

const submitProposal = async (gv, category, actionData, members) => {
  const proposalId = await gv.getProposalLength();
  await gv.createProposal('', '', '', '0');
  await gv.categorizeProposal(proposalId, category, 0);
  await gv.submitProposalWithSolution(proposalId, '', actionData);

  for (const member of members) {
    await gv.connect(member).submitVote(proposalId, 1, []);
  }

  await increaseTime(daysToSeconds(7));

  const closeTx = await gv.closeProposal(proposalId);
  expect(closeTx).to.emit(gv, 'ActionSuccess').withArgs(proposalId);

  const proposal = await gv.proposal(proposalId);

  expect(proposal[2]).to.be.equal(3);

  return proposalId;
};

const submitMemberVoteProposal = async (gv, pc, categoryId, actionData, members) => {
  const proposalId = await gv.getProposalLength();

  const from = members[0];
  await gv.createProposal('', '', '', 0, { from });
  await gv.categorizeProposal(proposalId, categoryId, 0, { from });
  await gv.submitProposalWithSolution(proposalId, '', actionData, { from });

  for (const member of members) {
    await gv.submitVote(proposalId, 1, { from: member });
  }

  const { 5: closingTime } = await pc.category(categoryId);
  await increaseTime(closingTime.addn(1).toString());
  await gv.closeProposal(proposalId, { from: members[0] });

  const { val: speedBumpHours } = await gv.getUintParameters(hex('ACWT'));
  await increaseTime(speedBumpHours.muln(3600).addn(1).toString());
  const triggerTx = await gv.triggerAction(proposalId);

  expect(triggerTx).to.emit(gv, 'ActionSuccess').withArgs(proposalId);

  const proposal = await gv.proposal(proposalId);
  expect(proposal[2]).to.be.equal(3, 'proposal status != accepted');
};

module.exports = {
  submitProposal,
  submitMemberVoteProposal,
};
