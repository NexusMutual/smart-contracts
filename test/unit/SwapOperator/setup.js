const { ethers, nexus } = require('hardhat');

const { parseEther } = ethers;
const { Assets, ContractIndexes } = nexus.constants;

const deployERC20Mock = async (name, symbol, decimals) => {
  const erc20 = await ethers.deployContract('ERC20Mock');
  await erc20.setMetadata(name, symbol, decimals);
  return erc20;
};

async function setup() {
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
  const enzymeV4Comptroller = await ethers.deployContract('SOMockEnzymeV4Comptroller', [weth]);

  // move weth to Comptroller
  const comtrollerWethReserves = parseEther('10000');
  await weth.deposit({ value: comtrollerWethReserves });
  await weth.transfer(enzymeV4Comptroller, comtrollerWethReserves);

  const enzymeV4Vault = await ethers.deployContract('SOMockEnzymeV4Vault', [
    enzymeV4Comptroller,
    'Enzyme V4 Vault Share ETH',
    'EVSE',
    18,
  ]);

  await enzymeV4Comptroller.setVault(enzymeV4Vault);

  const enzymeFundValueCalculatorRouter = await ethers.deployContract('SOMockEnzymeFundValueCalculatorRouter', [weth]);

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

  const swapOperator = await ethers.deployContract('SwapOperator', [
    registry,
    cowSettlement,
    enzymeV4Vault,
    enzymeFundValueCalculatorRouter,
    weth,
  ]);

  await swapOperator.connect(governor).setSwapController(swapController);

  return {
    accounts: { defaultSender, governor, alice, bob, mallory, swapController },
    contracts: {
      dai,
      weth,
      stEth,
      usdc,
      safeTracker,
      pool,
      registry,
      swapOperator,
      cowSettlement,
      cowVaultRelayer,
      enzymeV4Vault,
      enzymeV4Comptroller,
      enzymeFundValueCalculatorRouter,
    },
  };
}

module.exports = setup;
