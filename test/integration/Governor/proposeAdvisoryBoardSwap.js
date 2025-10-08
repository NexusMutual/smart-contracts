const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { mintNxmTo } = require('../utils/helpers');

const { ProposalKind, ProposalStatus } = nexus.constants;

describe('proposeAdvisoryBoardSwap', function () {
  it('should fail when member has insufficient vote weight', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry, tokenController, token } = fixture.contracts;
    const [nonAbMember, member] = fixture.accounts.members;
    const [abMember] = fixture.accounts.advisoryBoardMembers;

    // insufficient NXM (< 100 NXM)
    const insufficientAmount = ethers.parseEther('50');
    await mintNxmTo(member.address, insufficientAmount, tokenController, token);

    const voteWeight = await governor.getVoteWeight(member.address);
    expect(voteWeight).to.be.lessThanOrEqual(await governor.PROPOSAL_THRESHOLD());

    const abMemberId = await registry.getMemberId(abMember.address);
    const nonAbMemberId = await registry.getMemberId(nonAbMember.address);

    const swaps = [{ from: abMemberId, to: nonAbMemberId }];
    const description = 'Swap AB member';

    const proposeTx = governor.connect(member).proposeAdvisoryBoardSwap(swaps, description);

    await expect(proposeTx).to.be.revertedWithCustomError(governor, 'ProposalThresholdNotMet');
  });

  it('should fail with invalid from AB member', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const [nonAbMember1, nonAbMember2] = fixture.accounts.members;

    const nonAbMemberId1 = await registry.getMemberId(nonAbMember1.address);
    const nonAbMemberId2 = await registry.getMemberId(nonAbMember2.address);

    const swaps = [{ from: nonAbMemberId1, to: nonAbMemberId2 }];
    const description = 'Invalid AB swap';

    const proposeTx = governor.connect(nonAbMember1).proposeAdvisoryBoardSwap(swaps, description);

    await expect(proposeTx).to.be.revertedWithCustomError(governor, 'InvalidAdvisoryBoardSwap');
  });

  it('should create AB swap proposal when member has sufficient vote weight', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const [member1, nonAbMember] = fixture.accounts.members;
    const [abMember1] = fixture.accounts.advisoryBoardMembers;

    const voteWeight = await governor.getVoteWeight(member1.address); // member1 has 10K NXM
    expect(voteWeight).to.be.greaterThan(await governor.PROPOSAL_THRESHOLD());

    const abMemberId = await registry.getMemberId(abMember1.address);
    const nonAbMemberId = await registry.getMemberId(nonAbMember.address);

    const proposalCountBefore = await governor.proposalCount();
    const expectedProposalId = proposalCountBefore + 1n;

    const swaps = [{ from: abMemberId, to: nonAbMemberId }];
    const description = 'Replace AB member';

    await expect(governor.connect(member1).proposeAdvisoryBoardSwap(swaps, description))
      .to.emit(governor, 'ProposalCreated')
      .withArgs(expectedProposalId, ProposalKind.Member, description);

    const proposalId = await governor.proposalCount();
    expect(proposalId).to.be.equal(expectedProposalId);

    const proposal = await governor.getProposal(proposalId);
    expect(proposal.kind).to.equal(ProposalKind.Member);
    expect(proposal.status).to.equal(ProposalStatus.Proposed);

    const storedTxs = await governor.getProposalTransactions(proposalId);
    const expectedData = registry.interface.encodeFunctionData('swapAdvisoryBoardMember', [abMemberId, nonAbMemberId]);
    expect(storedTxs.length).to.equal(1);
    expect(storedTxs[0].target).to.equal(registry.target);
    expect(storedTxs[0].value).to.equal(0);
    expect(storedTxs[0].data).to.equal(expectedData);

    const storedDescription = await governor.getProposalDescription(proposalId);
    expect(storedDescription).to.equal(description);
  });

  it('should create proposal with multiple AB swaps', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const [member, nonAbMember1, nonAbMember2] = fixture.accounts.members;
    const [abMember1, abMember2] = fixture.accounts.advisoryBoardMembers;

    const proposalCountBefore = await governor.proposalCount();
    const expectedProposalId = proposalCountBefore + 1n;

    const abMemberId1 = await registry.getMemberId(abMember1.address);
    const nonAbMemberId1 = await registry.getMemberId(nonAbMember1.address);
    const abMemberId2 = await registry.getMemberId(abMember2.address);
    const nonAbMemberId2 = await registry.getMemberId(nonAbMember2.address);

    const swaps = [
      { from: abMemberId1, to: nonAbMemberId1 },
      { from: abMemberId2, to: nonAbMemberId2 },
    ];
    const description = 'Replace multiple AB members';

    await expect(governor.connect(member).proposeAdvisoryBoardSwap(swaps, description))
      .to.emit(governor, 'ProposalCreated')
      .withArgs(expectedProposalId, ProposalKind.Member, description);

    const proposalId = await governor.proposalCount();

    const storedTxs = await governor.getProposalTransactions(proposalId);
    expect(storedTxs.length).to.equal(2);

    for (let i = 0; i < swaps.length; i++) {
      expect(storedTxs[i].target).to.equal(registry.target);
      expect(storedTxs[i].value).to.equal(0);

      const { from, to } = swaps[i];
      const expectedData = registry.interface.encodeFunctionData('swapAdvisoryBoardMember', [from, to]);
      expect(storedTxs[i].data).to.deep.equal(expectedData);
    }

    const storedDescription = await governor.getProposalDescription(proposalId);
    expect(storedDescription).to.equal(description);
  });
});
