const { nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { mintNxmTo } = require('../utils/helpers');

const { ProposalStatus, Choice } = nexus.constants;

describe('execute', function () {
  it('should fail when non-member tries to execute member proposal', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const [member, nonAbMember] = fixture.accounts.members;
    const [nonMember] = fixture.accounts.nonMembers;
    const [abMember] = fixture.accounts.advisoryBoardMembers;

    const abMemberId = await registry.getMemberId(abMember.address);
    const nonAbMemberId = await registry.getMemberId(nonAbMember.address);

    const swaps = [{ from: abMemberId, to: nonAbMemberId }];
    await governor.connect(member).proposeAdvisoryBoardSwap(swaps, 'Member proposal');

    const proposalId = await governor.proposalCount();
    const executeTx = governor.connect(nonMember).execute(proposalId);

    await expect(executeTx).to.be.revertedWithCustomError(governor, 'NotMember');
  });

  it('should fail when non-AB member tries to execute AB proposal', async function () {
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
    const executeTx = governor.connect(nonAbMember).execute(proposalId);

    await expect(executeTx).to.be.revertedWithCustomError(governor, 'OnlyAdvisoryBoardMember');
  });

  it('should execute multiple AB swaps in single proposal', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry, tokenController, token } = fixture.contracts;
    const [voter1, voter2, voter3, nonAbMember1, nonAbMember2] = fixture.accounts.members;
    const [abMember1, abMember2] = fixture.accounts.advisoryBoardMembers;

    const abMemberId1 = await registry.getMemberId(abMember1.address);
    const nonAbMemberId1 = await registry.getMemberId(nonAbMember1.address);
    const abMemberId2 = await registry.getMemberId(abMember2.address);
    const nonAbMemberId2 = await registry.getMemberId(nonAbMember2.address);

    const swaps = [
      { from: abMemberId1, to: nonAbMemberId1 },
      { from: abMemberId2, to: nonAbMemberId2 },
    ];
    await governor.connect(voter1).proposeAdvisoryBoardSwap(swaps, 'Replace multiple AB members');

    const totalSupplyBefore = await tokenController.totalSupply();
    const mintToEachVoter = (totalSupplyBefore * 6n) / 100n; // 6% each (will be capped at 5%)

    await mintNxmTo(voter1.address, mintToEachVoter, tokenController, token);
    await mintNxmTo(voter2.address, mintToEachVoter, tokenController, token);
    await mintNxmTo(voter3.address, mintToEachVoter, tokenController, token);
    await mintNxmTo(nonAbMember1.address, mintToEachVoter, tokenController, token);

    // 3 for, 1 against
    const proposalId = await governor.proposalCount();
    await governor.connect(voter1).vote(proposalId, Choice.For);
    await governor.connect(voter2).vote(proposalId, Choice.For);
    await governor.connect(voter3).vote(proposalId, Choice.For);
    await governor.connect(nonAbMember1).vote(proposalId, Choice.Against);

    // before
    expect(await registry.isAdvisoryBoardMemberById(abMemberId1)).to.be.equal(true);
    expect(await registry.isAdvisoryBoardMemberById(abMemberId2)).to.be.equal(true);
    expect(await registry.isAdvisoryBoardMemberById(nonAbMemberId1)).to.be.equal(false);
    expect(await registry.isAdvisoryBoardMemberById(nonAbMemberId2)).to.be.equal(false);

    // execute
    const { executeAfter } = await governor.getProposal(proposalId);
    await time.increaseTo(executeAfter + 1n);
    await governor.connect(voter1).execute(proposalId);

    // after
    expect(await registry.isAdvisoryBoardMemberById(abMemberId1)).to.be.equal(false);
    expect(await registry.isAdvisoryBoardMemberById(abMemberId2)).to.be.equal(false);
    expect(await registry.isAdvisoryBoardMemberById(nonAbMemberId1)).to.be.equal(true);
    expect(await registry.isAdvisoryBoardMemberById(nonAbMemberId2)).to.be.equal(true);

    const proposalAfter = await governor.getProposal(proposalId);
    expect(proposalAfter.status).to.equal(ProposalStatus.Executed);
  });

  it('should execute multiple transactions in a proposal', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const [abMember1, abMember2, abMember3, abMember4, abMember5] = fixture.accounts.advisoryBoardMembers;

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

    await governor.connect(abMember1).propose(transactions, 'Multi-transaction proposal');

    // 3 for, 1 against, 1 abstain
    const proposalId = await governor.proposalCount();
    await governor.connect(abMember1).vote(proposalId, Choice.For);
    await governor.connect(abMember2).vote(proposalId, Choice.For);
    await governor.connect(abMember3).vote(proposalId, Choice.Against);
    await governor.connect(abMember4).vote(proposalId, Choice.Abstain);
    await governor.connect(abMember5).vote(proposalId, Choice.For);

    const abThreshold = await governor.ADVISORY_BOARD_THRESHOLD();
    const tally = await governor.getProposalTally(proposalId);
    expect(tally.forVotes).to.be.greaterThanOrEqual(abThreshold);

    // before
    expect(await registry.getKycAuthAddress()).to.not.equal(abMember1.address);
    expect(await registry.isEmergencyAdmin(abMember2.address)).to.be.equal(false);
    expect(await registry.isEmergencyAdmin(abMember3.address)).to.be.equal(false);

    // execute
    const { executeAfter } = await governor.getProposal(proposalId);
    await time.increaseTo(executeAfter + 1n);
    await governor.connect(abMember1).execute(proposalId);

    // after
    expect(await registry.getKycAuthAddress()).to.equal(abMember1.address);
    expect(await registry.isEmergencyAdmin(abMember2.address)).to.be.equal(true);
    expect(await registry.isEmergencyAdmin(abMember3.address)).to.be.equal(true);

    const proposalAfter = await governor.getProposal(proposalId);
    expect(proposalAfter.status).to.equal(ProposalStatus.Executed);
  });
});
