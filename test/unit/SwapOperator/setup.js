const { ethers } = require('hardhat');
const { getAccounts } = require('../../utils/accounts');
const { parseUnits } = require('ethers/lib/utils');
const { hex } = require('../utils').helpers;
const { AggregatorType, Assets } = require('../utils').constants;

const {
  utils: { parseEther },
} = ethers;

async function setup() {
  const accounts = await getAccounts();
  const [owner, governance] = await ethers.getSigners();

  const MasterMock = await ethers.getContractFactory('MasterMock');
  const TokenController = await ethers.getContractFactory('TokenControllerMock');
  const TokenMock = await ethers.getContractFactory('NXMTokenMock');
  const LegacyPool = await ethers.getContractFactory('LegacyPool');
  const Pool = await ethers.getContractFactory('Pool');
  const MCR = await ethers.getContractFactory('MCR');
  const SwapOperator = await ethers.getContractFactory('SwapOperator');
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const ERC20CustomDecimalsMock = await ethers.getContractFactory('ERC20CustomDecimalsMock');
  const SOMockWeth = await ethers.getContractFactory('SOMockWeth');
  const SOMockSettlement = await ethers.getContractFactory('SOMockSettlement');
  const SOMockVaultRelayer = await ethers.getContractFactory('SOMockVaultRelayer');
  const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
  const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
  const SOMockEnzymeV4Comptroller = await ethers.getContractFactory('SOMockEnzymeV4Comptroller');
  const SOMockEnzymeFundValueCalculatorRouter = await ethers.getContractFactory(
    'SOMockEnzymeFundValueCalculatorRouter',
  );
  const SOMockEnzymeV4Vault = await ethers.getContractFactory('SOMockEnzymeV4Vault');

  // Deploy WETH + ERC20 test tokens
  const weth = await SOMockWeth.deploy();
  const dai = await ERC20Mock.deploy();
  const usdc = await ERC20CustomDecimalsMock.deploy(6);
  const stEth = await ERC20Mock.deploy();
  const st = await ERC20Mock.deploy();

  // Deploy CoW Protocol mocks
  const cowVaultRelayer = await SOMockVaultRelayer.deploy();
  const cowSettlement = await SOMockSettlement.deploy(cowVaultRelayer.address);

  // Deploy Master, MCR, TC, NXMToken
  const master = await MasterMock.deploy();
  const mcr = await MCR.deploy(master.address, 0);

  const nxmToken = await TokenMock.deploy();
  const tokenController = await TokenController.deploy(nxmToken.address);

  await nxmToken.setOperator(tokenController.address);

  // Deploy price aggregators
  const daiAggregator = await ChainlinkAggregatorMock.deploy();
  await daiAggregator.setLatestAnswer(0.0002 * 1e18); // 1 dai = 0.0002 eth, 1 eth = 5000 dai
  const stethAggregator = await ChainlinkAggregatorMock.deploy();
  await stethAggregator.setLatestAnswer(parseEther('1')); // 1 steth = 1 eth
  const usdcAggregator = await ChainlinkAggregatorMock.deploy();
  await usdcAggregator.setLatestAnswer(0.0002 * 1e18); // 1 usdc = 0.0002 eth, 1 eth = 5000 dai

  const enzymeV4VaultAggregator = await ChainlinkAggregatorMock.deploy();
  await enzymeV4VaultAggregator.setLatestAnswer(parseEther('1')); // 1 ETH = 1 share

  const chainlinkEthUsdAsset = await ChainlinkAggregatorMock.deploy();
  await chainlinkEthUsdAsset.setLatestAnswer(parseUnits('2500', 8));
  await chainlinkEthUsdAsset.setDecimals(8);

  /* deploy enzyme mocks */
  const enzymeV4Comptroller = await SOMockEnzymeV4Comptroller.deploy(weth.address);

  /* move weth to Comptroller */

  const comtrollerWethReserves = parseEther('10000');
  await weth.deposit({
    value: comtrollerWethReserves,
  });
  await weth.transfer(enzymeV4Comptroller.address, comtrollerWethReserves);

  const enzymeV4Vault = await SOMockEnzymeV4Vault.deploy(
    enzymeV4Comptroller.address,
    'Enzyme V4 Vault Share ETH',
    'EVSE',
    18,
  );

  await enzymeV4Comptroller.setVault(enzymeV4Vault.address);

  const enzymeFundValueCalculatorRouter = await SOMockEnzymeFundValueCalculatorRouter.deploy(weth.address);

  // Deploy PriceFeedOracle
  const priceFeedOracle = await PriceFeedOracle.deploy(
    [dai.address, stEth.address, usdc.address, enzymeV4Vault.address, Assets.ETH],
    [
      daiAggregator.address,
      stethAggregator.address,
      usdcAggregator.address,
      enzymeV4VaultAggregator.address,
      chainlinkEthUsdAsset.address,
    ],
    [AggregatorType.ETH, AggregatorType.ETH, AggregatorType.ETH, AggregatorType.ETH, AggregatorType.USD],
    [18, 18, 6, 18, 18],
    st.address,
  );

  // Deploy SwapOperator
  const swapOperator = await SwapOperator.deploy(
    cowSettlement.address,
    await owner.getAddress(),
    master.address,
    weth.address,
    enzymeV4Vault.address,
    await owner.getAddress(), // _safe
    dai.address,
    usdc.address,
    enzymeFundValueCalculatorRouter.address,
    parseEther('1'),
  );

  // Deploy Pool
  const legacyPool = await LegacyPool.deploy(
    master.address,
    priceFeedOracle.address, // price feed oracle, add to setup if needed
    swapOperator.address, // swap operator
    dai.address,
    stEth.address,
    enzymeV4Vault.address,
    nxmToken.address,
  );

  const pool = await Pool.deploy(
    master.address,
    priceFeedOracle.address, // price feed oracle, add to setup if needed
    swapOperator.address, // swap operator
    nxmToken.address,
    legacyPool.address,
  );

  // Setup master, token, token controller, pool and mcr connections
  await master.enrollGovernance(governance.address);
  await master.setTokenAddress(nxmToken.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('MC'), mcr.address);
  await master.setLatestAddress(hex('P1'), pool.address);

  await pool.changeDependentContractAddress();
  await mcr.changeDependentContractAddress();

  await pool.connect(governance).addAsset(usdc.address, true, 0, parseEther('1000'), 0);

  // Setup pool's swap operator
  await pool.connect(governance).updateAddressParameters(hex('SWP_OP'.padEnd(8, '\0')), swapOperator.address);

  return {
    accounts: {
      ...accounts,
      governanceAccounts: [governance],
    },
    contracts: {
      dai,
      weth,
      stEth,
      usdc,
      st,
      master,
      pool,
      mcr,
      swapOperator,
      priceFeedOracle,
      daiAggregator,
      cowSettlement,
      cowVaultRelayer,
      enzymeV4Vault,
      enzymeV4Comptroller,
      enzymeFundValueCalculatorRouter,
      nxmToken,
    },
    constants: {
      ETH_ADDRESS: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      DAI_ADDRESS: dai.address,
    },
    poolAssetAddressIdMapping: {
      [dai.address]: 1,
      [stEth.address]: 2,
      [usdc.address]: 6,
    },
  };
}

module.exports = setup;
