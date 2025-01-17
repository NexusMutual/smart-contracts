const { ethers } = require('hardhat');
const { toBytes2 } = require('../../../lib/helpers');

const { setEtherBalance } = require('../utils').evm;
const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

async function setup() {
  const coverOrderOwner = ethers.Wallet.createRandom().connect(ethers.provider);
  await setEtherBalance(coverOrderOwner.address, parseEther('1000000'));

  const notOwner = ethers.Wallet.createRandom().connect(ethers.provider);
  await setEtherBalance(notOwner.address, parseEther('1000000'));

  const coverOrderSettler = ethers.Wallet.createRandom().connect(ethers.provider);
  await setEtherBalance(coverOrderSettler.address, parseEther('1000000'));

  const dai = await ethers.deployContract('ERC20Mock');
  const memberRoles = await ethers.deployContract('MemberRolesMock');
  const cover = await ethers.deployContract('CoverOrderCoverMock');
  const pool = await ethers.deployContract('PoolMock');
  const master = await ethers.deployContract('MasterMock');

  await master.setLatestAddress(toBytes2('CO'), cover.address);
  await master.setLatestAddress(toBytes2('MR'), memberRoles.address);
  await master.setLatestAddress(toBytes2('P1'), pool.address);

  await pool.addAsset({ assetAddress: dai.address, isCoverAsset: true, isAbandoned: false });

  await dai.mint(coverOrderOwner.address, parseEther('1000000'));

  const coverOrder = await ethers.deployContract('CoverOrder', [master.address, AddressZero, coverOrderOwner.address]);

  await memberRoles.setRole(coverOrder.address, 2);
  await memberRoles.setRole(coverOrderSettler.address, 2);
  await memberRoles.setRole(coverOrderOwner.address, 2);

  return {
    accounts: {
      coverOrderOwner,
      coverOrderSettler,
      notOwner,
    },
    contracts: {
      dai,
      coverOrder,
    },
  };
}

module.exports = { setup };
