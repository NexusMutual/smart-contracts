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

  // dynamically tracked asset: 8 decimals token priced at 0.5 ETH
  const trackedAssetDecimals = 8;
  const trackedAsset = await ethers.deployContract('ERC20Mock');
  await trackedAsset.setMetadata('Tracked Asset', 'TRK', trackedAssetDecimals);
  await trackedAsset.mint(accounts.defaultSender.address, parseUnits('1000', trackedAssetDecimals));

  const trackedAssetAggregator = await ethers.deployContract('ChainlinkAggregatorMock');
  await trackedAssetAggregator.setDecimals(18);
  await trackedAssetAggregator.setLatestAnswer(parseEther('0.5'));

  await registry.addContract(ContractIndexes.C_POOL, pool.target, false);

  // use defaultSender for safe in unit tests
  const safeTracker = await ethers.deployContract('SafeTracker', [
    registry.target,
    investmentLimit,
    accounts.defaultSender.address,
    usdc.target,
    aweth.target,
    debtUsdc.target,
  ]);

  // ETH denominated aggregator for usdc (1 USDC = 0.0005 ETH)
  const usdcAggregator = await ethers.deployContract('ChainlinkAggregatorMock');
  await usdcAggregator.setDecimals(18);
  await usdcAggregator.setLatestAnswer(parseEther('0.0005'));

  await setBalance(pool.target, parseEther('145000'));
  const contracts = {
    registry,
    pool,
    safeTracker,
    swapOperator,
    priceFeedOracle,
    trackedAssetAggregator,
    usdcAggregator,
  };
  const tokens = { usdc, weth, aweth, debtUsdc, trackedAsset };

  return { accounts, contracts, tokens, trackedAssetDecimals };
}

module.exports = {
  setup,
};
