const { ethers } = require('hardhat');
const { getAccounts } = require('../../utils/accounts');
const { hex } = require('../utils').helpers;

const {
  BigNumber,
  constants: { AddressZero },
  utils: { parseEther, hexlify, randomBytes, isHexString, hexDataLength },
} = ethers;

// will be assigned by setup()
const instances = {};

async function setup() {
  const [owner, governance] = await ethers.getSigners();

  let accounts = await getAccounts();

  const MasterMock = await ethers.getContractFactory('MasterMock');
  const Pool = await ethers.getContractFactory('Pool');
  const MCR = await ethers.getContractFactory('MCR');
  const SwapOperator = await ethers.getContractFactory('SwapOperator');
  const CSMockQuotationData = await ethers.getContractFactory('SOMockQuotationData');
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

  // Deploy CoW Protocol mocks
  const cowVaultRelayer = await SOMockVaultRelayer.deploy();
  const cowSettlement = await SOMockSettlement.deploy(cowVaultRelayer.address);

  // Deploy Master, QD and MCR
  const master = await MasterMock.deploy();
  const quotationData = await CSMockQuotationData.deploy();
  const mcr = await MCR.deploy(master.address);

  // Deploy price aggregators
  const daiAggregator = await ChainlinkAggregatorMock.deploy();
  await daiAggregator.setLatestAnswer(0.0002 * 1e18); // 1 dai = 0.0002 eth, 1 eth = 5000 dai
  const stethAggregator = await ChainlinkAggregatorMock.deploy();
  await stethAggregator.setLatestAnswer(parseEther('1')); // 1 steth = 1 eth
  const usdcAggregator = await ChainlinkAggregatorMock.deploy();
  await usdcAggregator.setLatestAnswer(0.0002 * 1e18); // 1 usdc = 0.0002 eth, 1 eth = 5000 dai

  const enzymeV4VaultAggregator = await ChainlinkAggregatorMock.deploy();
  await enzymeV4VaultAggregator.setLatestAnswer(parseEther('1')); // 1 ETH = 1 share

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
    [dai.address, stEth.address, usdc.address, enzymeV4Vault.address],
    [daiAggregator.address, stethAggregator.address, usdcAggregator.address, enzymeV4VaultAggregator.address],
    [18, 18, 6, 18],
  );

  // Deploy Pool
  const pool = await Pool.deploy(
    master.address,
    priceFeedOracle.address, // price feed oracle, add to setup if needed
    AddressZero, // swap operator
    dai.address,
    stEth.address,
  );

  // Setup master, pool and mcr connections
  await master.enrollGovernance(governance.address);
  await master.setLatestAddress(hex('QD'), quotationData.address);
  await master.setLatestAddress(hex('MC'), mcr.address);
  await master.setLatestAddress(hex('P1'), pool.address);

  await pool.changeDependentContractAddress();
  await mcr.changeDependentContractAddress();

  await pool.connect(governance).addAsset(usdc.address, 6, 0, parseEther('1000'), 0, true);

  // Deploy SwapOperator
  const swapOperator = await SwapOperator.deploy(
    cowSettlement.address,
    await owner.getAddress(),
    master.address,
    weth.address,
    enzymeV4Vault.address,
    enzymeFundValueCalculatorRouter.address,
    parseEther('1'),
  );

  // Setup pool's swap operator
  await pool.connect(governance).updateAddressParameters(hex('SWP_OP'.padEnd(8, '\0')), swapOperator.address);

  accounts = {
    ...accounts,
    governanceAccounts: [governance],
  };

  Object.assign(instances, {
    dai,
    weth,
    stEth,
    usdc,
    master,
    pool,
    mcr,
    swapOperator,
    priceFeedOracle,
    daiAggregator,
    cowSettlement,
    cowVaultRelayer,
  });

  this.accounts = accounts;
  this.contracts = {
    dai,
    weth,
    stEth,
    usdc,
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
  };
}

// helper function to alter a given value
const makeWrongValue = value => {
  if (isHexString(value)) {
    return hexlify(randomBytes(hexDataLength(value)));
  } else if (BigNumber.isBigNumber(value)) {
    return value.add(1);
  } else if (typeof value === 'number') {
    return value + 1;
  } else if (typeof value === 'boolean') {
    return !value;
  } else {
    throw new Error(`Unsupported value while fuzzing order: ${value}`);
  }
};

module.exports = setup;
module.exports.contracts = instances;
module.exports.makeWrongValue = makeWrongValue;
