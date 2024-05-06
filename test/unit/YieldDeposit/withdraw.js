const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

async function withdrawSetup() {
  const fixture = await loadFixture(setup);
  const { yieldDeposit, weEth } = fixture.contracts;
  const [member] = fixture.accounts.members;

  const depositAmount = ethers.utils.parseEther('10');
  await weEth.connect(member).approve(yieldDeposit.address, depositAmount);
  await yieldDeposit.connect(member).deposit(depositAmount);

  return {
    ...fixture,
    depositAmount,
  };
}

describe('YieldDeposit - withdraw', function () {
  it('should revert with InsufficientDepositForWithdrawal if user has no deposits', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await expect(yieldDeposit.connect(member).withdraw()).to.revertedWithCustomError(
      yieldDeposit,
      'InsufficientDepositForWithdrawal',
    );
  });

  it('should withdraw only the principal deposit from contract', async function () {
    const fixture = await loadFixture(withdrawSetup);
    const { yieldDeposit, weEth } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const { depositAmount } = fixture;

    // user bal After
    const userWeEthBalanceBefore = await weEth.balanceOf(member.address);
    const contractTotalPrincipalBefore = await yieldDeposit.totalPrincipal();
    const userDepositBefore = await yieldDeposit.deposits(member.address);
    const userCoverAmountBefore = await yieldDeposit.coverAmounts(member.address);
    expect(contractTotalPrincipalBefore).to.be.equal(depositAmount);
    expect(userDepositBefore).to.be.equal(depositAmount);
    expect(userCoverAmountBefore).to.be.equal('518700000000000000');

    await yieldDeposit.connect(member).withdraw();

    const userWeEthBalanceAfter = await weEth.balanceOf(member.address);
    const contractTotalPrincipalAfter = await yieldDeposit.totalPrincipal();
    const userDepositAfter = await yieldDeposit.deposits(member.address);
    const userCoverAmountAfter = await yieldDeposit.coverAmounts(member.address);
    const userInitialRates = await yieldDeposit.initialRates(member.address);
    expect(userWeEthBalanceAfter).to.be.equal(userWeEthBalanceBefore.add(depositAmount));
    expect(contractTotalPrincipalAfter).to.be.equal('0');
    expect(userDepositAfter).to.be.equal('0');
    expect(userCoverAmountAfter).to.be.equal('0');
    expect(userInitialRates).to.be.equal('0');
  });

  it('should emit TokenWithdrawn on successful withdraw', async function () {
    const fixture = await loadFixture(withdrawSetup);
    const { yieldDeposit } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const { depositAmount } = fixture;

    await expect(yieldDeposit.connect(member).withdraw())
      .to.emit(yieldDeposit, 'TokenWithdrawn')
      .withArgs(member.address, depositAmount);
  });
});
