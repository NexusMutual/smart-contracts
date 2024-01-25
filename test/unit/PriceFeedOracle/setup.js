const { ethers } = require('hardhat');

async function setup() {
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
  const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');

  // Deploy ERC20 test tokens
  const dai = await ERC20Mock.deploy();
  const wbtc = await ERC20Mock.deploy();
  const st = await ERC20Mock.deploy();

  // Deploy price aggregators
  const daiAggregator = await ChainlinkAggregatorMock.deploy();
  const wbtcAggregator = await ChainlinkAggregatorMock.deploy();

  // Deploy PriceFeedOracle
  const priceFeedOracle = await PriceFeedOracle.deploy(
    [dai.address, wbtc.address],
    [daiAggregator.address, wbtcAggregator.address],
    [18, 8],
    st.address,
  );

  return {
    dai,
    st,
    wbtc,
    daiAggregator,
    wbtcAggregator,
    priceFeedOracle,
  };
}

module.exports = setup;
