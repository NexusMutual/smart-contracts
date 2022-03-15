const { ethers } = require('hardhat');
const { hex } = require('../utils').helpers;

const {
  BigNumber,
  constants: { AddressZero },
  utils: { parseEther, hexlify, randomBytes, isHexString, hexDataLength },
} = ethers;

// will be assigned by setup()
const instances = {};

async function setup () {
  const [owner, governance] = await ethers.getSigners();

  const MasterMock = await ethers.getContractFactory('MasterMock');
  const Pool = await ethers.getContractFactory('Pool');
  const MCR = await ethers.getContractFactory('MCR');
  const CowSwapOperator = await ethers.getContractFactory('CowSwapOperator');
  const CSMockQuotationData = await ethers.getContractFactory('CSMockQuotationData');
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const CSMockWeth = await ethers.getContractFactory('CSMockWeth');
  const CSMockSettlement = await ethers.getContractFactory('CSMockSettlement');
  const CSMockVaultRelayer = await ethers.getContractFactory('CSMockVaultRelayer');
  const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
  const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');

  // Deploy WETH + ERC20 test tokens
  const weth = await CSMockWeth.deploy();
  const dai = await ERC20Mock.deploy();
  const usdc = await ERC20Mock.deploy();
  const stEth = await ERC20Mock.deploy();

  // Deploy CoW Protocol mocks
  const cowVaultRelayer = await CSMockVaultRelayer.deploy();
  const cowSettlement = await CSMockSettlement.deploy(cowVaultRelayer.address);

  // Deploy Master, QD and MCR
  const master = await MasterMock.deploy();
  const quotationData = await CSMockQuotationData.deploy();
  const mcr = await MCR.deploy(master.address);

  // Deploy price aggregators
  const daiAggregator = await ChainlinkAggregatorMock.deploy();
  await daiAggregator.setLatestAnswer(0.0002 * 1e18); // 1 dai = 0.0002 eth, 1 eth = 5000 dai
  const stethAggregator = await ChainlinkAggregatorMock.deploy();
  await stethAggregator.setLatestAnswer(parseEther('1')); // 1 steth = 1 eth

  // Deploy PriceFeedOracle
  const priceFeedOracle = await PriceFeedOracle.deploy(
    [dai.address, stEth.address],
    [daiAggregator.address, stethAggregator.address],
    [18, 18],
  );

  // Deploy Pool
  const oneK = parseEther('1000');
  const pool = await Pool.deploy(
    [dai.address, usdc.address, stEth.address], // assets
    [18, 18, 18], // decimals
    [0, 0, 0], // min
    [oneK, oneK, oneK], // max
    [0, 0, 0], // max slippage ratio 0%
    master.address,
    priceFeedOracle.address, // price feed oracle, add to setup if needed
    AddressZero, // swap operator
  );

  // Setup master, pool and mcr connections
  await master.enrollGovernance(governance.address);
  await master.setLatestAddress(hex('QD'), quotationData.address);
  await master.setLatestAddress(hex('MC'), mcr.address);
  await master.setLatestAddress(hex('P1'), pool.address);

  await pool.changeDependentContractAddress();
  await mcr.changeDependentContractAddress();

  // Deploy CowSwapOperator
  const swapOperator = await CowSwapOperator.deploy(
    cowSettlement.address,
    await owner.getAddress(),
    master.address,
    weth.address,
    priceFeedOracle.address,
  );

  // Setup pool's swap operator
  await pool.connect(governance).updateAddressParameters(
    hex('SWP_OP'.padEnd(8, '\0')),
    swapOperator.address,
  );

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
}

// helper function to alter a given value
const makeWrongValue = (value) => {
  if (isHexString(value)) {
    return hexlify(randomBytes(hexDataLength(value)));
  } else if (value instanceof BigNumber) {
    return value.add(1);
  } else if (typeof (value) === 'number') {
    return value + 1;
  } else if (typeof (value) === 'boolean') {
    return !value;
  } else {
    throw new Error(`Unsupported value while fuzzing order: ${value}`);
  }
};

module.exports = setup;
module.exports.contracts = instances;
module.exports.makeWrongValue = makeWrongValue;
