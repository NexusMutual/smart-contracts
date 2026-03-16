const { ethers } = require('hardhat');
const { toBytes2 } = require('../../../lib/helpers');
const { setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const { ZeroAddress, parseEther } = ethers;

async function setup() {
  const limitOrderOwner = ethers.Wallet.createRandom().connect(ethers.provider);
  await setBalance(limitOrderOwner.address, parseEther('1000000'));

  const notOwner = ethers.Wallet.createRandom().connect(ethers.provider);
  await setBalance(notOwner.address, parseEther('1000000'));

  const limitOrdersSettler = ethers.Wallet.createRandom().connect(ethers.provider);
  await setBalance(limitOrdersSettler.address, parseEther('1000000'));

  const dai = await ethers.deployContract('ERC20Mock');
  const memberRoles = await ethers.deployContract('MemberRolesMock');
  const cover = await ethers.deployContract('LimitOrdersCoverMock');
  const pool = await ethers.deployContract('PoolMock');
  const master = await ethers.deployContract('MasterMock');

  const limitOrders = await ethers.deployContract('LimitOrders', [
    ZeroAddress,
    ZeroAddress,
    limitOrdersSettler.address,
  ]);

  await master.setLatestAddress(toBytes2('CO'), cover.target);
  await master.setLatestAddress(toBytes2('MR'), memberRoles.target);
  await master.setLatestAddress(toBytes2('P1'), pool.target);
  await master.setLatestAddress(toBytes2('LO'), limitOrders.target);

  await limitOrders.changeMasterAddress(master.target);
  await limitOrders.changeDependentContractAddress();

  await pool.addAsset({ assetAddress: dai.target, isCoverAsset: true, isAbandoned: false });

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
