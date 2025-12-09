const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { AbiCoder, parseEther } = ethers;
const abi = AbiCoder.defaultAbiCoder();

describe('distributeRewards', function () {
  it('reverts when caller is not network middleware (NotNetworkMiddleware)', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { other } = accounts;
    const { rewards, token } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;
    const data = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    const amount = parseEther('100');
    await token.mint(other.address, amount);
    await token.connect(other).approve(rewards.target, amount);

    const distributRewards = rewards.connect(other).distributeRewards(NETWORK_ID, token.target, amount, data);
    await expect(distributRewards).to.be.revertedWithCustomError(rewards, 'NotNetworkMiddleware');
  });

  it('reverts when timestamp is in the future (InvalidRewardTimestamp)', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { middleware } = accounts;
    const { rewards, token } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const block = await ethers.provider.getBlock('latest');
    const futureTs = block.timestamp + 10;
    const data = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [futureTs, ADMIN_FEE_BASE, '0x', '0x']);

    const distributeRewards = rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, 1n, data);
    await expect(distributeRewards).to.be.revertedWithCustomError(rewards, 'InvalidRewardTimestamp');
  });

  it('reverts when maxAdminFee is less than configured adminFee (HighAdminFee)', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { middleware } = accounts;
    const { rewards, token } = contracts;
    const { NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;
    const data = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, 400n, '0x', '0x']);

    const distributeRewards = rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, 1n, data);
    await expect(distributeRewards).to.be.revertedWithCustomError(rewards, 'HighAdminFee');
  });

  it('reverts when transferred amount is 0 (InsufficientReward)', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;

    await vault.setEpochAt(currentEpochTs, 0n);
    await vault.setActiveSharesAt(currentEpochTs, 1n);
    await vault.setActiveStakeAt(currentEpochTs, 1n);
    await vault.setWithdrawals(1n, 0n);
    await vault.setWithdrawalShares(1n, 0n);

    const data = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    const distributeRewards = rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, 0n, data);
    await expect(distributeRewards).to.be.revertedWithCustomError(rewards, 'InsufficientReward');
  });

  it('reverts if there is no eligible stake (active + nextEpoch withdrawal == 0)', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;

    await vault.setEpochAt(currentEpochTs, 1n);

    const data = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);
    const amount = parseEther('100');

    await token.connect(middleware).approve(rewards.target, amount);

    const distributeRewards = rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, amount, data);
    await expect(distributeRewards).to.be.revertedWithCustomError(rewards, 'InvalidRewardTimestamp');
  });

  it('ignores withdrawals[currentEpoch] in eligibility check', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;
    const currentEpoch = 5n;

    await vault.setEpochAt(currentEpochTs, currentEpoch);

    // set withdrawals[currentEpoch] (should be ignored)
    await vault.setWithdrawals(currentEpoch, parseEther('100'));
    await vault.setWithdrawalShares(currentEpoch, parseEther('10'));

    const data = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);
    const amount = parseEther('100');

    await token.connect(middleware).approve(rewards.target, amount);

    const distributeRewards = rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, amount, data);
    await expect(distributeRewards).to.be.revertedWithCustomError(rewards, 'InvalidRewardTimestamp');
  });

  it('succeeds when only activeStake is present (no withdrawals)', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;
    const currentEpoch = 5n;

    await vault.setEpochAt(currentEpochTs, currentEpoch);
    await vault.setActiveSharesAt(currentEpochTs, parseEther('100'));
    await vault.setActiveStakeAt(currentEpochTs, parseEther('1000'));

    const data = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);
    const amount = parseEther('100');

    await token.connect(middleware).approve(rewards.target, amount);

    await expect(rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, amount, data))
      .to.emit(rewards, 'DistributeRewards')
      .withArgs(
        NETWORK_ID,
        token.target,
        (amount * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE),
        (amount * 500n) / BigInt(ADMIN_FEE_BASE),
        currentEpochTs,
      );
  });

  it('succeeds when only withdrawals[nextEpoch] are present (no activeStake)', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;
    const currentEpoch = 7n;
    const nextEpoch = currentEpoch + 1n;

    await vault.setEpochAt(currentEpochTs, currentEpoch);

    // no activeStake
    await vault.setActiveSharesAt(currentEpochTs, 0n);
    await vault.setActiveStakeAt(currentEpochTs, 0n);

    // only withdrawals[nextEpoch]
    await vault.setWithdrawals(nextEpoch, parseEther('50'));
    await vault.setWithdrawalShares(nextEpoch, parseEther('5'));

    const data = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);
    const amount = parseEther('100');

    await token.connect(middleware).approve(rewards.target, amount);

    await expect(rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, amount, data))
      .to.emit(rewards, 'DistributeRewards')
      .withArgs(
        NETWORK_ID,
        token.target,
        (amount * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE),
        (amount * 500n) / BigInt(ADMIN_FEE_BASE),
        currentEpochTs,
      );
  });

  it('reverts when activeShares > 0 but activeStake == 0 (InvalidRewardTimestamp)', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;
    const currentEpoch = 2n;

    await vault.setEpochAt(currentEpochTs, currentEpoch);
    await vault.setActiveSharesAt(currentEpochTs, parseEther('100'));
    await vault.setActiveStakeAt(currentEpochTs, 0n); // stake is 0

    const data = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);
    const amount = parseEther('100');

    await token.connect(middleware).approve(rewards.target, amount);

    const distributeRewards = rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, amount, data);
    await expect(distributeRewards).to.be.revertedWithCustomError(rewards, 'InvalidRewardTimestamp');
  });

  it('reverts when activeStake > 0 but activeShares == 0 (InvalidRewardTimestamp)', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;
    const currentEpoch = 2n;

    await vault.setEpochAt(currentEpochTs, currentEpoch);
    await vault.setActiveSharesAt(currentEpochTs, 0n); // shares is 0
    await vault.setActiveStakeAt(currentEpochTs, parseEther('1000'));

    const data = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);
    const amount = parseEther('100');

    await token.connect(middleware).approve(rewards.target, amount);

    const distributeRewards = rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, amount, data);
    await expect(distributeRewards).to.be.revertedWithCustomError(rewards, 'InvalidRewardTimestamp');
  });

  it('reverts when withdrawalShares[nextEpoch] > 0 but withdrawals[nextEpoch] == 0 ', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;
    const currentEpoch = 3n;
    const nextEpoch = currentEpoch + 1n;

    await vault.setEpochAt(currentEpochTs, currentEpoch);
    await vault.setActiveSharesAt(currentEpochTs, 0n);
    await vault.setActiveStakeAt(currentEpochTs, 0n);
    await vault.setWithdrawalShares(nextEpoch, parseEther('100'));
    await vault.setWithdrawals(nextEpoch, 0n); // withdrawals is 0

    const data = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);
    const amount = parseEther('100');

    await token.connect(middleware).approve(rewards.target, amount);

    const distributeRewards = rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, amount, data);
    await expect(distributeRewards).to.be.revertedWithCustomError(rewards, 'InvalidRewardTimestamp');
  });

  it('reverts when withdrawals[nextEpoch] > 0 but withdrawalShares[nextEpoch] == 0', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;
    const currentEpoch = 3n;
    const nextEpoch = currentEpoch + 1n;

    await vault.setEpochAt(currentEpochTs, currentEpoch);
    await vault.setActiveSharesAt(currentEpochTs, 0n);
    await vault.setActiveStakeAt(currentEpochTs, 0n);
    await vault.setWithdrawalShares(nextEpoch, 0n); // shares is 0
    await vault.setWithdrawals(nextEpoch, parseEther('1000'));

    const data = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);
    const amount = parseEther('100');

    await token.connect(middleware).approve(rewards.target, amount);

    const distributeRewards = rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, amount, data);
    await expect(distributeRewards).to.be.revertedWithCustomError(rewards, 'InvalidRewardTimestamp');
  });

  it('reuses cached eligible shares for same timestamp', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;
    const currentEpoch = 4n;
    const nextEpoch = currentEpoch + 1n;

    await vault.setEpochAt(currentEpochTs, currentEpoch);
    await vault.setActiveSharesAt(currentEpochTs, parseEther('100'));
    await vault.setActiveStakeAt(currentEpochTs, parseEther('1000'));
    await vault.setWithdrawalShares(nextEpoch, parseEther('50'));
    await vault.setWithdrawals(nextEpoch, parseEther('500'));

    const data = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);
    const amount1 = parseEther('100');
    const amount2 = parseEther('200');

    // 1st distribution (cache is populated)
    await token.connect(middleware).approve(rewards.target, amount1);
    const distributeRewards1 = rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, amount1, data);
    await expect(distributeRewards1).to.emit(rewards, 'DistributeRewards');

    // 2nd distribution with same timestamp (should reuse cache)
    await token.connect(middleware).approve(rewards.target, amount2);
    const distributeRewards2 = rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, amount2, data);
    await expect(distributeRewards2).to.emit(rewards, 'DistributeRewards');

    expect(await rewards.rewardsLength(token.target, NETWORK_ID)).to.equal(2n);
  });

  it('stores reward distribution and adminFee with eligible stake including withdrawals[nextEpoch]', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;

    await vault.setEpochAt(currentEpochTs, 0n);
    await vault.setActiveSharesAt(currentEpochTs, parseEther('100'));
    await vault.setActiveStakeAt(currentEpochTs, parseEther('100'));
    await vault.setWithdrawals(1n, parseEther('50'));
    await vault.setWithdrawalShares(1n, parseEther('50'));

    const rewardAmount = parseEther('1000');
    const data = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, rewardAmount);

    await expect(rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount, data))
      .to.emit(rewards, 'DistributeRewards')
      .withArgs(
        NETWORK_ID,
        token.target,
        anyValue => anyValue > 0n,
        anyValue => anyValue >= 0n,
        currentEpochTs,
      );

    const len = await rewards.rewardsLength(token.target, NETWORK_ID);
    expect(len).to.equal(1n);
  });

  it('distributes rewards proportionally based on activeShares + withdrawalShares[nextEpoch]', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { staker1, staker2, middleware } = accounts;
    const { rewards, token, vault } = contracts;
    const { ADMIN_FEE_BASE, NETWORK_ID } = constants;

    const currentEpochTs = (await time.latest()) - 5;
    const currentEpoch = 3n;
    const nextEpoch = currentEpoch + 1n;

    await vault.setEpochAt(currentEpochTs, currentEpoch);

    // Total: 100 active + 100 nextEpoch withdrawal = 200 shares
    await vault.setActiveSharesAt(currentEpochTs, parseEther('100'));
    await vault.setActiveStakeAt(currentEpochTs, parseEther('1000'));
    await vault.setWithdrawalShares(nextEpoch, parseEther('100'));
    await vault.setWithdrawals(nextEpoch, parseEther('1000'));

    // staker1: 25 active + 25 withdrawal = 50/200 (25%)
    await vault.setActiveSharesOfAt(staker1.address, currentEpochTs, parseEther('25'));
    await vault.setWithdrawalSharesOf(staker1.address, nextEpoch, parseEther('25'));

    // staker2: 50 active + 50 withdrawal = 100/200 (50%)
    await vault.setActiveSharesOfAt(staker2.address, currentEpochTs, parseEther('50'));
    await vault.setWithdrawalSharesOf(staker2.address, nextEpoch, parseEther('50'));

    const rewardAmount = parseEther('400');
    const distData = abi.encode(['uint48', 'uint256', 'bytes', 'bytes'], [currentEpochTs, ADMIN_FEE_BASE, '0x', '0x']);

    await token.connect(middleware).approve(rewards.target, rewardAmount);
    await rewards.connect(middleware).distributeRewards(NETWORK_ID, token.target, rewardAmount, distData);

    const netReward = (rewardAmount * (BigInt(ADMIN_FEE_BASE) - 500n)) / BigInt(ADMIN_FEE_BASE);
    const expected1 = netReward / 4n; // 25%
    const expected2 = netReward / 2n; // 50%

    const claimData = abi.encode(['address', 'uint256', 'bytes[]'], [NETWORK_ID, 10n, []]);

    const before1 = await token.balanceOf(staker1.address);
    await rewards.connect(staker1).claimRewards(staker1.address, token.target, claimData);
    const after1 = await token.balanceOf(staker1.address);

    const before2 = await token.balanceOf(staker2.address);
    await rewards.connect(staker2).claimRewards(staker2.address, token.target, claimData);
    const after2 = await token.balanceOf(staker2.address);

    expect(after1 - before1).to.equal(expected1);
    expect(after2 - before2).to.equal(expected2);
  });
});
