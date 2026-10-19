const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');

const { setup } = require('./setup');

// eth + offchain investment + aave position (aweth collateral - debt usdc)
async function getBaseBalance(fixture) {
  const { safeTracker, priceFeedOracle } = fixture.contracts;
  const { aweth, usdc, debtUsdc } = fixture.tokens;
  const { defaultSender } = fixture.accounts;

  const ethBalance = await ethers.provider.getBalance(defaultSender.address);
  const awethBalance = await aweth.balanceOf(defaultSender.address);
  const offchainInvestmentUSDC = await safeTracker.offchainInvestmentUSDC();
  const offchainInvestmentInEth = await priceFeedOracle.getEthForAsset(usdc.target, offchainInvestmentUSDC);
  const debtUsdcAmount = await debtUsdc.balanceOf(defaultSender.address);
  const debtUsdcValueInEth = await priceFeedOracle.getEthForAsset(usdc.target, debtUsdcAmount);

  return ethBalance + awethBalance + offchainInvestmentInEth - debtUsdcValueInEth;
}

describe('totalSupply', function () {
  it('should return safe balance', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;

    const expectedBalance = await getBaseBalance(fixture);

    const totalSupply = await safeTracker.totalSupply();
    expect(totalSupply).to.be.equal(expectedBalance);
  });

  it('should include the ETH value of tracked assets', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker, trackedAssetAggregator, usdcAggregator } = fixture.contracts;
    const { trackedAsset, weth, usdc } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    await safeTracker.connect(defaultSender).addAsset(weth, safeTracker);
    await safeTracker.connect(defaultSender).addAsset(usdc, usdcAggregator);
    await safeTracker.connect(defaultSender).addAsset(trackedAsset, trackedAssetAggregator);

    const wethBalance = await weth.balanceOf(defaultSender.address);
    const usdcValueInEth = await safeTracker.getEthForAsset(usdc, await usdc.balanceOf(defaultSender.address));
    const trackedAssetBalance = await trackedAsset.balanceOf(defaultSender.address);
    const trackedAssetValueInEth = await safeTracker.getEthForAsset(trackedAsset, trackedAssetBalance);

    const expectedBalance = (await getBaseBalance(fixture)) + wethBalance + usdcValueInEth + trackedAssetValueInEth;

    const totalSupply = await safeTracker.totalSupply();
    expect(totalSupply).to.be.equal(expectedBalance);
  });
});
