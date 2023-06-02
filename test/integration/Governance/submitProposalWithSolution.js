const { expect } = require('chai');
const { proposalTitle, proposalDescHash, proposalSD, categoryId, solutionHash, action } = require('./proposalFixture');

describe('submitProposalWithSolution', function () {
  let proposalId;
  beforeEach(async function () {
    const { gv: governance } = this.contracts;
    const [member] = this.accounts.members;
    proposalId = await governance.getProposalLength();

    await governance.connect(member).createProposal(proposalTitle, proposalSD, proposalDescHash, categoryId);
  });

  it('should fail to submit proposal proposal if sender is not owner', async function () {
    const { gv: governance } = this.contracts;
    const [, member] = this.accounts.members;

    await expect(
      governance.connect(member).submitProposalWithSolution(proposalId, solutionHash, action),
    ).to.revertedWith('Not allowed');
  });

  it('should submit a solution for a proposal', async function () {
    const { gv: governance } = this.contracts;
    const [member] = this.accounts.members;
    await governance.connect(member).submitProposalWithSolution(proposalId, solutionHash, action);
  });
});
