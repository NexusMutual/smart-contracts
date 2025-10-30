const { expect } = require('chai');
const { proposalTitle, proposalDescHash, proposalSD, categoryId, solutionHash, action } = require('./proposalFixture');
const setup = require('../setup');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

async function submitProposalWithSolutionSetup() {
  const fixture = await loadFixture(setup);
  const { gv: governance } = fixture.contracts;
  const [member] = fixture.accounts.members;
  const proposalId = await governance.getProposalLength();

  await governance.connect(member).createProposal(proposalTitle, proposalSD, proposalDescHash, categoryId);

  return {
    ...fixture,
    proposalId,
  };
}

describe('submitProposalWithSolution', function () {
  it('should fail to submit proposal proposal if sender role is not authorized', async function () {
    const fixture = await loadFixture(submitProposalWithSolutionSetup);
    const { proposalId } = fixture;
    const { gv: governance } = fixture.contracts;
    const [, member] = fixture.accounts.members;

    await expect(
      governance.connect(member).submitProposalWithSolution(proposalId, solutionHash, action),
    ).to.revertedWith('Not allowed');
  });

  it('should submit a solution for a proposal', async function () {
    const fixture = await loadFixture(submitProposalWithSolutionSetup);
    const { proposalId } = fixture;
    const { gv: governance } = fixture.contracts;
    const [member] = fixture.accounts.members;
    await governance.connect(member).submitProposalWithSolution(proposalId, solutionHash, action);
  });
});
