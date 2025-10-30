const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { parseUnits } = ethers.utils;

describe('updateCoverReInvestmentUSDC', function () {
  it('should update CoverRe investment USDC', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const { defaultSender } = fixture.accounts;
    const investedAmount = parseUnits('15000000', 6);

    const coverReInvestmentUSDCBefore = await safeTracker.coverReInvestmentUSDC();
    await safeTracker.connect(defaultSender).updateCoverReInvestmentUSDC(investedAmount);
    const coverReInvestmentUSDCAfter = await safeTracker.coverReInvestmentUSDC();

    expect(coverReInvestmentUSDCBefore).to.be.equal(0);
    expect(coverReInvestmentUSDCAfter).to.be.equal(coverReInvestmentUSDCBefore.add(investedAmount));
  });

  it('should emit event CoverReInvestmentUSDCUpdated', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const { defaultSender } = fixture.accounts;
    const investedAmount = parseUnits('15000000', 6);

    await expect(safeTracker.connect(defaultSender).updateCoverReInvestmentUSDC(investedAmount))
      .to.emit(safeTracker, 'CoverReInvestmentUSDCUpdated')
      .withArgs(investedAmount);
  });

  it('should revert if caller is not the safe', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;
    const investedAmount = parseUnits('15000000', 6);

    await expect(safeTracker.connect(member).updateCoverReInvestmentUSDC(investedAmount)).to.be.revertedWithCustomError(
      safeTracker,
      'OnlySafe',
    );
  });

  it('should revert if the investment is over limit', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const { defaultSender } = fixture.accounts;
    const investedAmount = parseUnits('26000000', 6);

    await expect(
      safeTracker.connect(defaultSender).updateCoverReInvestmentUSDC(investedAmount),
    ).to.be.revertedWithCustomError(safeTracker, 'InvestmentSurpassesLimit');
  });
});
