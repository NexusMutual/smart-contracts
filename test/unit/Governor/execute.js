const { ethers, nexus } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const setup = require('./setup');

const { Choice } = nexus.constants;

async function executeABProposalSetup() {
  const fixture = await loadFixture(setup);
  const { createABProposal } = await loadFixture(setup);
  const proposalId = await createABProposal();
  return {
    ...fixture,
    proposalId,
  };
}

async function executeMemberProposalSetup() {
  const fixture = await loadFixture(setup);
  const { createMemberProposal } = await loadFixture(setup);
  const proposalId = await createMemberProposal();
  return {
    ...fixture,
    proposalId,
  };
}

describe('execute', () => {
  it('reverts if non-AB member tries to execute', async () => {
    const fixture = await loadFixture(executeABProposalSetup);
    const { governor, accounts, constants, proposalId } = fixture;
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;
    const [member] = accounts.members;

    await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, Choice.For);
    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD);

    await expect(governor.connect(member).execute(proposalId)).to.be.revertedWithCustomError(
      governor,
      'OnlyAdvisoryBoardMember',
    );
  });

  it('reverts if timelock has not ended', async () => {
    const fixture = await loadFixture(executeABProposalSetup);
    const { governor, accounts, proposalId } = fixture;
    const abMember = accounts.advisoryBoardMembers[0];

    for (let i = 0; i < 3; i++) {
      await governor.connect(accounts.advisoryBoardMembers[i]).vote(proposalId, Choice.For);
    }

    await expect(governor.connect(abMember).execute(proposalId)).to.be.revertedWithCustomError(
      governor,
      'TimelockHasNotEnded',
    );
  });

  it('reverts if vote threshold not met', async () => {
    const fixture = await loadFixture(executeABProposalSetup);
    const { governor, accounts, proposalId, constants } = fixture;
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;
    const [abMember] = accounts.advisoryBoardMembers;

    await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, Choice.For);

    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD);

    await expect(governor.connect(abMember).execute(proposalId)) //
      .to.be.revertedWithCustomError(governor, 'VoteThresholdNotMet');
  });

  it('reverts if votes are against the proposal', async () => {
    const fixture = await loadFixture(executeABProposalSetup);
    const { governor, accounts, proposalId, constants } = fixture;
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;
    const [abMember] = accounts.advisoryBoardMembers;

    await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, 0);
    await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, 0);
    await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, 0);

    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD);

    await expect(governor.connect(abMember).execute(proposalId)).to.be.revertedWithCustomError(
      governor,
      'VoteTalliedAgainst',
    );
  });

  it('reverts if proposal does not exist', async () => {
    const fixture = await loadFixture(executeABProposalSetup);
    const { governor, accounts } = fixture;
    const [abMember] = accounts.advisoryBoardMembers;

    await expect(governor.connect(abMember).execute(999)).to.be.revertedWithCustomError(governor, 'ProposalNotFound');
  });

  it('reverts if proposal is already executed', async () => {
    const fixture = await loadFixture(executeABProposalSetup);
    const { governor, accounts, proposalId, constants } = fixture;
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;
    const [abMember] = accounts.advisoryBoardMembers;

    await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, Choice.For);
    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD);

    await governor.connect(abMember).execute(proposalId);

    await expect(governor.connect(abMember).execute(proposalId)) //
      .to.be.revertedWithCustomError(governor, 'ProposalAlreadyExecuted');
  });

  it('reverts if proposal is canceled', async () => {
    const fixture = await loadFixture(executeABProposalSetup);
    const { governor, accounts, proposalId } = fixture;
    const abMember = accounts.advisoryBoardMembers[0];

    await governor.connect(abMember).cancel(proposalId);

    await expect(governor.connect(abMember).execute(proposalId)).to.be.revertedWithCustomError(
      governor,
      'ProposalIsCanceled',
    );
  });

  it('reverts with transaction index on failure', async () => {
    const fixture = await loadFixture(setup);
    const { governor, accounts, constants } = fixture;
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;
    const abMember = accounts.advisoryBoardMembers[0];

    const txs = [
      {
        target: accounts.members[0].address,
        value: 0,
        data: '0x',
      },
      {
        target: accounts.members[1].address,
        value: 0,
        data: '0x1234',
      },
    ];

    await governor.connect(abMember).propose(txs, 'Failing TX Proposal');
    const proposalId = await governor.proposalCount();

    await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, Choice.For);
    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD + 1n);

    await expect(governor.connect(abMember).execute(proposalId)).to.be.revertedWithCustomError(
      governor,
      'TargetIsNotAContract',
    );
  });

  it('allows AB member to execute proposal after timelock', async () => {
    const fixture = await loadFixture(executeABProposalSetup);
    const { governor, accounts, constants, proposalId } = fixture;
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;
    const [abMember] = accounts.advisoryBoardMembers;

    await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, Choice.For);
    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD);

    await expect(governor.connect(abMember).execute(proposalId))
      .to.emit(governor, 'ProposalExecuted')
      .withArgs(proposalId);

    const proposal = await governor.getProposal(proposalId);
    expect(proposal.status).to.be.equal(1);
  });

  it('executes transaction successfully', async () => {
    const fixture = await loadFixture(setup);
    const { governor, accounts, tokenController, constants } = fixture;
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;
    const abMember = accounts.advisoryBoardMembers[0];

    const value = 1337;
    const txs = [
      {
        target: tokenController.target,
        value: 0,
        data: tokenController.interface.encodeFunctionData('exampleFunctionX', [value]),
      },
    ];

    await governor.connect(abMember).propose(txs, 'Single TX Proposal');
    const newProposalId = await governor.proposalCount();

    await governor.connect(accounts.advisoryBoardMembers[0]).vote(newProposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[1]).vote(newProposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[2]).vote(newProposalId, Choice.For);
    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD);

    await expect(governor.connect(abMember).execute(newProposalId))
      .to.emit(governor, 'ProposalExecuted')
      .withArgs(newProposalId)
      .to.emit(tokenController, 'ExampleFunctionXCalledWith')
      .withArgs(value);
  });

  it('executes multiple transactions successfully', async () => {
    const fixture = await loadFixture(setup);
    const { governor, accounts, tokenController, constants } = fixture;
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;
    const [abMember] = accounts.advisoryBoardMembers;

    const value = 1337;
    const flag = true;
    const msgValue = 31337;

    const txs = [
      {
        target: tokenController.target,
        value: 0,
        data: tokenController.interface.encodeFunctionData('exampleFunctionX', [value]),
      },
      {
        target: tokenController.target,
        value: msgValue,
        data: tokenController.interface.encodeFunctionData('exampleFunctionY', [flag]),
      },
    ];

    await governor.connect(abMember).propose(txs, 'Multi-TX Proposal');
    const newProposalId = await governor.proposalCount();

    await governor.connect(accounts.advisoryBoardMembers[0]).vote(newProposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[1]).vote(newProposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[2]).vote(newProposalId, Choice.For);
    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD);

    await expect(governor.connect(abMember).execute(newProposalId, { value: msgValue }))
      .to.emit(governor, 'ProposalExecuted')
      .withArgs(newProposalId)
      .to.emit(tokenController, 'ExampleFunctionXCalledWith')
      .withArgs(value)
      .to.emit(tokenController, 'ExampleFunctionYCalledWith')
      .withArgs(msgValue, flag);
  });

  it('reverts if target is not a contract when data is provided', async () => {
    const fixture = await loadFixture(setup);
    const { governor, accounts, constants } = fixture;
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;
    const [abMember] = accounts.advisoryBoardMembers;

    const txs = [
      {
        target: accounts.nonMembers[0].address,
        value: 0,
        data: '0x1234',
      },
    ];

    await governor.connect(abMember).propose(txs, 'Invalid Target Proposal');
    const newProposalId = await governor.proposalCount();

    await governor.connect(accounts.advisoryBoardMembers[0]).vote(newProposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[1]).vote(newProposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[2]).vote(newProposalId, Choice.For);
    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD);

    await expect(governor.connect(abMember).execute(newProposalId)) //
      .to.be.revertedWithCustomError(governor, 'TargetIsNotAContract');
  });

  it('executes proposal with mixed vote types', async () => {
    const fixture = await loadFixture(executeABProposalSetup);
    const { governor, accounts, proposalId, constants } = fixture;
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;
    const [abMember] = accounts.advisoryBoardMembers;

    await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, Choice.Against);
    await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, Choice.Abstain);
    await governor.connect(accounts.advisoryBoardMembers[3]).vote(proposalId, Choice.For);
    await governor.connect(accounts.advisoryBoardMembers[4]).vote(proposalId, Choice.For);

    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD + 1n);

    await expect(governor.connect(abMember).execute(proposalId))
      .to.emit(governor, 'ProposalExecuted')
      .withArgs(proposalId);
  });

  it('allows member to execute proposal after timelock', async () => {
    const fixture = await loadFixture(executeMemberProposalSetup);
    const { governor, accounts, tokenController, proposalId, constants } = fixture;
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;
    const [alice, bob, charlie] = accounts.members;

    const totalSupply = ethers.parseEther('10000');
    await tokenController.setTotalSupply(totalSupply);
    await tokenController.setTotalBalanceOf(alice, ethers.parseEther('2000'));
    await tokenController.setTotalBalanceOf(bob, ethers.parseEther('2000'));
    await tokenController.setTotalBalanceOf(charlie, ethers.parseEther('2000'));

    await governor.connect(alice).vote(proposalId, Choice.For);
    await governor.connect(bob).vote(proposalId, Choice.For);
    await governor.connect(charlie).vote(proposalId, Choice.For);
    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD + 1n);

    await expect(governor.connect(alice).execute(proposalId))
      .to.emit(governor, 'ProposalExecuted')
      .withArgs(proposalId);

    const proposal = await governor.getProposal(proposalId);
    expect(proposal.status).to.be.equal(1);
  });

  it('reverts if non-member tries to execute', async () => {
    const fixture = await loadFixture(executeMemberProposalSetup);
    const { governor, accounts, proposalId, constants } = fixture;
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;
    const [nonMember] = accounts.nonMembers;

    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD + 1n);

    await expect(governor.connect(nonMember).execute(proposalId)).to.be.revertedWithCustomError(governor, 'NotMember');
  });

  it('reverts if quorum not met', async () => {
    const fixture = await loadFixture(executeMemberProposalSetup);
    const { governor, accounts, tokenController, proposalId, constants } = fixture;
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;
    const [member] = accounts.members;

    const totalSupply = ethers.parseEther('1000000');
    await tokenController.setTotalSupply(totalSupply);
    await tokenController.setTotalBalanceOf(member.address, ethers.parseEther('100'));

    await governor.connect(member).vote(proposalId, Choice.For);
    await time.increase(VOTING_PERIOD + TIMELOCK_PERIOD + 1n);

    await expect(governor.connect(member).execute(proposalId)).to.be.revertedWithCustomError(
      governor,
      'VoteQuorumNotMet',
    );
  });
});
