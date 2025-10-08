const { nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');

const { ProposalKind, ProposalStatus } = nexus.constants;

describe('cancel', function () {
  it('should fail when non-AB member tries to cancel proposal', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const [nonAbMember] = fixture.accounts.members;
    const [abMember] = fixture.accounts.advisoryBoardMembers;

    const transactions = [
      {
        target: registry.target,
        value: 0,
        data: registry.interface.encodeFunctionData('setKycAuthAddress', [abMember.address]),
      },
    ];

    await governor.connect(abMember).propose(transactions, 'AB proposal');
    const proposalId = await governor.proposalCount();

    const cancelTx = governor.connect(nonAbMember).cancel(proposalId);

    await expect(cancelTx).to.be.revertedWithCustomError(governor, 'OnlyAdvisoryBoardMember');
  });

  it('should fail when AB member tries to cancel member proposal', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const [member, nonAbMember] = fixture.accounts.members;
    const [abMember] = fixture.accounts.advisoryBoardMembers;

    const abMemberId = await registry.getMemberId(abMember.address);
    const nonAbMemberId = await registry.getMemberId(nonAbMember.address);

    const swaps = [{ from: abMemberId, to: nonAbMemberId }];
    await governor.connect(member).proposeAdvisoryBoardSwap(swaps, 'Member proposal');

    const proposalId = await governor.proposalCount();
    const proposal = await governor.getProposal(proposalId);
    expect(proposal.kind).to.equal(ProposalKind.Member);

    const cancelTx = governor.connect(abMember).cancel(proposalId);

    await expect(cancelTx).to.be.revertedWithCustomError(governor, 'CannotCancelMemberProposal');
  });

  it('should cancel AB proposal when called by AB member', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const [abMember1, abMember2] = fixture.accounts.advisoryBoardMembers;

    const transactions = [
      {
        target: registry.target,
        value: 0,
        data: registry.interface.encodeFunctionData('setKycAuthAddress', [abMember1.address]),
      },
    ];

    await governor.connect(abMember1).propose(transactions, 'AB proposal to cancel');
    const proposalId = await governor.proposalCount();

    const proposalBefore = await governor.getProposal(proposalId);
    expect(proposalBefore.kind).to.equal(ProposalKind.AdvisoryBoard);
    expect(proposalBefore.status).to.equal(ProposalStatus.Proposed);

    await expect(governor.connect(abMember2).cancel(proposalId))
      .to.emit(governor, 'ProposalCanceled')
      .withArgs(proposalId);

    const proposalAfter = await governor.getProposal(proposalId);
    expect(proposalAfter.status).to.equal(ProposalStatus.Canceled);
  });
});
