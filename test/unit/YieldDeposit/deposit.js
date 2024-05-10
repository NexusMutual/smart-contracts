const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { increasePriceFeedRate } = require('./helper');
const { setup } = require('./setup');

describe('YieldDeposit - deposit', function () {
  it('should revert InvalidDepositAmount if deposit amount is less than or equal to zero', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit, weEth } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const depositError = yieldDeposit.connect(member).deposit(weEth.address, '0');
    await expect(depositError).to.revertedWithCustomError(yieldDeposit, 'InvalidDepositAmount');

    expect(await yieldDeposit.totalDepositValue(weEth.address)).to.be.equal('0');
    expect(await yieldDeposit.userTokenDepositValue(member.address, weEth.address)).to.be.equal('0');
  });

  it('should revert TokenNotSupported if token is not supported', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit, weEth } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const unsupportedToken = '0x3d08cc653ec3df0c039c3a1da15ed0ceea3b0acc';
    const depositError = yieldDeposit.connect(member).deposit(unsupportedToken, '1');
    await expect(depositError).to.revertedWithCustomError(yieldDeposit, 'TokenNotSupported');

    expect(await yieldDeposit.totalDepositValue(weEth.address)).to.be.equal('0');
    expect(await yieldDeposit.userTokenDepositValue(member.address, weEth.address)).to.be.equal('0');
  });

  it('should be able to deposit to contract', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit, weEth, chainLinkPriceFeedWeEth } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const { rateDenominator } = fixture;

    const userWeEthBalanceBefore = await weEth.balanceOf(member.address);
    expect(await weEth.balanceOf(yieldDeposit.address)).to.be.equal('0');
    expect(await yieldDeposit.totalDepositValue(weEth.address)).to.be.equal('0');
    expect(await yieldDeposit.userTokenDepositValue(member.address, weEth.address)).to.be.equal('0');

    const depositAmount = ethers.utils.parseEther('10');
    await weEth.connect(member).approve(yieldDeposit.address, depositAmount);
    await yieldDeposit.connect(member).deposit(weEth.address, depositAmount);

    const priceRate = await chainLinkPriceFeedWeEth.latestAnswer();
    const userDepositValue = depositAmount.mul(priceRate).div(rateDenominator);

    const userWeEthBalanceAfter = await weEth.balanceOf(member.address);
    expect(userWeEthBalanceAfter).to.be.equal(userWeEthBalanceBefore.sub(depositAmount));
    expect(await weEth.balanceOf(yieldDeposit.address)).to.be.equal(depositAmount);
    expect(await yieldDeposit.totalDepositValue(weEth.address)).to.be.equal(userDepositValue);
    expect(await yieldDeposit.userTokenDepositValue(member.address, weEth.address)).to.be.equal(userDepositValue);
  });

  it('should be able to do a second deposit on top of existing deposit - same token', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit, weEth, chainLinkPriceFeedWeEth } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const userWeEthBalanceBefore = await weEth.balanceOf(member.address);

    const depositAmount1 = ethers.utils.parseEther('10');
    await weEth.connect(member).approve(yieldDeposit.address, depositAmount1);
    await yieldDeposit.connect(member).deposit(weEth.address, depositAmount1);

    const priceRate1 = await chainLinkPriceFeedWeEth.latestAnswer();
    const userDeposit1Value = depositAmount1.mul(priceRate1).div(fixture.rateDenominator);

    await increasePriceFeedRate(chainLinkPriceFeedWeEth);

    const depositAmount2 = ethers.utils.parseEther('20');
    await weEth.connect(member).approve(yieldDeposit.address, depositAmount2);
    await yieldDeposit.connect(member).deposit(weEth.address, depositAmount2);

    const priceRate2 = await chainLinkPriceFeedWeEth.latestAnswer();
    const userDeposit2Value = depositAmount2.mul(priceRate2).div(fixture.rateDenominator);

    const userWeEthBalanceAfter = await weEth.balanceOf(member.address);
    const totalUserDepositAmount = depositAmount1.add(depositAmount2);
    const totalUserDepositValue = userDeposit1Value.add(userDeposit2Value);

    expect(userWeEthBalanceAfter).to.be.equal(userWeEthBalanceBefore.sub(totalUserDepositAmount));
    expect(await weEth.balanceOf(yieldDeposit.address)).to.be.equal(totalUserDepositAmount);
    expect(await yieldDeposit.totalDepositValue(weEth.address)).to.be.equal(totalUserDepositValue);
    expect(await yieldDeposit.userTokenDepositValue(member.address, weEth.address)).to.be.equal(totalUserDepositValue);
  });

  it('should be able to do a second deposit on top of existing deposit - different token', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit, weEth, wstEth, chainLinkPriceFeedWeEth, chainLinkPriceFeedWstEth } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const userWeEthBalanceBefore = await weEth.balanceOf(member.address);
    const userWstEthBalanceBefore = await wstEth.balanceOf(member.address);

    // weEth deposit
    const weEthDepositAmount = ethers.utils.parseEther('10');
    await weEth.connect(member).approve(yieldDeposit.address, weEthDepositAmount);
    await yieldDeposit.connect(member).deposit(weEth.address, weEthDepositAmount);

    expect(await weEth.balanceOf(member.address)).to.equal(userWeEthBalanceBefore.sub(weEthDepositAmount));

    const weEthPriceRate = await chainLinkPriceFeedWeEth.latestAnswer();
    const weEthDepositValue = weEthDepositAmount.mul(weEthPriceRate).div(fixture.rateDenominator);

    // wstEth deposit
    const stEthDepositAmount = ethers.utils.parseEther('30');
    await wstEth.connect(member).approve(yieldDeposit.address, stEthDepositAmount);
    await yieldDeposit.connect(member).deposit(wstEth.address, stEthDepositAmount);

    expect(await wstEth.balanceOf(member.address)).to.equal(userWstEthBalanceBefore.sub(stEthDepositAmount));

    const stEthPriceRate = await chainLinkPriceFeedWstEth.latestAnswer();
    const stEthDepositValue = stEthDepositAmount.mul(stEthPriceRate).div(fixture.rateDenominator);

    expect(await weEth.balanceOf(yieldDeposit.address)).to.be.equal(weEthDepositAmount);
    expect(await wstEth.balanceOf(yieldDeposit.address)).to.be.equal(stEthDepositAmount);
    expect(await yieldDeposit.totalDepositValue(wstEth.address)).to.be.equal(stEthDepositValue);
    expect(await yieldDeposit.totalDepositValue(weEth.address)).to.be.equal(weEthDepositValue);
    expect(await yieldDeposit.userTokenDepositValue(member.address, weEth.address)).to.be.equal(weEthDepositValue);
    expect(await yieldDeposit.userTokenDepositValue(member.address, wstEth.address)).to.be.equal(stEthDepositValue);
  });

  it('should emit TokenDeposited on successful deposit', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit, weEth, chainLinkPriceFeedWeEth } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const depositAmount = ethers.utils.parseEther('10');
    const priceRate = await chainLinkPriceFeedWeEth.latestAnswer();

    await weEth.connect(member).approve(yieldDeposit.address, depositAmount);
    await expect(yieldDeposit.connect(member).deposit(weEth.address, depositAmount))
      .to.emit(yieldDeposit, 'TokenDeposited')
      .withArgs(member.address, depositAmount, priceRate);
  });
});
