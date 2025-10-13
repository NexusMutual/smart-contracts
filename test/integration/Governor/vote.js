const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { mintNxmTo } = require('../utils/helpers');

const { ProposalKind, Choice } = nexus.constants;

describe('vote', function () {
  it('should fail when non-member tries to vote', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const [nonMember] = fixture.accounts.nonMembers;
    const [abMember] = fixture.accounts.advisoryBoardMembers;

    const memberId = await registry.getMemberId(nonMember.address);
    expect(memberId).to.be.equal(0);

    const transactions = [
      {
        target: registry.target,
        value: 0,
        data: registry.interface.encodeFunctionData('setKycAuthAddress', [abMember.address]),
      },
    ];

    await governor.connect(abMember).propose(transactions, 'AB proposal');
    const proposalId = await governor.proposalCount();

    const voteTx = governor.connect(nonMember).vote(proposalId, Choice.For);

    await expect(voteTx).to.be.revertedWithCustomError(governor, 'NotMember');
  });

  it('should calculate correct vote weight', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry, tokenController } = fixture.contracts;
    const [proposer, voter, nonAbMember] = fixture.accounts.members;
    const [abMember] = fixture.accounts.advisoryBoardMembers;

    const abMemberId = await registry.getMemberId(abMember.address);
    const nonAbMemberId = await registry.getMemberId(nonAbMember.address);

    const swaps = [{ from: abMemberId, to: nonAbMemberId }];
    await governor.connect(proposer).proposeAdvisoryBoardSwap(swaps, 'Member proposal');

    const proposalId = await governor.proposalCount();

    // expected vote weight
    const tokenBalance = await tokenController.totalBalanceOf(voter.address);
    const expectedWeight = tokenBalance + ethers.parseEther('1');

    const member2Id = await registry.getMemberId(voter.address);

    await expect(governor.connect(voter).vote(proposalId, Choice.For))
      .to.emit(governor, 'VoteCast')
      .withArgs(proposalId, ProposalKind.Member, member2Id, Choice.For, expectedWeight);

    const tally = await governor.getProposalTally(proposalId);
    expect(tally.forVotes).to.equal(expectedWeight);

    const vote = await governor.getVote(proposalId, member2Id);
    expect(vote.choice).to.equal(Choice.For);
    expect(vote.weight).to.equal(expectedWeight);
  });

  it("should prevent token transfers when voter's tokens are locked from voting", async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry, token } = fixture.contracts;
    const [member, voter, nonAbMember] = fixture.accounts.members;
    const [abMember] = fixture.accounts.advisoryBoardMembers;

    const abMemberId = await registry.getMemberId(abMember.address);
    const nonAbMemberId = await registry.getMemberId(nonAbMember.address);

    const swaps = [{ from: abMemberId, to: nonAbMemberId }];
    await governor.connect(member).proposeAdvisoryBoardSwap(swaps, 'Member proposal');

    const proposalId = await governor.proposalCount();

    await governor.connect(voter).vote(proposalId, Choice.For);

    // voter transfer should fail
    const nxmAmount = ethers.parseEther('1');
    const transferTx = token.connect(voter).transfer(member.address, nxmAmount);
    await expect(transferTx).to.be.reverted;

    // transferFrom voter should fail
    await token.connect(voter).approve(member.address, nxmAmount);
    const transferFromTx = token.connect(member).transferFrom(voter.address, member.address, nxmAmount);
    await expect(transferFromTx).to.be.reverted;
  });

  it("should prevent RAMM swap when voter's tokens are locked from voting", async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry, ramm } = fixture.contracts;
    const [member1, voter, nonAbMember] = fixture.accounts.members;
    const [abMember] = fixture.accounts.advisoryBoardMembers;

    const abMemberId = await registry.getMemberId(abMember.address);
    const nonAbMemberId = await registry.getMemberId(nonAbMember.address);

    const swaps = [{ from: abMemberId, to: nonAbMemberId }];
    await governor.connect(member1).proposeAdvisoryBoardSwap(swaps, 'Member proposal');

    const proposalId = await governor.proposalCount();

    await governor.connect(voter).vote(proposalId, Choice.For);

    // RAMM NXM to ETH swap should fail
    const deadline = (await time.latest()) + 3600;
    const swapTx = ramm.connect(voter).swap(ethers.parseEther('1'), 0, deadline);

    await expect(swapTx).to.be.revertedWithCustomError(ramm, 'LockedForVoting');
  });

  it('should cap vote weight at 5% of total supply from TokenController', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry, tokenController, token } = fixture.contracts;
    const [proposer, voter, nonAbMember] = fixture.accounts.members;
    const [abMember] = fixture.accounts.advisoryBoardMembers;

    const totalSupplyBefore = await tokenController.totalSupply();

    // mint 10% of supply (> 5% cap)
    const largeAmount = (totalSupplyBefore * 10n) / 100n;
    await mintNxmTo(voter.address, largeAmount, tokenController, token);

    const totalSupplyAfter = await tokenController.totalSupply();
    const voteWeightCapPercentage = await governor.VOTE_WEIGHT_CAP_PERCENTAGE();
    const cappedWeight = (totalSupplyAfter * voteWeightCapPercentage) / 100n;

    // voter balance > capped weight
    const voterNxmBalance = await token.balanceOf(voter.address);
    expect(voterNxmBalance).to.be.greaterThan(cappedWeight);

    // but vote weight is capped
    const voteWeight = await governor.getVoteWeight(voter.address);
    expect(voteWeight).to.equal(cappedWeight);

    const abMemberId = await registry.getMemberId(abMember.address);
    const nonAbMemberId = await registry.getMemberId(nonAbMember.address);

    const swaps = [{ from: abMemberId, to: nonAbMemberId }];
    await governor.connect(proposer).proposeAdvisoryBoardSwap(swaps, 'Member proposal');

    const proposalId = await governor.proposalCount();
    const memberId = await registry.getMemberId(voter.address);

    await expect(governor.connect(voter).vote(proposalId, Choice.For))
      .to.emit(governor, 'VoteCast')
      .withArgs(proposalId, ProposalKind.Member, memberId, Choice.For, cappedWeight);

    const tally = await governor.getProposalTally(proposalId);
    expect(tally.forVotes).to.equal(cappedWeight);

    const vote = await governor.getVote(proposalId, memberId);
    expect(vote.choice).to.equal(Choice.For);
    expect(vote.weight).to.equal(cappedWeight);
  });

  it('should use have vote weight of 1 for AB member voting on AB proposal without locking tokens', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry, token, tokenController } = fixture.contracts;
    const [abMember1, abMember2] = fixture.accounts.advisoryBoardMembers;

    await mintNxmTo(abMember2.address, ethers.parseEther('100'), tokenController, token);

    const transactions = [
      {
        target: registry.target,
        value: 0,
        data: registry.interface.encodeFunctionData('setKycAuthAddress', [abMember1.address]),
      },
    ];

    await governor.connect(abMember1).propose(transactions, 'AB proposal');
    const proposalId = await governor.proposalCount();

    const abSeat = await registry.getAdvisoryBoardSeat(abMember2.address);
    expect(abSeat).to.be.greaterThan(0);

    const tokenBalanceBefore = await token.balanceOf(abMember2.address);

    await expect(governor.connect(abMember2).vote(proposalId, Choice.For))
      .to.emit(governor, 'VoteCast')
      .withArgs(proposalId, ProposalKind.AdvisoryBoard, abSeat, Choice.For, 1);

    const tally = await governor.getProposalTally(proposalId);
    expect(tally.forVotes).to.equal(1);

    const vote = await governor.getVote(proposalId, abSeat);
    expect(vote.choice).to.equal(Choice.For);
    expect(vote.weight).to.equal(1);

    // NXM not locked - transfers should succeed
    const transferAmount = ethers.parseEther('1');
    await token.connect(abMember2).transfer(abMember1.address, transferAmount);

    const tokenBalanceAfter = await token.balanceOf(abMember2.address);
    expect(tokenBalanceAfter).to.equal(tokenBalanceBefore - transferAmount);
  });

  it('should fail when non-AB member tries to vote on AB proposal', async function () {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const [member1] = fixture.accounts.members;
    const [abMember] = fixture.accounts.advisoryBoardMembers;

    const isAbMember = await registry.isAdvisoryBoardMember(member1.address);
    expect(isAbMember).to.equal(false);

    const transactions = [
      {
        target: registry.target,
        value: 0,
        data: registry.interface.encodeFunctionData('setKycAuthAddress', [abMember.address]),
      },
    ];

    await governor.connect(abMember).propose(transactions, 'AB proposal');
    const proposalId = await governor.proposalCount();

    const voteTx = governor.connect(member1).vote(proposalId, Choice.For);

    await expect(voteTx).to.be.revertedWithCustomError(registry, 'NotAdvisoryBoardMember');
  });
});
