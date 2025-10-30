const { ethers } = require('hardhat');

const { Role } = require('../../../lib/constants');
const { hex } = require('../../../lib/helpers');
const { BigNumber } = require('ethers');
const { setEtherBalance } = require('../utils').evm;
const { getAccounts } = require('../utils').accounts;

const { parseEther } = ethers.utils;

const SPOT_PRICE_A = parseEther('0.0347');
const SPOT_PRICE_B = parseEther('0.0152');

async function setup() {
  const accounts = await getAccounts();
  const master = await ethers.deployContract('MasterMock');
  const memberRoles = await ethers.deployContract('RAMockMemberRoles');
  const nxm = await ethers.deployContract('NXMTokenMock');
  const tokenController = await ethers.deployContract('RAMockTokenController', [nxm.address]);
  const mcr = await ethers.deployContract('RAMockMCR', [master.address]);
  const pool = await ethers.deployContract('PoolMock');
  const ramm = await ethers.deployContract('Ramm', [SPOT_PRICE_B]);

  await mcr.setPool(pool.address);
  await setEtherBalance(pool.address, parseEther('145000'));
  await pool.setTokenPrice(0, SPOT_PRICE_A);

  await Promise.all([
    master.setLatestAddress(hex('P1'), pool.address),
    master.setLatestAddress(hex('TC'), tokenController.address),
    master.setLatestAddress(hex('MC'), mcr.address),
    master.setLatestAddress(hex('RA'), ramm.address),
    master.setTokenAddress(nxm.address),
    master.enrollInternal(ramm.address),
    master.enrollGovernance(accounts.governanceContracts[0].address),
    master.setEmergencyAdmin(accounts.emergencyAdmin.address),
  ]);

  for (const member of accounts.members) {
    await master.enrollMember(member.address, Role.Member);
    await memberRoles.enrollMember(member.address, Role.Member);
    await nxm.mint(member.address, parseEther('10000'));
    await nxm.connect(member).approve(tokenController.address, parseEther('10000'));
  }

  await nxm.mint(accounts.defaultSender.address, parseEther('6700000'));

  await ramm.changeMasterAddress(master.address);
  await ramm.changeDependentContractAddress();

  await ramm.connect(accounts.emergencyAdmin).setEmergencySwapPause(false);

  const internalConstants = {
    FAST_RATCHET_SPEED: BigNumber.from(5000),
    INITIAL_LIQUIDITY: parseEther('5000'),
    INITIAL_BUDGET: parseEther('43835'),
    INITIAL_ETH_LIMIT: BigNumber.from(22000),
    INITIAL_NXM_LIMIT: BigNumber.from(250000),
  };

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
      NORMAL_RATCHET_SPEED: await ramm.NORMAL_RATCHET_SPEED(),
      ...internalConstants,
    },
  };
}

module.exports = {
  setup,
  SPOT_PRICE_A,
  SPOT_PRICE_B,
};
