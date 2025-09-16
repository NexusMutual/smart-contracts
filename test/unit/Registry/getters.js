const { ethers, nexus } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const { setup } = require('./setup');

const { ContractIndexes } = nexus.constants;
const { ZeroAddress } = ethers;

describe('getters', () => {
  it('should revert with invalid index', async () => {
    const { registry } = await loadFixture(setup);
    const invalidIdx = 3n; // not a power of two

    await expect(registry.getContractAddressByIndex(invalidIdx)) //
      .to.be.revertedWithCustomError(registry, 'InvalidContractIndex');

    await expect(registry.isProxyContract(invalidIdx)) //
      .to.be.revertedWithCustomError(registry, 'InvalidContractIndex');
  });

  it('should revert for non-existent contracts', async () => {
    const { registry } = await loadFixture(setup);
    const idx = 2n ** 48n; // valid index but no contract
    await expect(registry.getContractAddressByIndex(idx)).to.revertedWithCustomError(registry, 'ContractDoesNotExist');
    await expect(registry.isProxyContract(idx)).to.revertedWithCustomError(registry, 'ContractDoesNotExist');
  });

  it('should return correct index for registered contracts', async () => {
    const { registry } = await loadFixture(setup);

    const poolAddress = await registry.getContractAddressByIndex(ContractIndexes.C_POOL);
    const tcAddress = await registry.getContractAddressByIndex(ContractIndexes.C_TOKEN_CONTROLLER);

    expect(await registry.getContractIndexByAddress(poolAddress)).to.equal(ContractIndexes.C_POOL);
    expect(await registry.getContractIndexByAddress(tcAddress)).to.equal(ContractIndexes.C_TOKEN_CONTROLLER);
  });

  it('should return 0 for unregistered addresses', async () => {
    const { registry, alice } = await loadFixture(setup);

    await expect(registry.getContractIndexByAddress(alice.address)) //
      .to.revertedWithCustomError(registry, 'ContractDoesNotExist');

    await expect(registry.getContractIndexByAddress(ZeroAddress)) //
      .to.revertedWithCustomError(registry, 'InvalidContractAddress');

    const randomAddress = ethers.Wallet.createRandom().address; // an address that we have the PK of
    await expect(registry.getContractIndexByAddress(randomAddress)) //
      .to.revertedWithCustomError(registry, 'ContractDoesNotExist');
  });

  it('should return 0 after contract removal', async () => {
    const { registry, governor } = await loadFixture(setup);
    const poolAddress = await registry.getContractAddressByIndex(ContractIndexes.C_POOL);
    await registry.connect(governor).removeContract(ContractIndexes.C_POOL);
    await expect(registry.getContractIndexByAddress(poolAddress)) //
      .to.revertedWithCustomError(registry, 'ContractDoesNotExist');
  });

  it('should return C_REGISTRY for Registry itself', async () => {
    const { registry } = await loadFixture(setup);
    expect(await registry.getContractIndexByAddress(registry)).to.equal(ContractIndexes.C_REGISTRY);
  });

  it('should revert if any index in array is invalid', async () => {
    const { registry } = await loadFixture(setup);
    const indexes = [ContractIndexes.C_POOL, 3, ContractIndexes.C_TOKEN_CONTROLLER]; // 3 is invalid
    await expect(registry.getContracts(indexes)).to.be.revertedWithCustomError(registry, 'InvalidContractIndex');
  });

  it('should return empty array for empty input', async () => {
    const { registry } = await loadFixture(setup);
    const result = await registry.getContracts([]);
    expect(result).to.have.length(0);
  });

  it('should return correct contracts for valid indexes', async () => {
    const { registry, pool, tokenController } = await loadFixture(setup);
    const indexes = [ContractIndexes.C_POOL, ContractIndexes.C_TOKEN_CONTROLLER];

    const [poolDetails, tcDetails, ...rest] = await registry.getContracts(indexes);

    expect(rest).to.have.length(0);
    expect(poolDetails.addr).to.equal(pool);
    expect(poolDetails.isProxy).to.be.true;
    expect(tcDetails.addr).to.equal(tokenController);
    expect(tcDetails.isProxy).to.be.true;
  });

  it('should handle mixed existing and non-existing contracts', async () => {
    const { registry, pool } = await loadFixture(setup);

    const indexes = [ContractIndexes.C_POOL, 2n ** 35n]; // one exists, one doesn't
    const [poolDetails, inexistent, ...rest] = await registry.getContracts(indexes);

    expect(rest).to.have.length(0);

    expect(poolDetails.addr).to.equal(pool);
    expect(poolDetails.isProxy).to.be.true;

    expect(inexistent.addr).to.equal(ZeroAddress);
    expect(inexistent.isProxy).to.be.false;
  });

  it('should handle duplicate indexes in input', async () => {
    const { registry } = await loadFixture(setup);

    const indexes = [ContractIndexes.C_POOL, ContractIndexes.C_POOL];
    const [poolDetails, poolDetails2, ...rest] = await registry.getContracts(indexes);

    expect(rest).to.have.length(0);
    expect(poolDetails).to.deep.equal(poolDetails2);
  });
});
