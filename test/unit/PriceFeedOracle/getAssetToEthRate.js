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

describe('getAssetToEthRate', function () {
  it('reverts if the asset is unknown', async function () {
    const fixture = await loadFixture(setup);
    const { priceFeedOracle } = fixture;
    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const newToken = await ERC20Mock.deploy();
    await expect(priceFeedOracle.getAssetToEthRate(newToken.address)).to.be.revertedWith(
      'PriceFeedOracle: Unknown asset',
    );
  });

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

    // Set cbBTC/USD rate to 65000
    await cbBTCAggregator.setLatestAnswer(parseUnits('65000', 8)); // Assuming 8 decimals for USD price feeds

    // Set ETH/USD rate to 2500
    await ethAggregator.setLatestAnswer(parseUnits('2500', 8)); // Assuming 8 decimals for USD price feeds

    const cbBTCEthRate = await priceFeedOracle.getAssetToEthRate(cbBTC.address);

    // Expected rate: (cbBTC/USD) / (ETH/USD) * 1e18
    // (65000 / 2500) * 1e18 = 26e18
    const expectedRate = parseEther('26');

    expect(cbBTCEthRate).to.eq(expectedRate);
  });
});
