const { expect } = require('chai');
const { proposalTitle, proposalSD, proposalDescHash } = require('./proposalFixture');

describe('categorizeProposal', function () {
  let proposalId;
  beforeEach(async function () {
    const { gv: governance } = this.contracts;
    const categoryId = 0;
    const [member] = this.accounts.members;
    proposalId = await governance.getProposalLength();

    await governance.connect(member).createProposal(proposalTitle, proposalSD, proposalDescHash, categoryId);
  });

  it('should fail to categorize proposal if sender is not owner', async function () {
    const { gv: governance } = this.contracts;
    const [, member] = this.accounts.members;
    const categoryId = 1;

    await expect(governance.connect(member).categorizeProposal(proposalId, categoryId, 0)).to.revertedWith(
      'Not allowed',
    );
  });

  it('should categorize proposal', async function () {
    const { gv: governance } = this.contracts;
    const { defaultSender } = this.accounts;
    const senderAddress = await defaultSender.getAddress();
    const categoryId = 3;

    await expect(governance.categorizeProposal(proposalId, categoryId, 0))
      .to.emit(governance, 'ProposalCategorized')
      .withArgs(proposalId, senderAddress, categoryId);
  });
});
