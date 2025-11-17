const { ethers, nexus } = require('hardhat');

const { setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const { getAccounts } = require('../utils');

const { parseEther } = ethers;
const { ContractIndexes } = nexus.constants;

const SPOT_PRICE_A = parseEther('0.0347');
const SPOT_PRICE_B = parseEther('0.0152');

async function setup() {
  const accounts = await getAccounts();
  const token = await ethers.deployContract('NXMTokenMock');
  const tokenController = await ethers.deployContract('RAMockTokenController', [token.target]);
  const pool = await ethers.deployContract('PoolMock');
  const registry = await ethers.deployContract('RegistryMock');

  // add contracts to registry BEFORE deploying Ramm
  const [governor] = accounts.governanceContracts;
  await registry.addContract(ContractIndexes.C_GOVERNOR, governor.address, false);
  await registry.addContract(ContractIndexes.C_POOL, pool.target, false);
  await registry.addContract(ContractIndexes.C_TOKEN_CONTROLLER, tokenController.target, false);

  const ramm = await ethers.deployContract('Ramm', [registry.target, SPOT_PRICE_B]);

  await setBalance(pool.target, parseEther('145000'));
  await pool.setTokenPrice(0, SPOT_PRICE_A);
  await pool.setMCR(parseEther('100000'));

  for (const member of accounts.members) {
    await registry.join(member.address, '0x');
    await token.mint(member.address, parseEther('10000'));
    await token.connect(member).approve(tokenController.target, parseEther('10000'));
  }

  // mint NXM tokens and initialize ramm
  await token.mint(accounts.defaultSender.address, parseEther('6700000'));
  await ramm.connect(governor).initialize();

  const internalConstants = {
    FAST_RATCHET_SPEED: 5000n,
    INITIAL_LIQUIDITY: parseEther('5000'),
    INITIAL_BUDGET: parseEther('43835'),
    INITIAL_ETH_LIMIT: 22000n,
    INITIAL_NXM_LIMIT: 250000n,
  };

  return {
    accounts,
    contracts: {
      token,
      tokenController,
      pool,
      ramm,
      registry,
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
