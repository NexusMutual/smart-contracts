const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { mintNxmTo } = require('../utils/helpers');
const { executeGovernorProposal } = require('../../utils/governor');

const { Choice, ContractIndexes, ProposalStatus } = nexus.constants;

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

describe('execute contract upgrades', () => {
  it('upgrades Governor contract successfully via governance proposal', async () => {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const governorAddress = await registry.getContractAddressByIndex(ContractIndexes.C_GOVERNOR);
    const governorProxy = await ethers.getContractAt('UpgradeableProxy', governorAddress);
    const implementationBefore = await governorProxy.implementation();

    const newGovernorImplementation = await ethers.deployContract('Governor', [registry]);

    const txs = [
      {
        target: registry.target,
        value: 0,
        data: registry.interface.encodeFunctionData('upgradeContract', [
          ContractIndexes.C_GOVERNOR,
          newGovernorImplementation.target,
        ]),
      },
    ];

    const proposalId = await executeGovernorProposal(governor, advisoryBoardMembers, txs, 'Upgrade Governor');
    const implementationAfter = await governorProxy.implementation();

    expect(proposalId).to.be.greaterThan(0n);
    expect(implementationAfter).to.not.equal(implementationBefore);
    expect(implementationAfter).to.equal(newGovernorImplementation.target);
  });

  it('upgrades Registry contract successfully via governance proposal', async () => {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const registryProxy = await ethers.getContractAt('UpgradeableProxy', registry.target);
    const implementationBefore = await registryProxy.implementation();

    // Verify Governor is the owner of the registry proxy
    const proxyOwner = await registryProxy.proxyOwner();
    expect(proxyOwner).to.equal(governor.target);

    const master = await registry.master();
    const newRegistryImplementation = await ethers.deployContract('Registry', [registry.target, master]);

    const txs = [
      {
        target: registryProxy.target,
        value: 0,
        data: registryProxy.interface.encodeFunctionData('upgradeTo', [newRegistryImplementation.target]),
      },
    ];

    const proposalId = await executeGovernorProposal(governor, advisoryBoardMembers, txs, 'Upgrade Registry');
    const implementationAfter = await registryProxy.implementation();

    expect(proposalId).to.be.greaterThan(0n);
    expect(implementationAfter).to.not.equal(implementationBefore);
    expect(implementationAfter).to.equal(newRegistryImplementation.target);
  });

  it('upgrades TokenController contract successfully via governance proposal', async () => {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const tokenControllerAddress = await registry.getContractAddressByIndex(ContractIndexes.C_TOKEN_CONTROLLER);
    const tokenControllerProxy = await ethers.getContractAt('UpgradeableProxy', tokenControllerAddress);
    const implementationBefore = await tokenControllerProxy.implementation();

    const newTokenControllerImplementation = await ethers.deployContract('TokenController', [registry]);

    const txs = [
      {
        target: registry.target,
        value: 0,
        data: registry.interface.encodeFunctionData('upgradeContract', [
          ContractIndexes.C_TOKEN_CONTROLLER,
          newTokenControllerImplementation.target,
        ]),
      },
    ];

    const proposalId = await executeGovernorProposal(governor, advisoryBoardMembers, txs, 'Upgrade TokenController');
    const implementationAfter = await tokenControllerProxy.implementation();

    expect(proposalId).to.be.greaterThan(0n);
    expect(implementationAfter).to.not.equal(implementationBefore);
    expect(implementationAfter).to.equal(newTokenControllerImplementation.target);
  });

  it('upgrades multiple contracts in a single proposal', async () => {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const governorAddress = await registry.getContractAddressByIndex(ContractIndexes.C_GOVERNOR);
    const governorProxy = await ethers.getContractAt('UpgradeableProxy', governorAddress);
    const governorImplementationBefore = await governorProxy.implementation();
    const newGovernorImplementation = await ethers.deployContract('Governor', [registry]);

    const tokenControllerAddress = await registry.getContractAddressByIndex(ContractIndexes.C_TOKEN_CONTROLLER);
    const tokenControllerProxy = await ethers.getContractAt('UpgradeableProxy', tokenControllerAddress);
    const tokenControllerImplementationBefore = await tokenControllerProxy.implementation();
    const newTokenControllerImplementation = await ethers.deployContract('TokenController', [registry]);

    const txs = [
      {
        target: registry.target,
        value: 0,
        data: registry.interface.encodeFunctionData('upgradeContract', [
          ContractIndexes.C_GOVERNOR,
          newGovernorImplementation.target,
        ]),
      },
      {
        target: registry.target,
        value: 0,
        data: registry.interface.encodeFunctionData('upgradeContract', [
          ContractIndexes.C_TOKEN_CONTROLLER,
          newTokenControllerImplementation.target,
        ]),
      },
    ];

    const proposalId = await executeGovernorProposal(governor, advisoryBoardMembers, txs, 'Upgrade Multiple Contracts');
    expect(proposalId).to.be.greaterThan(0n);

    const governorImplementationAfter = await governorProxy.implementation();
    const tokenControllerImplementationAfter = await tokenControllerProxy.implementation();

    expect(governorImplementationAfter).to.not.equal(governorImplementationBefore);
    expect(governorImplementationAfter).to.equal(newGovernorImplementation.target);

    expect(tokenControllerImplementationAfter).to.not.equal(tokenControllerImplementationBefore);
    expect(tokenControllerImplementationAfter).to.equal(newTokenControllerImplementation.target);
  });

  it('reverts when trying to upgrade non-existent or non-proxy contract', async () => {
    const fixture = await loadFixture(setup);
    const { governor, registry } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    // Use an index that doesn't exist in the registry
    const nonExistentIndex = 999;
    const newImplementation = await ethers.deployContract('TokenController', [registry]);

    const txs = [
      {
        target: registry.target,
        value: 0,
        data: registry.interface.encodeFunctionData('upgradeContract', [nonExistentIndex, newImplementation.target]),
      },
    ];

    await expect(
      executeGovernorProposal(governor, advisoryBoardMembers, txs, 'Upgrade Non-existent Contract'),
    ).to.be.revertedWithCustomError(registry, 'ContractDoesNotExist');
  });

  it('reverts when non-Governor tries to upgrade contract directly', async () => {
    const fixture = await loadFixture(setup);
    const { registry } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;
    const [abMember] = advisoryBoardMembers;

    const newImplementation = await ethers.deployContract('Governor', [registry]);

    const upgradeTx = registry.connect(abMember).upgradeContract(ContractIndexes.C_GOVERNOR, newImplementation.target);

    await expect(upgradeTx).to.be.revertedWithCustomError(registry, 'OnlyGovernor');
  });

  it('preserves proxy address after upgrade', async () => {
    const fixture = await loadFixture(setup);
    const { governor, registry, tokenController } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const tokenControllerAddressBefore = tokenController.target;
    const proxyBefore = await ethers.getContractAt('UpgradeableProxy', tokenControllerAddressBefore);
    const implementationBefore = await proxyBefore.implementation();

    const newTokenControllerImplementation = await ethers.deployContract('TokenController', [registry]);

    const txs = [
      {
        target: registry.target,
        value: 0,
        data: registry.interface.encodeFunctionData('upgradeContract', [
          ContractIndexes.C_TOKEN_CONTROLLER,
          newTokenControllerImplementation.target,
        ]),
      },
    ];

    await executeGovernorProposal(governor, advisoryBoardMembers, txs, 'Upgrade TokenController');

    expect(tokenController.target).to.equal(tokenControllerAddressBefore);

    const proxyAfter = await ethers.getContractAt('UpgradeableProxy', tokenControllerAddressBefore);
    const implementationAfter = await proxyAfter.implementation();

    expect(implementationAfter).to.not.equal(implementationBefore);
    expect(implementationAfter).to.equal(newTokenControllerImplementation.target);
  });
});
