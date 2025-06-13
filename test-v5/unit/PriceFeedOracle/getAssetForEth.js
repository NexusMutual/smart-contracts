const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { ETH } = require('../utils').constants.Assets;

const { parseEther, parseUnits } = ethers.utils;

describe('getAssetForEth', function () {
  it('returns ethIn if asset is ETH', async function () {
    const fixture = await loadFixture(setup);
    const { priceFeedOracle } = fixture;
    const ethAmount = await priceFeedOracle.getAssetForEth(ETH, 1234);
    expect(ethAmount).to.eq(1234);
  });

  it('uses chainlink aggregators and decimals setup to determine asset amount', async function () {
    const fixture = await loadFixture(setup);
    const { daiAggregator, wbtcAggregator, wbtc, dai, priceFeedOracle } = fixture;
    await daiAggregator.setLatestAnswer(0.0002 * 1e18); // 1 dai = 0.0002 eth, 1 eth = 5000 dai
    await wbtcAggregator.setLatestAnswer(parseEther('16')); // 1 wbtc = 16 eth; 1 eth = 0,0625 wbtc

    const twoEthInWBTC = await priceFeedOracle.getAssetForEth(wbtc.address, parseEther('2'));
    expect(twoEthInWBTC).to.eq(0.125 * 10 ** 8); // 0.125 WBTC with decimals

    const twoEthInDAI = await priceFeedOracle.getAssetForEth(dai.address, parseEther('2'));
    expect(twoEthInDAI).to.eq(parseEther('10000'));
  });

  it('returns correct amount for cbBTC (USD-based oracle) for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { cbBTC, cbBTCAggregator, ethAggregator, priceFeedOracle } = fixture;
    const USD_DECIMALS = 8;
    const CBBTC_DECIMALS = 8;

    const ethAmount = parseEther('2');
    const ethUsdRate = parseUnits('2500', USD_DECIMALS); // 1 ETH = 2500 USD
    const cbBTCUsdRate = parseUnits('65000', USD_DECIMALS); // 1 cbBTC = 65000 USD

    // Set the aggregator rates
    await cbBTCAggregator.setLatestAnswer(cbBTCUsdRate);
    await ethAggregator.setLatestAnswer(ethUsdRate);

    const cbBTCAmount = await priceFeedOracle.getAssetForEth(cbBTC.address, ethAmount);

    const oneETH = parseEther('1');
    const oneCBBTC = parseUnits('1', CBBTC_DECIMALS);

    const totalUSD = ethAmount.mul(ethUsdRate).div(oneETH); // 2 ETH * (2500 USD/ETH)
    const expectedAmountcbBTC = totalUSD.mul(oneCBBTC).div(cbBTCUsdRate); // 5000 USD / (65000 USD/cbBTC)
    expect(cbBTCAmount).to.eq(expectedAmountcbBTC);
  });
});
