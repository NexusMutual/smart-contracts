const { ethers } = require('hardhat');

const { Role } = require('../../../lib/constants');
const { hex } = require('../../../lib/helpers');
const {
  evm: { setEtherBalance },
  accounts: { getAccounts },
} = require('../utils');

const { parseEther } = ethers.utils;

async function getState(ramm) {
  const { nxmReserveA, nxmReserveB } = await ramm.slot0();
  const { ethReserve, budget, updatedAt } = await ramm.slot1();
  const ratchetSpeed = await ramm.ratchetSpeed();

  return {
    nxmA: nxmReserveA,
    nxmB: nxmReserveB,
    eth: ethReserve,
    budget,
    ratchetSpeed,
    timestamp: updatedAt,
  };
}

async function setup() {
  const SPOT_PRICE_A = parseEther('0.0347');
  const SPOT_PRICE_B = parseEther('0.0152');

  const accounts = await getAccounts();
  const master = await ethers.deployContract('MasterMock');
  const memberRoles = await ethers.deployContract('RammMockMemberRoles');
  const nxm = await ethers.deployContract('NXMTokenMock');
  const tokenController = await ethers.deployContract('RammMockTokenController', [nxm.address]);
  const mcr = await ethers.deployContract('RammMockMCR', [master.address]);
  const pool = await ethers.deployContract('RammMockPool', [master.address, mcr.address, nxm.address]);
  const ramm = await ethers.deployContract('Ramm', [SPOT_PRICE_A, SPOT_PRICE_B]);

  await mcr.setPool(pool.address);
  await setEtherBalance(pool.address, parseEther('145000'));

  await Promise.all([
    master.setLatestAddress(hex('P1'), pool.address),
    master.setLatestAddress(hex('TC'), tokenController.address),
    master.setLatestAddress(hex('MC'), mcr.address),
    master.setLatestAddress(hex('RA'), ramm.address),
    master.setTokenAddress(nxm.address),
    master.enrollInternal(ramm.address),
    master.enrollGovernance(accounts.governanceContracts[0].address),
  ]);

  await ramm.changeMasterAddress(master.address);
  await ramm.changeDependentContractAddress();

  for (const member of accounts.members) {
    await master.enrollMember(member.address, Role.Member);
    await memberRoles.enrollMember(member.address, Role.Member);
    await nxm.mint(member.address, parseEther('10000'));
    await nxm.connect(member).approve(tokenController.address, parseEther('10000'));
  }

  await nxm.mint(accounts.defaultSender.address, parseEther('6700000'));
  const state = await getState(ramm);

  return {
    accounts,
    state,
    contracts: {
      master,
      nxm,
      tokenController,
      pool,
      mcr,
      ramm,
    },
  };
}

module.exports = {
  setup,
  getState,
};
