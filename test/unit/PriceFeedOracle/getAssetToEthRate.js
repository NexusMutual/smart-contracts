const { expect } = require('chai');
const {
  Assets: { ETH },
} = require('../../../lib/constants');
const {
  ethers: {
    utils: { parseEther },
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
});
