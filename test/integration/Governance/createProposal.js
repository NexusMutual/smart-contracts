const { expect } = require('chai');
const { setNextBlockTime } = require('../../utils').evm;
const { proposalTitle, proposalSD, proposalDescHash } = require('./proposalFixture');

describe('createProposal', function () {
  it('should fail to create proposal if category not allowed', async function () {
    const { gv: governance } = this.contracts;
    const [nonMember] = this.accounts.nonMembers;
    const categoryId = 1;

    await expect(
      governance.connect(nonMember).createProposal(proposalTitle, proposalSD, proposalDescHash, categoryId),
    ).to.revertedWith('Not allowed');
  });

  it('should fail to create proposal if sender is not a member', async function () {
    const { gv: governance } = this.contracts;
    const [nonMember] = this.accounts.nonMembers;
    const categoryId = 0;

    await expect(
      governance.connect(nonMember).createProposal(proposalTitle, proposalSD, proposalDescHash, categoryId),
    ).to.revertedWith('Not Member');
  });

  it('should create proposal', async function () {
    const { gv: governance } = this.contracts;
    const [member] = this.accounts.members;
    const memberAddress = await member.getAddress();
    const categoryId = 0;

    const proposalCountBefore = await governance.getProposalLength();
    const timestamp = Math.floor(Date.now());
    await setNextBlockTime(timestamp);

    await expect(governance.connect(member).createProposal(proposalTitle, proposalSD, proposalDescHash, categoryId))
      .to.emit(governance, 'Proposal')
      .withArgs(memberAddress, proposalCountBefore, timestamp, proposalTitle, proposalSD, proposalDescHash);
    const proposalCountAfter = await governance.getProposalLength();
    expect(proposalCountAfter).to.be.equal(proposalCountBefore.add(1));
  });
});
