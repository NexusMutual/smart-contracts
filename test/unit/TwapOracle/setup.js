const { accounts, artifacts, web3 } = require('hardhat');

const { impersonateAccount } = require('../utils').hardhat;
const { ether } = require('@openzeppelin/test-helpers');

// actual uniswap factory address on all chains
const UNISWAP_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';

// will be assigned by setup()
const instances = {};

const uniswapContract = contractName => {
  const TruffleContract = require('@truffle/contract');
  const jsonPath = `@uniswap/v2-core/build/${contractName}.json`;
  const contract = TruffleContract(require(jsonPath));
  contract.setProvider(web3.currentProvider);
  return contract;
};

async function setup () {

  const [owner] = accounts;
  const uniswapDeployer = '0x9c33eacc2f50e39940d3afaf2c7b8246b681a374';
  const uniswapOwner = '0xc0a4272bb5df52134178df25d77561cfb17ce407';

  /* load artifacts */

  const ERC20Mock = artifacts.require('ERC20Mock');
  const WETH9 = artifacts.require('WETH9');
  const TwapOracle = artifacts.require('TwapOracle');

  const UniswapV2Factory = artifacts.require('UniswapV2Factory');
  const UniswapV2Pair = artifacts.require('UniswapV2Pair');
  const UniswapV2Router01 = artifacts.require('UniswapV2Router01');

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

  // deploying factory using truffle contract to have the correct addresses
  // use hardhat's artifacts later on for interaction
  const _factory = await uniswapContract('UniswapV2Factory').new(
    uniswapOwner,
    { from: uniswapDeployer },
  );

  // check that we landed at the correct address
  assert.strictEqual(_factory.address, UNISWAP_FACTORY);

  /** @var {UniswapV2FactoryInstance} factory */
  const factory = await UniswapV2Factory.at(_factory.address);
  const router = await UniswapV2Router01.new(factory.address, weth.address);
  const oracle = await TwapOracle.new(factory.address);

  await factory.createPair(weth.address, tokenA.address);
  await factory.createPair(weth.address, tokenB.address);

  const wethAPairAddress = await oracle.pairFor(weth.address, tokenA.address);
  const wethBPairAddress = await oracle.pairFor(weth.address, tokenB.address);

  const wethAPair = await UniswapV2Pair.at(wethAPairAddress);
  const wethBPair = await UniswapV2Pair.at(wethBPairAddress);

  /* deploy our contracts */

  const main = { factory, router, oracle };
  const tokens = { weth, tokenA, tokenB };
  const pairs = { wethAPair, wethBPair };

  Object.assign(instances, { ...main, ...tokens, ...pairs });
}

/**
 * @typedef {object} TwapOracleContracts
 * @property {UniswapV2FactoryInstance} factory
 * @property {TwapOracleInstance} oracle
 * @property {UniswapV2Router01Instance} router
 * @property {ERC20MockInstance} tokenA
 * @property {ERC20MockInstance} tokenB
 * @property {Weth9Instance} weth
 * @property {UniswapV2PairInstance} wethAPair
 * @property {UniswapV2PairInstance} wethBPair
 */

module.exports = setup;

/** @returns {TwapOracleContracts} */
module.exports.contracts = () => instances;
