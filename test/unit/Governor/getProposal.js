const { ethers, nexus } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const setup = require('./setup');

const { Choice, ProposalStatus } = nexus.constants;
const { ZeroAddress } = ethers;

describe('getProposal', () => {
  it('returns correct proposal data for existing proposal', async () => {
    const { governor, createABProposal, constants } = await loadFixture(setup);
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;

    const timestamp = await time.latest();
    const nextBlockTimestamp = BigInt(timestamp) + 1n;
    await time.setNextBlockTimestamp(nextBlockTimestamp);

    const proposalId = await createABProposal();
    const proposal = await governor.getProposal(proposalId);

    expect(proposal.kind).to.be.equal(0);
    expect(proposal.status).to.be.equal(ProposalStatus.Proposed);
    expect(proposal.proposedAt).to.be.equal(nextBlockTimestamp);
    expect(proposal.voteBefore).to.be.equal(nextBlockTimestamp + VOTING_PERIOD);
    expect(proposal.executeAfter).to.be.equal(nextBlockTimestamp + VOTING_PERIOD + TIMELOCK_PERIOD);
  });

  it('returns correct proposal data for member proposal', async () => {
    const { governor, accounts, tokenController, registry, constants } = await loadFixture(setup);
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;
    const [member] = accounts.members;
    const [abMember] = accounts.advisoryBoardMembers;

    await tokenController.setTotalBalanceOf(member, ethers.parseEther('200'));
    await tokenController.setTotalSupply(ethers.parseEther('10000'));

    const memberId = await registry.memberIds(member);
    const abMemberId = await registry.memberIds(abMember);

    const swaps = [{ from: abMemberId, to: memberId }];

    const timestamp = await time.latest();
    const nextBlockTimestamp = BigInt(timestamp) + 1n;
    await time.setNextBlockTimestamp(nextBlockTimestamp);

    await governor.connect(member).proposeAdvisoryBoardSwap(swaps, 'Member Proposal');
    const proposalId = await governor.proposalCount();

    const proposal = await governor.getProposal(proposalId);

    expect(proposal.kind).to.be.equal(1);
    expect(proposal.status).to.be.equal(ProposalStatus.Proposed);
    expect(proposal.proposedAt).to.be.equal(nextBlockTimestamp);
    expect(proposal.voteBefore).to.be.equal(nextBlockTimestamp + VOTING_PERIOD);
    expect(proposal.executeAfter).to.be.equal(nextBlockTimestamp + VOTING_PERIOD + TIMELOCK_PERIOD);
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
    const [abMember] = accounts.advisoryBoardMembers;

    const txs = [{ target: ZeroAddress, value: 0, data: '0x' }];

    await governor.connect(abMember).propose(txs, 'Test Proposal');
    const proposalId = await governor.proposalCount();
    const { executeAfter } = await governor.getProposal(proposalId);

    await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, Choice.For);
    await time.increaseTo(executeAfter + 1n);

    await governor.connect(abMember).execute(proposalId);

    const proposal = await governor.getProposal(proposalId);
    expect(proposal.status).to.be.equal(ProposalStatus.Executed);
  });

  it('returns updated status after proposal cancellation', async () => {
    const { governor, accounts } = await loadFixture(setup);
    const [abMember] = accounts.advisoryBoardMembers;

    const txs = [{ target: ZeroAddress, value: 0, data: '0x' }];

    await governor.connect(abMember).propose(txs, 'Test Proposal');
    const proposalId = await governor.proposalCount();

    await governor.connect(abMember).cancel(proposalId);

    const proposal = await governor.getProposal(proposalId);
    expect(proposal.status).to.be.equal(ProposalStatus.Canceled);
  });

  it('maintains proposal data integrity through lifecycle', async () => {
    const { governor, accounts } = await loadFixture(setup);
    const [abMember] = accounts.advisoryBoardMembers;

    const txs = [{ target: ZeroAddress, value: 0, data: '0x' }];

    await governor.connect(abMember).propose(txs, 'Test Proposal');
    const proposalId = await governor.proposalCount();

    const initialProposal = await governor.getProposal(proposalId);
    const initialProposedAt = initialProposal.proposedAt;
    const initialExecuteAfter = initialProposal.executeAfter;

    await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, Choice.For);

    const voteBeforeAfterThreshold = await time.latest();

    const proposalAfterVote = await governor.getProposal(proposalId);
    expect(proposalAfterVote.proposedAt).to.be.equal(initialProposedAt);
    expect(proposalAfterVote.voteBefore).to.be.equal(voteBeforeAfterThreshold);

    expect(proposalAfterVote.executeAfter).to.be.lessThanOrEqual(initialExecuteAfter);

    await time.increaseTo(initialProposal.executeAfter + 1n);

    await governor.connect(abMember).execute(proposalId);

    const finalProposal = await governor.getProposal(proposalId);
    expect(finalProposal.proposedAt).to.be.equal(initialProposedAt);
    expect(finalProposal.voteBefore).to.be.equal(voteBeforeAfterThreshold);
    expect(finalProposal.status).to.be.equal(ProposalStatus.Executed);
  });
});
