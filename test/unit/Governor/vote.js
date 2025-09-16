const { nexus } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const setup = require('./setup');
const { Choice } = nexus.constants;

describe('vote', () => {
  it('reverts if proposal does not exist', async () => {
    const { governor, accounts } = await loadFixture(setup);
    const [abMember] = accounts.advisoryBoardMembers;

    await expect(governor.connect(abMember).vote(999, Choice.For)) //
      .to.be.revertedWithCustomError(governor, 'ProposalNotFound');
  });

  it('reverts if voting period has ended', async () => {
    const { governor, accounts, createABProposal, constants } = await loadFixture(setup);
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;
    const [abMember] = accounts.advisoryBoardMembers;

    const proposalId = await createABProposal();

    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD + 1n);

    await expect(governor.connect(abMember).vote(proposalId, Choice.For)) //
      .to.be.revertedWithCustomError(governor, 'VotePeriodHasEnded');
  });

  it('reverts if proposal is canceled', async () => {
    const { governor, accounts, createABProposal } = await loadFixture(setup);
    const [abMember] = accounts.advisoryBoardMembers;

    const proposalId = await createABProposal();

    await governor.connect(abMember).cancel(proposalId);

    await expect(governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, Choice.For)) //
      .to.be.revertedWithCustomError(governor, 'ProposalIsCanceled');
  });

  it('reverts if proposal is executed', async () => {
    const { governor, accounts, createABProposal, constants } = await loadFixture(setup);
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;
    const [abMember] = accounts.advisoryBoardMembers;

    const proposalId = await createABProposal();

    await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, Choice.For);

    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD);

    await governor.connect(abMember).execute(proposalId);

    await expect(governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, Choice.For)) //
      .to.be.revertedWithCustomError(governor, 'VotePeriodHasEnded');
  });

  it('reverts if proposal non member tries to vote', async () => {
    const { governor, accounts, createMemberProposal } = await loadFixture(setup);
    const [nonMember] = accounts.nonMembers;

    const proposalId = await createMemberProposal();

    await expect(governor.connect(nonMember).vote(proposalId, Choice.For)) //
      .to.be.revertedWithCustomError(governor, 'NotMember');
  });

  it('reverts if proposal member already voted', async () => {
    const { governor, accounts, createABProposal } = await loadFixture(setup);
    const [abMember] = accounts.advisoryBoardMembers;

    const proposalId = await createABProposal();

    await governor.connect(abMember).vote(proposalId, Choice.For);

    await expect(governor.connect(abMember).vote(proposalId, Choice.For)) //
      .to.be.revertedWithCustomError(governor, 'AlreadyVoted');
  });

  it('reverts if member tries to vote on AB member proposal', async () => {
    const { governor, accounts, createABProposal, registry } = await loadFixture(setup);
    const [member] = accounts.members;

    const proposalId = await createABProposal();

    await expect(governor.connect(member).vote(proposalId, Choice.For)) //
      .to.be.revertedWithCustomError(registry, 'NotAdvisoryBoardMember');
  });
});
