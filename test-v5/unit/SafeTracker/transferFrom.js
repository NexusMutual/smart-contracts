const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { impersonateAccount, setEtherBalance } = require('../utils').evm;
const { setup } = require('./setup');
const { ethers } = require('hardhat');
const { parseEther } = ethers.utils;

describe('transferFrom', function () {
  it("should revert if amount is not 0 and the caller aren't pool and swapOperator", async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const {
      defaultSender,
      members: [memberSender, memberRecipient],
    } = fixture.accounts;

    await expect(safeTracker.connect(defaultSender).transferFrom(memberSender.address, memberRecipient.address, 100)).to
      .be.reverted;
  });

  it('should emit Transfer event if amount is 0', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const {
      defaultSender,
      members: [memberSender, memberRecipient],
    } = fixture.accounts;

    await expect(
      safeTracker.connect(defaultSender).transferFrom(memberSender.address, memberRecipient.address, 0),
    ).to.emit(safeTracker, 'Transfer');
  });

  it('should emit Transfer event if caller is pool', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker, pool } = fixture.contracts;
    const {
      members: [memberSender, memberRecipient],
    } = fixture.accounts;

    await impersonateAccount(pool.address);
    await setEtherBalance(pool.address, parseEther('1000'));
    const poolSigner = await ethers.provider.getSigner(pool.address);

    await expect(
      safeTracker.connect(poolSigner).transferFrom(memberSender.address, memberRecipient.address, 0),
    ).to.emit(safeTracker, 'Transfer');
  });

  it('should emit Transfer event if caller is swapOperator', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker, swapOperator } = fixture.contracts;
    const {
      members: [memberSender, memberRecipient],
    } = fixture.accounts;

    await impersonateAccount(swapOperator.address);
    await setEtherBalance(swapOperator.address, parseEther('1000'));
    const swapOperatorSigner = await ethers.provider.getSigner(swapOperator.address);

    await expect(
      safeTracker.connect(swapOperatorSigner).transferFrom(memberSender.address, memberRecipient.address, 0),
    ).to.emit(safeTracker, 'Transfer');
  });
});
