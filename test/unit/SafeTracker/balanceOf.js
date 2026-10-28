const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { parseUnits } = ethers;

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

describe('balanceOf', function () {
  it('should return safe balance', async function () {
    const fixture = await loadFixture(setup);
    const { pool, safeTracker } = fixture.contracts;

    const expectedBalance = await getBaseBalance(fixture);

    const balance = await safeTracker.balanceOf(pool.target);
    expect(balance).to.be.equal(expectedBalance);
  });

  it('should return 0 balance if account is not pool', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const balance = await safeTracker.balanceOf(member.address);
    expect(balance).to.be.equal(0);
  });

  it('should include the offchain investment', async function () {
    const fixture = await loadFixture(setup);
    const { pool, safeTracker, priceFeedOracle } = fixture.contracts;
    const { usdc } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    const investedAmount = parseUnits('1000000', 6);
    await safeTracker.connect(defaultSender).updateOffchainInvestmentUSDC(investedAmount);

    const investedInEth = await priceFeedOracle.getEthForAsset(usdc.target, investedAmount);
    expect(investedInEth).to.be.gt(0);

    // getBaseBalance reads offchainInvestmentUSDC from the contract
    const expectedBalance = await getBaseBalance(fixture);

    const balance = await safeTracker.balanceOf(pool.target);
    expect(balance).to.be.equal(expectedBalance);
  });

  it('should not deduct debt when there is no debtUsdc', async function () {
    const fixture = await loadFixture(setup);
    const { pool, safeTracker } = fixture.contracts;
    const { aweth, debtUsdc } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    await debtUsdc.burn(defaultSender.address, await debtUsdc.balanceOf(defaultSender.address));

    const ethBalance = await ethers.provider.getBalance(defaultSender.address);
    const awethBalance = await aweth.balanceOf(defaultSender.address);

    const balance = await safeTracker.balanceOf(pool.target);
    expect(balance).to.be.equal(ethBalance + awethBalance);
  });

  it('should include weth and usdc once added as tracked assets', async function () {
    const fixture = await loadFixture(setup);
    const { pool, safeTracker, usdcAggregator } = fixture.contracts;
    const { weth, usdc } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    await safeTracker.connect(defaultSender).addAsset(weth, safeTracker);
    await safeTracker.connect(defaultSender).addAsset(usdc, usdcAggregator);

    const wethBalance = await weth.balanceOf(defaultSender.address);
    const usdcBalance = await usdc.balanceOf(defaultSender.address);
    const usdcValueInEth = await safeTracker.getEthForAsset(usdc, usdcBalance);
    expect(wethBalance).to.be.gt(0);
    expect(usdcValueInEth).to.be.gt(0);

    const expectedBalance = (await getBaseBalance(fixture)) + wethBalance + usdcValueInEth;

    const balance = await safeTracker.balanceOf(pool.target);
    expect(balance).to.be.equal(expectedBalance);
  });

  it('should include the ETH value of tracked assets', async function () {
    const fixture = await loadFixture(setup);
    const { pool, safeTracker, trackedAssetAggregator } = fixture.contracts;
    const { trackedAsset } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    await safeTracker.connect(defaultSender).addAsset(trackedAsset, trackedAssetAggregator);

    const trackedAssetBalance = await trackedAsset.balanceOf(defaultSender.address);
    const trackedAssetValueInEth = await safeTracker.getEthForAsset(trackedAsset, trackedAssetBalance);
    expect(trackedAssetValueInEth).to.be.gt(0);

    const expectedBalance = (await getBaseBalance(fixture)) + trackedAssetValueInEth;

    const balance = await safeTracker.balanceOf(pool.target);
    expect(balance).to.be.equal(expectedBalance);
  });

  it('should exclude abandoned tracked assets', async function () {
    const fixture = await loadFixture(setup);
    const { pool, safeTracker, trackedAssetAggregator } = fixture.contracts;
    const { trackedAsset } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    await safeTracker.connect(defaultSender).addAsset(trackedAsset, trackedAssetAggregator);
    await safeTracker.connect(defaultSender).setAssetDetails(0, true);

    const expectedBalance = await getBaseBalance(fixture);

    const balance = await safeTracker.balanceOf(pool.target);
    expect(balance).to.be.equal(expectedBalance);
  });

  it('should treat a reverting balanceOf as zero', async function () {
    const fixture = await loadFixture(setup);
    const { pool, safeTracker, trackedAssetAggregator } = fixture.contracts;
    const { defaultSender } = fixture.accounts;

    // ChainlinkAggregatorMock has decimals() but no balanceOf(), so the balanceOf call reverts
    const notAToken = await ethers.deployContract('ChainlinkAggregatorMock');
    await safeTracker.connect(defaultSender).addAsset(notAToken, trackedAssetAggregator);

    const expectedBalance = await getBaseBalance(fixture);

    const balance = await safeTracker.balanceOf(pool.target);
    expect(balance).to.be.equal(expectedBalance);
  });

  it('should value an asset at zero if its aggregator reverts without affecting other assets', async function () {
    const fixture = await loadFixture(setup);
    const { pool, safeTracker } = fixture.contracts;
    const { weth, trackedAsset } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    // ERC20Mock has decimals() but no latestAnswer(), so the aggregator call reverts
    const revertingAggregator = await ethers.deployContract('ERC20Mock');
    await safeTracker.connect(defaultSender).addAsset(trackedAsset, revertingAggregator);
    await safeTracker.connect(defaultSender).addAsset(weth, safeTracker);

    await expect(safeTracker.getEthForAsset(trackedAsset, 1)).to.be.reverted;

    const wethBalance = await weth.balanceOf(defaultSender.address);
    const expectedBalance = (await getBaseBalance(fixture)) + wethBalance;

    const balance = await safeTracker.balanceOf(pool.target);
    expect(balance).to.be.equal(expectedBalance);
    expect(await safeTracker.totalSupply()).to.be.equal(expectedBalance);
  });

  it('should value an asset at zero if its aggregator returns a zero rate', async function () {
    const fixture = await loadFixture(setup);
    const { pool, safeTracker, trackedAssetAggregator } = fixture.contracts;
    const { weth, trackedAsset } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    await safeTracker.connect(defaultSender).addAsset(trackedAsset, trackedAssetAggregator);
    await safeTracker.connect(defaultSender).addAsset(weth, safeTracker);
    await trackedAssetAggregator.setLatestAnswer(0);

    await expect(safeTracker.getEthForAsset(trackedAsset, 1))
      .to.be.revertedWithCustomError(safeTracker, 'NonPositiveRate')
      .withArgs(trackedAssetAggregator.target, 0);

    const wethBalance = await weth.balanceOf(defaultSender.address);
    const expectedBalance = (await getBaseBalance(fixture)) + wethBalance;

    const balance = await safeTracker.balanceOf(pool.target);
    expect(balance).to.be.equal(expectedBalance);
  });

  it('should value an asset at zero if its aggregator returns a negative rate', async function () {
    const fixture = await loadFixture(setup);
    const { pool, safeTracker, trackedAssetAggregator } = fixture.contracts;
    const { weth, trackedAsset } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    await safeTracker.connect(defaultSender).addAsset(trackedAsset, trackedAssetAggregator);
    await safeTracker.connect(defaultSender).addAsset(weth, safeTracker);
    // the mock stores a uint, MaxUint256 is read as -1 by the int returning SafeAggregator interface
    await trackedAssetAggregator.setLatestAnswer(ethers.MaxUint256);
    await expect(safeTracker.getEthForAsset(trackedAsset, 1))
      .to.be.revertedWithCustomError(safeTracker, 'NonPositiveRate')
      .withArgs(trackedAssetAggregator.target, -1);

    const wethBalance = await weth.balanceOf(defaultSender.address);
    const expectedBalance = (await getBaseBalance(fixture)) + wethBalance;

    const balance = await safeTracker.balanceOf(pool.target);
    expect(balance).to.be.equal(expectedBalance);
  });

  it('should value an asset at zero if its value overflows', async function () {
    const fixture = await loadFixture(setup);
    const { pool, safeTracker, trackedAssetAggregator } = fixture.contracts;
    const { weth, trackedAsset } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    await safeTracker.connect(defaultSender).addAsset(trackedAsset, trackedAssetAggregator);
    await safeTracker.connect(defaultSender).addAsset(weth, safeTracker);
    await trackedAssetAggregator.setLatestAnswer(ethers.MaxInt256);

    const trackedAssetBalance = await trackedAsset.balanceOf(defaultSender.address);
    await expect(safeTracker.getEthForAsset(trackedAsset, trackedAssetBalance)).to.be.revertedWithPanic(0x11);

    const wethBalance = await weth.balanceOf(defaultSender.address);
    const expectedBalance = (await getBaseBalance(fixture)) + wethBalance;

    const balance = await safeTracker.balanceOf(pool.target);
    expect(balance).to.be.equal(expectedBalance);
    expect(await safeTracker.totalSupply()).to.be.equal(expectedBalance);
  });
});
