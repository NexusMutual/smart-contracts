const { expect } = require('chai');
const { contracts } = require('./setup');
const {
  Assets: { ETH },
} = require('../../../lib/constants');
const {
  ethers: {
    utils: { parseEther },
  },
  ethers,
} = require('hardhat');

describe('getAssetForEth', function () {
  let dai, wbtc, daiAggregator, wbtcAggregator, priceFeedOracle;

  beforeEach(async () => {
    dai = contracts.dai;
    wbtc = contracts.wbtc;
    wbtcAggregator = contracts.wbtcAggregator;
    daiAggregator = contracts.daiAggregator;
    priceFeedOracle = contracts.priceFeedOracle;
  });

  it('reverts if the asset is unknown', async function () {
    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const newToken = await ERC20Mock.deploy();
    await expect(priceFeedOracle.getAssetForEth(newToken.address, 1234)).to.be.revertedWith(
      'PriceFeedOracle: Unknown asset',
    );
  });

  it('returns ethIn if asset is ETH', async function () {
    const ethAmount = await priceFeedOracle.getAssetForEth(ETH, 1234);
    expect(ethAmount).to.eq(1234);
  });

  it('uses chainlink aggregators and decimals setup to determine asset amount', async function () {
    await daiAggregator.setLatestAnswer(0.0002 * 1e18); // 1 dai = 0.0002 eth, 1 eth = 5000 dai
    await wbtcAggregator.setLatestAnswer(parseEther('16')); // 1 wbtc = 16 eth; 1 eth = 0,0625 wbtc

    const twoEthInWBTC = await priceFeedOracle.getAssetForEth(wbtc.address, parseEther('2'));
    expect(twoEthInWBTC).to.eq(0.125 * 10 ** 8); // 0.125 WBTC with decimals

    const twoEthInDAI = await priceFeedOracle.getAssetForEth(dai.address, parseEther('2'));
    expect(twoEthInDAI).to.eq(parseEther('10000'));
  });
});
