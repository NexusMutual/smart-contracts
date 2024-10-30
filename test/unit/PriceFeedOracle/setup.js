const { ethers } = require('hardhat');

const { AggregatorType, Assets } = require('../utils').constants;

async function setup() {
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
  const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');

  // Deploy ERC20 test tokens
  const dai = await ERC20Mock.deploy();
  const wbtc = await ERC20Mock.deploy();
  const cbBTC = await ERC20Mock.deploy();
  const st = await ERC20Mock.deploy();

  // Deploy price aggregators
  const daiAggregator = await ChainlinkAggregatorMock.deploy();
  const wbtcAggregator = await ChainlinkAggregatorMock.deploy();
  const cbBTCAggregator = await ChainlinkAggregatorMock.deploy();
  const ethAggregator = await ChainlinkAggregatorMock.deploy();

  // Deploy PriceFeedOracle
  const priceFeedOracle = await PriceFeedOracle.deploy(
    [dai.address, wbtc.address, cbBTC.address, Assets.ETH], // assetAddresses
    [daiAggregator.address, wbtcAggregator.address, cbBTCAggregator.address, ethAggregator.address], // assetAggregators
    [AggregatorType.ETH, AggregatorType.ETH, AggregatorType.USD, AggregatorType.USD], // aggregatorTypes
    [18, 8, 8, 18], // assetDecimals
    st.address,
  );

  return {
    dai,
    st,
    wbtc,
    cbBTC,
    daiAggregator,
    wbtcAggregator,
    cbBTCAggregator,
    ethAggregator,
    priceFeedOracle,
  };
}

module.exports = setup;
