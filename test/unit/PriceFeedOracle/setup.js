const { ethers } = require('hardhat');

// will be assigned by setup()
const contracts = {};

async function setup() {
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
  const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');

  // Deploy ERC20 test tokens
  const dai = await ERC20Mock.deploy();
  const wbtc = await ERC20Mock.deploy();

  // Deploy price aggregators
  const daiAggregator = await ChainlinkAggregatorMock.deploy();
  const wbtcAggregator = await ChainlinkAggregatorMock.deploy();

  // Deploy PriceFeedOracle
  const priceFeedOracle = await PriceFeedOracle.deploy(
    [dai.address, wbtc.address],
    [daiAggregator.address, wbtcAggregator.address],
    [18, 8],
  );

  Object.assign(contracts, {
    dai,
    wbtc,
    daiAggregator,
    wbtcAggregator,
    priceFeedOracle,
  });
}

module.exports = setup;
module.exports.contracts = contracts;
