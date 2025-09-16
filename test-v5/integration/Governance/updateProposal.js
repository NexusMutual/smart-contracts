const { ethers } = require('hardhat');
const { expect } = require('chai');
const { proposalTitle, proposalSD, proposalDescHash } = require('./proposalFixture');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');

const updateProposalFixture = {
  proposalTitle: 'Proposal Title on Update',
  proposalSD: 'Proposal SD on Update',
  proposalDescHash: 'Proposal Desc Hash on Update',
  categoryId: 0,
};

async function updateProposalSetup() {
  const fixture = await loadFixture(setup);
  const { gv: governance } = fixture.contracts;
  const categoryId = 0;
  const [member] = fixture.accounts.members;
  const proposalId = await governance.getProposalLength();

  await governance.connect(member).createProposal(proposalTitle, proposalSD, proposalDescHash, categoryId);

  return { ...fixture, proposalId };
}

describe('updateProposal', function () {
  it('should fail to update the proposal if sender role is not authorized', async function () {
    const fixture = await loadFixture(updateProposalSetup);
    const { proposalId } = fixture;
    const { gv: governance } = fixture.contracts;
    const [, member] = fixture.accounts.members;
    const { proposalTitle, proposalSD, proposalDescHash } = updateProposalFixture;

    await expect(
      governance.connect(member).updateProposal(proposalId, proposalTitle, proposalSD, proposalDescHash),
    ).to.revertedWith('Not allowed');
  });

  it('should update the proposal', async function () {
    const fixture = await loadFixture(updateProposalSetup);
    const { proposalId } = fixture;
    const { gv: governance } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const memberAddress = await member.getAddress();
    const { proposalTitle, proposalSD, proposalDescHash } = updateProposalFixture;
    const { timestamp } = await ethers.provider.getBlock('latest');

    await expect(governance.connect(member).updateProposal(proposalId, proposalTitle, proposalSD, proposalDescHash))
      .to.emit(governance, 'Proposal')
      .withArgs(memberAddress, proposalId, timestamp + 1, proposalTitle, proposalSD, proposalDescHash);
  });
});
