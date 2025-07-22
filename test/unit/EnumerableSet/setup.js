const { ethers } = require('hardhat');

async function setup() {
  const EnumerableSetMock = await ethers.getContractFactory('EnumerableSetMock');
  const enumerableSetMock = await EnumerableSetMock.deploy();
  await enumerableSetMock.waitForDeployment();
  return enumerableSetMock;
}

module.exports = {
  setup,
};
