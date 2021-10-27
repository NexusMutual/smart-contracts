const { accounts, artifacts, web3 } = require('hardhat');

const { ether } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;
const { setupUniswap } = require('../utils');

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

  const lido = await P1MockLido.new();

  const { factory, router, wethAPair, wethBPair, weth, tokenA, tokenB } = await setupUniswap();

  const twapOracle = await TwapOracle.new(factory.address);

  /* deploy our contracts */

  /** @var {MasterMockInstance} master */
  const master = await MasterMock.new();

  const pool = await Pool.new(
    [tokenA.address, tokenB.address, lido.address], // assets
    [18, 18, 18], // decimals
    [0, 0, 0], // min
    [ether('1000'), ether('1000'), ether('1000')], // max
    [500, 500, 500], // max slippage ratio [5%, 5%, 5%]
    master.address,
    ZERO_ADDRESS, // price feed oracle not used
    ZERO_ADDRESS, // swap operator
  );

  await master.setLatestAddress(hex('P1'), pool.address);
  await master.enrollGovernance(governance);

  const swapOperator = await SwapOperator.new(master.address, twapOracle.address, owner, lido.address);

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
