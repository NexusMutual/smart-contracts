const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { increasePriceFeedRate } = require('./helper');

async function withdrawYieldSetup() {
  const fixture = await loadFixture(setup);
  const { yieldDeposit, weEth, chainLinkPriceFeedWeEth } = fixture.contracts;
  const [member] = fixture.accounts.members;

  const depositAmount = ethers.utils.parseEther('10');
  await weEth.connect(member).approve(yieldDeposit.address, depositAmount);
  await yieldDeposit.connect(member).deposit(weEth.address, depositAmount);

  // simulate price rate increase to have available yield
  await increasePriceFeedRate(chainLinkPriceFeedWeEth);

  return {
    ...fixture,
    depositAmount,
  };
}

// TODO: fix getAvailableYield
// should be able to withdraw further yields if priceRate goes up
describe('YieldDeposit - withdrawAvailableYield', function () {
  it('should revert with TokenNotSupported if token is not supported', async function () {
    const fixture = await loadFixture(withdrawYieldSetup);
    const { yieldDeposit } = fixture.contracts;
    const { manager } = fixture;

    const unsupportedToken = '0x3d08cc653ec3df0c039c3a1da15ed0ceea3b0acc';
    const withdrawYieldError = yieldDeposit.connect(manager).withdrawAvailableYield(unsupportedToken);
    await expect(withdrawYieldError).to.revertedWithCustomError(yieldDeposit, 'TokenNotSupported');
  });

  it('should revert with NoYieldAvailable if there is no available yield', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit, weEth } = fixture.contracts;
    const { manager } = fixture;

    const withdrawYieldError = yieldDeposit.connect(manager).withdrawAvailableYield(weEth.address);
    await expect(withdrawYieldError).to.revertedWithCustomError(yieldDeposit, 'NoYieldAvailable');
  });

  it('should send all available yield to the manager', async function () {
    const fixture = await loadFixture(withdrawYieldSetup);
    const { yieldDeposit, weEth } = fixture.contracts;
    const { manager } = fixture;

    const managerBalanceBefore = await weEth.balanceOf(manager.address);
    const availableYield = await yieldDeposit.getAvailableYield(weEth.address);

    await yieldDeposit.connect(manager).withdrawAvailableYield(weEth.address);

    expect(await yieldDeposit.totalYieldWithdrawn(weEth.address)).to.be.equal(availableYield);

    const managerBalanceAfter = await weEth.balanceOf(manager.address);
    expect(managerBalanceAfter).to.be.equal(managerBalanceBefore.add(availableYield));
    console.log('----------------------------');
    console.log('----------------------------');
    console.log('----------------------------');
    console.log('----------------------------');
    const availableYieldAfter = await yieldDeposit.getAvailableYield(weEth.address);
    console.log('availableYieldAfter: ', availableYieldAfter);
    expect(availableYieldAfter).to.be.equal('0');
  });
});
