const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { parseUnits } = ethers;

describe('updateOffchainInvestmentUSDC', function () {
  it('should update offchain investment USDC', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const { defaultSender } = fixture.accounts;
    const investedAmount = parseUnits('15000000', 6);

    const offchainInvestmentUSDCBefore = await safeTracker.offchainInvestmentUSDC();
    await safeTracker.connect(defaultSender).updateOffchainInvestmentUSDC(investedAmount);
    const offchainInvestmentUSDCAfter = await safeTracker.offchainInvestmentUSDC();

    expect(offchainInvestmentUSDCBefore).to.be.equal(0);
    expect(offchainInvestmentUSDCAfter).to.be.equal(investedAmount);
  });

  it('should emit event OffchainInvestmentUSDCUpdated', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const { defaultSender } = fixture.accounts;
    const investedAmount = parseUnits('15000000', 6);

    await expect(safeTracker.connect(defaultSender).updateOffchainInvestmentUSDC(investedAmount))
      .to.emit(safeTracker, 'OffchainInvestmentUSDCUpdated')
      .withArgs(investedAmount);
  });

  it('should revert if caller is not the safe', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;
    const investedAmount = parseUnits('15000000', 6);

    await expect(
      safeTracker.connect(member).updateOffchainInvestmentUSDC(investedAmount),
    ).to.be.revertedWithCustomError(safeTracker, 'OnlySafe');
  });

  it('should revert if the investment is over limit', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const { defaultSender } = fixture.accounts;
    const investedAmount = parseUnits('26000000', 6);

    await expect(
      safeTracker.connect(defaultSender).updateOffchainInvestmentUSDC(investedAmount),
    ).to.be.revertedWithCustomError(safeTracker, 'InvestmentSurpassesLimit');
  });
});
