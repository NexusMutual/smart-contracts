const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { executeGovernorProposal } = require('../../utils/governor');

const { ZeroAddress } = ethers;

const NEW_INDEX = 1n << 17n;

describe('addContract', function () {
  it('should revert when adding to existing contract index', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor, pool } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const poolImplementation = await ethers.deployContract('Pool', [registry.target]);
    const poolIndex = await registry.getContractIndexByAddress(pool.target);
    const isProxy = false;
    const addContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('addContract', [poolIndex, poolImplementation.target, isProxy]),
    };

    const proposeTx = executeGovernorProposal(governor, advisoryBoardMembers, [addContractTx], 'Add to existing index');
    await expect(proposeTx).to.be.revertedWithCustomError(registry, 'ContractAlreadyExists');
  });

  it('should revert when non-governor attempts to add contract', async function () {
    const fixture = await loadFixture(setup);
    const { registry } = fixture.contracts;
    const [attacker] = fixture.accounts.nonMembers;

    const poolImplementation = await ethers.deployContract('Pool', [registry.target]);
    const isProxy = false;
    const addTx = registry.connect(attacker).addContract(NEW_INDEX, poolImplementation.target, isProxy);
    await expect(addTx).to.be.revertedWithCustomError(registry, 'OnlyGovernor');
  });

  it('should revert with invalid contract index', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const poolImplementation = await ethers.deployContract('Pool', [registry.target]);
    const invalidIndex = 3;
    const isProxy = false;
    const addContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('addContract', [invalidIndex, poolImplementation.target, isProxy]),
    };

    const govProposeTx = executeGovernorProposal(governor, advisoryBoardMembers, [addContractTx]);
    await expect(govProposeTx).to.be.revertedWithCustomError(registry, 'InvalidContractIndex');
  });

  it('should revert when adding zero address', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const isProxy = false;
    const addContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('addContract', [NEW_INDEX, ZeroAddress, isProxy]),
    };

    const proposeTx = executeGovernorProposal(governor, advisoryBoardMembers, [addContractTx], 'Add zero address');
    await expect(proposeTx).to.be.revertedWithCustomError(registry, 'InvalidContractAddress');
  });

  it('should revert when proxy is not owned by Registry', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;
    const [randomOwner] = fixture.accounts.nonMembers;

    const proxy = await ethers.deployContract('UpgradeableProxy');
    await proxy.transferProxyOwnership(randomOwner.address);

    const isProxy = true;
    const addContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('addContract', [NEW_INDEX, proxy.target, isProxy]),
    };

    const proposeTx = executeGovernorProposal(governor, advisoryBoardMembers, [addContractTx]);
    await expect(proposeTx).to.be.revertedWithCustomError(registry, 'NotProxyOwner');
  });

  it('should add non-proxy contract to a new unused contract index', async function () {
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

    await executeGovernorProposal(governor, advisoryBoardMembers, [addContractTx], 'Add Pool contract');

    const contractAddress = await registry.getContractAddressByIndex(NEW_INDEX);
    expect(contractAddress).to.equal(poolImplementation.target);
    expect(await registry.isProxyContract(NEW_INDEX)).to.be.false;
    expect(await registry.getContractIndexByAddress(poolImplementation.target)).to.equal(NEW_INDEX);
  });

  it('should add proxy contract owned by Registry to a new unused contract index', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const tcImplementation = await ethers.deployContract('TokenController', [registry.target]);

    const proxy = await ethers.deployContract('UpgradeableProxy');
    await proxy.upgradeTo(tcImplementation.target);
    await proxy.transferProxyOwnership(registry.target);

    const isProxy = true;
    const addContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('addContract', [NEW_INDEX, proxy.target, isProxy]),
    };

    await executeGovernorProposal(governor, advisoryBoardMembers, [addContractTx], 'Add TokenController proxy');

    expect(await registry.isProxyContract(NEW_INDEX)).to.be.true;
    expect(await registry.getContractIndexByAddress(proxy.target)).to.equal(NEW_INDEX);
    expect(await registry.getContractAddressByIndex(NEW_INDEX)).to.equal(proxy.target);

    expect(await proxy.proxyOwner()).to.equal(registry.target);
    expect(await proxy.implementation()).to.equal(tcImplementation.target);
  });
});
