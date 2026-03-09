const { ethers } = require('hardhat');

const { setEtherBalance } = require('../../utils/evm');
const { getAccounts } = require('../../utils/accounts');

const { parseEther, parseUnits } = ethers;

const ETH_RATE = 1;

async function setup() {
  const accounts = await getAccounts();

  const registry = await ethers.deployContract('RegistryMock');
  const priceFeedOracle = await ethers.deployContract('PriceFeedOracleMock', [ETH_RATE]);
  const swapOperator = await ethers.deployContract('STMockSwapOperator');
  const pool = priceFeedOracle;

  const tokenAmount = parseEther('100000');
  const investmentLimit = parseUnits('15000000', 6);

  const usdc = await ethers.deployContract('ERC20Mock');
  const aweth = await ethers.deployContract('ERC20Mock');
  const debtUsdc = await ethers.deployContract('ERC20Mock');
  const weth = await ethers.deployContract('WETH9');

  const wethAmount = parseEther('100');
  await weth.deposit({ value: wethAmount });

  await usdc.mint(accounts.defaultSender.address, tokenAmount);
  await aweth.mint(accounts.defaultSender.address, tokenAmount);
  await debtUsdc.mint(accounts.defaultSender.address, tokenAmount);

  // C_POOL index constant from RegistryAware
  const C_POOL = 1 << 4;
  await registry.addContract(C_POOL, pool.target, false);

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

  await setEtherBalance(pool.target, parseEther('145000'));
  const contracts = { registry, pool, safeTracker, swapOperator, priceFeedOracle };
  const tokens = { usdc, weth, aweth, debtUsdc };

  return { accounts, contracts, tokens };
}

module.exports = {
  setup,
};
