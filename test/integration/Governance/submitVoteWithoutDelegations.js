const { ethers } = require('hardhat');
const { expect } = require('chai');
const { increaseTime } = require('../../utils').evm;
const { proposalTitle, proposalSD, proposalDescHash, categoryId, solutionHash, action } = require('./proposalFixture');

describe('submitVoteWithoutDelegations', function () {
  let proposalId;
  beforeEach(async function () {
    const { gv: governance } = this.contracts;
    const [member] = this.accounts.members;
    proposalId = await governance.getProposalLength();

    await governance
      .connect(member)
      .createProposalwithSolution(proposalTitle, proposalSD, proposalDescHash, categoryId, solutionHash, action);
  });

  it('should fail to submit vote for proposal if sender is not authorize', async function () {
    const { gv: governance } = this.contracts;
    const [member] = this.accounts.members;

    await expect(governance.connect(member).submitVoteWithoutDelegations(proposalId, 1)).to.revertedWith(
      'Not Authorized',
    );
  });

  it('should submit vote for proposal', async function () {
    const { gv: governance } = this.contracts;
    const [member] = this.accounts.advisoryBoardMembers;
    const solution = 1;

    const { timestamp } = await ethers.provider.getBlock('latest');

    await expect(governance.connect(member).submitVoteWithoutDelegations(proposalId, solution))
      .to.emit(governance, 'Vote')
      .withArgs(member.address, proposalId, 1, timestamp + 1, solution);
  });

  it('should submit vote against proposal', async function () {
    const { gv: governance } = this.contracts;
    const [member] = this.accounts.advisoryBoardMembers;
    const solution = 0;

    const { timestamp } = await ethers.provider.getBlock('latest');

    await expect(governance.connect(member).submitVoteWithoutDelegations(proposalId, solution))
      .to.emit(governance, 'Vote')
      .withArgs(member.address, proposalId, 1, timestamp + 1, solution);
  });

  it('should fail to submit vote twice', async function () {
    const { gv: governance } = this.contracts;
    const [member] = this.accounts.advisoryBoardMembers;
    const solution = 0;

    await governance.connect(member).submitVoteWithoutDelegations(proposalId, solution);
    await expect(governance.connect(member).submitVoteWithoutDelegations(proposalId, solution)).to.revertedWith(
      'Not allowed',
    );
  });

  it('should fail to submit vote when closed', async function () {
    const { gv: governance, pc: proposalCategory } = this.contracts;
    const { 5: closingTime } = await proposalCategory.category(categoryId);
    const [member] = this.accounts.advisoryBoardMembers;
    const solution = 0;
    await increaseTime(closingTime.toNumber());
    await expect(governance.connect(member).submitVoteWithoutDelegations(proposalId, solution)).to.revertedWith(
      'Closed',
    );
  });
});
