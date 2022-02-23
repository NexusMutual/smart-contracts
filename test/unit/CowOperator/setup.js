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
  const Pool = await ethers.getContractFactory('Pool');
  const MCR = await ethers.getContractFactory('MCR');
  const SwapOperator = await ethers.getContractFactory('SwapOperator');
  const CSMockQuotationData = await ethers.getContractFactory('CSMockQuotationData');
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');

  // mock tokens
  const tokenA = await ERC20Mock.deploy();
  const tokenB = await ERC20Mock.deploy();
  const tokenC = await ERC20Mock.deploy();

  // master contract
  const master = await MasterMock.deploy();
  const quotationData = await CSMockQuotationData.deploy();
  const mcr = await MCR.deploy(master.address);

  const oneK = parseEther('1000');

  const pool = await Pool.deploy(
    [tokenA.address, tokenB.address, tokenC.address], // assets
    [18, 18, 18], // decimals
    [0, 0, 0], // min
    [oneK, oneK, oneK], // max
    [500, 500, 500], // max slippage ratio [5%, 5%, 5%]
    master.address,
    AddressZero, // price feed oracle, add to setup if needed
    AddressZero, // swap operator
  );

  await master.enrollGovernance(governance.address);
  await master.setLatestAddress(hex('QD'), quotationData.address);
  await master.setLatestAddress(hex('MC'), mcr.address);
  await master.setLatestAddress(hex('P1'), pool.address);

  await pool.changeDependentContractAddress();
  await mcr.changeDependentContractAddress();

  /* swap operator start */

  const swapOperator = await SwapOperator.deploy(
    master.address,
    AddressZero, // twap oracle, not used
    owner.address, // swap controller
    AddressZero, // lido token addres, not used
  );

  await pool.connect(governance).updateAddressParameters(
    hex('SWP_OP'.padEnd(8, '\0')),
    swapOperator.address,
  );

  /* swap operator end */

  // add ether to pool
  await owner.sendTransaction({
    to: pool.address,
    value: parseEther('10000'),
  });

  Object.assign(instances, {
    master,
    pool,
    mcr,
    swapOperator,
  });
}

module.exports = setup;
module.exports.contracts = () => instances;
