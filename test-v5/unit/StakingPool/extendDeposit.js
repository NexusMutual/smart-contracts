const { ethers } = require('hardhat');
const { expect } = require('chai');
const { getTranches, TRANCHE_DURATION, generateRewards, setTime } = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const { increaseTime } = require('../utils').evm;

const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

const depositToFixture = {
  amount: parseEther('100'),
  trancheId: 0,
  tokenId: 0,
  destination: AddressZero,
};

const productParams = {
  productId: 0,
  weight: 100,
  initialPrice: 500,
  targetPrice: 500,
};

const poolInitParams = {
  poolId: 1,
  initialPoolFee: 5, // 5%
  maxPoolFee: 5, // 5%
  products: [productParams],
};

const depositNftId = 1;
const managerDepositId = 0;

async function extendDepositSetup() {
  const fixture = await loadFixture(setup);
  const { stakingPool, stakingProducts, stakingNFT, tokenController } = fixture;
  const [user] = fixture.accounts.members;
  const manager = fixture.accounts.defaultSender;

  const { poolId, initialPoolFee, maxPoolFee, products } = poolInitParams;
  await stakingPool.connect(fixture.stakingProductsSigner).initialize(false, initialPoolFee, maxPoolFee, poolId);
  await tokenController.setStakingPoolManager(poolId, manager.address);

  await stakingProducts.connect(fixture.stakingProductsSigner).setInitialProducts(poolId, products);

  // Move to the beginning of the next tranche
  const { firstActiveTrancheId: trancheId } = await getTranches();
  await setTime((trancheId + 1) * TRANCHE_DURATION);

  expect(await stakingNFT.totalSupply()).to.equal(0);

  const { amount, tokenId } = depositToFixture;
  const tx = await stakingPool.connect(user).depositTo(amount, trancheId + 1, tokenId, AddressZero);
  await expect(tx).to.emit(stakingNFT, 'Transfer').withArgs(AddressZero, user.address, depositNftId);

  expect(await stakingNFT.totalSupply()).to.equal(1);

  return fixture;
}

describe('extendDeposit', function () {
  it('reverts if system is paused', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool, master } = fixture;
    const [user] = fixture.accounts.members;
    const { firstActiveTrancheId, maxTranche } = await getTranches();

    // enable emergency pause
    await master.setEmergencyPause(true);

    await expect(
      stakingPool.connect(user).extendDeposit(depositNftId, maxTranche, firstActiveTrancheId, 0),
    ).to.be.revertedWithCustomError(stakingPool, 'SystemPaused');
  });

  it('reverts if token id is 0', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool } = fixture;
    const { firstActiveTrancheId, maxTranche } = await getTranches();
    const manager = fixture.accounts.defaultSender;

    await expect(
      stakingPool.connect(manager).extendDeposit(0, firstActiveTrancheId, maxTranche, 0),
    ).to.be.revertedWithCustomError(stakingPool, 'InvalidTokenId');
  });

  it('reverts if new tranche ends before the initial tranche', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await expect(
      stakingPool.connect(user).extendDeposit(depositNftId, maxTranche, firstActiveTrancheId, 0),
    ).to.be.revertedWithCustomError(stakingPool, 'NewTrancheEndsBeforeInitialTranche');
  });

  it('reverts if new tranche is not yet available', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await expect(
      stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche + 1, 0),
    ).to.be.revertedWithCustomError(stakingPool, 'RequestedTrancheIsNotYetActive');
  });

  it('reverts if the new tranche already expired', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { firstActiveTrancheId } = await getTranches();

    await increaseTime(TRANCHE_DURATION * 2);

    await expect(
      stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, firstActiveTrancheId + 1, 0),
    ).to.be.revertedWithCustomError(stakingPool, 'RequestedTrancheIsExpired');
  });

  it('reverts when the user is not token owner nor approved tries to extend the deposit', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool } = fixture;
    const [notNFTOwnerNorApproved] = fixture.accounts.nonMembers;
    const { firstActiveTrancheId } = await getTranches();

    await expect(
      stakingPool
        .connect(notNFTOwnerNorApproved)
        .extendDeposit(depositNftId, firstActiveTrancheId, firstActiveTrancheId + 1, 0),
    ).to.be.revertedWithCustomError(stakingPool, 'NotTokenOwnerOrApproved');
  });

  it('should revert if trying to extend the deposit amount, while nxm is locked', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool, nxm } = fixture;
    const [user] = fixture.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, fixture.coverSigner);

    // Simulate member vote lock
    await nxm.setLock(user.address, 3 * 24 * 60 * 60); // 3 days in seconds

    const extendDeposit = stakingPool
      .connect(user)
      .extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, parseEther('50'));

    await expect(extendDeposit).to.be.revertedWithCustomError(stakingPool, 'NxmIsLockedForGovernanceVote');
  });

  it('should not revert if trying to extend the deposit duration, while nxm is locked', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool, nxm } = fixture;
    const [user] = fixture.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, fixture.coverSigner);

    const accNxmPerRewardsShareBefore = await stakingPool.getAccNxmPerRewardsShare();
    const lastAccNxmUpdateBefore = await stakingPool.getLastAccNxmUpdate();

    // Simulate member vote lock
    await nxm.setLock(user.address, 3 * 24 * 60 * 60); // 3 days in seconds);

    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, 0);

    const accNxmPerRewardsShareAfter = await stakingPool.getAccNxmPerRewardsShare();
    const lastAccNxmUpdateAfter = await stakingPool.getLastAccNxmUpdate();
    const { timestamp } = await ethers.provider.getBlock('latest');
    const depositData = await stakingPool.deposits(depositNftId, maxTranche);

    expect(accNxmPerRewardsShareAfter).to.gt(accNxmPerRewardsShareBefore);
    expect(accNxmPerRewardsShareAfter).to.equal(depositData.lastAccNxmPerRewardShare);
    expect(lastAccNxmUpdateAfter).to.gt(lastAccNxmUpdateBefore);
    expect(lastAccNxmUpdateAfter).to.equal(timestamp);
  });

  it('withdraws and make a new deposit if initial tranche is expired', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await increaseTime(TRANCHE_DURATION);

    await expect(stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, 0)).to.emit(
      stakingPool,
      'StakeDeposited',
    );
    // TODO validate it also emits withdraw event
  });

  it('updates tranches including accNxmPerRewardsShare and lastAccNxmUpdate', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, fixture.coverSigner);

    const accNxmPerRewardsShareBefore = await stakingPool.getAccNxmPerRewardsShare();
    const lastAccNxmUpdateBefore = await stakingPool.getLastAccNxmUpdate();

    await increaseTime(TRANCHE_DURATION);

    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, 0);

    const accNxmPerRewardsShareAfter = await stakingPool.getAccNxmPerRewardsShare();
    const lastAccNxmUpdateAfter = await stakingPool.getLastAccNxmUpdate();
    const { timestamp } = await ethers.provider.getBlock('latest');
    const depositData = await stakingPool.deposits(depositNftId, maxTranche);

    expect(accNxmPerRewardsShareAfter).to.gt(accNxmPerRewardsShareBefore);
    expect(accNxmPerRewardsShareAfter).to.equal(depositData.lastAccNxmPerRewardShare);
    expect(lastAccNxmUpdateAfter).to.gt(lastAccNxmUpdateBefore);
    expect(lastAccNxmUpdateAfter).to.equal(timestamp);
  });

  it('removes the initial tranche deposit and stores the new tranche deposit', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, fixture.coverSigner);

    const initialDeposit = await stakingPool.deposits(depositNftId, firstActiveTrancheId);

    expect(initialDeposit.stakeShares).to.not.equal(0);
    expect(initialDeposit.rewardsShares).to.not.equal(0);

    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, 0);

    const updatedInitialDeposit = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const newTrancheDeposit = await stakingPool.deposits(depositNftId, maxTranche);
    const accNxmPerRewardsShare = await stakingPool.getAccNxmPerRewardsShare();

    const expectedPendingRewards = initialDeposit.rewardsShares
      .mul(newTrancheDeposit.lastAccNxmPerRewardShare.sub(initialDeposit.lastAccNxmPerRewardShare))
      .div(parseEther('1'));

    expect(updatedInitialDeposit.stakeShares).to.equal(0);
    expect(updatedInitialDeposit.rewardsShares).to.equal(0);
    expect(updatedInitialDeposit.pendingRewards).to.equal(0);
    expect(updatedInitialDeposit.lastAccNxmPerRewardShare).to.equal(0);

    expect(newTrancheDeposit.stakeShares).to.equal(initialDeposit.stakeShares);
    expect(newTrancheDeposit.rewardsShares).to.equal(initialDeposit.rewardsShares);
    expect(newTrancheDeposit.pendingRewards).to.equal(expectedPendingRewards);
    expect(newTrancheDeposit.lastAccNxmPerRewardShare).to.equal(accNxmPerRewardsShare);
  });

  it('allows to increase the deposit', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, fixture.coverSigner);

    const initialDeposit = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const activeStake = await stakingPool.getActiveStake();
    const stakeSharesSupply = await stakingPool.getStakeSharesSupply();

    const topUpAmount = parseEther('50');
    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount);

    const updatedDeposit = await stakingPool.deposits(depositNftId, maxTranche);
    const accNxmPerRewardsShare = await stakingPool.getAccNxmPerRewardsShare();

    const expectedPendingRewards = initialDeposit.rewardsShares
      .mul(updatedDeposit.lastAccNxmPerRewardShare.sub(initialDeposit.lastAccNxmPerRewardShare))
      .div(parseEther('1'));

    const expectedNewShares = topUpAmount.mul(stakeSharesSupply).div(activeStake).add(initialDeposit.stakeShares);

    expect(updatedDeposit.stakeShares).to.equal(expectedNewShares);
    expect(updatedDeposit.rewardsShares).to.equal(expectedNewShares);
    expect(updatedDeposit.pendingRewards).to.equal(expectedPendingRewards);
    expect(updatedDeposit.lastAccNxmPerRewardShare).to.equal(accNxmPerRewardsShare);
  });

  it('allows to increase the deposit in expired tranche', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;
    const { amount } = depositToFixture;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, fixture.coverSigner);

    await increaseTime(TRANCHE_DURATION);

    const topUpAmount = parseEther('5');
    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount);

    const updatedDeposit = await stakingPool.deposits(depositNftId, maxTranche);
    const accNxmPerRewardsShare = await stakingPool.getAccNxmPerRewardsShare();

    const expectedShares = Math.floor(Math.sqrt(amount.add(topUpAmount)));

    expect(updatedDeposit.stakeShares).to.equal(expectedShares);
    expect(updatedDeposit.rewardsShares).to.equal(expectedShares);
    expect(updatedDeposit.pendingRewards).to.equal(0);
    expect(updatedDeposit.lastAccNxmPerRewardShare).to.equal(accNxmPerRewardsShare);
  });

  it('updates the initial and new tranche stake shares and reward shares', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, fixture.coverSigner);

    const managerDeposit = await stakingPool.deposits(managerDepositId, firstActiveTrancheId);
    const initialDeposit = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const initialTranche = await stakingPool.getTranche(firstActiveTrancheId);

    expect(initialTranche.stakeShares).to.equal(initialDeposit.stakeShares);
    expect(initialTranche.rewardsShares).to.equal(initialDeposit.rewardsShares.add(managerDeposit.rewardsShares));

    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, 0);

    const newTrancheDeposit = await stakingPool.deposits(depositNftId, maxTranche);
    const updatedInitialTranche = await stakingPool.getTranche(firstActiveTrancheId);
    const newTranche = await stakingPool.getTranche(maxTranche);

    const updatedManagerDeposit = await stakingPool.deposits(managerDepositId, firstActiveTrancheId);
    const newTrancheManagerDeposit = await stakingPool.deposits(managerDepositId, maxTranche);

    expect(updatedInitialTranche.stakeShares).to.equal(0);
    expect(updatedInitialTranche.rewardsShares).to.equal(0);
    expect(updatedManagerDeposit.rewardsShares).to.equal(0);

    expect(newTranche.stakeShares).to.equal(newTrancheDeposit.stakeShares);
    expect(newTranche.rewardsShares).to.equal(
      newTrancheDeposit.rewardsShares.add(newTrancheManagerDeposit.rewardsShares),
    );
  });

  it('updates the initial and new tranche manager deposit when extending without a top-up', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();
    await generateRewards(stakingPool, fixture.coverSigner);

    const initialManagerDeposit = await stakingPool.deposits(managerDepositId, firstActiveTrancheId);

    const topUpAmount = parseEther('0');
    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount);

    const updatedInitialManagerDeposit = await stakingPool.deposits(managerDepositId, firstActiveTrancheId);
    const updatedTargetManagerDeposit = await stakingPool.deposits(managerDepositId, maxTranche);
    const accNxmPerRewardsShareAfter = await stakingPool.getAccNxmPerRewardsShare();

    const earningsPerShare = accNxmPerRewardsShareAfter.sub(initialManagerDeposit.lastAccNxmPerRewardShare);
    const expectedPendingRewards = initialManagerDeposit.rewardsShares
      .mul(earningsPerShare)
      .div(parseEther('1'))
      .add(initialManagerDeposit.pendingRewards);

    expect(updatedInitialManagerDeposit.rewardsShares).to.equal(0);
    expect(updatedInitialManagerDeposit.pendingRewards).to.equal(expectedPendingRewards);
    expect(updatedInitialManagerDeposit.lastAccNxmPerRewardShare).to.equal(accNxmPerRewardsShareAfter);

    expect(updatedTargetManagerDeposit.rewardsShares).to.equal(initialManagerDeposit.rewardsShares);
    expect(updatedTargetManagerDeposit.pendingRewards).to.equal(0);
    expect(updatedTargetManagerDeposit.lastAccNxmPerRewardShare).to.equal(accNxmPerRewardsShareAfter);
  });

  it('updates the initial and new tranche manager deposit when extending with a top-up', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { config, stakingPool } = fixture;
    const { POOL_FEE_DENOMINATOR } = config;
    const [user] = fixture.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();
    await generateRewards(stakingPool, fixture.coverSigner);

    const initialShareSupply = await stakingPool.getStakeSharesSupply();
    const initialActiveStake = await stakingPool.getActiveStake();
    const poolFee = await stakingPool.getPoolFee();
    const initialManagerDeposit = await stakingPool.deposits(managerDepositId, firstActiveTrancheId);

    const topUpAmount = parseEther('50');
    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount);

    const updatedInitialManagerDeposit = await stakingPool.deposits(managerDepositId, firstActiveTrancheId);
    const updatedTargetManagerDeposit = await stakingPool.deposits(managerDepositId, maxTranche);
    const accNxmPerRewardsShareAfter = await stakingPool.getAccNxmPerRewardsShare();

    const newStakeShares = topUpAmount.mul(initialShareSupply).div(initialActiveStake);
    const newRewardsShares = newStakeShares; // they're identical, but copied for consistency
    const newManagerFeeShares = newRewardsShares.mul(poolFee).div(POOL_FEE_DENOMINATOR.sub(poolFee));
    const expectedTargetManagerDepositRewardsShares = initialManagerDeposit.rewardsShares.add(newManagerFeeShares);

    const earningsPerShare = accNxmPerRewardsShareAfter.sub(initialManagerDeposit.lastAccNxmPerRewardShare);
    const expectedPendingRewards = initialManagerDeposit.rewardsShares
      .mul(earningsPerShare)
      .div(parseEther('1'))
      .add(initialManagerDeposit.pendingRewards);

    expect(updatedInitialManagerDeposit.rewardsShares).to.equal(0);
    expect(updatedInitialManagerDeposit.pendingRewards).to.equal(expectedPendingRewards);
    expect(updatedInitialManagerDeposit.lastAccNxmPerRewardShare).to.equal(accNxmPerRewardsShareAfter);

    expect(updatedTargetManagerDeposit.rewardsShares).to.equal(expectedTargetManagerDepositRewardsShares);
    expect(updatedTargetManagerDeposit.pendingRewards).to.equal(0);
    expect(updatedTargetManagerDeposit.lastAccNxmPerRewardShare).to.equal(accNxmPerRewardsShareAfter);
  });

  it('updates the initial and new tranche stake and reward shares when extending with a top-up', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { config, stakingPool } = fixture;
    const { POOL_FEE_DENOMINATOR } = config;
    const [user] = fixture.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, fixture.coverSigner);

    const managerDeposit = await stakingPool.deposits(managerDepositId, firstActiveTrancheId);
    const initialDeposit = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const initialTranche = await stakingPool.getTranche(firstActiveTrancheId);

    const initialShareSupply = await stakingPool.getStakeSharesSupply();
    const initialRewardsSharesSupply = await stakingPool.getRewardsSharesSupply();
    const initialActiveStake = await stakingPool.getActiveStake();
    const poolFee = await stakingPool.getPoolFee();

    expect(initialTranche.stakeShares).to.equal(initialDeposit.stakeShares);
    expect(initialTranche.rewardsShares).to.equal(initialDeposit.rewardsShares.add(managerDeposit.rewardsShares));

    const topUpAmount = parseEther('50');
    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount);

    const updatedInitialTranche = await stakingPool.getTranche(firstActiveTrancheId);
    const newTranche = await stakingPool.getTranche(maxTranche);

    const actualShareSupply = await stakingPool.getStakeSharesSupply();
    const actualRewardsSharesSupply = await stakingPool.getRewardsSharesSupply();

    const expectedNewDepositStakeShares = topUpAmount.mul(initialShareSupply).div(initialActiveStake);
    const expectedNewDepositRewardsShares = expectedNewDepositStakeShares;
    const expectedNewFeeShares = expectedNewDepositRewardsShares.mul(poolFee).div(POOL_FEE_DENOMINATOR.sub(poolFee));
    const expectedNewRewardsShares = expectedNewDepositRewardsShares.add(expectedNewFeeShares);

    const expectedTrancheStakeShares = initialTranche.stakeShares.add(expectedNewDepositStakeShares);
    const expectedTrancheRewardsShares = initialTranche.rewardsShares.add(expectedNewRewardsShares);

    expect(updatedInitialTranche.stakeShares).to.equal(0);
    expect(updatedInitialTranche.rewardsShares).to.equal(0);

    expect(newTranche.stakeShares).to.equal(expectedTrancheStakeShares);
    expect(newTranche.rewardsShares).to.equal(expectedTrancheRewardsShares);
    expect(actualShareSupply).to.equal(initialShareSupply.add(expectedNewDepositStakeShares));
    expect(actualRewardsSharesSupply).to.equal(initialRewardsSharesSupply.add(expectedNewRewardsShares));
  });

  it('updates the initial and new tranche manager deposit with multiple users', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { config, stakingPool, stakingNFT } = fixture;
    const { POOL_FEE_DENOMINATOR } = config;
    const [alice, bob] = fixture.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, fixture.coverSigner);

    const secondDeposit = parseEther('75');
    const secondDepositNftId = 2;
    const tx = await stakingPool.connect(bob).depositTo(secondDeposit, firstActiveTrancheId, 0, AddressZero);
    await expect(tx).to.emit(stakingNFT, 'Transfer').withArgs(AddressZero, bob.address, secondDepositNftId);

    const initialAliceDeposit = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const initialBobDeposit = await stakingPool.deposits(secondDepositNftId, firstActiveTrancheId);
    const initialManagerDeposit = await stakingPool.deposits(managerDepositId, firstActiveTrancheId);
    const initialActiveStake = await stakingPool.getActiveStake();
    const initialSupplyShares = await stakingPool.getStakeSharesSupply();
    const poolFee = await stakingPool.getPoolFee();

    const topUpAmount = parseEther('50');
    await stakingPool.connect(alice).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount);

    const newStakeShares = topUpAmount.mul(initialSupplyShares).div(initialActiveStake);
    const newRewardsShares = newStakeShares; // copied for consistency
    const newManagerFeeShares = newRewardsShares.mul(poolFee).div(POOL_FEE_DENOMINATOR.sub(poolFee));

    const updatedInitialManagerDeposit = await stakingPool.deposits(managerDepositId, firstActiveTrancheId);
    const updatedTargetManagerDeposit = await stakingPool.deposits(managerDepositId, maxTranche);
    const accNxmPerRewardsShareAfter = await stakingPool.getAccNxmPerRewardsShare();

    const userRewardsShares = initialAliceDeposit.rewardsShares.add(initialBobDeposit.rewardsShares);
    const aliceManagerSharesPortion = initialManagerDeposit.rewardsShares
      .mul(initialAliceDeposit.rewardsShares)
      .div(userRewardsShares);
    const expectedRemainingManagerShares = initialManagerDeposit.rewardsShares.sub(aliceManagerSharesPortion);

    const managerRewardsBeforeExtend = initialManagerDeposit.rewardsShares
      .mul(accNxmPerRewardsShareAfter.sub(initialManagerDeposit.lastAccNxmPerRewardShare))
      .div(parseEther('1'))
      .add(initialManagerDeposit.pendingRewards);

    expect(updatedInitialManagerDeposit.rewardsShares).to.equal(expectedRemainingManagerShares);
    expect(updatedInitialManagerDeposit.lastAccNxmPerRewardShare).to.equal(accNxmPerRewardsShareAfter);
    expect(updatedInitialManagerDeposit.pendingRewards).to.equal(managerRewardsBeforeExtend);

    expect(updatedTargetManagerDeposit.rewardsShares).to.equal(aliceManagerSharesPortion.add(newManagerFeeShares));
    expect(updatedTargetManagerDeposit.lastAccNxmPerRewardShare).to.equal(accNxmPerRewardsShareAfter);
    expect(updatedTargetManagerDeposit.pendingRewards).to.equal(0);
  });

  it('updates global stake and reward shares supply', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, fixture.coverSigner);

    const poolFeeDenominator = await stakingPool.POOL_FEE_DENOMINATOR();
    const poolFee = await stakingPool.getPoolFee();

    const activeStake = await stakingPool.getActiveStake();
    const stakeSharesSupplyBefore = await stakingPool.getStakeSharesSupply();
    const rewardsSharesSupplyBefore = await stakingPool.getRewardsSharesSupply();

    const topUpAmount = parseEther('50');
    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount);

    const stakeSharesSupplyAfter = await stakingPool.getStakeSharesSupply();
    const rewardsSharesSupplyAfter = await stakingPool.getRewardsSharesSupply();

    const newShares = topUpAmount.mul(stakeSharesSupplyBefore).div(activeStake);
    const newManagerFeeShares = newShares.mul(poolFee).div(poolFeeDenominator.sub(poolFee));

    const expectedSharesSupplyAfter = stakeSharesSupplyBefore.add(newShares);
    const expectedRewardsSharesSupplyAfter = rewardsSharesSupplyBefore.add(newShares).add(newManagerFeeShares);

    expect(stakeSharesSupplyAfter).to.equal(expectedSharesSupplyAfter);
    expect(rewardsSharesSupplyAfter).to.equal(expectedRewardsSharesSupplyAfter);
  });

  it('transfers increased deposit amount to token controller', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool, nxm, tokenController } = fixture;
    const [user] = fixture.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, fixture.coverSigner);

    const userBalanceBefore = await nxm.balanceOf(user.address);
    const tokenControllerBalanceBefore = await nxm.balanceOf(tokenController.address);

    const topUpAmount = parseEther('50');
    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount);

    const userBalanceAfter = await nxm.balanceOf(user.address);
    const tokenControllerBalanceAfter = await nxm.balanceOf(tokenController.address);
    expect(userBalanceAfter).to.equal(userBalanceBefore.sub(topUpAmount));
    expect(tokenControllerBalanceAfter).to.equal(tokenControllerBalanceBefore.add(topUpAmount));
  });

  it('transfers correctly increased deposit amount if previous deposit exists', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool, nxm, tokenController } = fixture;
    const [user] = fixture.accounts.members;
    const { amount } = depositToFixture;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    // add deposit to new tranche
    await stakingPool.connect(user).depositTo(amount, maxTranche, depositNftId, AddressZero);

    await generateRewards(stakingPool, fixture.coverSigner);

    const userBalanceBefore = await nxm.balanceOf(user.address);
    const tokenControllerBalanceBefore = await nxm.balanceOf(tokenController.address);

    const topUpAmount = parseEther('50');
    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount);

    const userBalanceAfter = await nxm.balanceOf(user.address);
    const tokenControllerBalanceAfter = await nxm.balanceOf(tokenController.address);
    expect(userBalanceAfter).to.equal(userBalanceBefore.sub(topUpAmount));
    expect(tokenControllerBalanceAfter).to.equal(tokenControllerBalanceBefore.add(topUpAmount));
  });

  it('emits DepositExtended, ActiveStakeUpdated and DepositUpdated events', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    const initialActiveStake = await stakingPool.getActiveStake();
    const initialStakeSharesSupply = await stakingPool.getStakeSharesSupply();

    const topUpAmount = parseEther('50');
    const tx = stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount);

    const expectedActiveStake = initialActiveStake.add(topUpAmount);
    const expectedNewStakeShares = topUpAmount.mul(initialStakeSharesSupply).div(initialActiveStake);
    const expectedStakeSharesSupply = initialStakeSharesSupply.add(expectedNewStakeShares);

    await expect(tx)
      .to.emit(stakingPool, 'DepositExtended')
      .withArgs(user.address, depositNftId, firstActiveTrancheId, maxTranche, topUpAmount);

    await expect(tx)
      .to.emit(stakingPool, 'ActiveStakeUpdated')
      .withArgs(expectedActiveStake, expectedStakeSharesSupply);

    await expect(tx)
      .to.emit(stakingPool, 'DepositUpdated')
      .withArgs(depositNftId, firstActiveTrancheId, 0, expectedStakeSharesSupply);

    await expect(tx)
      .to.emit(stakingPool, 'DepositUpdated')
      .withArgs(depositNftId, maxTranche, expectedStakeSharesSupply, expectedStakeSharesSupply);
  });

  it('does not emit DepositExtended if initial tranche is expired', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await increaseTime(TRANCHE_DURATION);

    const topUpAmount = parseEther('50');
    await expect(
      stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount),
    ).to.not.emit(stakingPool, 'DepositExtended');
  });

  it('reverts if pool is private', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;
    const manager = fixture.accounts.defaultSender;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await stakingPool.connect(manager).setPoolPrivacy(true);

    const topUpAmount = parseEther('50');
    await expect(
      stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount),
    ).to.be.revertedWithCustomError(stakingPool, 'PrivatePool');
  });

  it('reverts if pool is private and tranche expired', async function () {
    const fixture = await loadFixture(extendDepositSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;
    const manager = fixture.accounts.defaultSender;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await stakingPool.connect(manager).setPoolPrivacy(true);

    await increaseTime(TRANCHE_DURATION);

    const topUpAmount = parseEther('50');
    await expect(
      stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount),
    ).to.be.revertedWithCustomError(stakingPool, 'PrivatePool');
  });
});
