const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { executeGovernorProposal } = require('../utils');

const NEW_INDEX = 1n << 17n;

describe('upgradeContract', function () {
  it('should revert when upgrading non-existent contract', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const poolImplementation = await ethers.deployContract('Pool', [registry.target]);

    const upgradeContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('upgradeContract', [NEW_INDEX, poolImplementation.target]),
    };

    const proposeTx = executeGovernorProposal(governor, advisoryBoardMembers, [upgradeContractTx]);
    await expect(proposeTx).to.be.revertedWithCustomError(registry, 'ContractDoesNotExist');
  });

  it('should revert when upgrading non-proxy contract', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const poolImplementation = await ethers.deployContract('Pool', [registry.target]);

    const isProxy = false;
    const addContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('addContract', [NEW_INDEX, poolImplementation.target, isProxy]),
    };

    await executeGovernorProposal(governor, advisoryBoardMembers, [addContractTx], 'Add non-proxy Pool');

    const newPoolImplementation = await ethers.deployContract('Pool', [registry.target]);

    const upgradeContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('upgradeContract', [NEW_INDEX, newPoolImplementation.target]),
    };

    const proposeTx = executeGovernorProposal(governor, advisoryBoardMembers, [upgradeContractTx]);
    await expect(proposeTx).to.be.revertedWithCustomError(registry, 'ContractIsNotProxy');
  });

  it('should revert when non-governor attempts to upgrade contract', async function () {
    const fixture = await loadFixture(setup);
    const { registry, tokenController } = fixture.contracts;
    const [attacker] = fixture.accounts.nonMembers;

    const tcIndex = await registry.getContractIndexByAddress(tokenController.target);
    const tcImplementation = await ethers.deployContract('TokenController', [registry.target]);

    const upgradeTx = registry.connect(attacker).upgradeContract(tcIndex, tcImplementation.target);
    await expect(upgradeTx).to.be.revertedWithCustomError(registry, 'OnlyGovernor');
  });

  it('should upgrade existing proxy contract implementation', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor, tokenController } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const tcIndex = await registry.getContractIndexByAddress(tokenController.target);
    const tcProxy = await ethers.getContractAt('UpgradeableProxy', tokenController.target);
    const implementationBefore = await tcProxy.implementation();

    const newTcImplementation = await ethers.deployContract('TokenController', [registry.target]);

    const upgradeContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('upgradeContract', [tcIndex, newTcImplementation.target]),
    };

    await executeGovernorProposal(governor, advisoryBoardMembers, [upgradeContractTx], 'Upgrade TokenController');

    expect(await tcProxy.implementation()).to.not.equal(implementationBefore);
    expect(await tcProxy.implementation()).to.equal(newTcImplementation.target);
    expect(await tcProxy.proxyOwner()).to.equal(registry.target);
    expect(await registry.getContractAddressByIndex(tcIndex)).to.equal(tokenController.target);
    expect(await registry.isProxyContract(tcIndex)).to.be.true;
    expect(await registry.getContractIndexByAddress(tokenController.target)).to.equal(tcIndex);
  });

  it('should upgrade multiple proxy contracts in sequence', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor, tokenController, pool } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const tcIndex = await registry.getContractIndexByAddress(tokenController.target);
    const poolIndex = await registry.getContractIndexByAddress(pool.target);

    const tcProxy = await ethers.getContractAt('UpgradeableProxy', tokenController.target);
    const poolProxy = await ethers.getContractAt('UpgradeableProxy', pool.target);

    const tcImplementationBefore = await tcProxy.implementation();
    const poolImplementationBefore = await poolProxy.implementation();

    const newTcImplementation = await ethers.deployContract('TokenController', [registry.target]);
    const newPoolImplementation = await ethers.deployContract('Pool', [registry.target]);

    const upgradeTcTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('upgradeContract', [tcIndex, newTcImplementation.target]),
    };

    const upgradePoolTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('upgradeContract', [poolIndex, newPoolImplementation.target]),
    };

    await executeGovernorProposal(governor, advisoryBoardMembers, [upgradeTcTx, upgradePoolTx], 'Upgrade multiple');

    expect(await tcProxy.implementation()).to.not.equal(tcImplementationBefore);
    expect(await tcProxy.implementation()).to.equal(newTcImplementation.target);
    expect(await tcProxy.proxyOwner()).to.equal(registry.target);

    expect(await poolProxy.implementation()).to.not.equal(poolImplementationBefore);
    expect(await poolProxy.implementation()).to.equal(newPoolImplementation.target);
    expect(await poolProxy.proxyOwner()).to.equal(registry.target);

    expect(await registry.getContractAddressByIndex(tcIndex)).to.equal(tokenController.target);
    expect(await registry.getContractAddressByIndex(poolIndex)).to.equal(pool.target);
  });

  it('should upgrade same contract multiple times', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor, tokenController } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const tcIndex = await registry.getContractIndexByAddress(tokenController.target);
    const tcProxy = await ethers.getContractAt('UpgradeableProxy', tokenController.target);

    const implementationBefore = await tcProxy.implementation();

    const firstImplementation = await ethers.deployContract('TokenController', [registry.target]);
    const upgradeTx1 = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('upgradeContract', [tcIndex, firstImplementation.target]),
    };

    await executeGovernorProposal(governor, advisoryBoardMembers, [upgradeTx1], 'First upgrade');

    expect(await tcProxy.implementation()).to.equal(firstImplementation.target);
    expect(await tcProxy.proxyOwner()).to.equal(registry.target);

    const secondImplementation = await ethers.deployContract('TokenController', [registry.target]);
    const upgradeTx2 = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('upgradeContract', [tcIndex, secondImplementation.target]),
    };

    await executeGovernorProposal(governor, advisoryBoardMembers, [upgradeTx2], 'Second upgrade');

    expect(await tcProxy.implementation()).to.equal(secondImplementation.target);
    expect(await tcProxy.implementation()).to.not.equal(implementationBefore);
    expect(await tcProxy.implementation()).to.not.equal(firstImplementation.target);
    expect(await tcProxy.proxyOwner()).to.equal(registry.target);
    expect(await registry.getContractAddressByIndex(tcIndex)).to.equal(tokenController.target);
  });
});
