const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { executeGovernorProposal } = require('../../utils/governor');

const UNUSED_INDEX = 1n << 17n;

const getExpectedCreate2Address = async (deployer, salt) => {
  const UpgradeableProxy = await ethers.getContractFactory('UpgradeableProxy');
  const initCodeHash = ethers.keccak256(UpgradeableProxy.bytecode);
  const saltHex = Buffer.from(salt.toString(16).padStart(64, '0'), 'hex');
  return ethers.getCreate2Address(deployer, saltHex, initCodeHash);
};

describe('deployContract', function () {
  const salt = ethers.encodeBytes32String('test-salt');

  it('should deploy new proxy contract with implementation', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const tcImplementation = await ethers.deployContract('TokenController', [registry.target]);

    const deployContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('deployContract', [UNUSED_INDEX, salt, tcImplementation.target]),
    };

    await executeGovernorProposal(governor, advisoryBoardMembers, [deployContractTx], 'Deploy TokenController');

    const proxyAddress = await registry.getContractAddressByIndex(UNUSED_INDEX);
    const proxy = await ethers.getContractAt('UpgradeableProxy', proxyAddress);

    expect(await proxy.implementation()).to.equal(tcImplementation.target);
    expect(await proxy.proxyOwner()).to.equal(registry.target);
    expect(await registry.isProxyContract(UNUSED_INDEX)).to.be.true;
    expect(await registry.getContractIndexByAddress(proxyAddress)).to.equal(UNUSED_INDEX);
  });

  it('should deploy proxy with predictable CREATE2 address', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const poolImplementation = await ethers.deployContract('Pool', [registry.target]);
    const numericSalt = 42;
    const saltBytes32 = ethers.zeroPadValue(ethers.toBeHex(numericSalt), 32);
    const expectedAddress = await getExpectedCreate2Address(registry.target, numericSalt);

    const deployContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('deployContract', [
        UNUSED_INDEX,
        saltBytes32,
        poolImplementation.target,
      ]),
    };

    await executeGovernorProposal(governor, advisoryBoardMembers, [deployContractTx], 'Deploy with CREATE2');

    const actualAddress = await registry.getContractAddressByIndex(UNUSED_INDEX);
    expect(actualAddress).to.equal(expectedAddress);

    const proxy = await ethers.getContractAt('UpgradeableProxy', actualAddress);
    expect(await proxy.implementation()).to.equal(poolImplementation.target);
    expect(await proxy.proxyOwner()).to.equal(registry.target);
    expect(await registry.isProxyContract(UNUSED_INDEX)).to.be.true;
    expect(await registry.getContractIndexByAddress(actualAddress)).to.equal(UNUSED_INDEX);
  });

  it('should allow deployed contract to interact with other system contracts', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const tcImplementation = await ethers.deployContract('TokenController', [registry.target]);

    const deployContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('deployContract', [UNUSED_INDEX, salt, tcImplementation.target]),
    };

    await executeGovernorProposal(governor, advisoryBoardMembers, [deployContractTx], 'Deploy and interact');

    const proxyAddress = await registry.getContractAddressByIndex(UNUSED_INDEX);
    const deployedTC = await ethers.getContractAt('TokenController', proxyAddress);

    const [member] = fixture.accounts.members;
    const balance = await deployedTC.totalBalanceOf(member.address);
    expect(balance).to.be.gte(0);
  });

  it('should revert when deploying to existing contract index', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor, pool } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const poolImplementation = await ethers.deployContract('Pool', [registry.target]);

    const poolIndex = await registry.getContractIndexByAddress(pool.target);
    const deployContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('deployContract', [poolIndex, salt, poolImplementation.target]),
    };

    const proposeTx = executeGovernorProposal(governor, advisoryBoardMembers, [deployContractTx]);
    await expect(proposeTx).to.be.revertedWithCustomError(registry, 'ContractAlreadyExists');
  });

  it('should revert when non-governor attempts to deploy', async function () {
    const fixture = await loadFixture(setup);
    const { registry } = fixture.contracts;
    const [attacker] = fixture.accounts.nonMembers;

    const poolImplementation = await ethers.deployContract('Pool', [registry.target]);

    const deployTx = registry.connect(attacker).deployContract(UNUSED_INDEX, salt, poolImplementation.target);

    await expect(deployTx).to.be.revertedWithCustomError(registry, 'OnlyGovernor');
  });

  it('should revert with invalid contract index', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const { advisoryBoardMembers } = fixture.accounts;

    const poolImplementation = await ethers.deployContract('Pool', [registry.target]);
    const invalidIndex = 3;

    const deployContractTx = {
      target: registry.target,
      value: 0,
      data: registry.interface.encodeFunctionData('deployContract', [invalidIndex, salt, poolImplementation.target]),
    };

    const proposeTx = executeGovernorProposal(governor, advisoryBoardMembers, [deployContractTx]);
    await expect(proposeTx).to.be.revertedWithCustomError(registry, 'InvalidContractIndex');
  });
});
