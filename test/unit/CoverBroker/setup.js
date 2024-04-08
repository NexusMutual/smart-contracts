const { ethers } = require('hardhat');

const { setEtherBalance } = require('../utils').evm;
const { parseEther } = ethers.utils;

async function setup() {
  const coverBrokerOwner = ethers.Wallet.createRandom().connect(ethers.provider);
  await setEtherBalance(coverBrokerOwner.address, parseEther('1000000'));

  const dai = await ethers.deployContract('ERC20Mock');
  const cover = await ethers.deployContract('CMMockCover');
  const memberRoles = await ethers.deployContract('MemberRolesMock');
  const tk = await ethers.deployContract('NXMTokenMock');
  const master = await ethers.deployContract('MasterMock');
  const coverBroker = await ethers.deployContract('CoverBroker', [
    cover.address,
    memberRoles.address,
    tk.address,
    master.address,
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
