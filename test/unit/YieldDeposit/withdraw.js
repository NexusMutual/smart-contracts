const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { increasePriceFeedRate } = require('./helper');
const { setup } = require('./setup');

async function withdrawSetup() {
  const fixture = await loadFixture(setup);
  const { yieldDeposit, weEth } = fixture.contracts;
  const [member] = fixture.accounts.members;

  const depositAmount = ethers.utils.parseEther('10');
  await weEth.connect(member).approve(yieldDeposit.address, depositAmount);
  await yieldDeposit.connect(member).deposit(weEth.address, depositAmount);

  return {
    ...fixture,
    depositAmount,
  };
}

describe('YieldDeposit - withdraw', function () {
  it('should revert with TokenNotSupported if token is not supported', async function () {
    const fixture = await loadFixture(withdrawSetup);
    const { yieldDeposit } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const unsupportedToken = '0x3d08cc653ec3df0c039c3a1da15ed0ceea3b0acc';
    const amount = fixture.depositAmount.add(1);
    const withdrawError = yieldDeposit.connect(member).withdraw(unsupportedToken, amount);
    await expect(withdrawError).to.revertedWithCustomError(yieldDeposit, 'TokenNotSupported');
  });

  it('should revert with InsufficientDepositForWithdrawal if user has no deposits', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit, weEth } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const amount = ethers.utils.parseEther('10');
    const withdrawError = yieldDeposit.connect(member).withdraw(weEth.address, amount);
    await expect(withdrawError).to.revertedWithCustomError(yieldDeposit, 'InsufficientDepositForWithdrawal');
  });

  it('should revert with InvalidWithdrawalAmount for 0 withdrawal amount', async function () {
    const fixture = await loadFixture(withdrawSetup);
    const { yieldDeposit, weEth } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const amount = 0;
    const maxAmount = fixture.depositAmount;

    const withdrawError = yieldDeposit.connect(member).withdraw(weEth.address, amount);
    await expect(withdrawError).to.revertedWithCustomError(yieldDeposit, 'InvalidWithdrawalAmount').withArgs(maxAmount);
  });

  it('should revert with InvalidWithdrawalAmount if amount > max withdrawal amount', async function () {
    const fixture = await loadFixture(withdrawSetup);
    const { yieldDeposit, weEth } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const amount = fixture.depositAmount.add(1);
    const maxAmount = fixture.depositAmount;

    const withdrawError = yieldDeposit.connect(member).withdraw(weEth.address, amount);
    await expect(withdrawError).to.revertedWithCustomError(yieldDeposit, 'InvalidWithdrawalAmount').withArgs(maxAmount);
  });

  it('should withdraw the withdrawal amount specified by the caller', async function () {
    const fixture = await loadFixture(withdrawSetup);
    const { yieldDeposit, weEth, chainLinkPriceFeedWeEth } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const { rateDenominator } = fixture;

    const userBalanceBefore = await weEth.balanceOf(member.address);
    const contractBalanceBefore = await weEth.balanceOf(yieldDeposit.address);
    const totalDepositValueBefore = await yieldDeposit.totalDepositValue(weEth.address);
    const userTokenDepositValueBefore = await yieldDeposit.userTokenDepositValue(member.address, weEth.address);

    const amount = ethers.utils.parseEther('5');
    await yieldDeposit.connect(member).withdraw(weEth.address, amount);

    const priceRate = await chainLinkPriceFeedWeEth.latestAnswer();
    const withdrawalValue = amount.mul(priceRate).div(rateDenominator);
    const userTokenDepositValueAfter = await yieldDeposit.userTokenDepositValue(member.address, weEth.address);

    const totalDepositValueAfter = totalDepositValueBefore.sub(withdrawalValue);
    expect(await weEth.balanceOf(member.address)).to.be.equal(userBalanceBefore.add(amount));
    expect(await weEth.balanceOf(yieldDeposit.address)).to.be.equal(contractBalanceBefore.sub(amount));
    expect(await yieldDeposit.totalDepositValue(weEth.address)).to.be.equal(totalDepositValueAfter);
    expect(userTokenDepositValueAfter).to.be.equal(userTokenDepositValueBefore.sub(withdrawalValue));
  });

  it('should allow multiple withdrawals up to the principal deposit value', async function () {
    const fixture = await loadFixture(withdrawSetup);
    const { yieldDeposit, weEth, chainLinkPriceFeedWeEth } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const { rateDenominator } = fixture;

    const userBalanceBefore = await weEth.balanceOf(member.address);
    const contractBalanceBefore = await weEth.balanceOf(yieldDeposit.address);
    const totalDepositValueBefore = await yieldDeposit.totalDepositValue(weEth.address);
    const userTokenDepositValueBefore = await yieldDeposit.userTokenDepositValue(member.address, weEth.address);

    // simulate price rate increased before first withdrawal
    await increasePriceFeedRate(chainLinkPriceFeedWeEth);
    const amount = ethers.utils.parseEther('5');
    await yieldDeposit.connect(member).withdraw(weEth.address, amount);

    const priceRate1 = await chainLinkPriceFeedWeEth.latestAnswer();
    const withdrawalValue = amount.mul(priceRate1).div(rateDenominator);
    const userTokenDepositValueAfter1 = await yieldDeposit.userTokenDepositValue(member.address, weEth.address);

    expect(await weEth.balanceOf(member.address)).to.be.equal(userBalanceBefore.add(amount));
    expect(await weEth.balanceOf(yieldDeposit.address)).to.be.equal(contractBalanceBefore.sub(amount));
    expect(await yieldDeposit.totalDepositValue(weEth.address)).to.be.equal(
      totalDepositValueBefore.sub(withdrawalValue),
    );
    expect(userTokenDepositValueAfter1).to.be.equal(userTokenDepositValueBefore.sub(withdrawalValue));

    // simulate price rate increased before second withdrawal
    await increasePriceFeedRate(chainLinkPriceFeedWeEth);
    const priceRate2 = await chainLinkPriceFeedWeEth.latestAnswer();
    const maxAmount = userTokenDepositValueAfter1.mul(rateDenominator).div(priceRate2);

    await yieldDeposit.connect(member).withdraw(weEth.address, maxAmount);

    const userTokenDepositValueAfter2 = await yieldDeposit.userTokenDepositValue(member.address, weEth.address);

    expect(await weEth.balanceOf(member.address)).to.be.equal(userBalanceBefore.add(amount).add(maxAmount));
    expect(await weEth.balanceOf(yieldDeposit.address)).to.be.equal(contractBalanceBefore.sub(amount).sub(maxAmount));
    expect(await yieldDeposit.totalDepositValue(weEth.address)).to.be.lessThanOrEqual('1'); // dusts
    expect(userTokenDepositValueAfter2).to.be.lessThanOrEqual('1'); // dusts
  });

  it('should not affect other token deposit amount values when withdrawing a different token', async function () {
    const fixture = await loadFixture(withdrawSetup);
    const { yieldDeposit, weEth, wstEth, chainLinkPriceFeedWeEth } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const { rateDenominator } = fixture;

    // 2nd deposit (wstEth)
    const stEthDepositAmount = ethers.utils.parseEther('10');
    await wstEth.connect(member).approve(yieldDeposit.address, stEthDepositAmount);
    await yieldDeposit.connect(member).deposit(wstEth.address, stEthDepositAmount);

    const totalDepositValueBefore = await yieldDeposit.totalDepositValue(weEth.address);

    // wstEth balances before
    const userWstEthBalanceBefore = await wstEth.balanceOf(member.address);
    const contractWstEthBalanceBefore = await wstEth.balanceOf(yieldDeposit.address);
    const userWstEthDepositValueBefore = await yieldDeposit.userTokenDepositValue(member.address, wstEth.address);

    // weEth balances before
    const userWeEthBalanceBefore = await weEth.balanceOf(member.address);
    const contractWeEthBalanceBefore = await weEth.balanceOf(yieldDeposit.address);
    const userWeEthDepositValueBefore = await yieldDeposit.userTokenDepositValue(member.address, weEth.address);

    const amount = ethers.utils.parseEther('5');
    await yieldDeposit.connect(member).withdraw(weEth.address, amount);

    const priceRate = await chainLinkPriceFeedWeEth.latestAnswer();
    const withdrawalValue = amount.mul(priceRate).div(rateDenominator);

    expect(await yieldDeposit.totalDepositValue(weEth.address)).to.be.equal(
      totalDepositValueBefore.sub(withdrawalValue),
    );

    // weEth
    const userWeEthTokenDepositValueAfter = await yieldDeposit.userTokenDepositValue(member.address, weEth.address);
    expect(userWeEthTokenDepositValueAfter).to.be.equal(userWeEthDepositValueBefore.sub(withdrawalValue));
    expect(await weEth.balanceOf(member.address)).to.be.equal(userWeEthBalanceBefore.add(amount));
    expect(await weEth.balanceOf(yieldDeposit.address)).to.be.equal(contractWeEthBalanceBefore.sub(amount));

    // wstEth should not be affected
    const userWstEthTokenDepositValueAfter = await yieldDeposit.userTokenDepositValue(member.address, wstEth.address);
    expect(userWstEthTokenDepositValueAfter).to.be.equal(userWstEthDepositValueBefore);
    expect(await wstEth.balanceOf(member.address)).to.be.equal(userWstEthBalanceBefore);
    expect(await wstEth.balanceOf(yieldDeposit.address)).to.be.equal(contractWstEthBalanceBefore);
  });

  it('should emit TokenWithdrawn on successful withdraw', async function () {
    const fixture = await loadFixture(withdrawSetup);
    const { yieldDeposit, weEth, chainLinkPriceFeedWeEth } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const { depositAmount } = fixture;

    const priceRate = await chainLinkPriceFeedWeEth.latestAnswer();
    await expect(yieldDeposit.connect(member).withdraw(weEth.address, depositAmount))
      .to.emit(yieldDeposit, 'TokenWithdrawn')
      .withArgs(member.address, depositAmount, priceRate);
  });

  it('should successfully withdraw ALL principal deposit if amount is MAX_UINT256', async function () {
    const fixture = await loadFixture(withdrawSetup);
    const { yieldDeposit, weEth, chainLinkPriceFeedWeEth } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const { rateDenominator } = fixture;

    const userBalanceBefore = await weEth.balanceOf(member.address);
    const contractBalanceBefore = await weEth.balanceOf(yieldDeposit.address);
    // TODO: check
    const totalDepositValueBefore = await yieldDeposit.totalDepositValue(weEth.address);
    const userTokenDepositValueBefore = await yieldDeposit.userTokenDepositValue(member.address, weEth.address);

    // simulate price feed increase before withdraw MAX_UINT256
    await increasePriceFeedRate(chainLinkPriceFeedWeEth);
    await yieldDeposit.connect(member).withdraw(weEth.address, ethers.constants.MaxUint256);

    const priceRate = await chainLinkPriceFeedWeEth.latestAnswer();
    const maxWithdrawalValue = userTokenDepositValueBefore;
    const maxWithdrawalAmount = maxWithdrawalValue.mul(rateDenominator).div(priceRate);

    const userTokenDepositValueAfter = await yieldDeposit.userTokenDepositValue(member.address, weEth.address);
    expect(await weEth.balanceOf(member.address)).to.be.equal(userBalanceBefore.add(maxWithdrawalAmount));
    expect(await weEth.balanceOf(yieldDeposit.address)).to.be.equal(contractBalanceBefore.sub(maxWithdrawalAmount));
    expect(await yieldDeposit.totalDepositValue(weEth.address)).to.be.lessThanOrEqual(2);
    expect(userTokenDepositValueAfter).to.be.lessThanOrEqual(2);
  });
});
