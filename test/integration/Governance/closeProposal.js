const { expect } = require('chai');
const { increaseTime } = require('../../utils').evm;
const { daysToSeconds } = require('../../../lib/helpers');
const { action, proposalTitle, proposalDescHash, proposalSD, solutionHash } = require('./proposalFixture');

describe('closeProposal', function () {
  let proposalId;
  beforeEach(async function () {
    const { gv: governance } = this.contracts;
    const categoryId = 3;

    const [member] = this.accounts.members;

    proposalId = await governance.getProposalLength();

    await governance
      .connect(member)
      .createProposalwithSolution(proposalTitle, proposalSD, proposalDescHash, categoryId, solutionHash, action);
  });

  it('should fail to close the proposal before vote', async function () {
    const { gv: governance } = this.contracts;
    const [member] = this.accounts.members;

    await expect(governance.connect(member).closeProposal(proposalId)).to.be.revertedWithoutReason();
  });

  it('should close the proposal if no vote and set status to denied', async function () {
    const { gv: governance } = this.contracts;
    const [member] = this.accounts.members;

    await increaseTime(daysToSeconds(7));
    await governance.connect(member).closeProposal(proposalId);
    const proposal = await governance.proposal(proposalId);
    expect(proposal.status).to.be.equal(6);
    expect(proposal.finalVerdict).to.be.equal(0);
  });

  it('should close proposal', async function () {
    const { gv: governance } = this.contracts;
    const [member] = this.accounts.members;

    for (const abMember of this.accounts.advisoryBoardMembers) {
      await governance.connect(abMember).submitVote(proposalId, 1);
    }
    await expect(governance.connect(member).closeProposal(proposalId))
      .to.emit(governance, 'ProposalAccepted')
      .withArgs(proposalId);
    const proposal = await governance.proposal(proposalId);
    expect(proposal.status).to.be.equal(3);
    expect(proposal.finalVerdict).to.be.equal(1);
  });
});
