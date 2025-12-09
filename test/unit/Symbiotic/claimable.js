const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { AbiCoder, parseEther } = ethers;
const abi = AbiCoder.defaultAbiCoder();

describe('claimable', function () {
  it('returns 0 when no rewards have been distributed', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { staker1 } = accounts;
    const { rewards, token } = contracts;
    const { NETWORK_ID } = constants;

    const data = abi.encode(['address', 'uint256'], [NETWORK_ID, 10n]);
    const claimable = await rewards.claimable(token.target, staker1.address, data);

    expect(claimable).to.equal(0n);
  });

  it('returns 0 when staker has no shares', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { staker1, middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { NETWORK_ID, ADMIN_FEE_BASE } = constants;

    const currentEpochTs = (await time.latest()) - 5;

    await vault.setEpochAt(currentEpochTs, 0n);
    await vault.setActiveSharesAt(currentEpochTs, 100n);
    await vault.setActiveStakeAt(currentEpochTs, 100n);
    await vault.setWithdrawals(1n, 0n);
    await vault.setWithdrawalShares(1n, 0n);

    // staker1 has no shares
    await vault.setActiveSharesOfAt(staker1.address, currentEpochTs, 0n);

    const rewardAmount = parseEther('1000');
    const distData = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, rewardAmount);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount, distData);

    const claimableData = abi.encode(['address', 'uint256'], [NETWORK_ID, 10n]);
    const claimable = await rewards.claimable(token.target, staker1.address, claimableData);

    expect(claimable).to.equal(0n);
  });

  it('returns correct amount for single reward distribution', async function () {
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

    const rewardAmount = parseEther('1000');
    const distData = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, rewardAmount);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount, distData);

    const claimableData = abi.encode(['address', 'uint256'], [NETWORK_ID, 10n]);
    const claimable = await rewards.claimable(token.target, staker1.address, claimableData);

    const expectedReward = (rewardAmount * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE);
    expect(claimable).to.equal(expectedReward);
  });

  it('returns correct amounts for various scenarios without modifying state', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { staker1, staker2, middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;

    await vault.setEpochAt(currentEpochTs, 0n);
    await vault.setActiveSharesAt(currentEpochTs, 100n);
    await vault.setActiveStakeAt(currentEpochTs, 100n);
    await vault.setWithdrawals(1n, 50n);
    await vault.setWithdrawalShares(1n, 50n);

    // staker1: 60 active + 30 withdrawal = 90/150 (60%), staker2: 40 active + 20 withdrawal = 60/150 (40%)
    await vault.setActiveSharesOfAt(staker1.address, currentEpochTs, 60n);
    await vault.setWithdrawalSharesOf(staker1.address, 1n, 30n);

    await vault.setActiveSharesOfAt(staker2.address, currentEpochTs, 40n);
    await vault.setWithdrawalSharesOf(staker2.address, 1n, 20n);

    const distData = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    const totalToDistribute = 300n + 400n + 500n;
    await token.connect(middleware).approve(rewards.target, totalToDistribute);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, 300n, distData);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, 400n, distData);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, 500n, distData);

    // maxRewards = 1: process only first distribution
    const data1 = abi.encode(['address', 'uint256'], [NETWORK_ID, 1n]);
    const claimable1 = await rewards.claimable(token.target, staker1.address, data1);
    const expected1 = (((300n * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE)) * 60n) / 100n;
    expect(claimable1).to.be.closeTo(expected1, 1n);

    // maxRewards = 2: process first 2 distributions
    const data2 = abi.encode(['address', 'uint256'], [NETWORK_ID, 2n]);
    const claimable2 = await rewards.claimable(token.target, staker1.address, data2);
    const expected2 = ((((300n + 400n) * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE)) * 60n) / 100n;
    expect(claimable2).to.be.closeTo(expected2, 2n);

    // maxRewards = 100: process all 3
    const data3 = abi.encode(['address', 'uint256'], [NETWORK_ID, 100n]);
    const claimable3 = await rewards.claimable(token.target, staker1.address, data3);
    const expected3 =
      ((((300n + 400n + 500n) * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE)) * 60n) / 100n;
    expect(claimable3).to.be.closeTo(expected3, 3n);

    // view-only: calling multiple times gives same result
    const claimable3Again = await rewards.claimable(token.target, staker1.address, data3);
    expect(claimable3Again).to.equal(claimable3);

    // staker2 has different claimable (40% vs 60%)
    const claimable2ForStaker2 = await rewards.claimable(token.target, staker2.address, data3);
    expect(claimable2ForStaker2).to.equal((claimable3 * 40n) / 60n);

    // after partial claim, claimable reflects remaining
    const partialClaimData = abi.encode(['address', 'uint256', 'bytes[]'], [NETWORK_ID, 1n, []]);
    await rewards.connect(staker1).claimRewards(staker1.address, token.target, partialClaimData);

    const claimableAfterPartial = await rewards.claimable(token.target, staker1.address, data3);
    expect(claimableAfterPartial).to.equal(claimable3 - claimable1);
  });

  it('handles proportional shares correctly with active + withdrawal shares', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { staker1, staker2, middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;

    await vault.setEpochAt(currentEpochTs, 0n);
    await vault.setActiveSharesAt(currentEpochTs, 200n);
    await vault.setActiveStakeAt(currentEpochTs, 200n);
    await vault.setWithdrawals(1n, 100n);
    await vault.setWithdrawalShares(1n, 100n);

    // staker1: 150 active + 75 withdrawal = 225/300 (75%)
    await vault.setActiveSharesOfAt(staker1.address, currentEpochTs, 150n);
    await vault.setWithdrawalSharesOf(staker1.address, 1n, 75n);

    // staker2: 50 active + 25 withdrawal = 75/300 (25%)
    await vault.setActiveSharesOfAt(staker2.address, currentEpochTs, 50n);
    await vault.setWithdrawalSharesOf(staker2.address, 1n, 25n);

    const rewardAmount = parseEther('1000');
    const distData = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, rewardAmount);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount, distData);

    const claimableData = abi.encode(['address', 'uint256'], [NETWORK_ID, 10n]);

    const claimable1 = await rewards.claimable(token.target, staker1.address, claimableData);
    const claimable2 = await rewards.claimable(token.target, staker2.address, claimableData);

    const netReward = (rewardAmount * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE);
    const expected1 = (netReward * 75n) / 100n;
    const expected2 = (netReward * 25n) / 100n;

    expect(claimable1).to.equal(expected1);
    expect(claimable2).to.equal(expected2);
  });

  it('is idempotent - calling multiple times returns same result', async function () {
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

    const rewardAmount = parseEther('1000');
    const distData = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, rewardAmount);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount, distData);

    const claimableData = abi.encode(['address', 'uint256'], [NETWORK_ID, 10n]);

    const claimable1 = await rewards.claimable(token.target, staker1.address, claimableData);
    const claimable2 = await rewards.claimable(token.target, staker1.address, claimableData);
    const claimable3 = await rewards.claimable(token.target, staker1.address, claimableData);

    expect(claimable1).to.equal(claimable2);
    expect(claimable2).to.equal(claimable3);
  });

  it('handles rewards after actual claim correctly', async function () {
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

    const rewardAmount = parseEther('1000');
    const distData = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, rewardAmount);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount, distData);

    const claimableData = abi.encode(['address', 'uint256'], [NETWORK_ID, 10n]);
    const claimableBefore = await rewards.claimable(token.target, staker1.address, claimableData);

    expect(claimableBefore).to.be.gt(0n);

    // Actually claim the rewards
    const claimRewardsData = abi.encode(['address', 'uint256', 'bytes[]'], [NETWORK_ID, 10n, []]);
    await rewards.connect(staker1).claimRewards(staker1.address, token.target, claimRewardsData);

    // After claiming, claimable should be 0
    const claimableAfter = await rewards.claimable(token.target, staker1.address, claimableData);
    expect(claimableAfter).to.equal(0n);
  });

  it('stops at maxRewards when fewer than total rewards (processed < maxRewards exits first)', async function () {
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

    const distData = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    // Distribute 5 rewards
    await token.connect(middleware).approve(rewards.target, 5000n);
    for (let i = 0; i < 5; i++) {
      await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, 1000n, distData);
    }

    // Verify we have 5 rewards
    const rewardsLength = await rewards.rewardsLength(token.target, NETWORK_ID);
    expect(rewardsLength).to.equal(5n);

    // Request maxRewards = 3 (should stop at 3, not process all 5)
    const maxRewards3 = abi.encode(['address', 'uint256'], [NETWORK_ID, 3n]);
    const claimable3 = await rewards.claimable(token.target, staker1.address, maxRewards3);

    // Request maxRewards = 5 (should process all 5)
    const maxRewards5 = abi.encode(['address', 'uint256'], [NETWORK_ID, 5n]);
    const claimable5 = await rewards.claimable(token.target, staker1.address, maxRewards5);

    // claimable3 should be exactly 3/5 of claimable5
    const expectedClaimable3 = (claimable5 * 3n) / 5n;
    expect(claimable3).to.equal(expectedClaimable3);

    // Verify the processed < maxRewards condition stopped the loop
    expect(claimable3).to.be.lt(claimable5);
  });

  it('stops at rewardsLength when maxRewards exceeds available (rewardIndex < length)', async function () {
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

    const distData = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    // Distribute only 3 rewards
    await token.connect(middleware).approve(rewards.target, 3000n);
    for (let i = 0; i < 3; i++) {
      await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, 1000n, distData);
    }

    // Verify we have exactly 3 rewards
    const rewardsLength = await rewards.rewardsLength(token.target, NETWORK_ID);
    expect(rewardsLength).to.equal(3n);

    // Request maxRewards = 10 (far more than available)
    const maxRewards10 = abi.encode(['address', 'uint256'], [NETWORK_ID, 10n]);
    const claimable10 = await rewards.claimable(token.target, staker1.address, maxRewards10);

    // Request maxRewards = 100 (even more than available)
    const maxRewards100 = abi.encode(['address', 'uint256'], [NETWORK_ID, 100n]);
    const claimable100 = await rewards.claimable(token.target, staker1.address, maxRewards100);

    // Request maxRewards = 3 (exactly the available amount)
    const maxRewards3 = abi.encode(['address', 'uint256'], [NETWORK_ID, 3n]);
    const claimable3 = await rewards.claimable(token.target, staker1.address, maxRewards3);

    // All should be equal - stopped by rewardIndex < length condition
    expect(claimable10).to.equal(claimable100);
    expect(claimable3).to.equal(claimable100);

    // Verify we got rewards for all 3 distributions
    const netRewardPerDistribution = (1000n * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE);
    const expectedTotal = netRewardPerDistribution * 3n;
    expect(claimable100).to.equal(expectedTotal);
  });

  it('processes exactly maxRewards when maxRewards equals rewardsLength', async function () {
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

    const distData = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    // Distribute exactly 4 rewards
    await token.connect(middleware).approve(rewards.target, 4000n);
    for (let i = 0; i < 4; i++) {
      await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, 1000n, distData);
    }

    const rewardsLength = await rewards.rewardsLength(token.target, NETWORK_ID);
    expect(rewardsLength).to.equal(4n);

    // request exactly maxRewards = 4 (same as available)
    const maxRewards4 = abi.encode(['address', 'uint256'], [NETWORK_ID, 4n]);
    const claimable4 = await rewards.claimable(token.target, staker1.address, maxRewards4);

    // request maxRewards = 3 (less than available)
    const maxRewards3 = abi.encode(['address', 'uint256'], [NETWORK_ID, 3n]);
    const claimable3 = await rewards.claimable(token.target, staker1.address, maxRewards3);

    // request maxRewards = 5 (more than available)
    const maxRewards5 = abi.encode(['address', 'uint256'], [NETWORK_ID, 5n]);
    const claimable5 = await rewards.claimable(token.target, staker1.address, maxRewards5);

    // claimable4 and claimable5 should be equal (both process all 4)
    expect(claimable4).to.equal(claimable5);

    // claimable3 should be exactly 3/4 of claimable4
    const expectedClaimable3 = (claimable4 * 3n) / 4n;
    expect(claimable3).to.equal(expectedClaimable3);

    const netRewardPerDistribution = (1000n * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE);
    const expectedTotal = netRewardPerDistribution * 4n;
    expect(claimable4).to.equal(expectedTotal);
  });
});
