const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

async function withdrawYieldSetup() {
  const fixture = await loadFixture(setup);
  const { yieldDeposit, weEth, chainLinkPriceFeed } = fixture.contracts;
  const [member] = fixture.accounts.members;

  const depositAmount = ethers.utils.parseEther('10');
  await weEth.connect(member).approve(yieldDeposit.address, depositAmount);
  await yieldDeposit.connect(member).deposit(depositAmount);

  // bump the priceFeed to simulate yield
  await chainLinkPriceFeed.setLatestAnswer(ethers.utils.parseEther('1.045'));

  return {
    ...fixture,
    depositAmount,
  };
}

describe('YieldDeposit - withdrawAvailableYield', function () {
  it('should revert with NoYieldAvailable if there is no available yield', async function () {
    const fixture = await loadFixture(setup);
    const { yieldDeposit } = fixture.contracts;
    const { manager } = fixture;

    const withdrawYieldError = yieldDeposit.connect(manager).withdrawAvailableYield();
    await expect(withdrawYieldError).to.revertedWithCustomError(yieldDeposit, 'NoYieldAvailable');
  });

  it('should send all available yield to the manager', async function () {
    const fixture = await loadFixture(withdrawYieldSetup);
    const { yieldDeposit, weEth } = fixture.contracts;
    const { manager } = fixture;

    const managerBalanceBefore = await weEth.balanceOf(manager.address);
    const availableYieldBefore = await yieldDeposit.connect(manager).getAvailableYield();

    await yieldDeposit.connect(manager).withdrawAvailableYield();

    const managerBalanceAfter = await weEth.balanceOf(manager.address);
    expect(managerBalanceAfter).to.be.equal(managerBalanceBefore.add(availableYieldBefore));

    const availableYieldAfter = await yieldDeposit.connect(manager).getAvailableYield();
    expect(availableYieldAfter).to.be.equal('0');
  });
});
