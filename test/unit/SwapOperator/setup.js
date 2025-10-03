const { ethers, nexus } = require('hardhat');
const { loadFixture, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const { init } = require('../../init');

const { parseEther } = ethers;
const { Assets, ContractIndexes } = nexus.constants;

const deployERC20Mock = async (name, symbol, decimals) => {
  const erc20 = await ethers.deployContract('ERC20Mock');
  await erc20.setMetadata(name, symbol, decimals);
  return erc20;
};

async function setup() {
  await loadFixture(init);
  const [defaultSender, governor, alice, bob, mallory, swapController /*, safe */] = await ethers.getSigners();

  // deploy weth and erc20 mocks
  const weth = await ethers.deployContract('WETH9');
  const dai = await deployERC20Mock('MockDai', 'DAI', 18);
  const usdc = await deployERC20Mock('MockUsdc', 'USDC', 6);
  const stEth = await deployERC20Mock('stETH', 'stETH', 18);
  const safeTracker = await deployERC20Mock('SafeTracker', 'ST', 18);

  // deploy cow protocol mocks
  const cowVaultRelayer = await ethers.deployContract('SOMockVaultRelayer');
  const cowSettlement = await ethers.deployContract('SOMockSettlement', [cowVaultRelayer]);

  // deploy enzyme mocks
  const enzymeV4Vault = await ethers.deployContract('SOMockEnzymeV4Vault', []);
  const enzymeV4Comptroller = await ethers.deployContract('SOMockEnzymeV4Comptroller', [weth, enzymeV4Vault]);
  await enzymeV4Vault.setAccessor(enzymeV4Comptroller);

  // deposit weth to Enzyme Vault
  const comptrollerWethReserves = parseEther('10000');
  await weth.deposit({ value: comptrollerWethReserves });
  await weth.transfer(enzymeV4Vault, comptrollerWethReserves);

  const assetDetails = [
    { assetAddress: Assets.ETH, isCoverAsset: true, isAbandoned: false },
    { assetAddress: dai, isCoverAsset: true, isAbandoned: false },
    { assetAddress: usdc, isCoverAsset: true, isAbandoned: false },
    { assetAddress: stEth, isCoverAsset: false, isAbandoned: false },
    { assetAddress: enzymeV4Vault, isCoverAsset: false, isAbandoned: false },
  ];

  const pool = await ethers.deployContract('SOMockPool', [assetDetails]);

  const registry = await ethers.deployContract('SOMockRegistry');
  await registry.setContractAddress(ContractIndexes.C_GOVERNOR, governor);
  await registry.setContractAddress(ContractIndexes.C_POOL, pool);

  const swapOperator = await ethers.deployContract('SwapOperator', [registry, cowSettlement, enzymeV4Vault, weth]);
  await swapOperator.connect(governor).setSwapController(swapController);
  await pool.setSwapOperator(swapOperator);

  await setBalance(pool.target, parseEther('1000'));
  await dai.mint(pool.target, parseEther('20000000')); // 20M DAI
  await usdc.mint(pool.target, parseEther('20000000')); // 20M USDC
  await stEth.mint(pool.target, parseEther('1000')); // 1000 stETH

  const enzymeContracts = { enzymeV4Vault, enzymeV4Comptroller };
  const cowContracts = { cowVaultRelayer, cowSettlement };
  const tokens = { weth, dai, usdc, stEth };

  return {
    accounts: { defaultSender, governor, alice, bob, mallory, swapController },
    contracts: { pool, registry, swapOperator, safeTracker, ...tokens, ...enzymeContracts, ...cowContracts },
  };
}

module.exports = setup;
