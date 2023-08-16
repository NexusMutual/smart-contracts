const { ethers } = require('hardhat');

const { Role } = require('../../../lib/constants');
const { hex } = require('../../../lib/helpers');
const {
  evm: { setEtherBalance },
  accounts: { getAccounts },
} = require('../utils');

const { parseEther } = ethers.utils;

async function setup() {
  const accounts = await getAccounts();
  const master = await ethers.deployContract('MasterMock');
  const memberRoles = await ethers.deployContract('RammMockMemberRoles');
  const nxm = await ethers.deployContract('NXMTokenMock');
  const tokenController = await ethers.deployContract('RammMockTokenController', [nxm.address]);
  const mcr = await ethers.deployContract('RammMockMCR', [master.address]);
  const pool = await ethers.deployContract('RammMockPool', [master.address, mcr.address, nxm.address]);
  const twapOracle = await ethers.deployContract('TwapOracle');

  await mcr.setPool(pool.address);

  const TARGET_LIQUIDITY = parseEther('2500');
  const AGGRESSICE_LIQUIDITY_SPEED = parseEther('200');
  const LIQUIDITY = parseEther('2000');
  const BUDGET = parseEther('250');
  const LIQUIDITY_SPEED_OUT = 100; // 100ETH
  const LIQUIDITY_SPEED_IN = 100; // 100ETH
  const RATCHET_SPEED_A = 400;
  const RATCHET_SPEED_B = 400;
  const SPOT_PRICE_A = parseEther('0.03');
  const SPOT_PRICE_B = parseEther('0.01');

  const ramm = await ethers.deployContract('Ramm', [
    TARGET_LIQUIDITY,
    LIQUIDITY,
    BUDGET,
    AGGRESSICE_LIQUIDITY_SPEED,
    LIQUIDITY_SPEED_OUT,
    LIQUIDITY_SPEED_IN,
    RATCHET_SPEED_A,
    RATCHET_SPEED_B,
    SPOT_PRICE_A,
    SPOT_PRICE_B,
    twapOracle.address,
  ]);

  await setEtherBalance(pool.address, parseEther('145000'));

  await Promise.all([
    master.setLatestAddress(hex('TC'), tokenController.address),
    master.setTokenAddress(nxm.address),
    master.setLatestAddress(hex('MR'), memberRoles.address),
    master.setLatestAddress(hex('MC'), mcr.address),
    master.setLatestAddress(hex('RA'), ramm.address),
    master.setLatestAddress(hex('P1'), pool.address),
    master.enrollInternal(ramm.address),
  ]);

  await ramm.changeMasterAddress(master.address);
  await ramm.changeDependentContractAddress();

  await twapOracle.changeMasterAddress(master.address);
  await twapOracle.changeDependentContractAddress();

  await master.enrollGovernance(accounts.governanceContracts[0].address);

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
      twapOracle,
      ramm,
    },
  };
}

module.exports = {
  setup,
};
