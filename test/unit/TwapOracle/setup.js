const { artifacts } = require('hardhat');

const TwapOracle = artifacts.require('TwapOracle');

// will be assigned by setup()
let contracts;

async function setup () {

  // needs actual uniswap factory address
  const factoryAddress = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
  const oracle = await TwapOracle.new(factoryAddress);

  contracts = {
    oracle,
  };
}

module.exports = setup;

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
 *
 * @returns {TwapOracleContracts}
 */
module.exports.contracts = () => contracts;
