const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

describe('balanceOf', function () {
  it('should return safe balance', async function () {
    const fixture = await loadFixture(setup);
    const { pool, safeTracker, priceFeedOracle } = fixture.contracts;
    const { weth, aweth, usdc, debtUsdc, dai } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    const ethBalance = await ethers.provider.getBalance(defaultSender.address);
    const wethBalance = await weth.balanceOf(defaultSender.address);
    const awethBalance = await aweth.balanceOf(defaultSender.address);
    const usdcBalance = await usdc.balanceOf(defaultSender.address);
    const daiBalance = await dai.balanceOf(defaultSender.address);

    const daiBalanceInEth = await priceFeedOracle.getEthForAsset(dai.address, daiBalance);
    const usdcBalanceInEth = await priceFeedOracle.getEthForAsset(usdc.address, usdcBalance);
    const debtUsdcAmount = await debtUsdc.balanceOf(defaultSender.address);
    const debtUsdcValueInEth = await priceFeedOracle.getEthForAsset(usdc.address, debtUsdcAmount);

    const expectedBalance = ethBalance
      .add(wethBalance)
      .add(awethBalance)
      .add(usdcBalanceInEth)
      .sub(debtUsdcValueInEth)
      .add(daiBalanceInEth);

    const balance = await safeTracker.balanceOf(pool.address);
    expect(balance).to.be.equal(expectedBalance); // add calculation
  });

  it('should return 0 balance if account is not pool', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const balance = await safeTracker.balanceOf(member.address);
    expect(balance).to.be.equal(0);
  });
});
