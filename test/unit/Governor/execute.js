const { ethers, nexus } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const setup = require('./setup');

const { VoteType } = nexus.constants;

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
  describe('Advisory Board Proposals', () => {
    it('reverts if non-AB member tries to execute', async () => {
      const fixture = await loadFixture(executeABProposalSetup);
      const { governor, accounts, constants, proposalId } = fixture;
      const member = accounts.members[0];

      await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, VoteType.For);
      await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, VoteType.For);
      await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, VoteType.For);
      await time.increase(Number(constants.TIMELOCK_PERIOD));

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
        await governor.connect(accounts.advisoryBoardMembers[i]).vote(proposalId, VoteType.For);
      }

      await expect(governor.connect(abMember).execute(proposalId)).to.be.revertedWithCustomError(
        governor,
        'TimelockHasNotEnded',
      );
    });

    it('reverts if vote threshold not met', async () => {
      const fixture = await loadFixture(executeABProposalSetup);
      const { governor, accounts, proposalId, constants } = fixture;
      const abMember = accounts.advisoryBoardMembers[0];

      await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, VoteType.For);
      await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, VoteType.For);

      await time.increase(constants.TIMELOCK_PERIOD);

      await expect(governor.connect(abMember).execute(proposalId)).to.be.revertedWithCustomError(
        governor,
        'VoteThresholdNotMet',
      );
    });

    it('reverts if votes are against the proposal', async () => {
      const fixture = await loadFixture(executeABProposalSetup);
      const { governor, accounts, proposalId, constants } = fixture;
      const abMember = accounts.advisoryBoardMembers[0];

      await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, 0);
      await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, 0);
      await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, 0);

      await time.increase(constants.TIMELOCK_PERIOD);

      await expect(governor.connect(abMember).execute(proposalId)).to.be.revertedWithCustomError(
        governor,
        'VoteTalliedAgainst',
      );
    });

    it('reverts if proposal does not exist', async () => {
      const fixture = await loadFixture(executeABProposalSetup);
      const { governor, accounts } = fixture;
      const abMember = accounts.advisoryBoardMembers[0];

      await expect(governor.connect(abMember).execute(999)).to.be.revertedWithCustomError(governor, 'ProposalNotFound');
    });

    it('reverts if proposal is already executed', async () => {
      const fixture = await loadFixture(executeABProposalSetup);
      const { governor, accounts, proposalId, constants } = fixture;
      const abMember = accounts.advisoryBoardMembers[0];

      await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, VoteType.For);
      await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, VoteType.For);
      await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, VoteType.For);
      await time.increase(constants.TIMELOCK_PERIOD);

      await governor.connect(abMember).execute(proposalId);

      await expect(governor.connect(abMember).execute(proposalId)).to.be.revertedWithCustomError(
        governor,
        'ProposalAlreadyExecuted',
      );
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
      const { governor, accounts } = fixture;
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

      await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, VoteType.For);
      await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, VoteType.For);
      await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, VoteType.For);
      await time.increase(3 * 24 * 3600 + 12 * 3600 + 1);

      await expect(governor.connect(abMember).execute(proposalId)).to.be.revertedWithCustomError(
        governor,
        'TargetIsNotAContract',
      );
    });

    it('allows AB member to execute proposal after timelock', async () => {
      const fixture = await loadFixture(executeABProposalSetup);
      const { governor, accounts, constants, proposalId } = fixture;
      const abMember = accounts.advisoryBoardMembers[0];

      await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, VoteType.For);
      await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, VoteType.For);
      await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, VoteType.For);
      await time.increase(Number(constants.TIMELOCK_PERIOD));

      await expect(governor.connect(abMember).execute(proposalId))
        .to.emit(governor, 'ProposalExecuted')
        .withArgs(proposalId);

      const proposal = await governor.getProposal(proposalId);
      expect(proposal.status).to.be.equal(1);
    });

    it('executes transaction successfully', async () => {
      const fixture = await loadFixture(setup);
      const { governor, accounts, tokenController, constants } = fixture;
      const abMember = accounts.advisoryBoardMembers[0];

      const txs = [
        {
          target: tokenController.target,
          value: 0,
          data: tokenController.interface.encodeFunctionData('setTotalSupply', [ethers.parseEther('1000000')]),
        },
      ];

      await governor.connect(abMember).propose(txs, 'Single TX Proposal');
      const newProposalId = await governor.proposalCount();

      await governor.connect(accounts.advisoryBoardMembers[0]).vote(newProposalId, VoteType.For);
      await governor.connect(accounts.advisoryBoardMembers[1]).vote(newProposalId, VoteType.For);
      await governor.connect(accounts.advisoryBoardMembers[2]).vote(newProposalId, VoteType.For);
      time.increase(constants.TIMELOCK_PERIOD + constants.VOTING_PERIOD);
      await ethers.provider.send('evm_increaseTime', [3 * 24 * 3600 + 12 * 3600 + 1]);
      await ethers.provider.send('evm_mine');

      await expect(governor.connect(abMember).execute(newProposalId))
        .to.emit(governor, 'ProposalExecuted')
        .withArgs(newProposalId);
    });

    it('executes multiple transactions successfully', async () => {
      const fixture = await loadFixture(setup);
      const { governor, accounts, tokenController, constants } = fixture;
      const abMember = accounts.advisoryBoardMembers[0];

      const txs = [
        {
          target: tokenController.target,
          value: 0,
          data: tokenController.interface.encodeFunctionData('setTotalSupply', [ethers.parseEther('1000000')]),
        },
        {
          target: tokenController.target,
          value: 0,
          data: tokenController.interface.encodeFunctionData('setTotalBalanceOf', [
            accounts.members[0].address,
            ethers.parseEther('100000'),
          ]),
        },
      ];

      await governor.connect(abMember).propose(txs, 'Multi-TX Proposal');
      const newProposalId = await governor.proposalCount();

      await governor.connect(accounts.advisoryBoardMembers[0]).vote(newProposalId, VoteType.For);
      await governor.connect(accounts.advisoryBoardMembers[1]).vote(newProposalId, VoteType.For);
      await governor.connect(accounts.advisoryBoardMembers[2]).vote(newProposalId, VoteType.For);
      await time.increase(constants.TIMELOCK_PERIOD + constants.VOTING_PERIOD);

      await expect(governor.connect(abMember).execute(newProposalId))
        .to.emit(governor, 'ProposalExecuted')
        .withArgs(newProposalId);
    });

    it('reverts if target is not a contract when data is provided', async () => {
      const fixture = await loadFixture(setup);
      const { governor, accounts, constants } = fixture;
      const abMember = accounts.advisoryBoardMembers[0];

      const txs = [
        {
          target: accounts.nonMembers[0].address,
          value: 0,
          data: '0x1234',
        },
      ];

      await governor.connect(abMember).propose(txs, 'Invalid Target Proposal');
      const newProposalId = await governor.proposalCount();

      await governor.connect(accounts.advisoryBoardMembers[0]).vote(newProposalId, VoteType.For);
      await governor.connect(accounts.advisoryBoardMembers[1]).vote(newProposalId, VoteType.For);
      await governor.connect(accounts.advisoryBoardMembers[2]).vote(newProposalId, VoteType.For);
      await time.increase(constants.TIMELOCK_PERIOD);

      await expect(governor.connect(abMember).execute(newProposalId)).to.be.revertedWithCustomError(
        governor,
        'TargetIsNotAContract',
      );
    });

    it('executes proposal with mixed vote types', async () => {
      const fixture = await loadFixture(executeABProposalSetup);
      const { governor, accounts, proposalId } = fixture;
      const abMember = accounts.advisoryBoardMembers[0];

      await governor.connect(accounts.advisoryBoardMembers[0]).vote(proposalId, VoteType.For);
      await governor.connect(accounts.advisoryBoardMembers[1]).vote(proposalId, VoteType.Against);
      await governor.connect(accounts.advisoryBoardMembers[2]).vote(proposalId, VoteType.Abstain);
      await governor.connect(accounts.advisoryBoardMembers[3]).vote(proposalId, VoteType.For);
      await governor.connect(accounts.advisoryBoardMembers[4]).vote(proposalId, VoteType.For);

      await time.increase(12 * 3600 + 1 + 3 * 24 * 3600);

      await expect(governor.connect(abMember).execute(proposalId))
        .to.emit(governor, 'ProposalExecuted')
        .withArgs(proposalId);
    });
  });

  describe('Member Proposals', () => {
    it('allows member to execute proposal after timelock', async () => {
      const fixture = await loadFixture(executeMemberProposalSetup);
      const { governor, accounts, tokenController, proposalId, constants } = fixture;
      const member = accounts.members[0];

      const totalSupply = ethers.parseEther('10000');
      await tokenController.setTotalSupply(totalSupply);
      await tokenController.setTotalBalanceOf(member.address, ethers.parseEther('2000'));

      await governor.connect(member).vote(proposalId, VoteType.For);
      await time.increase(constants.TIMELOCK_PERIOD + constants.VOTING_PERIOD + 1n);

      await expect(governor.connect(member).execute(proposalId))
        .to.emit(governor, 'ProposalExecuted')
        .withArgs(proposalId);

      const proposal = await governor.getProposal(proposalId);
      expect(proposal.status).to.be.equal(1);
    });

    it('reverts if non-member tries to execute', async () => {
      const fixture = await loadFixture(executeMemberProposalSetup);
      const { governor, accounts, proposalId, constants } = fixture;
      const nonMember = accounts.nonMembers[0];

      await time.increase(constants.TIMELOCK_PERIOD + constants.VOTING_PERIOD + 1n);

      await expect(governor.connect(nonMember).execute(proposalId)).to.be.revertedWithCustomError(
        governor,
        'NotMember',
      );
    });

    it('reverts if quorum not met', async () => {
      const fixture = await loadFixture(executeMemberProposalSetup);
      const { governor, accounts, tokenController, proposalId, constants } = fixture;
      const member = accounts.members[0];

      const totalSupply = ethers.parseEther('1000000');
      await tokenController.setTotalSupply(totalSupply);
      await tokenController.setTotalBalanceOf(member.address, ethers.parseEther('100'));

      await governor.connect(member).vote(proposalId, VoteType.For);
      await time.increase(constants.TIMELOCK_PERIOD + constants.VOTING_PERIOD + 1n);

      await expect(governor.connect(member).execute(proposalId)).to.be.revertedWithCustomError(
        governor,
        'VoteQuorumNotMet',
      );
    });
  });
});
