const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { ethers } = require('hardhat');

describe('totalSupply', function () {
  it('should return safe balance', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker, priceFeedOracle } = fixture.contracts;
    const { weth, aweth, usdc, dai, debtUsdc } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    const ethBalance = await ethers.provider.getBalance(defaultSender.address);
    const wethBalance = await weth.balanceOf(defaultSender.address);
    const awethBalance = await aweth.balanceOf(defaultSender.address);
    const daiBalance = await dai.balanceOf(defaultSender.address);
    const daiBalanceInEth = await priceFeedOracle.getEthForAsset(dai.address, daiBalance);
    const usdcBalance = await usdc.balanceOf(defaultSender.address);
    const usdcBalanceInEth = await priceFeedOracle.getEthForAsset(usdc.address, usdcBalance);
    const debtUsdcAmount = await debtUsdc.balanceOf(defaultSender.address);
    const debtUsdcValueInEth = await priceFeedOracle.getEthForAsset(usdc.address, debtUsdcAmount);

    const expectedBalance = ethBalance
      .add(wethBalance)
      .add(awethBalance)
      .add(daiBalanceInEth)
      .add(usdcBalanceInEth)
      .sub(debtUsdcValueInEth);

    const totalSupply = await safeTracker.totalSupply();
    expect(totalSupply).to.be.equal(expectedBalance); // add calculation
  });
});
