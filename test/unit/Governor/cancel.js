const { nexus } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const setup = require('./setup');

const { Choice } = nexus.constants;

async function cancelABProposalSetup() {
  const fixture = await loadFixture(setup);
  const { createABProposal } = await loadFixture(setup);
  const proposalId = await createABProposal();
  return { ...fixture, proposalId };
}

async function cancelMemberProposalSetup() {
  const fixture = await loadFixture(setup);
  const { createMemberProposal } = await loadFixture(setup);
  const proposalId = await createMemberProposal();
  return { ...fixture, proposalId };
}

describe('cancel', () => {
  it('allows AB member to cancel proposal', async () => {
    const fixture = await loadFixture(cancelABProposalSetup);
    const { accounts, governor, proposalId } = fixture;
    const abMember = accounts.advisoryBoardMembers[0];

    await expect(governor.connect(abMember).cancel(proposalId))
      .to.emit(governor, 'ProposalCanceled')
      .withArgs(proposalId);

    const proposal = await governor.getProposal(proposalId);
    expect(proposal.status).to.be.equal(2); // Canceled
  });

  it('reverts if non-AB member tries to cancel', async () => {
    const fixture = await loadFixture(cancelABProposalSetup);
    const { accounts, governor, proposalId } = fixture;
    const member = accounts.members[0];

    await expect(governor.connect(member).cancel(proposalId)).to.be.revertedWithCustomError(
      governor,
      'OnlyAdvisoryBoardMember',
    );
  });

  it('reverts if caller is not a member at all', async () => {
    const { governor, accounts, proposalId } = await loadFixture(cancelABProposalSetup);
    const nonMember = accounts.nonMembers[0];

    await expect(governor.connect(nonMember).cancel(proposalId)).to.be.revertedWithCustomError(
      governor,
      'OnlyAdvisoryBoardMember',
    );
  });

  it('reverts if proposal does not exist', async () => {
    const fixture = await loadFixture(cancelABProposalSetup);
    const { accounts, governor } = fixture;
    const abMember = accounts.advisoryBoardMembers[0];

    await expect(governor.connect(abMember).cancel(999)).to.be.revertedWithCustomError(governor, 'ProposalNotFound');
  });

  it('reverts if proposal is already executed', async () => {
    const fixture = await loadFixture(cancelABProposalSetup);
    const { accounts, constants, governor, proposalId } = fixture;
    const { VOTING_PERIOD, TIMELOCK_PERIOD } = constants;
    const abMember = accounts.advisoryBoardMembers[0];

    // Vote to meet AB threshold (3 votes)
    await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, Choice.For);

    // Fast forward past full voting period and timelock
    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD + 1n);

    // Execute proposal
    await governor.connect(abMember).execute(proposalId);

    // Try to cancel executed proposal
    await expect(governor.connect(abMember).cancel(proposalId)).to.be.revertedWithCustomError(
      governor,
      'ProposalAlreadyExecuted',
    );
  });

  it('reverts if proposal is already canceled', async () => {
    const fixture = await loadFixture(cancelABProposalSetup);
    const { accounts, governor, proposalId } = fixture;
    const abMember = accounts.advisoryBoardMembers[0];

    // Cancel proposal first time
    await governor.connect(abMember).cancel(proposalId);

    // Try to cancel again
    await expect(governor.connect(abMember).cancel(proposalId)).to.be.revertedWithCustomError(
      governor,
      'ProposalIsCanceled',
    );
  });

  it('reverts if trying to vote on canceled proposal', async () => {
    const fixture = await loadFixture(cancelABProposalSetup);
    const { accounts, governor, proposalId } = fixture;
    const abMember = accounts.advisoryBoardMembers[0];
    const abMember2 = accounts.advisoryBoardMembers[1];

    // Cancel proposal
    await governor.connect(abMember).cancel(proposalId);

    // Try to vote on canceled proposal
    await expect(governor.connect(abMember2).vote(proposalId, Choice.For)).to.be.revertedWithCustomError(
      governor,
      'ProposalIsCanceled',
    );
  });

  it('revert when executing canceled proposal', async () => {
    const fixture = await loadFixture(cancelABProposalSetup);
    const { accounts, constants, governor, proposalId } = fixture;
    const { VOTING_PERIOD, TIMELOCK_PERIOD } = constants;
    const abMember = accounts.advisoryBoardMembers[0];

    // Cancel proposal
    await governor.connect(abMember).cancel(proposalId);

    // Fast forward past timelock
    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD + 1n);

    // Try to execute canceled proposal
    await expect(governor.connect(abMember).execute(proposalId)).to.be.revertedWithCustomError(
      governor,
      'ProposalIsCanceled',
    );
  });

  it('allows different AB member to cancel', async () => {
    const fixture = await loadFixture(cancelABProposalSetup);
    const { accounts, governor, proposalId } = fixture;
    const abMember2 = accounts.advisoryBoardMembers[1];

    await expect(governor.connect(abMember2).cancel(proposalId))
      .to.emit(governor, 'ProposalCanceled')
      .withArgs(proposalId);

    const proposal = await governor.getProposal(proposalId);
    expect(proposal.status).to.be.equal(2); // Canceled
  });

  it('reverts if trying to cancel member proposal', async () => {
    const fixture = await loadFixture(cancelMemberProposalSetup);
    const { accounts, governor, proposalId } = fixture;
    const abMember = accounts.advisoryBoardMembers[0];

    await expect(governor.connect(abMember).cancel(proposalId)).to.be.revertedWithCustomError(
      governor,
      'CannotCancelMemberProposal',
    );
  });

  it('reverts if member tries to cancel their own proposal', async () => {
    const { governor, accounts, proposalId } = await loadFixture(cancelMemberProposalSetup);
    const member = accounts.members[0];

    await expect(governor.connect(member).cancel(proposalId)).to.be.revertedWithCustomError(
      governor,
      'OnlyAdvisoryBoardMember',
    );
  });
});
