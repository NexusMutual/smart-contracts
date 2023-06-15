const { ethers } = require('hardhat');
const { expect } = require('chai');
const { proposalTitle, proposalSD, proposalDescHash } = require('./proposalFixture');

const updateProposalFixture = {
  proposalTitle: 'Proposal Title on Update',
  proposalSD: 'Proposal SD on Update',
  proposalDescHash: 'Proposal Desc Hash on Update',
  categoryId: 0,
};

describe('updateProposal', function () {
  let proposalId;
  beforeEach(async function () {
    const { gv: governance } = this.contracts;
    const categoryId = 0;
    const [member] = this.accounts.members;
    proposalId = await governance.getProposalLength();

    await governance.connect(member).createProposal(proposalTitle, proposalSD, proposalDescHash, categoryId);
  });

  it('should fail to update the proposal if sender role is not authorized', async function () {
    const { gv: governance } = this.contracts;
    const [, member] = this.accounts.members;
    const { proposalTitle, proposalSD, proposalDescHash } = updateProposalFixture;

    await expect(
      governance.connect(member).updateProposal(proposalId, proposalTitle, proposalSD, proposalDescHash),
    ).to.revertedWith('Not allowed');
  });

  it('should update the proposal', async function () {
    const { gv: governance } = this.contracts;
    const [member] = this.accounts.members;
    const memberAddress = await member.getAddress();
    const { proposalTitle, proposalSD, proposalDescHash } = updateProposalFixture;
    const { timestamp } = await ethers.provider.getBlock('latest');

    await expect(governance.connect(member).updateProposal(proposalId, proposalTitle, proposalSD, proposalDescHash))
      .to.emit(governance, 'Proposal')
      .withArgs(memberAddress, proposalId, timestamp + 1, proposalTitle, proposalSD, proposalDescHash);
  });
});
