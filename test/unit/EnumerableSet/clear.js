const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const setTypesTestConfig = {
  UintSet: {
    add: 'addUint',
    remove: 'removeUint',
    clear: 'clearUint',
    contains: 'containsUint',
    length: 'lengthUint',
    at: 'atUint',
    values: 'valuesUint',
    testValues: [1, 2, 3, 42, 100, 999],
    singleValue: 42,
    newValues: [10, 20],
    largeSetSize: 50,
    generateValue: i => i,
  },
  AddressSet: {
    add: 'addAddress',
    remove: 'removeAddress',
    clear: 'clearAddress',
    contains: 'containsAddress',
    length: 'lengthAddress',
    at: 'atAddress',
    values: 'valuesAddress',
    testValues: [
      '0x1234567890123456789012345678901234567890',
      '0x2345678901234567890123456789012345678901',
      '0x3456789012345678901234567890123456789012',
      '0x4567890123456789012345678901234567890123',
      '0x5678901234567890123456789012345678901234',
    ],
    singleValue: '0x1234567890123456789012345678901234567890',
    newValues: ['0x9876543210987654321098765432109876543210', '0x8765432109876543210987654321098765432109'],
    largeSetSize: 50,
    generateValue: i => `0x${i.toString(16).padStart(40, '0')}`,
  },
  Bytes32Set: {
    add: 'addBytes32',
    remove: 'removeBytes32',
    clear: 'clearBytes32',
    contains: 'containsBytes32',
    length: 'lengthBytes32',
    at: 'atBytes32',
    values: 'valuesBytes32',
    testValues: [
      ethers.solidityPackedKeccak256(['string'], ['test1']),
      ethers.solidityPackedKeccak256(['string'], ['test2']),
      ethers.solidityPackedKeccak256(['string'], ['test3']),
      ethers.solidityPackedKeccak256(['string'], ['test4']),
      ethers.solidityPackedKeccak256(['string'], ['test5']),
    ],
    singleValue: ethers.solidityPackedKeccak256(['string'], ['test']),
    newValues: [
      ethers.solidityPackedKeccak256(['string'], ['new1']),
      ethers.solidityPackedKeccak256(['string'], ['new2']),
    ],
    largeSetSize: 50,
    generateValue: i => ethers.solidityPackedKeccak256(['string'], [`test${i}`]),
  },
};

function createClearTests(setType) {
  describe('clear', function () {
    it('should clear an empty set without reverting', async function () {
      const mock = await loadFixture(setup);

      // Should not revert when clearing empty set
      await expect(mock[setType.clear]()).to.not.be.reverted;

      // Verify set is still empty
      expect(await mock[setType.length]()).to.equal(0);
    });

    it('should clear a set with single element', async function () {
      const mock = await loadFixture(setup);

      // Add single element
      await mock[setType.add](setType.singleValue);
      expect(await mock[setType.length]()).to.equal(1);
      expect(await mock[setType.contains](setType.singleValue)).to.be.true;

      // Clear the set
      await mock[setType.clear]();

      // Verify set is empty
      expect(await mock[setType.length]()).to.equal(0);
      expect(await mock[setType.contains](setType.singleValue)).to.be.false;
    });

    it('should clear a set with multiple elements', async function () {
      const mock = await loadFixture(setup);

      // Add multiple elements
      for (const value of setType.testValues) {
        await mock[setType.add](value);
      }

      // Verify all elements are added
      expect(await mock[setType.length]()).to.equal(setType.testValues.length);
      for (const value of setType.testValues) {
        expect(await mock[setType.contains](value)).to.be.true;
      }

      // Clear the set
      await mock[setType.clear]();

      // Verify set is empty
      expect(await mock[setType.length]()).to.equal(0);
      for (const value of setType.testValues) {
        expect(await mock[setType.contains](value)).to.be.false;
      }
    });

    it('should allow adding elements after clearing', async function () {
      const mock = await loadFixture(setup);

      // Add initial elements
      await mock[setType.add](setType.testValues[0]);
      await mock[setType.add](setType.testValues[1]);
      expect(await mock[setType.length]()).to.equal(2);

      // Clear the set
      await mock[setType.clear]();
      expect(await mock[setType.length]()).to.equal(0);

      // Add new elements
      await mock[setType.add](setType.newValues[0]);
      await mock[setType.add](setType.newValues[1]);

      // Verify new elements are added correctly
      expect(await mock[setType.length]()).to.equal(2);
      expect(await mock[setType.contains](setType.newValues[0])).to.be.true;
      expect(await mock[setType.contains](setType.newValues[1])).to.be.true;
      expect(await mock[setType.contains](setType.testValues[0])).to.be.false;
      expect(await mock[setType.contains](setType.testValues[1])).to.be.false;
    });

    it('should handle clearing the same element that was removed and re-added', async function () {
      const mock = await loadFixture(setup);

      // Add element
      await mock[setType.add](setType.singleValue);

      // Remove and re-add same element
      await mock[setType.remove](setType.singleValue);
      await mock[setType.add](setType.singleValue);

      // Clear the set
      await mock[setType.clear]();

      // Verify element is removed
      expect(await mock[setType.length]()).to.equal(0);
      expect(await mock[setType.contains](setType.singleValue)).to.be.false;
    });

    it('should handle multiple clear operations in sequence', async function () {
      const mock = await loadFixture(setup);

      // Add elements and clear
      await mock[setType.add](setType.testValues[0]);
      await mock[setType.clear]();
      expect(await mock[setType.length]()).to.equal(0);

      // Add more elements and clear again
      await mock[setType.add](setType.testValues[1]);
      await mock[setType.add](setType.testValues[2]);
      await mock[setType.clear]();
      expect(await mock[setType.length]()).to.equal(0);

      // Clear empty set again
      await mock[setType.clear]();
      expect(await mock[setType.length]()).to.equal(0);
    });

    it('should correctly handle values() after clear', async function () {
      const mock = await loadFixture(setup);

      // Add elements
      await mock[setType.add](setType.testValues[0]);
      await mock[setType.add](setType.testValues[1]);
      await mock[setType.add](setType.testValues[2]);

      // Verify values before clear
      const valuesBefore = await mock[setType.values]();
      expect(valuesBefore).to.have.length(3);

      // Clear the set
      await mock[setType.clear]();

      // Verify values returns empty array
      const valuesAfter = await mock[setType.values]();
      expect(valuesAfter).to.have.length(0);
      expect(valuesAfter).to.deep.equal([]);
    });
  });
}

describe('clear', function () {
  // Generate tests for each set type
  for (const [setTypeName, config] of Object.entries(setTypesTestConfig)) {
    describe(setTypeName, function () {
      createClearTests(config);
    });
  }

  describe('Integration Tests', function () {
    it('should handle mixed operations across different set types', async function () {
      const mock = await loadFixture(setup);

      const { UintSet, AddressSet, Bytes32Set } = setTypesTestConfig;

      // Add elements to all sets
      await mock[UintSet.add](UintSet.singleValue);
      await mock[AddressSet.add](AddressSet.singleValue);
      await mock[Bytes32Set.add](Bytes32Set.singleValue);

      // Verify all sets have elements
      expect(await mock[UintSet.length]()).to.equal(1);
      expect(await mock[AddressSet.length]()).to.equal(1);
      expect(await mock[Bytes32Set.length]()).to.equal(1);

      // Clear only UintSet
      await mock[UintSet.clear]();

      // Verify only UintSet is cleared
      expect(await mock[UintSet.length]()).to.equal(0);
      expect(await mock[AddressSet.length]()).to.equal(1);
      expect(await mock[Bytes32Set.length]()).to.equal(1);

      // Clear all sets
      await mock[AddressSet.clear]();
      await mock[Bytes32Set.clear]();

      // Verify all sets are empty
      expect(await mock[UintSet.length]()).to.equal(0);
      expect(await mock[AddressSet.length]()).to.equal(0);
      expect(await mock[Bytes32Set.length]()).to.equal(0);
    });

    it('should handle large sets efficiently', async function () {
      const mock = await loadFixture(setup);

      const { UintSet } = setTypesTestConfig;

      // Add a moderate number of elements (testing gas efficiency)
      const elementCount = UintSet.largeSetSize;
      for (let i = 0; i < elementCount; i++) {
        await mock[UintSet.add](UintSet.generateValue(i));
      }

      expect(await mock[UintSet.length]()).to.equal(elementCount);

      // Clear the large set
      await mock[UintSet.clear]();

      // Verify it's empty
      expect(await mock[UintSet.length]()).to.equal(0);

      // Verify we can still add elements after clearing large set
      await mock[UintSet.add](999);
      expect(await mock[UintSet.length]()).to.equal(1);
      expect(await mock[UintSet.contains](999)).to.be.true;
    });
  });
});
