const { nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');

const { ProposalKind, ProposalStatus } = nexus.constants;

describe('propose', function () {
  it('should fail to create proposal when called by non-AB member', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const [nonAbMember] = fixture.accounts.members;

    const transactions = [
      {
        target: registry.target,
        value: 0,
        data: registry.interface.encodeFunctionData('setKycAuthAddress', [nonAbMember.address]),
      },
    ];
    const description = 'Unauthorized proposal';

    const proposeTx = governor.connect(nonAbMember).propose(transactions, description);

    await expect(proposeTx).to.be.revertedWithCustomError(governor, 'OnlyAdvisoryBoardMember');
  });
  it('should create AB proposal when called by AB member', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const [abMember] = fixture.accounts.advisoryBoardMembers;

    const proposalCountBefore = await governor.proposalCount();
    const expectedProposalId = proposalCountBefore + 1n;

    const transactions = [
      {
        target: registry.target,
        value: 0,
        data: registry.interface.encodeFunctionData('setKycAuthAddress', [abMember.address]),
      },
    ];
    const description = 'Test AB proposal';

    // propose
    await expect(governor.connect(abMember).propose(transactions, description))
      .to.emit(governor, 'ProposalCreated')
      .withArgs(expectedProposalId, ProposalKind.AdvisoryBoard, description);

    const proposalId = await governor.proposalCount();
    expect(proposalId).to.be.equal(expectedProposalId);

    const proposal = await governor.getProposal(proposalId);
    expect(proposal.kind).to.equal(ProposalKind.AdvisoryBoard);
    expect(proposal.status).to.equal(ProposalStatus.Proposed);

    const storedTxs = await governor.getProposalTransactions(proposalId);
    expect(storedTxs.length).to.equal(1);
    expect(storedTxs[0].target).to.equal(transactions[0].target);
    expect(storedTxs[0].value).to.equal(transactions[0].value);
    expect(storedTxs[0].data).to.equal(transactions[0].data);

    const storedDescription = await governor.getProposalDescription(proposalId);
    expect(storedDescription).to.equal(description);
  });

  it('should create AB proposal with multiple transactions', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const [abMember1, abMember2, abMember3] = fixture.accounts.advisoryBoardMembers;

    const transactions = [
      {
        target: registry.target,
        value: 0,
        data: registry.interface.encodeFunctionData('setKycAuthAddress', [abMember1.address]),
      },
      {
        target: registry.target,
        value: 0,
        data: registry.interface.encodeFunctionData('setEmergencyAdmin', [abMember2.address, true]),
      },
      {
        target: registry.target,
        value: 0,
        data: registry.interface.encodeFunctionData('setEmergencyAdmin', [abMember3.address, true]),
      },
    ];
    const description = 'Multi-transaction proposal';

    const proposalCountBefore = await governor.proposalCount();
    const expectedProposalId = proposalCountBefore + 1n;

    await expect(governor.connect(abMember1).propose(transactions, description))
      .to.emit(governor, 'ProposalCreated')
      .withArgs(expectedProposalId, ProposalKind.AdvisoryBoard, description);

    const proposalId = await governor.proposalCount();
    const storedTxs = await governor.getProposalTransactions(proposalId);
    expect(storedTxs.length).to.equal(3);

    for (let i = 0; i < transactions.length; i++) {
      expect(storedTxs[i].target).to.equal(transactions[i].target);
      expect(storedTxs[i].value).to.equal(transactions[i].value);
      expect(storedTxs[i].data).to.equal(transactions[i].data);
    }

    const storedDescription = await governor.getProposalDescription(proposalId);
    expect(storedDescription).to.equal(description);
  });
});
