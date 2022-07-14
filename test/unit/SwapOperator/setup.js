const { accounts, artifacts, web3 } = require('hardhat');

const { ether } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;
const { setupUniswap } = require('../utils');
const { impersonateAccount } = require("../../utils/evm");

// actual uniswap addresses on all chains
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';


// will be assigned by setup()
const instances = {};

async function setup () {
  const [owner, governance] = accounts;

  /* load artifacts */

  const P1MockLido = artifacts.require('P1MockLido');
  const TwapOracle = artifacts.require('TwapOracle');

  /** @var { PoolContract} Pool */
  const Pool = artifacts.require('Pool');
  const SwapOperator = artifacts.require('SwapOperator');
  const MasterMock = artifacts.require('MasterMock');
  const P1MockEnzymeV4Comptroller = artifacts.require('P1MockEnzymeV4Comptroller');
  const P1MockEnzymeV4Vault = artifacts.require('P1MockEnzymeV4Vault');
  const P1MockEnzymeFundValueCalculatorRouter = artifacts.require('P1MockEnzymeFundValueCalculatorRouter');

  const lido = await P1MockLido.new();

  const {
    factory,
    router,
    wethAPair,
    wethBPair,
    weth,
    tokenA,
    tokenB,
  } = await setupUniswap();

  const twapOracle = await TwapOracle.new(factory.address);

  /* deploy enzyme */
  const enzymeV4Comptroller = await P1MockEnzymeV4Comptroller.new(weth.address);


  /* move weth to Comptroller */

  const comtrollerWethReserves = ether('10000');
  await weth.deposit({
    value: comtrollerWethReserves
  });
  await weth.transfer(enzymeV4Comptroller.address, comtrollerWethReserves);

  const enzymeV4Vault = await P1MockEnzymeV4Vault.new(
    enzymeV4Comptroller.address,
    'Enzyme V4 Vault Share ETH',
    'EVSE',
    18
  );

  await enzymeV4Comptroller.setVault(enzymeV4Vault.address);

  /* deploy our contracts */

  /** @var {MasterMockInstance} master */
  const master = await MasterMock.new();

  const pool = await Pool.new(
    [tokenA.address, tokenB.address, lido.address, enzymeV4Vault.address], // assets
    [0, 0, 0, 0], // min
    [ether('1000'), ether('1000'), ether('1000'), ether('1000')], // max
    [ether('0.05'), ether('0.05'), ether('0.05'), ether('0.05')], // max slippage ratio [1%, 1%]
    master.address,
    ZERO_ADDRESS, // price feed oracle not used
    ZERO_ADDRESS, // swap operator
  );

  await master.setLatestAddress(hex('P1'), pool.address);
  await master.enrollGovernance(governance);

  const enzymeFundValueCalculatorRouter = await P1MockEnzymeFundValueCalculatorRouter.new(weth.address);

  const swapOperator = await SwapOperator.new(
    master.address,
    twapOracle.address,
    owner,
    lido.address,
    enzymeV4Vault.address,
    enzymeFundValueCalculatorRouter.address
  );

  await pool.updateAddressParameters(hex('SWP_OP'), swapOperator.address, {
    from: governance,
  });

  // add ether to pool
  await web3.eth.sendTransaction({
    from: owner,
    to: pool.address,
    value: ether('10000'),
  });

  const main = {
    master,
    pool,
    factory,
    router,
    oracle: twapOracle,
    swapOperator,
    enzymeV4Comptroller,
    enzymeV4Vault
  };
  const tokens = { weth, tokenA, tokenB, lido };
  const pairs = { wethAPair, wethBPair };

  Object.assign(instances, { ...main, ...tokens, ...pairs });
}

/**
 * @typedef {object} SwapOperatorContracts
 * @property {MasterMockInstance} master
 * @property {PoolInstance} pool
 * @property {UniswapV2FactoryInstance} factory
 * @property {UniswapV2Router02Instance} router
 * @property {TwapOracleInstance} oracle
 * @property {ERC20MockInstance} tokenA
 * @property {ERC20MockInstance} tokenB
 * @property {WETH9Instance} weth
 * @property {UniswapV2PairInstance} wethAPair
 * @property {UniswapV2PairInstance} wethBPair
 */

module.exports = setup;

/** @returns {SwapOperatorContracts} */
module.exports.contracts = () => instances;
