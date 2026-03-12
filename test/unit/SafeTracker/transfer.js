const { expect } = require('chai');
const { loadFixture, impersonateAccount, setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');

const { setup } = require('./setup');

const { parseEther } = ethers;

describe('transfer', function () {
  it("should revert if amount is not 0 and the caller aren't pool and swapOperator", async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const {
      defaultSender,
      members: [member],
    } = fixture.accounts;

    await expect(safeTracker.connect(defaultSender).transfer(member.address, 100)).to.be.revertedWithCustomError(
      safeTracker,
      'AmountExceedsBalance',
    );
  });

  it('should emit Transfer event if amount is 0', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const {
      defaultSender,
      members: [member],
    } = fixture.accounts;

    await expect(safeTracker.connect(defaultSender).transfer(member.address, 0)).to.emit(safeTracker, 'Transfer');
  });

  it('should emit Transfer event if caller is pool', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker, pool } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    await impersonateAccount(pool.target);
    await setBalance(pool.target, parseEther('1000'));
    const poolSigner = await ethers.getSigner(pool.target);

    await expect(safeTracker.connect(poolSigner).transfer(member.address, 0)).to.emit(safeTracker, 'Transfer');
  });

  it('should emit Transfer event if caller is pool and amount is non-zero', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker, pool } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    await impersonateAccount(pool.target);
    await setBalance(pool.target, parseEther('1000'));
    const poolSigner = await ethers.getSigner(pool.target);

    await expect(safeTracker.connect(poolSigner).transfer(member.address, 100)).to.emit(safeTracker, 'Transfer');
  });

  it('should emit Transfer event if caller is swapOperator', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker, swapOperator } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    await impersonateAccount(swapOperator.target);
    await setBalance(swapOperator.target, parseEther('1000'));
    const swapOperatorSigner = await ethers.getSigner(swapOperator.target);

    await expect(safeTracker.connect(swapOperatorSigner).transfer(member.address, 0)).to.emit(safeTracker, 'Transfer');
  });

  it('should revert if caller is swapOperator and amount is non-zero', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker, swapOperator } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    await impersonateAccount(swapOperator.target);
    await setBalance(swapOperator.target, parseEther('1000'));
    const swapOperatorSigner = await ethers.getSigner(swapOperator.target);

    await expect(safeTracker.connect(swapOperatorSigner).transfer(member.address, 100)).to.be.revertedWithCustomError(
      safeTracker,
      'AmountExceedsBalance',
    );
  });
});
