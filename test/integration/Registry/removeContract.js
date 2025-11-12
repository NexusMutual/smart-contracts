const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { executeGovernorProposal } = require('../utils');

const NEW_INDEX = 1n << 17n;

const addContractViaGovernance = async (registry, governor, advisoryBoardMembers, index, contractAddress, isProxy) => {
  const addContractTx = {
    target: registry.target,
    value: 0,
    data: registry.interface.encodeFunctionData('addContract', [index, contractAddress, isProxy]),
  };

  await executeGovernorProposal(governor, advisoryBoardMembers, [addContractTx]);
};

const deployContractViaGovernance = async (registry, governor, advisoryBoardMembers, index, implementation) => {
  const deployContractTx = {
    target: registry.target,
    value: 0,
    data: registry.interface.encodeFunctionData('deployContract', [
      index,
      ethers.encodeBytes32String('test-salt'),
      implementation,
    ]),
  };

  await executeGovernorProposal(governor, advisoryBoardMembers, [deployContractTx]);
};

describe('removeContract', function () {
  it('should revert when removing non-existent contract', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const removeContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('removeContract', [NEW_INDEX]),
    };

    const proposeTx = executeGovernorProposal(governor, advisoryBoardMembers, [removeContractTx]);
    await expect(proposeTx).to.be.revertedWithCustomError(registry, 'ContractDoesNotExist');
  });

  it('should revert when non-governor attempts to remove contract', async function () {
    const fixture = await loadFixture(setup);
    const { registry, pool } = fixture.contracts;
    const [attacker] = fixture.accounts.nonMembers;

    const poolIndex = await registry.getContractIndexByAddress(pool.target);
    const removeTx = registry.connect(attacker).removeContract(poolIndex);
    await expect(removeTx).to.be.revertedWithCustomError(registry, 'OnlyGovernor');
  });

  it('should remove proxy contract and clear registry mappings', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const tcImplementation = await ethers.deployContract('TokenController', [registry.target]);
    await deployContractViaGovernance(registry, governor, advisoryBoardMembers, NEW_INDEX, tcImplementation.target);

    const proxyAddress = await registry.getContractAddressByIndex(NEW_INDEX);

    const removeContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('removeContract', [NEW_INDEX]),
    };

    await executeGovernorProposal(governor, advisoryBoardMembers, [removeContractTx]);

    await expect(registry.getContractAddressByIndex(NEW_INDEX)).to.be.revertedWithCustomError(
      registry,
      'ContractDoesNotExist',
    );
    await expect(registry.getContractIndexByAddress(proxyAddress)).to.be.revertedWithCustomError(
      registry,
      'ContractDoesNotExist',
    );
    await expect(registry.isProxyContract(NEW_INDEX)).to.be.revertedWithCustomError(registry, 'ContractDoesNotExist');
  });

  it('should remove non-proxy contract and clear registry mappings', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const poolImplementation = await ethers.deployContract('Pool', [registry.target]);
    const isProxy = false;
    await addContractViaGovernance(
      registry,
      governor,
      advisoryBoardMembers,
      NEW_INDEX,
      poolImplementation.target,
      isProxy,
    );

    const removeContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('removeContract', [NEW_INDEX]),
    };

    await executeGovernorProposal(governor, advisoryBoardMembers, [removeContractTx]);

    await expect(registry.getContractAddressByIndex(NEW_INDEX)).to.be.revertedWithCustomError(
      registry,
      'ContractDoesNotExist',
    );
    await expect(registry.getContractIndexByAddress(poolImplementation.target)).to.be.revertedWithCustomError(
      registry,
      'ContractDoesNotExist',
    );
    await expect(registry.isProxyContract(NEW_INDEX)).to.be.revertedWithCustomError(registry, 'ContractDoesNotExist');
  });

  it('should allow re-adding contract at same index after removal', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const firstPool = await ethers.deployContract('Pool', [registry.target]);
    const isProxy = false;
    await addContractViaGovernance(registry, governor, advisoryBoardMembers, NEW_INDEX, firstPool.target, isProxy);

    expect(await registry.getContractAddressByIndex(NEW_INDEX)).to.equal(firstPool.target);

    const removeContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('removeContract', [NEW_INDEX]),
    };

    await executeGovernorProposal(governor, advisoryBoardMembers, [removeContractTx]);

    const secondPool = await ethers.deployContract('Pool', [registry.target]);
    await addContractViaGovernance(registry, governor, advisoryBoardMembers, NEW_INDEX, secondPool.target, isProxy);

    expect(await registry.getContractAddressByIndex(NEW_INDEX)).to.equal(secondPool.target);
    expect(await registry.isProxyContract(NEW_INDEX)).to.be.false;
    expect(await registry.getContractIndexByAddress(secondPool.target)).to.equal(NEW_INDEX);

    await expect(registry.getContractIndexByAddress(firstPool.target)).to.be.revertedWithCustomError(
      registry,
      'ContractDoesNotExist',
    );
  });

  it('should remove multiple contracts in single governance proposal', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const firstIndex = 1n << 18n;
    const secondIndex = 1n << 19n;

    const firstPool = await ethers.deployContract('Pool', [registry.target]);
    const secondPool = await ethers.deployContract('Pool', [registry.target]);

    const isProxy = false;
    await addContractViaGovernance(registry, governor, advisoryBoardMembers, firstIndex, firstPool.target, isProxy);
    await addContractViaGovernance(registry, governor, advisoryBoardMembers, secondIndex, secondPool.target, isProxy);

    const removeFirstTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('removeContract', [firstIndex]),
    };

    const removeSecondTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('removeContract', [secondIndex]),
    };

    await executeGovernorProposal(governor, advisoryBoardMembers, [removeFirstTx, removeSecondTx]);

    await expect(registry.getContractAddressByIndex(firstIndex)).to.be.revertedWithCustomError(
      registry,
      'ContractDoesNotExist',
    );
    await expect(registry.getContractAddressByIndex(secondIndex)).to.be.revertedWithCustomError(
      registry,
      'ContractDoesNotExist',
    );
  });

  it('should not affect proxy contract on-chain after removal from registry', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const tcImplementation = await ethers.deployContract('TokenController', [registry.target]);
    await deployContractViaGovernance(registry, governor, advisoryBoardMembers, NEW_INDEX, tcImplementation.target);

    const proxyAddress = await registry.getContractAddressByIndex(NEW_INDEX);
    const proxy = await ethers.getContractAt('UpgradeableProxy', proxyAddress);

    expect(await proxy.proxyOwner()).to.equal(registry.target);
    expect(await proxy.implementation()).to.equal(tcImplementation.target);

    const removeContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('removeContract', [NEW_INDEX]),
    };

    await executeGovernorProposal(governor, advisoryBoardMembers, [removeContractTx]);

    expect(await proxy.proxyOwner()).to.equal(registry.target);
    expect(await proxy.implementation()).to.equal(tcImplementation.target);

    await expect(registry.getContractAddressByIndex(NEW_INDEX)).to.be.revertedWithCustomError(
      registry,
      'ContractDoesNotExist',
    );
  });
});
