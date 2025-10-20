const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { init } = require('../../init');

async function setup() {
  await loadFixture(init);
  const EnumerableSetMock = await ethers.getContractFactory('EnumerableSetMock');
  const enumerableSetMock = await EnumerableSetMock.deploy();
  return enumerableSetMock;
}

module.exports = {
  setup,
};
