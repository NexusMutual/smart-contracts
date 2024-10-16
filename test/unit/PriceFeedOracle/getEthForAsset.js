const { expect } = require('chai');
const {
  Assets: { ETH },
} = require('../../../lib/constants');
const {
  ethers: {
    utils: { parseEther, parseUnits },
  },
  ethers,
} = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

describe('getEthForAsset', function () {
  it('reverts if the asset is unknown', async function () {
    const fixture = await loadFixture(setup);
    const { priceFeedOracle } = fixture;
    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const newToken = await ERC20Mock.deploy();
    await expect(priceFeedOracle.getEthForAsset(newToken.address, 1234)).to.be.revertedWith(
      'PriceFeedOracle: Unknown asset',
    );
  });

  it('returns amount if asset is ETH', async function () {
    const fixture = await loadFixture(setup);
    const { priceFeedOracle } = fixture;
    const ethAmount = await priceFeedOracle.getEthForAsset(ETH, 1234);
    expect(ethAmount).to.eq(1234);
  });

  it('uses chainlink aggregators and decimals setup to determine eth amount', async function () {
    const fixture = await loadFixture(setup);
    const { daiAggregator, wbtcAggregator, wbtc, dai, priceFeedOracle } = fixture;
    await daiAggregator.setLatestAnswer(0.0002 * 1e18); // 1 dai = 0.0002 eth, 1 eth = 5000 dai
    await wbtcAggregator.setLatestAnswer(parseEther('16')); // 1 wbtc = 16 eth; 1 eth = 0,0625 wbtc

    const tenThousandDaiInEth = await priceFeedOracle.getEthForAsset(dai.address, parseEther('10000'));
    expect(tenThousandDaiInEth).to.eq(parseEther('2'));

    const oneWBTCInEth = await priceFeedOracle.getEthForAsset(wbtc.address, 1e8);
    expect(oneWBTCInEth).to.eq(parseEther('16'));
  });

  // New test case for cbBTC
  it('returns correct amount of ETH for cbBTC (USD-based asset)', async function () {
    const fixture = await loadFixture(setup);
    const { cbBTC, cbBTCAggregator, ethAggregator, priceFeedOracle } = fixture;

    // Set cbBTC/USD rate to 65000
    await cbBTCAggregator.setLatestAnswer(parseUnits('65000', 8)); // Assuming 8 decimals for USD price feeds

    // Set ETH/USD rate to 2500
    await ethAggregator.setLatestAnswer(parseUnits('2500', 8)); // Assuming 8 decimals for USD price feeds

    const cbBTCAmount = parseUnits('2', 8); // 2 cbBTC

    const ethAmount = await priceFeedOracle.getEthForAsset(cbBTC.address, cbBTCAmount);

    // Expected calculation:
    // 2 cbBTC * (65000 USD/cbBTC) = 130000 USD
    // 130000 USD / (2500 USD/ETH) = 52 ETH
    const expectedAmount = parseEther('52');

    expect(ethAmount).to.eq(expectedAmount);
  });
});
