const { ethers, nexus } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const setup = require('./setup');

const { VoteType } = nexus.constants;

describe('getProposal', () => {
  it('returns correct proposal data for existing proposal', async () => {
    const { governor, createABProposal } = await loadFixture(setup);

    const timestamp = await time.latest();
    const nextBlockTimestamp = timestamp + 1;
    await time.setNextBlockTimestamp(timestamp + 1);

    const proposalId = await createABProposal();
    const proposal = await governor.getProposal(proposalId);

    expect(proposal.kind).to.be.equal(0);
    expect(proposal.status).to.be.equal(0);
    expect(proposal.proposedAt).to.be.equal(nextBlockTimestamp);
    expect(proposal.voteBefore).to.be.equal(nextBlockTimestamp + 3 * 24 * 3600);
    expect(proposal.executeAfter).to.be.equal(nextBlockTimestamp + 24 * 3600);
  });

  it('returns correct proposal data for member proposal', async () => {
    const { governor, accounts, tokenController, registry } = await loadFixture(setup);
    const member = accounts.members[0];
    const abMember = accounts.advisoryBoardMembers[0];

    await tokenController.setTotalBalanceOf(member.address, ethers.parseEther('200'));

    const memberId = await registry.memberIds(member.address);
    const abMemberId = await registry.memberIds(abMember.address);

    const swaps = [
      {
        from: abMemberId,
        to: memberId,
      },
    ];

    const timestamp = await time.latest();
    const nextBlockTimestamp = timestamp + 1;
    await time.setNextBlockTimestamp(timestamp + 1);

    await governor.connect(member).proposeAdvisoryBoardSwap(swaps, 'Member Proposal');
    const proposalId = await governor.proposalCount();

    const proposal = await governor.getProposal(proposalId);

    expect(proposal.kind).to.be.equal(1);
    expect(proposal.status).to.be.equal(0);
    expect(proposal.proposedAt).to.be.equal(nextBlockTimestamp);
    expect(proposal.voteBefore).to.be.equal(nextBlockTimestamp + 3 * 24 * 3600);
    expect(proposal.executeAfter).to.be.equal(nextBlockTimestamp + 24 * 3600);
  });

  it('returns zero values for non-existent proposal', async () => {
    const { governor } = await loadFixture(setup);

    const proposal = await governor.getProposal(999);

    expect(proposal.kind).to.be.equal(0);
    expect(proposal.status).to.be.equal(0);
    expect(proposal.proposedAt).to.be.equal(0);
    expect(proposal.voteBefore).to.be.equal(0);
    expect(proposal.executeAfter).to.be.equal(0);
  });

  it('returns updated status after proposal execution', async () => {
    const { governor, accounts } = await loadFixture(setup);
    const abMember = accounts.advisoryBoardMembers[0];

    const txs = [
      {
        target: ethers.ZeroAddress,
        value: 0,
        data: '0x',
      },
    ];

    await governor.connect(abMember).propose(txs, 'Test Proposal');
    const proposalId = await governor.proposalCount();
    const proposalBefore = await governor.getProposal(proposalId);

    await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, VoteType.For);
    await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, VoteType.For);
    await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, VoteType.For);
    await time.increaseTo(Number(proposalBefore.executeAfter + 1n));

    await governor.connect(abMember).execute(proposalId);

    const proposal = await governor.getProposal(proposalId);
    expect(proposal.status).to.be.equal(1);
  });

  it('returns updated status after proposal cancellation', async () => {
    const { governor, accounts } = await loadFixture(setup);
    const abMember = accounts.advisoryBoardMembers[0];

    const txs = [
      {
        target: ethers.ZeroAddress,
        value: 0,
        data: '0x',
      },
    ];

    await governor.connect(abMember).propose(txs, 'Test Proposal');
    const proposalId = await governor.proposalCount();

    await governor.connect(abMember).cancel(proposalId);

    const proposal = await governor.getProposal(proposalId);
    expect(proposal.status).to.be.equal(2);
  });

  it('maintains proposal data integrity through lifecycle', async () => {
    const { governor, accounts } = await loadFixture(setup);
    const abMember = accounts.advisoryBoardMembers[0];

    const txs = [
      {
        target: ethers.ZeroAddress,
        value: 0,
        data: '0x',
      },
    ];

    await governor.connect(abMember).propose(txs, 'Test Proposal');
    const proposalId = await governor.proposalCount();

    const initialProposal = await governor.getProposal(proposalId);
    const initialProposedAt = initialProposal.proposedAt;
    const initialVoteBefore = initialProposal.voteBefore;
    const initialExecuteAfter = initialProposal.executeAfter;

    await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, VoteType.For);
    await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, VoteType.For);
    await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, VoteType.For);

    const proposalAfterVote = await governor.getProposal(proposalId);
    expect(proposalAfterVote.proposedAt).to.be.equal(initialProposedAt);
    expect(proposalAfterVote.voteBefore).to.be.equal(initialVoteBefore);

    expect(proposalAfterVote.executeAfter).to.be.greaterThanOrEqual(initialExecuteAfter);

    await time.increaseTo(Number(initialProposal.executeAfter + 1n));

    await governor.connect(abMember).execute(proposalId);

    const finalProposal = await governor.getProposal(proposalId);
    expect(finalProposal.proposedAt).to.be.equal(initialProposedAt);
    expect(finalProposal.voteBefore).to.be.equal(initialVoteBefore);
    expect(finalProposal.status).to.be.equal(1);
  });
});
