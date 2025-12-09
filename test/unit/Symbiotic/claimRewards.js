const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { AbiCoder, parseEther } = ethers;
const abi = AbiCoder.defaultAbiCoder();

describe('claimRewards', function () {
  it('reverts if recipient is zero address (InvalidRecipient)', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { staker1 } = accounts;
    const { rewards, token } = contracts;
    const { NETWORK_ID } = constants;

    const data = abi.encode(['address', 'uint256', 'bytes[]'], [NETWORK_ID, 10n, []]);
    await expect(
      rewards.connect(staker1).claimRewards(ethers.ZeroAddress, token.target, data),
    ).to.be.revertedWithCustomError(rewards, 'InvalidRecipient');
  });

  it('reverts when there are no rewards to claim (NoRewardsToClaim)', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { staker1, recipient } = accounts;
    const { rewards, token } = contracts;
    const { NETWORK_ID } = constants;

    const data = abi.encode(['address', 'uint256', 'bytes[]'], [NETWORK_ID, 10n, []]);
    await expect(
      rewards.connect(staker1).claimRewards(recipient.address, token.target, data),
    ).to.be.revertedWithCustomError(rewards, 'NoRewardsToClaim');
  });

  it('reverts when hints length is not equal to rewardsToClaim (InvalidHintsLength)', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { staker1, recipient, middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;

    await vault.setEpochAt(currentEpochTs, 0n);
    await vault.setActiveSharesAt(currentEpochTs, 1n);
    await vault.setActiveStakeAt(currentEpochTs, 1n);
    await vault.setWithdrawals(1n, 0n);
    await vault.setWithdrawalShares(1n, 0n);

    const rewardAmount = 1000n;
    const distData = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, rewardAmount);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount, distData);

    // hints length must equal rewardsToClaim
    const claimData = abi.encode(['address', 'uint256', 'bytes[]'], [NETWORK_ID, 1n, ['0x', '0x']]);

    await expect(
      rewards.connect(staker1).claimRewards(recipient.address, token.target, claimData),
    ).to.be.revertedWithCustomError(rewards, 'InvalidHintsLength');
  });

  it('pays rewards and updates lastUnclaimedReward index (single reward)', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { staker1, staker2, middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;

    await vault.setEpochAt(currentEpochTs, 0n);
    await vault.setActiveSharesAt(currentEpochTs, 100n);
    await vault.setActiveStakeAt(currentEpochTs, 100n);
    await vault.setWithdrawals(1n, 0n);
    await vault.setWithdrawalShares(1n, 0n);

    await vault.setActiveSharesOfAt(staker1.address, currentEpochTs, 60n);
    await vault.setActiveSharesOfAt(staker2.address, currentEpochTs, 40n);

    const rewardAmount = 1000n;
    const distData = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, rewardAmount);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount, distData);

    const netReward = (rewardAmount * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE);
    const expected1 = (netReward * 60n) / 100n;

    const before = await token.balanceOf(staker1.address);

    const claimData = abi.encode(['address', 'uint256', 'bytes[]'], [NETWORK_ID, 10n, []]);
    await rewards.connect(staker1).claimRewards(staker1.address, token.target, claimData);

    const after = await token.balanceOf(staker1.address);
    expect(after - before).to.equal(expected1);

    const idx = await rewards.lastUnclaimedReward(staker1.address, token.target, NETWORK_ID);
    expect(idx).to.equal(1n);

    const claimRewards = rewards.connect(staker1).claimRewards(staker1.address, token.target, claimData);
    await expect(claimRewards).to.be.revertedWithCustomError(rewards, 'NoRewardsToClaim');
  });

  it('handles multiple reward distributions for the same token', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { staker1, staker2, middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;

    await vault.setEpochAt(currentEpochTs, 0n);
    await vault.setActiveSharesAt(currentEpochTs, 100n);
    await vault.setActiveStakeAt(currentEpochTs, 100n);
    await vault.setWithdrawals(1n, 0n);
    await vault.setWithdrawalShares(1n, 0n);

    await vault.setActiveSharesOfAt(staker1.address, currentEpochTs, 60n);
    await vault.setActiveSharesOfAt(staker2.address, currentEpochTs, 40n);

    const rewardAmount1 = 1000n;
    const distData1 = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, rewardAmount1);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount1, distData1);

    const rewardAmount2 = 500n;
    const distData2 = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, rewardAmount2);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount2, distData2);

    const totalNetRewards =
      ((rewardAmount1 + rewardAmount2) * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE);

    const expected1 = (totalNetRewards * 60n) / 100n;
    const expected2 = (totalNetRewards * 40n) / 100n;

    const claimableData = abi.encode(['address', 'uint256'], [NETWORK_ID, 10n]);

    const claimable1 = await rewards.claimable(token.target, staker1.address, claimableData);
    expect(claimable1).to.equal(expected1);

    const claimable2 = await rewards.claimable(token.target, staker2.address, claimableData);
    expect(claimable2).to.equal(expected2);

    const claimRewardsData = abi.encode(['address', 'uint256', 'bytes[]'], [NETWORK_ID, 10n, []]);

    const bal1Before = await token.balanceOf(staker1.address);
    await rewards.connect(staker1).claimRewards(staker1.address, token.target, claimRewardsData);
    const bal1After = await token.balanceOf(staker1.address);
    expect(bal1After - bal1Before).to.equal(expected1);

    const bal2Before = await token.balanceOf(staker2.address);
    await rewards.connect(staker2).claimRewards(staker2.address, token.target, claimRewardsData);
    const bal2After = await token.balanceOf(staker2.address);
    expect(bal2After - bal2Before).to.equal(expected2);
  });

  it('works correctly with 0% admin fee', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { staker1, middleware, adminFeeSetter, adminFeeClaimer, recipient } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    await rewards.connect(adminFeeSetter).setAdminFee(0);
    expect(await rewards.adminFee()).to.equal(0);

    const currentEpochTs = (await time.latest()) - 5;

    await vault.setEpochAt(currentEpochTs, 0n);
    await vault.setActiveSharesAt(currentEpochTs, 100n);
    await vault.setActiveStakeAt(currentEpochTs, 100n);
    await vault.setWithdrawals(1n, 0n);
    await vault.setWithdrawalShares(1n, 0n);

    await vault.setActiveSharesOfAt(staker1.address, currentEpochTs, 100n);

    const rewardAmount = 1000n;
    const distData = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, rewardAmount);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount, distData);

    const claimableData = abi.encode(['address', 'uint256'], [NETWORK_ID, 10n]);
    const claimable = await rewards.claimable(token.target, staker1.address, claimableData);
    expect(claimable).to.equal(rewardAmount);

    await expect(
      rewards.connect(adminFeeClaimer).claimAdminFee(recipient.address, token.target),
    ).to.be.revertedWithCustomError(rewards, 'InsufficientAdminFee');

    const claimRewardsData = abi.encode(['address', 'uint256', 'bytes[]'], [NETWORK_ID, 10n, []]);
    const balBefore = await token.balanceOf(staker1.address);
    await rewards.connect(staker1).claimRewards(staker1.address, token.target, claimRewardsData);
    const balAfter = await token.balanceOf(staker1.address);

    expect(balAfter - balBefore).to.equal(rewardAmount);
  });

  it('works correctly with near-maximum admin fee (99.99%)', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { staker1, middleware, adminFeeSetter, adminFeeClaimer, recipient } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    await rewards.connect(adminFeeSetter).setAdminFee(9999);
    expect(await rewards.adminFee()).to.equal(9999);

    const currentEpochTs = (await time.latest()) - 5;

    await vault.setEpochAt(currentEpochTs, 0n);
    await vault.setActiveSharesAt(currentEpochTs, 100n);
    await vault.setActiveStakeAt(currentEpochTs, 100n);
    await vault.setWithdrawals(1n, 0n);
    await vault.setWithdrawalShares(1n, 0n);

    await vault.setActiveSharesOfAt(staker1.address, currentEpochTs, 100n);

    // using larger amount to avoid rounding to 0
    const rewardAmount = 10000n;
    const distData = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, rewardAmount);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount, distData);

    const expectedStakerReward = (rewardAmount * 1n) / BigInt(ADMIN_FEE_BASE);
    const expectedAdminFee = (rewardAmount * 9999n) / BigInt(ADMIN_FEE_BASE);

    const claimableData = abi.encode(['address', 'uint256'], [NETWORK_ID, 10n]);
    const claimable = await rewards.claimable(token.target, staker1.address, claimableData);
    expect(claimable).to.equal(expectedStakerReward);
    expect(claimable).to.be.gt(0);

    const claimRewardsData = abi.encode(['address', 'uint256', 'bytes[]'], [NETWORK_ID, 10n, []]);
    const stakerBalBefore = await token.balanceOf(staker1.address);
    await rewards.connect(staker1).claimRewards(staker1.address, token.target, claimRewardsData);
    const stakerBalAfter = await token.balanceOf(staker1.address);

    expect(stakerBalAfter - stakerBalBefore).to.equal(expectedStakerReward);

    const adminBalBefore = await token.balanceOf(recipient.address);
    await rewards.connect(adminFeeClaimer).claimAdminFee(recipient.address, token.target);
    const adminBalAfter = await token.balanceOf(recipient.address);

    expect(adminBalAfter - adminBalBefore).to.equal(expectedAdminFee);
  });

  it('returns 0 for claimable when staker has no shares', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { staker1, staker2, middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;

    await vault.setEpochAt(currentEpochTs, 0n);
    await vault.setActiveSharesAt(currentEpochTs, 100n);
    await vault.setActiveStakeAt(currentEpochTs, 100n);
    await vault.setWithdrawals(1n, 0n);
    await vault.setWithdrawalShares(1n, 0n);

    await vault.setActiveSharesOfAt(staker1.address, currentEpochTs, 100n);
    await vault.setActiveSharesOfAt(staker2.address, currentEpochTs, 0n);

    const rewardAmount = 1000n;
    const distData = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, rewardAmount);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount, distData);

    const claimableData = abi.encode(['address', 'uint256'], [NETWORK_ID, 10n]);
    const claimable = await rewards.claimable(token.target, staker2.address, claimableData);
    expect(claimable).to.equal(0);

    const claimRewardsData = abi.encode(['address', 'uint256', 'bytes[]'], [NETWORK_ID, 10n, []]);
    const balBefore = await token.balanceOf(staker2.address);
    await rewards.connect(staker2).claimRewards(staker2.address, token.target, claimRewardsData);
    const balAfter = await token.balanceOf(staker2.address);

    expect(balAfter - balBefore).to.equal(0);
  });

  it('handles rewards from different tokens independently', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { staker1, middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const ERC20 = await ethers.getContractFactory('ERC20Mock');
    const token2 = await ERC20.deploy();
    await token2.waitForDeployment();
    await token2.mint(middleware.address, parseEther('100000'));

    const currentEpochTs = (await time.latest()) - 5;

    await vault.setEpochAt(currentEpochTs, 0n);
    await vault.setActiveSharesAt(currentEpochTs, 100n);
    await vault.setActiveStakeAt(currentEpochTs, 100n);
    await vault.setWithdrawals(1n, 0n);
    await vault.setWithdrawalShares(1n, 0n);

    await vault.setActiveSharesOfAt(staker1.address, currentEpochTs, 100n);

    const rewardAmount1 = 1000n;
    const distData1 = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, rewardAmount1);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount1, distData1);

    const rewardAmount2 = 500n;
    const distData2 = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token2.connect(middleware).approve(rewards.target, rewardAmount2);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token2.target, rewardAmount2, distData2);

    const claimableData = abi.encode(['address', 'uint256'], [NETWORK_ID, 10n]);

    const expectedReward1 = (rewardAmount1 * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE);
    const claimable1 = await rewards.claimable(token.target, staker1.address, claimableData);
    expect(claimable1).to.equal(expectedReward1);

    const expectedReward2 = (rewardAmount2 * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE);
    const claimable2 = await rewards.claimable(token2.target, staker1.address, claimableData);
    expect(claimable2).to.equal(expectedReward2);

    const claimRewardsData = abi.encode(['address', 'uint256', 'bytes[]'], [NETWORK_ID, 10n, []]);

    const bal1Before = await token.balanceOf(staker1.address);
    await rewards.connect(staker1).claimRewards(staker1.address, token.target, claimRewardsData);
    const bal1After = await token.balanceOf(staker1.address);
    expect(bal1After - bal1Before).to.equal(expectedReward1);

    // Claim token2 rewards
    const bal2Before = await token2.balanceOf(staker1.address);
    await rewards.connect(staker1).claimRewards(staker1.address, token2.target, claimRewardsData);
    const bal2After = await token2.balanceOf(staker1.address);
    expect(bal2After - bal2Before).to.equal(expectedReward2);

    const claimable1After = await rewards.claimable(token.target, staker1.address, claimableData);
    expect(claimable1After).to.equal(0);

    const claimable2After = await rewards.claimable(token2.target, staker1.address, claimableData);
    expect(claimable2After).to.equal(0);
  });

  it('allows claiming rewards to a different recipient address', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { staker1, staker2, middleware, recipient } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;

    await vault.setEpochAt(currentEpochTs, 0n);
    await vault.setActiveSharesAt(currentEpochTs, 100n);
    await vault.setActiveStakeAt(currentEpochTs, 100n);
    await vault.setWithdrawals(1n, 0n);
    await vault.setWithdrawalShares(1n, 0n);

    await vault.setActiveSharesOfAt(staker1.address, currentEpochTs, 100n);

    const rewardAmount = 1000n;
    const distData = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, rewardAmount);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount, distData);

    const expectedReward = (rewardAmount * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE);

    const claimableData = abi.encode(['address', 'uint256'], [NETWORK_ID, 10n]);
    const claimable = await rewards.claimable(token.target, staker1.address, claimableData);
    expect(claimable).to.equal(expectedReward);

    const claimRewardsData = abi.encode(['address', 'uint256', 'bytes[]'], [NETWORK_ID, 10n, []]);

    const staker1BalBefore = await token.balanceOf(staker1.address);
    const recipientBalBefore = await token.balanceOf(recipient.address);
    const staker2BalBefore = await token.balanceOf(staker2.address);

    await rewards.connect(staker1).claimRewards(recipient.address, token.target, claimRewardsData);

    const staker1BalAfter = await token.balanceOf(staker1.address);
    const recipientBalAfter = await token.balanceOf(recipient.address);
    const staker2BalAfter = await token.balanceOf(staker2.address);

    expect(staker1BalAfter).to.equal(staker1BalBefore);
    expect(recipientBalAfter - recipientBalBefore).to.equal(expectedReward);
    expect(staker2BalAfter).to.equal(staker2BalBefore);

    const claimableAfter = await rewards.claimable(token.target, staker1.address, claimableData);
    expect(claimableAfter).to.equal(0);
  });

  it('supports partial claims by processing limited reward distributions', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { staker1, middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;

    await vault.setEpochAt(currentEpochTs, 0n);
    await vault.setActiveSharesAt(currentEpochTs, 100n);
    await vault.setActiveStakeAt(currentEpochTs, 100n);
    await vault.setWithdrawals(1n, 0n);
    await vault.setWithdrawalShares(1n, 0n);

    await vault.setActiveSharesOfAt(staker1.address, currentEpochTs, 100n);

    const rewardAmount1 = 100n;
    const rewardAmount2 = 200n;
    const rewardAmount3 = 300n;
    const distData = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, rewardAmount1);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount1, distData);

    await token.connect(middleware).approve(rewards.target, rewardAmount2);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount2, distData);

    await token.connect(middleware).approve(rewards.target, rewardAmount3);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount3, distData);

    const totalDistributed = rewardAmount1 + rewardAmount2 + rewardAmount3;
    const totalReward = (totalDistributed * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE);

    // process only 2 reward distributions (maxRewards = 2)
    const partialClaimData = abi.encode(['address', 'uint256', 'bytes[]'], [NETWORK_ID, 2, []]);

    const bal1Before = await token.balanceOf(staker1.address);
    await rewards.connect(staker1).claimRewards(staker1.address, token.target, partialClaimData);
    const bal1After = await token.balanceOf(staker1.address);

    const expectedPartial =
      ((rewardAmount1 + rewardAmount2) * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE);
    expect(bal1After - bal1Before).to.equal(expectedPartial);

    const claimableData = abi.encode(['address', 'uint256'], [NETWORK_ID, 10n]);
    const claimableRemaining = await rewards.claimable(token.target, staker1.address, claimableData);
    const expectedRemaining = (rewardAmount3 * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE);
    expect(claimableRemaining).to.equal(expectedRemaining);

    const fullClaimData = abi.encode(['address', 'uint256', 'bytes[]'], [NETWORK_ID, 10, []]);

    const bal2Before = await token.balanceOf(staker1.address);
    await rewards.connect(staker1).claimRewards(staker1.address, token.target, fullClaimData);
    const bal2After = await token.balanceOf(staker1.address);

    expect(bal2After - bal2Before).to.equal(expectedRemaining);

    const claimableFinal = await rewards.claimable(token.target, staker1.address, claimableData);
    expect(claimableFinal).to.equal(0);

    const totalClaimed = bal1After - bal1Before + (bal2After - bal2Before);
    expect(totalClaimed).to.equal(totalReward);
  });

  it('accumulates rewards correctly over multiple epochs', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { staker1, middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const epoch0Ts = (await time.latest()) - 100;
    await vault.setEpochAt(epoch0Ts, 0n);
    await vault.setActiveSharesAt(epoch0Ts, 100n);
    await vault.setActiveStakeAt(epoch0Ts, 1000n);
    await vault.setWithdrawals(1n, 0n);
    await vault.setWithdrawalShares(1n, 0n);
    await vault.setActiveSharesOfAt(staker1.address, epoch0Ts, 100n);

    const epoch1Ts = (await time.latest()) - 50;
    await vault.setEpochAt(epoch1Ts, 1n);
    await vault.setActiveSharesAt(epoch1Ts, 150n);
    await vault.setActiveStakeAt(epoch1Ts, 1500n);
    await vault.setWithdrawals(2n, 0n);
    await vault.setWithdrawalShares(2n, 0n);
    await vault.setActiveSharesOfAt(staker1.address, epoch1Ts, 150n);

    const epoch2Ts = (await time.latest()) - 5;
    await vault.setEpochAt(epoch2Ts, 2n);
    await vault.setActiveSharesAt(epoch2Ts, 200n);
    await vault.setActiveStakeAt(epoch2Ts, 2000n);
    await vault.setWithdrawals(3n, 0n);
    await vault.setWithdrawalShares(3n, 0n);
    await vault.setActiveSharesOfAt(staker1.address, epoch2Ts, 200n);

    const reward0 = 1000n;
    const distData0 = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [epoch0Ts, ADMIN_FEE_BASE, '0x', '0x']);
    await token.connect(middleware).approve(rewards.target, reward0);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, reward0, distData0);

    const reward1 = 500n;
    const distData1 = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [epoch1Ts, ADMIN_FEE_BASE, '0x', '0x']);
    await token.connect(middleware).approve(rewards.target, reward1);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, reward1, distData1);

    const reward2 = 750n;
    const distData2 = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [epoch2Ts, ADMIN_FEE_BASE, '0x', '0x']);
    await token.connect(middleware).approve(rewards.target, reward2);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, reward2, distData2);

    // admin fee applied per distribution, calculate separately to avoid rounding errors
    const expected0 = (reward0 * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE);
    const expected1 = (reward1 * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE);
    const expected2 = (reward2 * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE);
    const expectedTotal = expected0 + expected1 + expected2;

    const claimableData = abi.encode(['address', 'uint256'], [NETWORK_ID, 10n]);
    const claimable = await rewards.claimable(token.target, staker1.address, claimableData);

    expect(claimable).to.be.lte(expectedTotal + 1n);
    expect(claimable).to.be.gte(expectedTotal - 1n);
    expect(claimable).to.be.gt(2000n);

    const claimRewardsData = abi.encode(['address', 'uint256', 'bytes[]'], [NETWORK_ID, 10n, []]);
    const balBefore = await token.balanceOf(staker1.address);
    await rewards.connect(staker1).claimRewards(staker1.address, token.target, claimRewardsData);
    const balAfter = await token.balanceOf(staker1.address);

    expect(balAfter - balBefore).to.equal(claimable);

    const claimableAfter = await rewards.claimable(token.target, staker1.address, claimableData);
    expect(claimableAfter).to.equal(0);
  });
});
