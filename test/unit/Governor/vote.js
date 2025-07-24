const { nexus } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const setup = require('./setup');
const { VoteType } = nexus.constants;

describe('vote', () => {
  it('reverts if proposal does not exist', async () => {
    const { governor, accounts } = await loadFixture(setup);
    const abMember = accounts.advisoryBoardMembers[0];

    await expect(governor.connect(abMember).vote(999, VoteType.For)).to.be.revertedWithCustomError(
      governor,
      'ProposalNotFound',
    );
  });

  it('reverts if voting period has ended', async () => {
    const { governor, accounts, createABProposal, constants } = await loadFixture(setup);
    const abMember = accounts.advisoryBoardMembers[0];

    const proposalId = await createABProposal();

    await time.increase(constants.VOTING_PERIOD);

    await expect(governor.connect(abMember).vote(proposalId, VoteType.For)).to.be.revertedWithCustomError(
      governor,
      'VotePeriodHasEnded',
    );
  });

  it('reverts if proposal is canceled', async () => {
    const { governor, accounts, createABProposal } = await loadFixture(setup);
    const abMember = accounts.advisoryBoardMembers[0];

    const proposalId = await createABProposal();

    await governor.connect(abMember).cancel(proposalId);

    await expect(
      governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, VoteType.For),
    ).to.be.revertedWithCustomError(governor, 'ProposalIsCanceled');
  });

  it('reverts if proposal is executed', async () => {
    const { governor, accounts, createABProposal, constants } = await loadFixture(setup);
    const abMember = accounts.advisoryBoardMembers[0];

    const proposalId = await createABProposal();

    await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, VoteType.For);
    await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, VoteType.For);
    await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, VoteType.For);

    await time.increase(constants.TIMELOCK_PERIOD);

    await governor.connect(abMember).execute(proposalId);

    await expect(
      governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, VoteType.For),
    ).to.be.revertedWithCustomError(governor, 'ProposalAlreadyExecuted');
  });

  it('reverts if proposal non member tries to vote', async () => {
    const { governor, accounts, createMemberProposal } = await loadFixture(setup);
    const nonMember = accounts.nonMembers[0];

    const proposalId = await createMemberProposal();

    await expect(governor.connect(nonMember).vote(proposalId, VoteType.For)).to.be.revertedWithCustomError(
      governor,
      'NotMember',
    );
  });

  it('reverts if proposal member already voted', async () => {
    const { governor, accounts, createABProposal } = await loadFixture(setup);
    const abMember = accounts.advisoryBoardMembers[0];

    const proposalId = await createABProposal();

    await governor.connect(abMember).vote(proposalId, VoteType.For);

    await expect(governor.connect(abMember).vote(proposalId, VoteType.For)).to.be.revertedWithCustomError(
      governor,
      'AlreadyVoted',
    );
  });

  it('reverts if proposal member tries to vote on AB member proposal', async () => {
    const { governor, accounts, createABProposal } = await loadFixture(setup);
    const member = accounts.members[0];

    const proposalId = await createABProposal();

    await expect(governor.connect(member).vote(proposalId, VoteType.For)).to.be.revertedWithCustomError(
      governor,
      'NotAuthorizedToVote',
    );
  });
});
