const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { ETH } = require('../utils').constants.Assets;

const { parseEther, parseUnits } = ethers.utils;

describe('getEthForAsset', function () {
  it('returns asset amount if asset is ETH', async function () {
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

    const twoWBTCinEth = await priceFeedOracle.getEthForAsset(wbtc.address, 2e8); // 2e8 = 2 WBTC
    expect(twoWBTCinEth).to.eq(parseEther('32'));

    const twoDAIinEth = await priceFeedOracle.getEthForAsset(dai.address, parseEther('2')); // 2e18 = 2 DAI
    expect(twoDAIinEth).to.eq(parseEther('0.0004'));
  });

  it('returns correct amount of ETH for cbBTC (USD-based oracle)', async function () {
    const fixture = await loadFixture(setup);
    const { cbBTC, cbBTCAggregator, ethAggregator, priceFeedOracle } = fixture;
    const USD_DECIMALS = 8;
    const CBBTC_DECIMALS = 8;

    const cbBTCAmount = parseUnits('2', CBBTC_DECIMALS); // 2 cbBTC
    const ethUsdRate = parseUnits('2500', USD_DECIMALS); // 1 ETH = 2500 USD
    const cbBTCUsdRate = parseUnits('65000', USD_DECIMALS); // 1 cbBTC = 65000 USD

    // Set the aggregator rates
    await ethAggregator.setLatestAnswer(ethUsdRate);
    await cbBTCAggregator.setLatestAnswer(cbBTCUsdRate);

    const ethAmount = await priceFeedOracle.getEthForAsset(cbBTC.address, cbBTCAmount);

    // Calculate expected amount dynamically
    const oneCBBTC = parseUnits('1', CBBTC_DECIMALS);
    const oneETH = parseEther('1');

    const totalUSD = cbBTCAmount.mul(cbBTCUsdRate).div(oneCBBTC); // 2 cbBTC * 65000 USD
    const expectedAmountETH = totalUSD.mul(oneETH).div(ethUsdRate); // 130000 USD / (5000 USD/ETH)
    expect(ethAmount).to.eq(expectedAmountETH);
  });
});
