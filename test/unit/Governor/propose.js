const { ethers, nexus } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const setup = require('./setup');

const { ProposalKind, ProposalStatus } = nexus.constants;
const { ZeroAddress } = ethers;

describe('propose', () => {
  it('reverts if non-AB member calls', async () => {
    const { governor, accounts } = await loadFixture(setup);
    const [nonAB] = accounts.members;
    const txs = [{ target: ZeroAddress, value: 0, data: '0x' }];

    await expect(governor.connect(nonAB).propose(txs, 'X')).to.be.revertedWithCustomError(
      governor,
      'OnlyAdvisoryBoardMember',
    );
  });

  it('creates proposal successfully', async () => {
    const { governor, accounts, constants } = await loadFixture(setup);
    const { TIMELOCK_PERIOD, VOTING_PERIOD } = constants;
    const [abMember] = accounts.advisoryBoardMembers;

    const proposalCountBefore = await governor.proposalCount();
    const txs = [{ target: ZeroAddress, value: 0, data: '0x' }];

    const timestamp = await time.latest();
    const nextBlockTimestamp = BigInt(timestamp) + 1n;
    await time.setNextBlockTimestamp(nextBlockTimestamp);

    await expect(governor.connect(abMember).propose(txs, 'Test Proposal'))
      .to.emit(governor, 'ProposalCreated')
      .withArgs(1, 0, 'Test Proposal');

    const proposalCountAfter = await governor.proposalCount();
    expect(proposalCountAfter).to.be.equal(proposalCountBefore + 1n);

    const proposal = await governor.getProposal(1);
    expect(proposal.kind).to.be.equal(ProposalKind.AdvisoryBoard);
    expect(proposal.status).to.be.equal(ProposalStatus.Proposed);
    expect(proposal.proposedAt).to.be.equal(nextBlockTimestamp);
    expect(proposal.voteBefore).to.be.equal(nextBlockTimestamp + VOTING_PERIOD);
    expect(proposal.executeAfter).to.be.equal(nextBlockTimestamp + VOTING_PERIOD + TIMELOCK_PERIOD);
  });

  it('creates proposal with multiple transactions', async () => {
    const { governor, accounts } = await loadFixture(setup);
    const abMember = accounts.advisoryBoardMembers[0];

    const txs = [
      { target: accounts.members[0].address, value: ethers.parseEther('1'), data: '0x' },
      { target: accounts.members[1].address, value: 0, data: '0x1234' },
    ];

    await expect(governor.connect(abMember).propose(txs, 'Multi-TX Proposal'))
      .to.emit(governor, 'ProposalCreated')
      .withArgs(1, 0, 'Multi-TX Proposal');

    const proposal = await governor.getProposal(1);
    expect(proposal.kind).to.be.equal(ProposalKind.AdvisoryBoard);
    expect(proposal.status).to.be.equal(ProposalStatus.Proposed);
  });

  it('increments proposal count correctly', async () => {
    const { governor, accounts } = await loadFixture(setup);
    const [abMember] = accounts.advisoryBoardMembers;

    const initialCount = await governor.proposalCount();

    for (let i = 0; i < 3; i++) {
      const txs = [{ target: ZeroAddress, value: 0, data: '0x' }];
      await governor.connect(abMember).propose(txs, `Proposal ${i + 1}`);
      expect(await governor.proposalCount()).to.be.equal(initialCount + BigInt(i + 1));
    }
  });

  it('stores proposal description correctly', async () => {
    const { governor, accounts } = await loadFixture(setup);
    const [abMember] = accounts.advisoryBoardMembers;

    const description = 'This is a detailed proposal description with special chars: !@#$%^&*()';
    const txs = [{ target: ZeroAddress, value: 0, data: '0x' }];

    const timestamp = await time.latest();
    const nextBlockTimestamp = BigInt(timestamp) + 1n;
    await time.setNextBlockTimestamp(nextBlockTimestamp);
    await governor.connect(abMember).propose(txs, description);

    const proposal = await governor.getProposal(1);
    expect(proposal.proposedAt).to.be.equal(nextBlockTimestamp);
  });
});
