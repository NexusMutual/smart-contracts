const { expect } = require('chai');
const { ethers } = require('hardhat');

const { setNextBlockTime } = require('../../utils').evm;
const createProposalFixture = require('./proposalFixture');
const setup = require('../setup');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

describe('createProposalwithSolution', function () {
  it('should fail to create proposal with solution if category not allowed', async function () {
    const fixture = await loadFixture(setup);
    const { gv: governance } = fixture.contracts;
    const { proposalTitle, proposalSD, proposalDescHash, solutionHash, action } = createProposalFixture;
    const [nonMember] = fixture.accounts.nonMembers;
    const categoryId = 3;

    await expect(
      governance
        .connect(nonMember)
        .createProposalwithSolution(proposalTitle, proposalSD, proposalDescHash, categoryId, solutionHash, action),
    ).to.revertedWith('Not allowed');
  });

  it('should fail to create proposal with solution if category is Uncategorized', async function () {
    const fixture = await loadFixture(setup);
    const { gv: governance } = fixture.contracts;
    const { proposalTitle, proposalSD, proposalDescHash, solutionHash, action } = createProposalFixture;
    const [nonMember] = fixture.accounts.nonMembers;
    const categoryId = 0;

    await expect(
      governance
        .connect(nonMember)
        .createProposalwithSolution(proposalTitle, proposalSD, proposalDescHash, categoryId, solutionHash, action),
    ).to.revertedWithoutReason();
  });

  it('should create proposal with solution', async function () {
    const fixture = await loadFixture(setup);
    const { gv: governance, pc: proposalCategory } = fixture.contracts;
    const { categoryId, proposalTitle, proposalSD, proposalDescHash, solutionHash, action } = createProposalFixture;
    const [member] = fixture.accounts.members;
    const memberAddress = await member.getAddress();
    const proposalId = await governance.getProposalLength();

    const [, , , , , closingTime] = await proposalCategory.category(categoryId);
    const solutionId = 1;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const timestamp = currentTimestamp + 1;
    await setNextBlockTime(timestamp);

    await expect(
      governance
        .connect(member)
        .createProposalwithSolution(proposalTitle, proposalSD, proposalDescHash, categoryId, solutionHash, action),
    )
      .to.emit(governance, 'Proposal')
      .withArgs(memberAddress, proposalId, timestamp, proposalTitle, proposalSD, proposalDescHash)
      .to.emit(governance, 'CloseProposalOnTime')
      .withArgs(proposalId, closingTime.add(timestamp))
      .to.emit(governance, 'Solution')
      .withArgs(proposalId, memberAddress, solutionId, solutionHash, timestamp);

    const nextProposalId = await governance.getProposalLength();
    const [, solution] = await governance.getSolutionAction(proposalId, solutionId);

    expect(solution).to.be.equal(action);
    expect(nextProposalId).to.be.equal(proposalId.add(1));
  });
});
