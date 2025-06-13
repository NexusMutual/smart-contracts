const { ethers } = require('hardhat');

const { hex } = require('../../../lib/helpers');
const { setEtherBalance } = require('../utils').evm;
const { getAccounts } = require('../utils').accounts;

const { parseEther, parseUnits } = ethers.utils;

const ETH_RATE = 1;

async function setup() {
  const accounts = await getAccounts();
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const WETH9 = await ethers.getContractFactory('WETH9');

  const master = await ethers.deployContract('MasterMock');
  const nxm = await ethers.deployContract('NXMTokenMock');
  const priceFeedOracle = await ethers.deployContract('PriceFeedOracleMock', [ETH_RATE]);
  const swapOperator = await ethers.deployContract('STMockSwapOperator');
  const pool = await ethers.deployContract('PoolMock', [priceFeedOracle.address, swapOperator.address]);
  const tokenController = await ethers.deployContract('TokenControllerMock', [nxm.address]);

  const tokenAmount = parseEther('100000');
  const investmentLimit = parseUnits('15000000', 6);

  const usdc = await ERC20Mock.deploy();
  const dai = await ERC20Mock.deploy();
  const aweth = await ERC20Mock.deploy();
  const debtUsdc = await ERC20Mock.deploy();

  const weth = await WETH9.deploy();
  const wethAmount = parseEther('100');
  await weth.deposit({ value: wethAmount });

  await usdc.mint(accounts.defaultSender.address, tokenAmount);
  await dai.mint(accounts.defaultSender.address, tokenAmount);
  await aweth.mint(accounts.defaultSender.address, tokenAmount);
  await debtUsdc.mint(accounts.defaultSender.address, tokenAmount);

  // use defaultSender for safe in unit tests
  const safeTracker = await ethers.deployContract('SafeTracker', [
    investmentLimit,
    accounts.defaultSender.address,
    usdc.address,
    dai.address,
    weth.address,
    aweth.address,
    debtUsdc.address,
  ]);

  await setEtherBalance(pool.address, parseEther('145000'));
  await pool.setTokenPrice(0, parseEther('0.0347'));

  await Promise.all([
    master.setLatestAddress(hex('P1'), pool.address),
    master.setLatestAddress(hex('TC'), tokenController.address),
    master.setLatestAddress(hex('ST'), safeTracker.address),
    master.setTokenAddress(nxm.address),
    master.enrollInternal(safeTracker.address),
    master.enrollInternal(pool.address),
    master.enrollGovernance(accounts.governanceContracts[0].address),
    master.setEmergencyAdmin(accounts.emergencyAdmin.address),
  ]);

  await safeTracker.changeMasterAddress(master.address);
  await safeTracker.changeDependentContractAddress();

  await nxm.mint(accounts.defaultSender.address, parseEther('6700000'));

  const contracts = { master, nxm, tokenController, pool, safeTracker, swapOperator, priceFeedOracle };
  const tokens = { usdc, dai, weth, aweth, debtUsdc };

  return { accounts, contracts, tokens };
}

module.exports = {
  setup,
};
