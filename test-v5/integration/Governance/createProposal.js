const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setNextBlockTime } = require('../../utils').evm;
const { proposalTitle, proposalSD, proposalDescHash } = require('./proposalFixture');
const setup = require('../setup');

describe('createProposal', function () {
  it('should fail to create proposal if category not allowed', async function () {
    const fixture = await loadFixture(setup);
    const { gv: governance } = fixture.contracts;
    const [nonMember] = fixture.accounts.nonMembers;
    const categoryId = 1;

    await expect(
      governance.connect(nonMember).createProposal(proposalTitle, proposalSD, proposalDescHash, categoryId),
    ).to.revertedWith('Not allowed');
  });

  it('should fail to create proposal if sender is not a member', async function () {
    const fixture = await loadFixture(setup);
    const { gv: governance } = fixture.contracts;
    const [nonMember] = fixture.accounts.nonMembers;
    const categoryId = 0;

    await expect(
      governance.connect(nonMember).createProposal(proposalTitle, proposalSD, proposalDescHash, categoryId),
    ).to.revertedWith('Not Member');
  });

  it('should create proposal', async function () {
    const fixture = await loadFixture(setup);
    const { gv: governance } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const memberAddress = await member.getAddress();
    const categoryId = 0;

    const proposalCountBefore = await governance.getProposalLength();
    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const timestamp = currentTimestamp + 1;
    await setNextBlockTime(timestamp);

    await expect(governance.connect(member).createProposal(proposalTitle, proposalSD, proposalDescHash, categoryId))
      .to.emit(governance, 'Proposal')
      .withArgs(memberAddress, proposalCountBefore, timestamp, proposalTitle, proposalSD, proposalDescHash);
    const proposalCountAfter = await governance.getProposalLength();
    expect(proposalCountAfter).to.be.equal(proposalCountBefore.add(1));
  });
});
