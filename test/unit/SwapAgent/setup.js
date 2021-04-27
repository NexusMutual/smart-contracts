const { accounts, artifacts, web3 } = require('hardhat');

const { impersonateAccount } = require('../utils').evm;
const { ether } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;

// actual uniswap addresses on all chains
const UNISWAP_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const UNISWAP_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// will be assigned by setup()
const instances = {};

const uniswapContract = (contractName, repo = 'core') => {
  const TruffleContract = require('@truffle/contract');
  const jsonPath = `@uniswap/v2-${repo}/build/${contractName}.json`;
  const contract = TruffleContract(require(jsonPath));
  contract.setProvider(web3.currentProvider);
  return contract;
};

async function setup () {

  const [owner, governance] = accounts;
  const uniswapDeployer = '0x9c33eacc2f50e39940d3afaf2c7b8246b681a374';
  const uniswapOwner = '0xc0a4272bb5df52134178df25d77561cfb17ce407';
  const lidoDeployer = '0x55Bc991b2edF3DDb4c520B222bE4F378418ff0fA';

  /* load artifacts */

  /** @var { PoolContract} Pool */
  const Pool = artifacts.require('Pool');
  const SwapOperator = artifacts.require('SwapOperator');
  const MasterMock = artifacts.require('MasterMock');

  const ERC20Mock = artifacts.require('ERC20Mock');
  const WETH9 = artifacts.require('WETH9');
  const TwapOracle = artifacts.require('TwapOracle');
  const UniswapV2Factory = artifacts.require('UniswapV2Factory');
  const UniswapV2Pair = artifacts.require('UniswapV2Pair');
  const UniswapV2Router02 = artifacts.require('UniswapV2Router02');

  /* deploy tokens */

  const tokenA = await ERC20Mock.new();
  const tokenB = await ERC20Mock.new();
  const weth = await WETH9.new();

  /* deploy uniswap */

  await impersonateAccount(uniswapDeployer);
  await web3.eth.sendTransaction({
    from: owner,
    to: uniswapDeployer,
    value: ether('1'),
  });

  // Deploying using truffle contract to have the correct addresses:
  const TruffleUniswapV2Factory = uniswapContract('UniswapV2Factory');
  const TruffleUniswapV2Router = uniswapContract('UniswapV2Router02', 'periphery');

  // 1. deploy factory
  const _factory = await TruffleUniswapV2Factory.new(uniswapOwner, { from: uniswapDeployer });

  // 2. consume 2 nonces
  await web3.eth.sendTransaction({ from: uniswapDeployer, to: ZERO_ADDRESS });
  await web3.eth.sendTransaction({ from: uniswapDeployer, to: ZERO_ADDRESS });

  // 3. deploy router
  const _router = await TruffleUniswapV2Router.new(
    _factory.address,
    weth.address,
    { from: uniswapDeployer },
  );

  // check that we landed at the correct address
  assert.strictEqual(_factory.address, UNISWAP_FACTORY);
  assert.strictEqual(_router.address, UNISWAP_ROUTER);

  /** @var {UniswapV2FactoryInstance} factory */
  const factory = await UniswapV2Factory.at(_factory.address);
  const router = await UniswapV2Router02.at(_router.address);
  const twapOracle = await TwapOracle.new(factory.address);

  await factory.createPair(weth.address, tokenA.address);
  await factory.createPair(weth.address, tokenB.address);

  const wethAPairAddress = await twapOracle.pairFor(weth.address, tokenA.address);
  const wethBPairAddress = await twapOracle.pairFor(weth.address, tokenB.address);

  const wethAPair = await UniswapV2Pair.at(wethAPairAddress);
  const wethBPair = await UniswapV2Pair.at(wethBPairAddress);

  /* deploy our contracts */

  /** @var {MasterMockInstance} master */
  const master = await MasterMock.new();

  const pool = await Pool.new(
    [tokenA.address, tokenB.address], // assets
    [0, 0], // min
    [ether('1000'), ether('1000')], // max
    [ether('0.05'), ether('0.05')], // max slippage ratio [1%, 1%]
    master.address,
    ZERO_ADDRESS, // price feed oracle not used
    ZERO_ADDRESS, // swap operator
  );

  await master.enrollGovernance(governance);

  const swapOperator = await SwapOperator.new(pool.address, twapOracle.address, owner);

  await pool.updateAddressParameters(hex('SWP_OP'), swapOperator.address, {
    from: governance,
  });

  // add ether to pool
  await web3.eth.sendTransaction({
    from: owner,
    to: pool.address,
    value: ether('10000'),
  });

  const main = { master, pool, factory, router, oracle: twapOracle, swapOperator };
  const tokens = { weth, tokenA, tokenB };
  const pairs = { wethAPair, wethBPair };

  Object.assign(instances, { ...main, ...tokens, ...pairs });
}

/**
 * @typedef {object} SwapAgentContracts
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

/** @returns {SwapAgentContracts} */
module.exports.contracts = () => instances;
