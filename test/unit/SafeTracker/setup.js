const { ethers, nexus } = require('hardhat');
const { setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const { getAccounts } = require('../../utils/accounts');

const { parseEther, parseUnits } = ethers;
const { ContractIndexes } = nexus.constants;

const ETH_RATE = 1;

async function setup() {
  const accounts = await getAccounts();

  const registry = await ethers.deployContract('RegistryMock');
  const priceFeedOracle = await ethers.deployContract('PriceFeedOracleMock', [ETH_RATE]);
  const swapOperator = await ethers.deployContract('STMockSwapOperator');
  const pool = priceFeedOracle;

  const investmentLimit = parseUnits('15000000', 6);

  const usdc = await ethers.deployContract('ERC20Mock');
  const aweth = await ethers.deployContract('ERC20Mock');
  const debtUsdc = await ethers.deployContract('ERC20Mock');
  const weth = await ethers.deployContract('WETH9');

  await usdc.setMetadata('USDC', 'USDC', 6);
  await debtUsdc.setMetadata('Debt USDC', 'debtUSDC', 6);

  const wethAmount = parseEther('100');
  await weth.deposit({ value: wethAmount });

  await usdc.mint(accounts.defaultSender.address, parseUnits('100000', 6));
  await aweth.mint(accounts.defaultSender.address, parseEther('100000'));
  await debtUsdc.mint(accounts.defaultSender.address, parseUnits('100000', 6));

  await registry.addContract(ContractIndexes.C_POOL, pool.target, false);

  // use defaultSender for safe in unit tests
  const safeTracker = await ethers.deployContract('SafeTracker', [
    registry.target,
    investmentLimit,
    accounts.defaultSender.address,
    usdc.target,
    weth.target,
    aweth.target,
    debtUsdc.target,
  ]);

  await setBalance(pool.target, parseEther('145000'));
  const contracts = { registry, pool, safeTracker, swapOperator, priceFeedOracle };
  const tokens = { usdc, weth, aweth, debtUsdc };

  return { accounts, contracts, tokens };
}

module.exports = {
  setup,
};
