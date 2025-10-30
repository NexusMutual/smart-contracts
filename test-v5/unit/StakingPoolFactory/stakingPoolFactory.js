const { ethers, artifacts } = require('hardhat');
const { expect } = require('chai');
const { keccak256 } = require('ethereum-cryptography/keccak');
const { bytesToHex, hexToBytes } = require('ethereum-cryptography/utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

const { AddressZero } = ethers.constants;

describe('StakingPoolFactory', function () {
  it('should verify that constructor variables were set correctly', async function () {
    const fixture = await loadFixture(setup);
    const { stakingPoolFactory, operator } = fixture;

    expect(await stakingPoolFactory.operator()).to.be.equal(operator.address);
  });

  it('should revert if trying to change operator from non-operator', async function () {
    const fixture = await loadFixture(setup);
    const { stakingPoolFactory } = fixture;
    const [nonOperator] = fixture.accounts.members;

    await expect(stakingPoolFactory.connect(nonOperator).changeOperator(nonOperator.address)).to.be.revertedWith(
      'StakingPoolFactory: Not operator',
    );
  });

  it('should fail to change operator to 0 address', async function () {
    const fixture = await loadFixture(setup);
    const { stakingPoolFactory, operator } = fixture;
    await expect(stakingPoolFactory.connect(operator).changeOperator(AddressZero)).to.be.revertedWith(
      'StakingPoolFactory: Invalid operator',
    );
  });

  it('should successfully change operator', async function () {
    const fixture = await loadFixture(setup);
    const { stakingPoolFactory, operator } = fixture;
    const [newOperator] = fixture.accounts.members;
    await stakingPoolFactory.connect(operator).changeOperator(newOperator.address);
    expect(await stakingPoolFactory.operator()).to.be.equal(newOperator.address);
  });

  it('should revert if trying to create a pool from non-operator', async function () {
    const fixture = await loadFixture(setup);
    const { stakingPoolFactory } = fixture;
    const [nonOperator] = fixture.accounts.members;

    await expect(stakingPoolFactory.connect(nonOperator).create(nonOperator.address)).to.be.revertedWith(
      'StakingPoolFactory: Not operator',
    );
  });

  it('should successfully create staking pools with with the expected address', async function () {
    const fixture = await loadFixture(setup);
    const { stakingPoolFactory, operator } = fixture;
    const [beacon] = fixture.accounts.members;

    const { bytecode: proxyBytecode } = await artifacts.readArtifact('MinimalBeaconProxy');
    const proxyHash = bytesToHex(keccak256(hexToBytes(proxyBytecode.replace(/^0x/i, ''))));
    const initCodeHash = Buffer.from(proxyHash, 'hex');

    for (let i = 1; i <= 10; i++) {
      const poolId = i;
      const salt = Buffer.from(poolId.toString(16).padStart(64, '0'), 'hex');
      const expectedAddress = ethers.utils.getCreate2Address(stakingPoolFactory.address, salt, initCodeHash);

      await expect(stakingPoolFactory.connect(operator).create(beacon.address))
        .to.emit(stakingPoolFactory, 'StakingPoolCreated')
        .withArgs(poolId, expectedAddress);
      expect(await stakingPoolFactory.stakingPoolCount()).to.be.equal(poolId);
    }
  });
});
