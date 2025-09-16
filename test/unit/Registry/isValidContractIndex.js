const { nexus } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const { setup } = require('./setup');

const { ContractIndexes } = nexus.constants;

describe('isValidContractIndex', () => {
  it('should return true for valid powers of 2', async () => {
    const { registry } = await loadFixture(setup);

    // 2 ** 255 is the max valid power of 2 for uint256
    for (let i = 0n; i <= 255n; i++) {
      const idx = 2n ** i;
      expect(await registry.isValidContractIndex(idx)).to.be.true;
    }
  });

  it('should return true for all predefined constants', async () => {
    const { registry } = await loadFixture(setup);

    for (const idx of Object.values(ContractIndexes)) {
      expect(await registry.isValidContractIndex(idx)).to.be.true;
    }
  });

  it('should return false for zero', async () => {
    const { registry } = await loadFixture(setup);
    expect(await registry.isValidContractIndex(0)).to.be.false;
  });

  it('should return false for non-powers of 2', async () => {
    const { registry } = await loadFixture(setup);
    const invalidIndexes = [3, 5, 6, 7, 2n ** 256n - 1n];

    for (const idx of invalidIndexes) {
      expect(await registry.isValidContractIndex(idx)).to.be.false;
    }
  });
});
