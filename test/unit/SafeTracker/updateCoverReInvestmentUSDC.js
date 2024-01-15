const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { parseEther } = require('ethers/lib/utils');

describe('updateCoverReInvestmentUSDC', function () {
  it('should update CoverRe investment USDC', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const { defaultSender } = fixture.accounts;
    const investedAmount = parseEther('1000');

    const coverReInvestmentUSDCBefore = await safeTracker.coverReInvestmentUSDC();
    await safeTracker.connect(defaultSender).updateCoverReInvestmentUSDC(investedAmount);
    const coverReInvestmentUSDCAfter = await safeTracker.coverReInvestmentUSDC();

    expect(coverReInvestmentUSDCBefore).to.be.equal(0);
    expect(coverReInvestmentUSDCAfter).to.be.equal(coverReInvestmentUSDCBefore.add(investedAmount));
  });

  it('should revert if caller is not the safe', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;
    const investedAmount = parseEther('1000');

    await expect(safeTracker.connect(member).updateCoverReInvestmentUSDC(investedAmount)).to.be.revertedWith(
      'SafeTracker: not safe',
    );
  });
});
