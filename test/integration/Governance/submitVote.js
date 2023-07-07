const { ethers } = require('hardhat');
const { expect } = require('chai');
const { increaseTime } = require('../../utils').evm;
const { proposalTitle, proposalSD, proposalDescHash, solutionHash, action, categoryId } = require('./proposalFixture');
const setup = require('../setup');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

async function submitVoteSetup() {
  const fixture = await loadFixture(setup);
  const { gv: governance } = fixture.contracts;
  const [member] = fixture.accounts.members;

  const proposalId = await governance.getProposalLength();

  await governance
    .connect(member)
    .createProposalwithSolution(proposalTitle, proposalSD, proposalDescHash, categoryId, solutionHash, action);

  return { ...fixture, proposalId };
}

describe('submitVote', function () {
  it('should fail to submit vote for proposal if sender is not authorize', async function () {
    const fixture = await loadFixture(submitVoteSetup);
    const { proposalId } = fixture;
    const { gv: governance } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await expect(governance.connect(member).submitVote(proposalId, 1)).to.revertedWith('Not Authorized');
  });

  it('should submit vote for proposal', async function () {
    const fixture = await loadFixture(submitVoteSetup);
    const { proposalId } = fixture;
    const { gv: governance } = fixture.contracts;
    const [member] = fixture.accounts.advisoryBoardMembers;
    const solution = 1;

    const { timestamp } = await ethers.provider.getBlock('latest');

    await expect(governance.connect(member).submitVote(proposalId, solution))
      .to.emit(governance, 'Vote')
      .withArgs(member.address, proposalId, 1, timestamp + 1, solution);
  });

  it('should submit vote against proposal', async function () {
    const fixture = await loadFixture(submitVoteSetup);
    const { proposalId } = fixture;
    const { gv: governance } = fixture.contracts;
    const [member] = fixture.accounts.advisoryBoardMembers;
    const solution = 0;

    const { timestamp } = await ethers.provider.getBlock('latest');

    await expect(governance.connect(member).submitVote(proposalId, solution))
      .to.emit(governance, 'Vote')
      .withArgs(member.address, proposalId, 1, timestamp + 1, solution);
  });

  it('should fail to submit vote twice', async function () {
    const fixture = await loadFixture(submitVoteSetup);
    const { proposalId } = fixture;
    const { gv: governance } = fixture.contracts;
    const [member] = fixture.accounts.advisoryBoardMembers;
    const solution = 0;

    await governance.connect(member).submitVote(proposalId, solution);
    await expect(governance.connect(member).submitVote(proposalId, solution)).to.revertedWith('Not allowed');
  });

  it('should fail to submit vote when closed', async function () {
    const fixture = await loadFixture(submitVoteSetup);
    const { proposalId } = fixture;
    const { gv: governance, pc: proposalCategory } = fixture.contracts;
    const { 5: closingTime } = await proposalCategory.category(categoryId);
    const [member] = fixture.accounts.advisoryBoardMembers;
    const solution = 0;
    await increaseTime(closingTime.toNumber());
    await expect(governance.connect(member).submitVote(proposalId, solution)).to.revertedWith('Closed');
  });
});
