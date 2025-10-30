const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { ETH } = require('../utils').constants.Assets;

const { parseEther, parseUnits } = ethers.utils;

describe('getAssetToEthRate', function () {
  it('returns 1 ether if asset is ETH', async function () {
    const fixture = await loadFixture(setup);
    const { priceFeedOracle } = fixture;
    const ethRate = await priceFeedOracle.getAssetToEthRate(ETH);
    expect(ethRate).to.eq(parseEther('1'));
  });

  it('returns latestAnswer from chainlink aggregator', async function () {
    const fixture = await loadFixture(setup);
    const { dai, wbtc, daiAggregator, wbtcAggregator, priceFeedOracle } = fixture;
    await daiAggregator.setLatestAnswer(1111);
    await wbtcAggregator.setLatestAnswer(2222);

    expect(await priceFeedOracle.getAssetToEthRate(dai.address)).to.eq(1111);
    expect(await priceFeedOracle.getAssetToEthRate(wbtc.address)).to.eq(2222);
  });

  it('returns correct ETH rate for cbBTC asset', async function () {
    const fixture = await loadFixture(setup);
    const { cbBTC, cbBTCAggregator, ethAggregator, priceFeedOracle } = fixture;
    const USD_DECIMALS = 8;

    const ethUsdRate = parseUnits('2500', USD_DECIMALS); // 1 ETH = 2500 USD
    const cbBTCUsdRate = parseUnits('65000', USD_DECIMALS); // 1 cbBTC = 65000 USD

    // Set the aggregator rates
    await cbBTCAggregator.setLatestAnswer(cbBTCUsdRate);
    await ethAggregator.setLatestAnswer(ethUsdRate);

    const cbBTCEthRate = await priceFeedOracle.getAssetToEthRate(cbBTC.address);

    const oneETH = parseEther('1');
    const expectedRate = cbBTCUsdRate.mul(oneETH).div(ethUsdRate);
    expect(cbBTCEthRate).to.eq(expectedRate);
  });
});
