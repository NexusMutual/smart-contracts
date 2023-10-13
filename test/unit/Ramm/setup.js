const { ethers } = require('hardhat');

const { Role } = require('../../../lib/constants');
const { hex } = require('../../../lib/helpers');
const { setEtherBalance } = require('../utils').evm;
const { getAccounts } = require('../utils').accounts;

const { parseEther } = ethers.utils;

const SPOT_PRICE_A = parseEther('0.0347');
const SPOT_PRICE_B = parseEther('0.0152');

async function getState(ramm) {
  const { nxmReserveA: nxmA, nxmReserveB: nxmB } = await ramm.slot0();
  const { ethReserve: eth, budget, updatedAt: timestamp } = await ramm.slot1();
  const ratchetSpeed = await ramm.ratchetSpeed();
  return { nxmA, nxmB, eth, budget, ratchetSpeed, timestamp };
}

async function setup() {
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

  return {
    accounts,
    contracts: {
      master,
      nxm,
      tokenController,
      pool,
      mcr,
      ramm,
    },
    constants: {
      LIQ_SPEED_PERIOD: await ramm.LIQ_SPEED_PERIOD(),
      RATCHET_PERIOD: await ramm.RATCHET_PERIOD(),
      RATCHET_DENOMINATOR: await ramm.RATCHET_DENOMINATOR(),
      PRICE_BUFFER: await ramm.PRICE_BUFFER(),
      PRICE_BUFFER_DENOMINATOR: await ramm.PRICE_BUFFER_DENOMINATOR(),
      GRANULARITY: await ramm.GRANULARITY(),
      PERIOD_SIZE: await ramm.PERIOD_SIZE(),
      FAST_LIQUIDITY_SPEED: await ramm.FAST_LIQUIDITY_SPEED(),
      TARGET_LIQUIDITY: await ramm.TARGET_LIQUIDITY(),
      LIQ_SPEED_A: await ramm.LIQ_SPEED_A(),
      LIQ_SPEED_B: await ramm.LIQ_SPEED_B(),
      FAST_RATCHET_SPEED: await ramm.FAST_RATCHET_SPEED(),
      NORMAL_RATCHET_SPEED: await ramm.NORMAL_RATCHET_SPEED(),
      INITIAL_LIQUIDITY: await ramm.INITIAL_LIQUIDITY(),
      INITIAL_BUDGET: await ramm.INITIAL_BUDGET(),
    },
  };
}

module.exports = {
  setup,
  getState,
  SPOT_PRICE_A,
  SPOT_PRICE_B,
};
