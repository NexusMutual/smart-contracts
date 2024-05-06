const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

describe('YieldDeposit - deposit', function () {
  it('should not be able to deposit if user has already existing deposit', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit, weEth, chainLinkPriceFeed } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const depositAmount = ethers.utils.parseEther('10');
    await weEth.connect(member).approve(yieldDeposit.address, depositAmount);
    await yieldDeposit.connect(member).deposit(depositAmount);

    const priceRate = await chainLinkPriceFeed.latestAnswer();
    expect(await yieldDeposit.totalPrincipal()).to.be.equal(depositAmount);
    expect(await yieldDeposit.deposits(member.address)).to.be.equal(depositAmount);
    expect(await yieldDeposit.coverAmounts(member.address)).to.be.equal('518700000000000000');
    expect(await yieldDeposit.initialRates(member.address)).to.be.equal(priceRate);

    await weEth.connect(member).approve(yieldDeposit.address, depositAmount);
    const depositError = yieldDeposit.connect(member).deposit(depositAmount);
    await expect(depositError).to.revertedWithCustomError(yieldDeposit, 'WithdrawBeforeMakingNewDeposit');

    expect(await yieldDeposit.totalPrincipal()).to.be.equal(depositAmount);
    expect(await yieldDeposit.deposits(member.address)).to.be.equal(depositAmount);
    expect(await yieldDeposit.coverAmounts(member.address)).to.be.equal('518700000000000000');
    expect(await yieldDeposit.initialRates(member.address)).to.be.equal(priceRate);
  });

  it('should revert InvalidDepositAmount if deposit amount is less than or equal to zero', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const depositError = yieldDeposit.connect(member).deposit('0');
    await expect(depositError).to.revertedWithCustomError(yieldDeposit, 'InvalidDepositAmount');

    expect(await yieldDeposit.totalPrincipal()).to.be.equal('0');
    expect(await yieldDeposit.deposits(member.address)).to.be.equal('0');
    expect(await yieldDeposit.coverAmounts(member.address)).to.be.equal('0');
    expect(await yieldDeposit.initialRates(member.address)).to.be.equal('0');
  });

  it('should deposit token to contract', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit, weEth, chainLinkPriceFeed } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const userWeEthBalanceBefore = await weEth.balanceOf(member.address);
    const contractWeEthBalanceBefore = await weEth.balanceOf(yieldDeposit.address);
    const contractTotalPrincipalBefore = await yieldDeposit.totalPrincipal();
    const userDepositBefore = await yieldDeposit.deposits(member.address);
    const userCoverAmountBefore = await yieldDeposit.coverAmounts(member.address);
    const userInitialRateBefore = await yieldDeposit.initialRates(member.address);
    expect(contractWeEthBalanceBefore).to.be.equal('0');
    expect(contractTotalPrincipalBefore).to.be.equal('0');
    expect(userDepositBefore).to.be.equal('0');
    expect(userCoverAmountBefore).to.be.equal('0');
    expect(userInitialRateBefore).to.be.equal('0');

    const depositAmount = ethers.utils.parseEther('10');
    await weEth.connect(member).approve(yieldDeposit.address, depositAmount);
    await yieldDeposit.connect(member).deposit(depositAmount);

    const contractWeEthBalanceAfter = await weEth.balanceOf(yieldDeposit.address);
    const contractTotalPrincipalAfter = await yieldDeposit.totalPrincipal();
    const userWeEthBalanceAfter = await weEth.balanceOf(member.address);
    const userDepositAfter = await yieldDeposit.deposits(member.address);
    const userCoverAmountAfter = await yieldDeposit.coverAmounts(member.address);
    const userInitialRateAfter = await yieldDeposit.initialRates(member.address);
    expect(contractTotalPrincipalAfter).to.be.equal(depositAmount);
    expect(contractWeEthBalanceAfter).to.be.equal(depositAmount);
    expect(userWeEthBalanceAfter).to.be.equal(userWeEthBalanceBefore.sub(depositAmount));
    expect(userDepositAfter).to.be.equal(depositAmount);
    expect(userCoverAmountAfter).to.be.equal('518700000000000000');
    expect(userInitialRateAfter).to.be.equal(await chainLinkPriceFeed.latestAnswer());
  });

  it('should emit TokenDeposited on successful deposit', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit, weEth } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const depositAmount = ethers.utils.parseEther('10');
    await weEth.connect(member).approve(yieldDeposit.address, depositAmount);
    await expect(yieldDeposit.connect(member).deposit(depositAmount))
      .to.emit(yieldDeposit, 'TokenDeposited')
      .withArgs(member.address, depositAmount, '518700000000000000');
  });
});
