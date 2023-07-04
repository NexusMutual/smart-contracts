const { expect } = require('chai');
const { proposalTitle, proposalSD, proposalDescHash } = require('./proposalFixture');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');

describe('categorizeProposal', function () {
  let proposalId;
  let fixture;
  beforeEach(async function () {
    fixture = await loadFixture(setup);
    const { gv: governance } = fixture.contracts;
    const categoryId = 0;
    const [member] = fixture.accounts.members;
    proposalId = await governance.getProposalLength();

    await governance.connect(member).createProposal(proposalTitle, proposalSD, proposalDescHash, categoryId);
  });

  it('should fail to categorize proposal if sender role is not authorized', async function () {
    const { gv: governance } = fixture.contracts;
    const [, member] = fixture.accounts.members;
    const categoryId = 1;

    await expect(governance.connect(member).categorizeProposal(proposalId, categoryId, 0)).to.revertedWith(
      'Not allowed',
    );
  });

  it('should categorize proposal', async function () {
    const { gv: governance } = fixture.contracts;
    const { defaultSender } = fixture.accounts;
    const senderAddress = await defaultSender.getAddress();
    const categoryId = 3;

    await expect(governance.categorizeProposal(proposalId, categoryId, 0))
      .to.emit(governance, 'ProposalCategorized')
      .withArgs(proposalId, senderAddress, categoryId);
  });
});
