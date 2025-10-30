const { ethers } = require('hardhat');
const { expect } = require('chai');
const { increaseTime } = require('../utils').evm;

const { getTranches, calculateStakeShares, setTime, TRANCHE_DURATION } = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const { daysToSeconds } = require('../utils').helpers;
const { DIVISION_BY_ZERO } = require('../utils').errors;

const { BigNumber } = ethers;
const { AddressZero, MaxUint256 } = ethers.constants;
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

const managerDepositId = 0;

const DEFAULT_PERIOD = daysToSeconds(30);
const DEFAULT_GRACE_PERIOD = daysToSeconds(30);

async function depositToSetup() {
  const fixture = await loadFixture(setup);
  const { stakingPool, stakingProducts, tokenController } = fixture;
  const { defaultSender: manager } = fixture.accounts;
  const { poolId, initialPoolFee, maxPoolFee, products } = poolInitParams;

  await stakingPool.connect(fixture.stakingProductsSigner).initialize(
    false, // isPrivatePool
    initialPoolFee,
    maxPoolFee,
    poolId,
  );
  await tokenController.setStakingPoolManager(poolId, manager.address);

  await stakingProducts.connect(fixture.stakingProductsSigner).setInitialProducts(poolId, products);

  // Move to the beginning of the next tranche
  const { firstActiveTrancheId: trancheId } = await getTranches();
  await setTime((trancheId + 1) * TRANCHE_DURATION);

  return fixture;
}

describe('depositTo', function () {
  it('reverts if system is paused', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool, master } = fixture;
    const [user] = fixture.accounts.members;

    const { amount, tokenId, destination } = depositToFixture;
    const { firstActiveTrancheId: trancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    // enable emergency pause
    await master.setEmergencyPause(true);

    await expect(
      stakingPool.connect(user).depositTo(amount, trancheId, tokenId, destination),
    ).to.be.revertedWithCustomError(stakingPool, 'SystemPaused');
  });

  it('reverts if caller is not manager when pool is private', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool, nxm, tokenController } = fixture;
    const manager = fixture.accounts.defaultSender;
    const [user] = fixture.accounts.members;

    const { amount, tokenId, destination } = depositToFixture;
    const { firstActiveTrancheId: trancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    await stakingPool.connect(manager).setPoolPrivacy(true);

    await expect(
      stakingPool.connect(user).depositTo(amount, trancheId, tokenId, destination),
    ).to.be.revertedWithCustomError(stakingPool, 'PrivatePool');

    await nxm.mint(manager.address, amount);
    await nxm.connect(manager).approve(tokenController.address, amount);

    await nxm.mint(manager.address, amount);
    await nxm.connect(manager).approve(tokenController.address, amount);

    await expect(stakingPool.connect(manager).depositTo(amount, trancheId, tokenId, destination)).to.not.be.reverted;
  });

  it('reverts if deposit amount is 0', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;
    const { trancheId, tokenId, destination } = depositToFixture;

    await expect(stakingPool.connect(user).depositTo(0, trancheId, tokenId, destination)).to.be.revertedWithCustomError(
      stakingPool,
      'InsufficientDepositAmount',
    );
  });

  it('reverts if tranche id is not active', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const { maxTranche } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);
    const trancheId = maxTranche + 1;

    await expect(
      stakingPool.connect(user).depositTo(amount, trancheId, tokenId, destination),
    ).to.be.revertedWithCustomError(stakingPool, 'RequestedTrancheIsNotYetActive');
  });

  it('reverts if requested tranche expired', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);
    const trancheId = firstActiveTrancheId - 2;

    await expect(
      stakingPool.connect(user).depositTo(amount, trancheId, tokenId, destination),
    ).to.be.revertedWithCustomError(stakingPool, 'RequestedTrancheIsExpired');
  });

  it('mints a new nft if token id is 0', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool, stakingNFT } = fixture;
    const [user] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const totalSupplyBefore = await stakingNFT.totalSupply();
    expect(totalSupplyBefore).to.equal(0);

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);
    const tx = await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    const expectedMintedTokenId = 1;
    await expect(tx).to.emit(stakingNFT, 'Transfer').withArgs(AddressZero, user.address, expectedMintedTokenId);

    const totalSupplyAfter = await stakingNFT.totalSupply();
    expect(totalSupplyAfter).to.equal(1);

    const owner = await stakingNFT.ownerOf(expectedMintedTokenId);
    expect(owner).to.equal(user.address);
  });

  it('mints a new nft to destination if token id is 0', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool, stakingNFT } = fixture;
    const [user1, user2] = fixture.accounts.members;
    const { amount, tokenId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    const totalSupplyBefore = await stakingNFT.totalSupply();
    expect(totalSupplyBefore).to.equal(0);

    const tx = await stakingPool.connect(user1).depositTo(amount, firstActiveTrancheId, tokenId, user2.address);

    const expectedMintedTokenId = 1;
    await expect(tx).to.emit(stakingNFT, 'Transfer').withArgs(AddressZero, user2.address, expectedMintedTokenId);

    const totalSupplyAfter = await stakingNFT.totalSupply();
    expect(totalSupplyAfter).to.equal(1);

    const owner = await stakingNFT.ownerOf(expectedMintedTokenId);
    expect(owner).to.equal(user2.address);
  });

  it('register deposit to the new nft', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool, stakingNFT } = fixture;
    const [user] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);
    const newShares = await calculateStakeShares(stakingPool, amount);

    const expectedTokenId = 1;
    const tx = await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);
    await expect(tx).to.emit(stakingNFT, 'Transfer').withArgs(AddressZero, user.address, expectedTokenId);

    const deposit = await stakingPool.deposits(expectedTokenId, firstActiveTrancheId);

    expect(deposit.pendingRewards).to.equal(0);
    expect(deposit.lastAccNxmPerRewardShare).to.equal(0);
    expect(deposit.stakeShares).to.equal(newShares);
    expect(deposit.rewardsShares).to.equal(newShares);
  });

  it('register deposit to an existing nft', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool, stakingNFT } = fixture;
    const [user] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    // first deposit
    const tx = await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    const expectedTokenId = 1;
    await expect(tx).to.emit(stakingNFT, 'Transfer').withArgs(AddressZero, user.address, expectedTokenId);

    const firstDepositData = await stakingPool.deposits(expectedTokenId, firstActiveTrancheId);
    const newShares = await calculateStakeShares(stakingPool, amount);

    // deposit to the same tokenId
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, expectedTokenId, destination);

    const updatedDepositData = await stakingPool.deposits(expectedTokenId, firstActiveTrancheId);

    expect(updatedDepositData.pendingRewards).to.equal(0);
    expect(updatedDepositData.lastAccNxmPerRewardShare).to.equal(0);
    expect(updatedDepositData.stakeShares).to.equal(firstDepositData.stakeShares.add(newShares));
    expect(updatedDepositData.rewardsShares).to.equal(firstDepositData.rewardsShares.add(newShares));
  });

  it('reverts deposit to an existing nft that msg.sender is not an owner of / approved for', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool, stakingNFT } = fixture;
    const [user1, user2] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    // user1 first deposit
    const tx = await stakingPool.connect(user1).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    const expectedTokenId = 1;
    await expect(tx).to.emit(stakingNFT, 'Transfer').withArgs(AddressZero, user1.address, expectedTokenId);

    // user2 deposit to the same tokenId
    await expect(
      stakingPool.connect(user2).depositTo(amount, firstActiveTrancheId, expectedTokenId, destination),
    ).to.be.revertedWithCustomError(stakingPool, 'NotTokenOwnerOrApproved');
  });

  it('updates deposit pendingRewards and lastAccNxmPerRewardShare', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    // Generate rewards
    const allocationRequest = {
      productId: 0,
      coverId: 0,
      period: daysToSeconds(30),
      gracePeriod: daysToSeconds(30),
      useFixedPrice: false,
      capacityRatio: 20000,
      capacityReductionRatio: 0,
      rewardRatio: 5000,
      productMinPrice: 10000,
    };

    const { firstActiveTrancheId } = await getTranches(allocationRequest.period, allocationRequest.gracePeriod);

    // first deposit
    const expectedTokenId = 1;
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);
    const depositData = await stakingPool.deposits(expectedTokenId, firstActiveTrancheId);

    expect(depositData.lastAccNxmPerRewardShare).to.equal(0);
    expect(depositData.pendingRewards).to.equal(0);

    const coverAmount = parseEther('1');
    await stakingPool.connect(fixture.coverSigner).requestAllocation(coverAmount, allocationRequest);
    await increaseTime(daysToSeconds(20));

    // Second deposit
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, expectedTokenId, destination);
    const secondDepositData = await stakingPool.deposits(expectedTokenId, firstActiveTrancheId);
    const secondAccNxmPerRewardsShare = await stakingPool.getAccNxmPerRewardsShare();

    expect(secondDepositData.lastAccNxmPerRewardShare).to.not.equal(0);
    expect(secondDepositData.lastAccNxmPerRewardShare).to.equal(secondAccNxmPerRewardsShare);
    expect(secondDepositData.pendingRewards).to.not.equal(0);
    expect(secondDepositData.pendingRewards).to.equal(
      depositData.rewardsShares
        .mul(secondDepositData.lastAccNxmPerRewardShare.sub(depositData.lastAccNxmPerRewardShare))
        .div(parseEther('1')),
    );

    // Last deposit
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, expectedTokenId, destination);
    const lastDepositData = await stakingPool.deposits(expectedTokenId, firstActiveTrancheId);
    const lastAccNxmPerRewardsShare = await stakingPool.getAccNxmPerRewardsShare();

    expect(lastDepositData.lastAccNxmPerRewardShare).to.not.equal(0);
    expect(lastDepositData.lastAccNxmPerRewardShare).to.equal(lastAccNxmPerRewardsShare);
    expect(lastDepositData.pendingRewards).to.not.equal(0);

    const accDiff = lastDepositData.lastAccNxmPerRewardShare.sub(secondDepositData.lastAccNxmPerRewardShare);
    const newRewards = secondDepositData.rewardsShares.mul(accDiff).div(parseEther('1'));
    const expectedPendingRewards = secondDepositData.pendingRewards.add(newRewards);
    expect(lastDepositData.pendingRewards).to.equal(expectedPendingRewards);
  });

  it('updates global variables accNxmPerRewardsShare and lastAccNxmUpdate', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const allocationRequest = {
      productId: 0,
      coverId: 0,
      period: daysToSeconds(30),
      gracePeriod: daysToSeconds(30),
      useFixedPrice: false,
      capacityRatio: 20000,
      capacityReductionRatio: 0,
      rewardRatio: 5000,
      productMinPrice: 10000,
    };

    const { firstActiveTrancheId } = await getTranches(allocationRequest.period, allocationRequest.gracePeriod);

    // first deposit
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    {
      const accNxmPerRewardsShare = await stakingPool.getAccNxmPerRewardsShare();
      const lastAccNxmUpdate = await stakingPool.getLastAccNxmUpdate();
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

      expect(accNxmPerRewardsShare).to.equal(0);
      expect(lastAccNxmUpdate).to.equal(currentTime);
    }

    // Generate rewards
    const coverAmount = parseEther('1');
    await stakingPool.connect(fixture.coverSigner).requestAllocation(coverAmount, allocationRequest);
    await increaseTime(daysToSeconds(20));

    // Second deposit
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    {
      const accNxmPerRewardsShare = await stakingPool.getAccNxmPerRewardsShare();
      const lastAccNxmUpdate = await stakingPool.getLastAccNxmUpdate();
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

      const depositData = await stakingPool.deposits(tokenId, firstActiveTrancheId);

      expect(accNxmPerRewardsShare).to.not.equal(0);
      expect(accNxmPerRewardsShare).to.equal(depositData.lastAccNxmPerRewardShare);
      expect(lastAccNxmUpdate).to.equal(currentTime);
    }
  });

  it('should not revert with division by zero', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const allocationRequest = {
      productId: 0,
      coverId: 0,
      period: daysToSeconds(30),
      gracePeriod: daysToSeconds(30),
      useFixedPrice: false,
      capacityRatio: 20000,
      capacityReductionRatio: 0,
      rewardRatio: 5000,
      productMinPrice: 10000,
    };

    const { firstActiveTrancheId } = await getTranches(allocationRequest.period, allocationRequest.gracePeriod);

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    const coverAmount = parseEther('1');
    await stakingPool.connect(fixture.coverSigner).requestAllocation(coverAmount, allocationRequest);

    await increaseTime(daysToSeconds(150));

    await expect(
      stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination),
    ).to.not.revertedWithPanic(DIVISION_BY_ZERO);
  });

  it('updates global variables activeStake, stakeSharesSupply and rewardsSharesSupply', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    {
      const activeStake = await stakingPool.getActiveStake();
      const stakeSharesSupply = await stakingPool.getStakeSharesSupply();
      const rewardsSharesSupply = await stakingPool.getRewardsSharesSupply();

      expect(activeStake).to.equal(0);
      expect(stakeSharesSupply).to.equal(0);
      expect(rewardsSharesSupply).to.equal(0);
    }

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    {
      const expectedTokenId = 1;
      const userDeposit = await stakingPool.deposits(expectedTokenId, firstActiveTrancheId);
      const managerDeposit = await stakingPool.deposits(managerDepositId, firstActiveTrancheId);

      const activeStake = await stakingPool.getActiveStake();
      const stakeSharesSupply = await stakingPool.getStakeSharesSupply();
      const rewardsSharesSupply = await stakingPool.getRewardsSharesSupply();

      expect(activeStake).to.equal(amount);
      expect(stakeSharesSupply).to.equal(userDeposit.stakeShares);
      expect(rewardsSharesSupply).to.equal(userDeposit.rewardsShares.add(managerDeposit.rewardsShares));
    }
  });

  it('updates pool manager rewards shares', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool } = fixture;
    const { POOL_FEE_DENOMINATOR } = fixture.config;
    const [user] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;
    const { initialPoolFee } = poolInitParams;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    {
      const managerDeposit = await stakingPool.deposits(managerDepositId, firstActiveTrancheId);
      expect(managerDeposit.rewardsShares).to.equal(0);
    }

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    {
      const expectedTokenId = 1;
      const userDeposit = await stakingPool.deposits(expectedTokenId, firstActiveTrancheId);
      const managerDeposit = await stakingPool.deposits(managerDepositId, firstActiveTrancheId);

      const totalRewardShares = userDeposit.rewardsShares.add(managerDeposit.rewardsShares);
      const expectedManagerRewardsShares = totalRewardShares.mul(initialPoolFee).div(POOL_FEE_DENOMINATOR);
      expect(managerDeposit.rewardsShares).to.equal(expectedManagerRewardsShares);
    }
  });

  it('updates tranche stake and reward shares', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    {
      const tranche = await stakingPool.getTranche(firstActiveTrancheId);
      expect(tranche.stakeShares).to.equal(0);
      expect(tranche.rewardsShares).to.equal(0);
    }

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    {
      const expectedTokenId = 1;
      const userDeposit = await stakingPool.deposits(expectedTokenId, firstActiveTrancheId);
      const managerDeposit = await stakingPool.deposits(managerDepositId, firstActiveTrancheId);

      const tranche = await stakingPool.getTranche(firstActiveTrancheId);
      expect(tranche.stakeShares).to.equal(userDeposit.stakeShares);
      expect(tranche.rewardsShares).to.equal(userDeposit.rewardsShares.add(managerDeposit.rewardsShares));
    }
  });

  it('transfer staked nxm to token controller contract', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool, nxm, tokenController } = fixture;
    const [user] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    const userBalanceBefore = await nxm.balanceOf(user.address);
    const tokenControllerBalanceBefore = await nxm.balanceOf(tokenController.address);

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    const userBalanceAfter = await nxm.balanceOf(user.address);
    const tokenControllerBalanceAfter = await nxm.balanceOf(tokenController.address);
    expect(userBalanceAfter).to.equal(userBalanceBefore.sub(amount));
    expect(tokenControllerBalanceAfter).to.equal(tokenControllerBalanceBefore.add(amount));
  });

  it('allows to deposit to multiple tranches', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool, nxm, tokenController } = fixture;
    const { POOL_FEE_DENOMINATOR } = fixture.config;
    const [user] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;
    const { initialPoolFee } = poolInitParams;

    const { firstActiveTrancheId, maxTranche } = await getTranches(daysToSeconds(0), DEFAULT_GRACE_PERIOD);

    const tranches = Array(maxTranche - firstActiveTrancheId)
      .fill(0)
      .map((e, i) => firstActiveTrancheId + i);

    const userBalanceBefore = await nxm.balanceOf(user.address);
    const tokenControllerBalanceBefore = await nxm.balanceOf(tokenController.address);

    const depositToParams = tranches.map(trancheId =>
      stakingPool.interface.encodeFunctionData('depositTo', [amount, trancheId, tokenId, destination]),
    );

    await stakingPool.connect(user).multicall(depositToParams);

    const totalAmount = amount.mul(tranches.length);

    const userBalanceAfter = await nxm.balanceOf(user.address);
    const tokenControllerBalanceAfter = await nxm.balanceOf(tokenController.address);
    expect(userBalanceAfter).to.equal(userBalanceBefore.sub(totalAmount));
    expect(tokenControllerBalanceAfter).to.equal(tokenControllerBalanceBefore.add(totalAmount));

    let totalStakeShares = BigNumber.from(0);
    let stakedAmount = BigNumber.from(0);

    for (let tokenId = 1; tokenId < tranches.length; tokenId++) {
      const trancheId = tranches[tokenId - 1];
      const deposit = await stakingPool.deposits(tokenId, trancheId);

      const newShares =
        tokenId === 1
          ? Math.sqrt(amount) // first deposit uses sqrt(amount)
          : amount.mul(totalStakeShares).div(stakedAmount);

      expect(deposit.pendingRewards).to.equal(0);
      expect(deposit.lastAccNxmPerRewardShare).to.equal(0);
      expect(deposit.stakeShares).to.equal(newShares);
      expect(deposit.rewardsShares).to.equal(newShares);

      const managerDeposit = await stakingPool.deposits(managerDepositId, trancheId);

      const stakersRewardSharesRatio = POOL_FEE_DENOMINATOR - initialPoolFee;
      const expectedManagerRewardsShares = deposit.rewardsShares.mul(initialPoolFee).div(stakersRewardSharesRatio);
      expect(managerDeposit.rewardsShares).to.equal(expectedManagerRewardsShares);

      const tranche = await stakingPool.getTranche(trancheId);
      expect(tranche.stakeShares).to.equal(deposit.stakeShares);
      expect(tranche.rewardsShares).to.equal(deposit.rewardsShares.add(managerDeposit.rewardsShares));

      stakedAmount = stakedAmount.add(amount);
      totalStakeShares = totalStakeShares.add(deposit.stakeShares);
    }
  });

  it('emits StakeDeposited, DepositUpdated, TrancheUpdated and ActiveStakeUpdated events', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    const expectedActiveStake = amount;
    const expectedStakeSharesSupply = Math.sqrt(amount);

    const expectedTokenId = 1;
    const tx = stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    await expect(tx)
      .to.emit(stakingPool, 'StakeDeposited')
      .withArgs(user.address, amount, firstActiveTrancheId, expectedTokenId);

    await expect(tx)
      .to.emit(stakingPool, 'ActiveStakeUpdated')
      .withArgs(expectedActiveStake, expectedStakeSharesSupply);

    await expect(tx)
      .to.emit(stakingPool, 'DepositUpdated')
      .withArgs(expectedTokenId, firstActiveTrancheId, expectedStakeSharesSupply, expectedStakeSharesSupply);

    await expect(tx)
      .to.emit(stakingPool, 'TrancheUpdated')
      .withArgs(firstActiveTrancheId, expectedStakeSharesSupply, expectedStakeSharesSupply);
  });

  it('reverts if provided tokenId is not valid', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;
    const { amount, destination } = depositToFixture;

    const invalidTokenId = 127;
    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    {
      const tranche = await stakingPool.getTranche(firstActiveTrancheId);
      expect(tranche.stakeShares).to.equal(0);
      expect(tranche.rewardsShares).to.equal(0);
    }

    await expect(
      stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, invalidTokenId, destination),
    ).to.be.revertedWith('NOT_MINTED');
  });

  it('multicall should bubble up string revert', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;
    const { amount, destination } = depositToFixture;

    const invalidTokenId = 127;
    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    const depositToData = stakingPool.interface.encodeFunctionData('depositTo', [
      amount,
      firstActiveTrancheId,
      invalidTokenId,
      destination,
    ]);

    await expect(stakingPool.connect(user).multicall([depositToData])).to.be.revertedWith('NOT_MINTED');
  });

  it('should revert if trying to deposit, while nxm is locked for governance vote', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool, nxm } = fixture;
    const [user] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    // Simulate member vote lock
    await nxm.setLock(user.address, 1e6);

    const depositToData = stakingPool.interface.encodeFunctionData('depositTo', [
      amount,
      firstActiveTrancheId,
      tokenId,
      destination,
    ]);

    await expect(stakingPool.connect(user).multicall([depositToData])).to.be.revertedWithCustomError(
      stakingPool,
      'NxmIsLockedForGovernanceVote',
    );
  });

  it('should not revert if manager is trying to deposit, while nxm is locked for governance vote', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool, nxm, tokenController } = fixture;
    const manager = fixture.accounts.defaultSender;
    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    await nxm.mint(manager.address, amount);
    await nxm.connect(manager).approve(tokenController.address, MaxUint256);

    const managerBalanceBefore = await nxm.balanceOf(manager.address);
    const tokenControllerBalanceBefore = await nxm.balanceOf(tokenController.address);

    // Simulate member vote lock
    await nxm.setLock(manager.address, 1e6);
    await stakingPool.connect(manager).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    const managerBalanceAfter = await nxm.balanceOf(manager.address);
    const tokenControllerBalanceAfter = await nxm.balanceOf(tokenController.address);
    expect(managerBalanceAfter).to.equal(managerBalanceBefore.sub(amount));
    expect(tokenControllerBalanceAfter).to.equal(tokenControllerBalanceBefore.add(amount));
  });

  it('should revert if trying to deposit with token from other pool', async function () {
    const fixture = await loadFixture(depositToSetup);
    const { stakingPool, stakingNFT } = fixture;
    const [user] = fixture.accounts.members;

    const { amount, destination } = depositToFixture;
    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    const poolId = await stakingPool.getPoolId();

    // mint a token belonging to a different pool
    await stakingNFT.mint(poolId.add(1), user.address);
    const tokenId = await stakingNFT.totalSupply();

    await expect(
      stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination),
    ).to.be.revertedWithCustomError(stakingPool, 'InvalidStakingPoolForToken');
  });
});
