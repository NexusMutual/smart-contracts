const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const setup = require('./setup');
const { parseEther } = require('ethers');

describe('proposeAdvisoryBoardSwap', () => {
  it('reverts if non member calls', async () => {
    const { governor, accounts, registry } = await loadFixture(setup);
    const [nonMember] = accounts.nonMembers;
    const [member] = accounts.members;
    const [abMember] = accounts.advisoryBoardMembers;
    const memberId = await registry.memberIds(member.address);
    const abMemberId = await registry.memberIds(abMember.address);

    const boardSwap = [
      {
        from: abMemberId,
        to: memberId,
      },
    ];

    await expect(governor.connect(nonMember).proposeAdvisoryBoardSwap(boardSwap, 'X')).to.be.revertedWithCustomError(
      governor,
      'NotMember',
    );
  });

  it('reverts if wight is not over PROPOSAL_THRESHOLD', async () => {
    const { governor, accounts, registry } = await loadFixture(setup);
    const [member, swapMember] = accounts.members;
    const [abMember] = accounts.advisoryBoardMembers;
    const swapMemberId = await registry.memberIds(swapMember.address);
    const abMemberId = await registry.memberIds(abMember.address);

    const boardSwap = [
      {
        from: abMemberId,
        to: swapMemberId,
      },
    ];

    await expect(governor.connect(member).proposeAdvisoryBoardSwap(boardSwap, 'X')).to.be.revertedWithCustomError(
      governor,
      'ProposalThresholdNotMet',
    );
  });

  it('reverts if wight is not over PROPOSAL_THRESHOLD', async () => {
    const { governor, accounts, registry } = await loadFixture(setup);
    const [member, swapMember] = accounts.members;
    const [abMember] = accounts.advisoryBoardMembers;
    const swapMemberId = await registry.memberIds(swapMember.address);
    const abMemberId = await registry.memberIds(abMember.address);

    const boardSwap = [
      {
        from: abMemberId,
        to: swapMemberId,
      },
    ];

    await expect(governor.connect(member).proposeAdvisoryBoardSwap(boardSwap, 'X')).to.be.revertedWithCustomError(
      governor,
      'ProposalThresholdNotMet',
    );
  });

  it('reverts if 2 same addresses are passed', async () => {
    const { governor, accounts, registry, tokenController } = await loadFixture(setup);
    const [member] = accounts.members;
    const [abMember] = accounts.advisoryBoardMembers;
    const abMemberId = await registry.memberIds(abMember.address);

    await tokenController.setTotalBalanceOf(member.address, parseEther('100'));
    await tokenController.setTotalSupply(parseEther('10000'));

    const boardSwap = [
      {
        from: abMemberId,
        to: abMemberId,
      },
    ];

    await expect(governor.connect(member).proposeAdvisoryBoardSwap(boardSwap, 'X')).to.be.revertedWithCustomError(
      governor,
      'InvalidAdvisoryBoardSwap',
    );
  });

  it('reverts if from address is 0', async () => {
    const { governor, accounts, registry, tokenController } = await loadFixture(setup);
    const [member] = accounts.members;
    const memberId = await registry.memberIds(member.address);

    await tokenController.setTotalBalanceOf(member.address, parseEther('100'));
    await tokenController.setTotalSupply(parseEther('10000'));

    const boardSwap = [
      {
        from: 0,
        to: memberId,
      },
    ];

    await expect(governor.connect(member).proposeAdvisoryBoardSwap(boardSwap, 'X')).to.be.revertedWithCustomError(
      governor,
      'InvalidAdvisoryBoardSwap',
    );
  });

  it('reverts if to address is 0', async () => {
    const { governor, accounts, registry, tokenController } = await loadFixture(setup);
    const [member] = accounts.members;
    const [abMember] = accounts.advisoryBoardMembers;
    const abMemberId = await registry.memberIds(abMember.address);

    await tokenController.setTotalBalanceOf(member.address, parseEther('100'));
    await tokenController.setTotalSupply(parseEther('10000'));

    const boardSwap = [
      {
        from: abMemberId,
        to: 0,
      },
    ];

    await expect(governor.connect(member).proposeAdvisoryBoardSwap(boardSwap, 'X')).to.be.revertedWithCustomError(
      governor,
      'InvalidAdvisoryBoardSwap',
    );
  });

  it('should create a proposal', async () => {
    const { governor, accounts, registry, tokenController } = await loadFixture(setup);
    const [member] = accounts.members;
    const [abMember] = accounts.advisoryBoardMembers;
    const abMemberId = await registry.memberIds(abMember.address);
    const memberId = await registry.memberIds(member.address);

    await tokenController.setTotalBalanceOf(member.address, parseEther('100'));
    await tokenController.setTotalSupply(parseEther('10000'));

    const boardSwap = [
      {
        from: abMemberId,
        to: memberId,
      },
    ];

    const proposalCountBefore = await governor.proposalCount();
    await governor.connect(member).proposeAdvisoryBoardSwap(boardSwap, 'X');
    const proposalCountAfter = await governor.proposalCount();
    expect(proposalCountAfter).to.be.equal(proposalCountBefore + 1n);
  });
});
