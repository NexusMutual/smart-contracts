const { expect } = require('chai');
const { increaseTime } = require('../../utils').evm;
const { daysToSeconds } = require('../../../lib/helpers');
const { action, proposalTitle, proposalDescHash, proposalSD, solutionHash } = require('./proposalFixture');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');

async function closeProposalSetup() {
  const fixture = await loadFixture(setup);
  const { gv: governance } = fixture.contracts;
  const categoryId = 3;

  const [member] = fixture.accounts.members;

  const proposalId = await governance.getProposalLength();

  await governance
    .connect(member)
    .createProposalwithSolution(proposalTitle, proposalSD, proposalDescHash, categoryId, solutionHash, action);
  return { ...fixture, proposalId };
}

describe('closeProposal', function () {
  it('should fail to close the proposal before vote', async function () {
    const fixture = await loadFixture(closeProposalSetup);
    const { proposalId } = fixture;
    const { gv: governance } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await expect(governance.connect(member).closeProposal(proposalId)).to.be.revertedWithoutReason();
  });

  it('should close the proposal if no vote and set status to denied', async function () {
    const fixture = await loadFixture(closeProposalSetup);
    const { proposalId } = fixture;
    const { gv: governance } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await increaseTime(daysToSeconds(7));
    await governance.connect(member).closeProposal(proposalId);
    const proposal = await governance.proposal(proposalId);
    expect(proposal.status).to.be.equal(6);
    expect(proposal.finalVerdict).to.be.equal(0);
  });

  it('should close proposal', async function () {
    const fixture = await loadFixture(closeProposalSetup);
    const { proposalId } = fixture;
    const { gv: governance } = fixture.contracts;
    const [member] = fixture.accounts.members;

    for (const abMember of fixture.accounts.advisoryBoardMembers) {
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
