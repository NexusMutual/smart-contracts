const { expect } = require('chai');

const { proposalTitle, proposalSD, proposalDescHash } = require('./proposalFixture');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');

describe('state', function () {
  it('should get proposal', async function () {
    const fixture = await loadFixture(setup);
    const { gv: governance } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const categoryId = 0;

    const proposalId = await governance.getProposalLength();
    await governance.connect(member).createProposal(proposalTitle, proposalSD, proposalDescHash, categoryId);

    const proposal = await governance.proposal(proposalId);

    expect(proposal.proposalId).to.be.equal(proposalId);
    expect(proposal.category).to.be.equal(categoryId);
    expect(proposal.status).to.be.equal(0);
    expect(proposal.finalVerdict).to.be.equal(0);
    expect(proposal.totalReward).to.be.equal(0);
  });

  it('should get proposalDetails', async function () {
    const fixture = await loadFixture(setup);
    const { gv: governance } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const categoryId = 0;

    const proposalId = await governance.getProposalLength();
    await governance.connect(member).createProposal(proposalTitle, proposalSD, proposalDescHash, categoryId);

    const [actualProposalId, solutionsLength, voters] = await governance.proposal(proposalId);

    expect(actualProposalId).to.be.equal(proposalId);
    expect(solutionsLength).to.be.equal(0);
    expect(voters).to.be.equal(0);
  });

  it('should get followers', async function () {
    const fixture = await loadFixture(setup);
    const { gv: governance } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const result = await governance.getFollowers(member.address);
    expect(result.length).to.be.equal(0);
  });

  it('should get pending rewards', async function () {
    const fixture = await loadFixture(setup);
    const { gv: governance } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const reward = await governance.getPendingReward(member.address);
    expect(reward).to.be.equal(0);
  });
});
