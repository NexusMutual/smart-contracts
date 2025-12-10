const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { AbiCoder, parseEther } = ethers;
const abi = AbiCoder.defaultAbiCoder();

describe('claimAdminFee', function () {
  it('reverts when nothing is claimable (InsufficientAdminFee)', async function () {
    const { accounts, contracts } = await loadFixture(setup);
    const { adminFeeClaimer, recipient } = accounts;
    const { rewards, token } = contracts;

    const claimAdminFee = rewards.connect(adminFeeClaimer).claimAdminFee(recipient.address, token.target);
    await expect(claimAdminFee).to.be.revertedWithCustomError(rewards, 'InsufficientAdminFee');
  });

  it('allows ADMIN_FEE_CLAIM_ROLE to withdraw accumulated admin fees', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { adminFeeClaimer, recipient, middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;

    await vault.setEpochAt(currentEpochTs, 0n);
    await vault.setActiveSharesAt(currentEpochTs, parseEther('100'));
    await vault.setActiveStakeAt(currentEpochTs, parseEther('100'));
    await vault.setWithdrawals(1n, 0n);
    await vault.setWithdrawalShares(1n, 0n);

    const totalReward = parseEther('1000');
    const data = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, totalReward);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, totalReward, data);

    const adminFee = (totalReward * 500n) / BigInt(ADMIN_FEE_BASE);

    const balanceBefore = await token.balanceOf(recipient.address);

    await expect(rewards.connect(adminFeeClaimer).claimAdminFee(recipient.address, token.target))
      .to.emit(rewards, 'ClaimAdminFee')
      .withArgs(token.target, adminFee);

    const balanceAfter = await token.balanceOf(recipient.address);
    expect(balanceAfter - balanceBefore).to.equal(adminFee);
    expect(await rewards.claimableAdminFee(token.target)).to.equal(0n);
  });
});
