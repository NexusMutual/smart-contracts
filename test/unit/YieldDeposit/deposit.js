const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { increasePriceFeedRate } = require('./helper');
const { setup } = require('./setup');

const RATE_DENOMINATOR = ethers.BigNumber.from('10').pow(18);

describe('YieldDeposit - deposit', function () {
  it('should revert InvalidDepositAmount if deposit amount is less than or equal to zero', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit, weEth } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const depositError = yieldDeposit.connect(member).deposit(weEth.address, '0');
    await expect(depositError).to.revertedWithCustomError(yieldDeposit, 'InvalidDepositAmount');

    expect(await yieldDeposit.totalDepositValue()).to.be.equal('0');
    expect(await yieldDeposit.userTokenDepositValue(member.address, weEth.address)).to.be.equal('0');
  });

  it('should revert TokenNotSupported if token is not supported', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit, weEth } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const unsupportedToken = '0x3d08cc653ec3df0c039c3a1da15ed0ceea3b0acc';
    const depositError = yieldDeposit.connect(member).deposit(unsupportedToken, '1');
    await expect(depositError).to.revertedWithCustomError(yieldDeposit, 'TokenNotSupported');

    expect(await yieldDeposit.totalDepositValue()).to.be.equal('0');
    expect(await yieldDeposit.userTokenDepositValue(member.address, weEth.address)).to.be.equal('0');
  });

  it('should be able to deposit to contract', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit, weEth, chainLinkPriceFeedWeEth } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const userWeEthBalanceBefore = await weEth.balanceOf(member.address);
    expect(await weEth.balanceOf(yieldDeposit.address)).to.be.equal('0');
    expect(await yieldDeposit.totalDepositValue()).to.be.equal('0');
    expect(await yieldDeposit.userTokenDepositValue(member.address, weEth.address)).to.be.equal('0');

    const depositAmount = ethers.utils.parseEther('10');
    await weEth.connect(member).approve(yieldDeposit.address, depositAmount);
    await yieldDeposit.connect(member).deposit(weEth.address, depositAmount);

    const priceRate = await chainLinkPriceFeedWeEth.latestAnswer();
    const userDepositValue = depositAmount.mul(priceRate).div(RATE_DENOMINATOR);

    const userWeEthBalanceAfter = await weEth.balanceOf(member.address);
    expect(userWeEthBalanceAfter).to.be.equal(userWeEthBalanceBefore.sub(depositAmount));
    expect(await weEth.balanceOf(yieldDeposit.address)).to.be.equal(depositAmount);
    expect(await yieldDeposit.totalDepositValue()).to.be.equal(userDepositValue);
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
    const userDeposit1Value = depositAmount1.mul(priceRate1).div(RATE_DENOMINATOR);

    await increasePriceFeedRate(chainLinkPriceFeedWeEth);

    const depositAmount2 = ethers.utils.parseEther('20');
    await weEth.connect(member).approve(yieldDeposit.address, depositAmount2);
    await yieldDeposit.connect(member).deposit(weEth.address, depositAmount2);

    const priceRate2 = await chainLinkPriceFeedWeEth.latestAnswer();
    const userDeposit2Value = depositAmount2.mul(priceRate2).div(RATE_DENOMINATOR);

    const userWeEthBalanceAfter = await weEth.balanceOf(member.address);
    const totalUserDepositAmount = depositAmount1.add(depositAmount2);
    const totalUserDepositValue = userDeposit1Value.add(userDeposit2Value)

    expect(userWeEthBalanceAfter).to.be.equal(userWeEthBalanceBefore.sub(totalUserDepositAmount));
    expect(await weEth.balanceOf(yieldDeposit.address)).to.be.equal(totalUserDepositAmount);
    expect(await yieldDeposit.totalDepositValue()).to.be.equal(totalUserDepositValue);
    expect(await yieldDeposit.userTokenDepositValue(member.address, weEth.address)).to.be.equal(totalUserDepositValue);
  });

  it('should be able to do a second deposit on top of existing deposit - different token', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit, weEth, stEth, chainLinkPriceFeedWeEth, chainLinkPriceFeedStEth } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const userWeEthBalanceBefore = await weEth.balanceOf(member.address);
    const userStEthBalanceBefore = await stEth.balanceOf(member.address);

    const weEthDepositAmount = ethers.utils.parseEther('10');
    await weEth.connect(member).approve(yieldDeposit.address, weEthDepositAmount);
    await yieldDeposit.connect(member).deposit(weEth.address, weEthDepositAmount);

    expect(await weEth.balanceOf(member.address)).to.equal(userWeEthBalanceBefore.sub(weEthDepositAmount));

    const weEthPriceRate = await chainLinkPriceFeedWeEth.latestAnswer();
    const weEthDepositValue = weEthDepositAmount.mul(weEthPriceRate).div(RATE_DENOMINATOR);

    const stEthDepositAmount = ethers.utils.parseEther('30');
    await stEth.connect(member).approve(yieldDeposit.address, stEthDepositAmount);
    await yieldDeposit.connect(member).deposit(stEth.address, stEthDepositAmount);

    expect(await stEth.balanceOf(member.address)).to.equal(userStEthBalanceBefore.sub(stEthDepositAmount));
    
    const stEthPriceRate = await chainLinkPriceFeedStEth.latestAnswer();
    const stEthDepositValue = stEthDepositAmount.mul(stEthPriceRate).div(RATE_DENOMINATOR);
    console.log('stEthDepositValue: ', stEthDepositValue);

    const totalUserDepositAmount = weEthDepositAmount.add(stEthDepositAmount);
    const totalUserDepositValue = weEthDepositValue.add(stEthDepositValue)

    expect(await weEth.balanceOf(yieldDeposit.address)).to.be.equal(weEthDepositAmount);
    expect(await stEth.balanceOf(yieldDeposit.address)).to.be.equal(stEthDepositAmount);
    expect(await yieldDeposit.totalDepositValue()).to.be.equal(totalUserDepositValue);
    expect(await yieldDeposit.userTokenDepositValue(member.address, weEth.address)).to.be.equal(weEthDepositValue);
    expect(await yieldDeposit.userTokenDepositValue(member.address, stEth.address)).to.be.equal(stEthDepositValue);
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
