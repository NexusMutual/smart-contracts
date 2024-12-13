const { ethers } = require('hardhat');

const { setEtherBalance } = require('../utils').evm;
const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

async function setup() {
  const coverOrderOwner = ethers.Wallet.createRandom().connect(ethers.provider);
  await setEtherBalance(coverOrderOwner.address, parseEther('1000000'));

  const dai = await ethers.deployContract('ERC20Mock');
  const memberRoles = await ethers.deployContract('MemberRolesMock');
  const master = await ethers.deployContract('MasterMock');
  const coverOrder = await ethers.deployContract('CoverOrder', [master.address, AddressZero, coverOrderOwner.address]);

  await memberRoles.setRole(coverOrder.address, 2);

  return {
    coverOrderOwner,
    contracts: {
      dai,
      coverOrder,
    },
  };
}

module.exports = { setup };
