const { expect } = require('chai');
const { contracts } = require('./setup');
const { Assets: { ETH } } = require('../../../lib/constants');
const { ethers: { utils: { parseEther } }, ethers } = require('hardhat');

describe('getAssetToEthRate', function () {
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
    await expect(priceFeedOracle.getAssetToEthRate(newToken.address))
      .to.be.revertedWith('PriceFeedOracle: Unknown asset');
  });

  it('returns 1 ether if asset is ETH', async function () {
    const ethRate = await priceFeedOracle.getAssetToEthRate(ETH);
    expect(ethRate).to.eq(parseEther('1'));
  });

  it('returns latestAnswer from chainlink aggregator', async function () {
    await daiAggregator.setLatestAnswer(1111);
    await wbtcAggregator.setLatestAnswer(2222);

    expect(await priceFeedOracle.getAssetToEthRate(dai.address)).to.eq(1111);
    expect(await priceFeedOracle.getAssetToEthRate(wbtc.address)).to.eq(2222);
  });
});
