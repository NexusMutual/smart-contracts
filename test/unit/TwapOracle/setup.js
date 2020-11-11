const { accounts, artifacts, web3 } = require('hardhat');

const { impersonateAccount } = require('../utils').hardhat;
const { ether } = require('../utils').helpers;

const uniswapContract = contractName => {
  const TruffleContract = require('@truffle/contract');
  const jsonPath = `@uniswap/v2-core/build/${contractName}.json`;
  const contract = TruffleContract(require(jsonPath));
  contract.setProvider(web3.currentProvider);
  return contract;
};

const [owner] = accounts;
const uniswapDeployer = '0x9c33eacc2f50e39940d3afaf2c7b8246b681a374';
const uniswapOwner = '0xc0a4272bb5df52134178df25d77561cfb17ce407';

const ERC20Mock = artifacts.require('ERC20Mock');
const WETH9 = artifacts.require('WETH9');
const TwapOracle = artifacts.require('TwapOracle');

const UniswapV2Factory = artifacts.require('UniswapV2Factory');
const UniswapV2Pair = artifacts.require('UniswapV2Pair');
const UniswapV2Router01 = artifacts.require('UniswapV2Router01');

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

// will be assigned by setup()
let contracts;

async function setup () {

  await impersonateAccount(uniswapDeployer);
  await web3.eth.sendTransaction({
    from: owner,
    to: uniswapDeployer,
    value: ether('1'),
  });

  const weth = await WETH9.new();
  const tokenA = await ERC20Mock.new();
  const tokenB = await ERC20Mock.new();

  // deploying factory using truffle contract to have the correct addresses
  // use hardhat's artifacts later on for interaction
  const _factory = await uniswapContract('UniswapV2Factory').new(uniswapOwner, { from: uniswapDeployer });

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

  contracts = {
    factory,
    oracle,
    router,
    tokenA,
    tokenB,
    weth,
    wethAPair,
    wethBPair,
  };
}

module.exports = setup;

/** @returns {TwapOracleContracts} */
module.exports.contracts = () => contracts;
