const { ethers } = require('hardhat');

const { setEtherBalance } = require('../utils').evm;
const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

async function setup() {
  const coverBrokerOwner = ethers.Wallet.createRandom().connect(ethers.provider);
  await setEtherBalance(coverBrokerOwner.address, parseEther('1000000'));

  const dai = await ethers.deployContract('ERC20Mock');
  const memberRoles = await ethers.deployContract('MemberRolesMock');
  const coverBroker = await ethers.deployContract('CoverBroker', [
    AddressZero,
    memberRoles.address,
    AddressZero,
    AddressZero,
    coverBrokerOwner.address,
  ]);

  await memberRoles.setRole(coverBroker.address, 2);

  return {
    coverBrokerOwner,
    contracts: {
      dai,
      coverBroker,
    },
  };
}

module.exports = { setup };
