const { ethers } = require('hardhat');
const { toBytes2 } = require('../../../lib/helpers');

const { setEtherBalance } = require('../utils').evm;
const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

async function setup() {
  const limitOrderOwner = ethers.Wallet.createRandom().connect(ethers.provider);
  await setEtherBalance(limitOrderOwner.address, parseEther('1000000'));

  const notOwner = ethers.Wallet.createRandom().connect(ethers.provider);
  await setEtherBalance(notOwner.address, parseEther('1000000'));

  const limitOrdersSettler = ethers.Wallet.createRandom().connect(ethers.provider);
  await setEtherBalance(limitOrdersSettler.address, parseEther('1000000'));

  const dai = await ethers.deployContract('ERC20Mock');
  const memberRoles = await ethers.deployContract('MemberRolesMock');
  const cover = await ethers.deployContract('LimitOrdersCoverMock');
  const pool = await ethers.deployContract('PoolMock');
  const master = await ethers.deployContract('MasterMock');

  const limitOrders = await ethers.deployContract('LimitOrders', [
    AddressZero,
    AddressZero,
    limitOrdersSettler.address,
  ]);

  await master.setLatestAddress(toBytes2('CO'), cover.address);
  await master.setLatestAddress(toBytes2('MR'), memberRoles.address);
  await master.setLatestAddress(toBytes2('P1'), pool.address);
  await master.setLatestAddress(toBytes2('LO'), limitOrders.address);

  await limitOrders.changeMasterAddress(master.address);
  await limitOrders.changeDependentContractAddress();

  await pool.addAsset({ assetAddress: dai.address, isCoverAsset: true, isAbandoned: false });

  await dai.mint(limitOrderOwner.address, parseEther('1000000'));

  await memberRoles.setRole(limitOrdersSettler.address, 2);
  await memberRoles.setRole(limitOrderOwner.address, 2);

  return {
    accounts: {
      limitOrderOwner,
      limitOrdersSettler,
      notOwner,
    },
    contracts: {
      dai,
      limitOrders,
    },
  };
}

module.exports = { setup };
