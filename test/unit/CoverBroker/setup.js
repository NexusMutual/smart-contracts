const { ethers } = require('hardhat');
const { setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const { parseEther } = ethers;

async function setup() {
  const coverBrokerOwner = ethers.Wallet.createRandom().connect(ethers.provider);
  await setBalance(coverBrokerOwner.address, parseEther('1000000'));

  const registry = await ethers.deployContract('RegistryMock');
  const dai = await ethers.deployContract('ERC20Mock');
  const coverBroker = await ethers.deployContract('CoverBroker', [registry.target, coverBrokerOwner.address]);

  return {
    coverBrokerOwner,
    contracts: {
      dai,
      coverBroker,
      registry,
    },
  };
}

module.exports = { setup };
