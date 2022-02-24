const { ethers } = require('hardhat');
const { hex } = require('../utils').helpers;

const {
  constants: { AddressZero },
  utils: { parseEther },
} = ethers;

// will be assigned by setup()
const instances = {};

async function setup () {
  const [owner, governance] = await ethers.getSigners();

  const MasterMock = await ethers.getContractFactory('MasterMock');
  const CSMockTwapOracle = await ethers.getContractFactory('CSMockTwapOracle');
  const Pool = await ethers.getContractFactory('Pool');
  const MCR = await ethers.getContractFactory('MCR');
  const CowSwapOperator = await ethers.getContractFactory('CowSwapOperator');
  const CSMockQuotationData = await ethers.getContractFactory('CSMockQuotationData');
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const CSMockWeth = await ethers.getContractFactory('CSMockWeth');
  const CSMockSettlement = await ethers.getContractFactory('CSMockSettlement');
  const CSMockVaultRelayer = await ethers.getContractFactory('CSMockVaultRelayer');

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

  // Deploy Pool
  const oneK = parseEther('1000');
  const pool = await Pool.deploy(
    [dai.address, usdc.address, stEth.address], // assets
    [18, 18, 18], // decimals
    [0, 0, 0], // min
    [oneK, oneK, oneK], // max
    [500, 500, 500], // max slippage ratio [5%, 5%, 5%]
    master.address,
    AddressZero, // price feed oracle, add to setup if needed
    AddressZero, // swap operator
  );

  // Setup master, pool and mcr connections
  await master.enrollGovernance(governance.address);
  await master.setLatestAddress(hex('QD'), quotationData.address);
  await master.setLatestAddress(hex('MC'), mcr.address);
  await master.setLatestAddress(hex('P1'), pool.address);

  await pool.changeDependentContractAddress();
  await mcr.changeDependentContractAddress();

  // Deploy Twap Oracle
  const twap = await CSMockTwapOracle.deploy();

  // Deploy CowSwapOperator
  const swapOperator = await CowSwapOperator.deploy(
    cowSettlement.address,
    cowVaultRelayer.address,
    await owner.getAddress(),
    master.address,
    weth.address,
    twap.address,
  );

  // Setup pool's swap operator
  await pool.connect(governance).updateAddressParameters(
    hex('SWP_OP'.padEnd(8, '\0')),
    swapOperator.address,
  );

  Object.assign(instances, {
    master,
    pool,
    mcr,
    swapOperator,
    twap,
    cowSettlement,
    cowVaultRelayer,
  });
}

module.exports = setup;
module.exports.contracts = () => instances;
