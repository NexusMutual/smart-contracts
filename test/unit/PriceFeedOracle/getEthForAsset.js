const { expect } = require('chai');
const { contracts } = require('./setup');
const { Assets: { ETH } } = require('../../../lib/constants');
const { ethers: { utils: { parseEther } }, ethers } = require('hardhat');

describe('getEthForAsset', function () {
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
    await expect(priceFeedOracle.getEthForAsset(newToken.address, 1234))
      .to.be.revertedWith('PriceFeedOracle: Unknown asset');
  });

  it('returns asset amount if asset is ETH', async function () {
    const ethAmount = await priceFeedOracle.getEthForAsset(ETH, 1234);
    expect(ethAmount).to.eq(1234);
  });

  it('uses chainlink aggregators and decimals setup to determine eth amount', async function () {
    await daiAggregator.setLatestAnswer(0.0002 * 1e18); // 1 dai = 0.0002 eth, 1 eth = 5000 dai
    await wbtcAggregator.setLatestAnswer(parseEther('16')); // 1 wbtc = 16 eth; 1 eth = 0,0625 wbtc

    const twoWBTCinEth = await priceFeedOracle.getEthForAsset(wbtc.address, 2e8); // 2e8 = 2 WBTC
    expect(twoWBTCinEth).to.eq(parseEther('32'));

    const twoDAIinEth = await priceFeedOracle.getEthForAsset(dai.address, parseEther('2')); // 2e18 = 2 DAI
    expect(twoDAIinEth).to.eq(parseEther('0.0004'));
  });
});
