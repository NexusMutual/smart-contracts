const { accounts, artifacts, web3 } = require('hardhat');

const { impersonateAccount } = require('./evm');
const { ether } = require('@openzeppelin/test-helpers');

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
  const uniswapFactoryCode = await web3.eth.getCode(UNISWAP_FACTORY);
  if (uniswapFactoryCode !== '0x') {
    // Already deployed
    return instances;
  }
  const [owner] = accounts;
  const uniswapDeployer = '0x9c33eacc2f50e39940d3afaf2c7b8246b681a374';
  const uniswapOwner = '0xc0a4272bb5df52134178df25d77561cfb17ce407';

  /* load artifacts */

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
  const TruffleUniswapV2Router = uniswapContract(
    'UniswapV2Router02',
    'periphery',
  );

  // 1. deploy factory
  const _factory = await TruffleUniswapV2Factory.new(uniswapOwner, {
    from: uniswapDeployer,
  });

  // 2. consume 2 nonces
  await web3.eth.sendTransaction({
    from: uniswapDeployer,
    to: ZERO_ADDRESS,
    gas: 21000,
  });
  await web3.eth.sendTransaction({
    from: uniswapDeployer,
    to: ZERO_ADDRESS,
    gas: 21000,
  });

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

  const wethAPairAddress = await twapOracle.pairFor(
    weth.address,
    tokenA.address,
  );
  const wethBPairAddress = await twapOracle.pairFor(
    weth.address,
    tokenB.address,
  );

  const wethAPair = await UniswapV2Pair.at(wethAPairAddress);
  const wethBPair = await UniswapV2Pair.at(wethBPairAddress);

  const main = {
    factory,
    router,
    oracle: twapOracle,
  };
  const tokens = { weth, tokenA, tokenB };
  const pairs = { wethAPair, wethBPair };

  return Object.assign(instances, { ...main, ...tokens, ...pairs });
}

/**
 * @typedef {object} UniswapContracts
 * @property {UniswapV2FactoryInstance} factory
 * @property {UniswapV2Router02Instance} router
 * @property {ERC20MockInstance} tokenA
 * @property {ERC20MockInstance} tokenB
 * @property {WETH9Instance} weth
 * @property {UniswapV2PairInstance} wethAPair
 * @property {UniswapV2PairInstance} wethBPair
 */

module.exports = setup;

/** @returns {UniswapContracts} */
module.exports.contracts = () => instances;
