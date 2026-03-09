const { ethers } = require('hardhat');

const { setEtherBalance } = require('../../utils/evm');

const { parseEther } = ethers;

async function setup() {
  const coverBrokerOwner = ethers.Wallet.createRandom().connect(ethers.provider);
  await setEtherBalance(coverBrokerOwner.address, parseEther('1000000'));

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
