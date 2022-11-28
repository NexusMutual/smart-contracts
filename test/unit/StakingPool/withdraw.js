const { parseEther } = require('ethers/lib/utils');
const { ethers, expect } = require('hardhat');
const { daysToSeconds } = require('../../../lib/helpers');
const { setEtherBalance, increaseTime, mineNextBlock } = require('../../utils/evm');
const { getTranches, TRANCHE_DURATION, getNewRewardShares } = require('./helpers');

describe('withdraw', function () {
  const product0 = {
    productId: 0,
    weight: 100,
    initialPrice: '500',
    targetPrice: '500',
  };

  const initializeParams = {
    poolId: 0,
    isPrivatePool: false,
    initialPoolFee: 5, // 5%
    maxPoolFee: 5, // 5%
    productInitializationParams: [product0],
  };

  const depositToFixture = {
    poolId: 0,
    initialPoolFee: 5, // 5%
    maxPoolFee: 5, // 5%
    productInitializationParams: [
      {
        productId: 0,
        weight: 100,
        initialPrice: 500,
        targetPrice: 500,
      },
    ],
    amount: parseEther('100'),
    trancheId: 0,
    tokenId: 0,
    destination: ethers.constants.AddressZero,
    depositNftId: 1,
  };

  // Rewards allocation
  const allocationRequest = {
    productId: 0,
    coverId: 0,
    amount: depositToFixture.amount,
    period: daysToSeconds(10),
  };

  const allocationConfig = {
    gracePeriod: daysToSeconds(10),
    globalCapacityRatio: 20000,
    capacityReductionRatio: 0,
    rewardRatio: 5000,
    globalMinPrice: 10000,
  };

  beforeEach(async function () {
    const {
      stakingPool,
      cover,
      accounts: { defaultSender: manager },
    } = this;

    const { poolId, initialPoolFee, maxPoolFee, productInitializationParams, isPrivatePool } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    await stakingPool
      .connect(coverSigner)
      .initialize(manager.address, isPrivatePool, initialPoolFee, maxPoolFee, productInitializationParams, poolId);
  });

  it('reverts if trying to withdraw stake locked in governance', async function () {
    const {
      nxm,
      stakingPool,
      accounts: {
        defaultSender: manager,
        members: [user],
      },
    } = this;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId,
        destination,
      },
    ]);

    await increaseTime(TRANCHE_DURATION);

    // Simulate manager lock in governance
    await nxm.setLock(manager.address, 1e6);

    const withdrawStake = true;
    const withdrawRewards = true;
    const trancheIds = [firstActiveTrancheId];

    await expect(
      stakingPool.connect(user).withdraw([{ tokenId, withdrawStake, withdrawRewards, trancheIds }]),
    ).to.be.revertedWith(
      'StakingPool: While the pool manager is locked for governance voting only rewards can be withdrawn',
    );
  });

  it('allows to withdraw only stake', async function () {
    const {
      nxm,
      cover,
      stakingPool,
      tokenController,
      accounts: {
        members: [user],
      },
    } = this;

    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId,
        destination,
      },
    ]);

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);

    await stakingPool.connect(coverSigner).allocateCapacity(allocationRequest, allocationConfig);

    await increaseTime(TRANCHE_DURATION);

    const withdrawStake = true;
    const withdrawRewards = false;
    const trancheIds = [firstActiveTrancheId];

    const depositBefore = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const userBalanceBefore = await nxm.balanceOf(user.address);
    const TCbalanceBefore = await nxm.balanceOf(tokenController.address);

    await stakingPool.connect(user).withdraw([{ tokenId: depositNftId, withdrawStake, withdrawRewards, trancheIds }]);

    const depositAfter = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const userBalanceAfter = await nxm.balanceOf(user.address);
    const TCbalanceAfter = await nxm.balanceOf(tokenController.address);

    expect(depositBefore.stakeShares).to.be.eq(Math.sqrt(amount));
    expect(depositAfter.stakeShares).to.be.eq(0);

    expect(TCbalanceBefore).to.be.eq(amount);
    expect(TCbalanceAfter).to.be.eq(0);

    expect(userBalanceAfter).to.be.eq(userBalanceBefore.add(amount));
  });

  it('allows to withdraw only rewards', async function () {
    const {
      nxm,
      cover,
      stakingPool,
      tokenController,
      accounts: {
        members: [user],
      },
    } = this;

    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId,
        destination,
      },
    ]);

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);

    const withdrawStake = false;
    const withdrawRewards = true;
    const trancheIds = [firstActiveTrancheId];

    const depositBefore = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const userBalanceBefore = await nxm.balanceOf(user.address);
    const TCbalanceBefore = await nxm.balanceOf(tokenController.address);

    const rewardShares = await getNewRewardShares({
      stakingPool,
      initialStakeShares: 0,
      stakeSharesIncrease: depositBefore.stakeShares,
      initialTrancheId: firstActiveTrancheId,
      newTrancheId: firstActiveTrancheId,
    });
    await stakingPool.connect(coverSigner).allocateCapacity(allocationRequest, allocationConfig);

    await increaseTime(TRANCHE_DURATION);

    await stakingPool.connect(user).withdraw([{ tokenId: depositNftId, withdrawStake, withdrawRewards, trancheIds }]);

    const depositAfter = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const userBalanceAfter = await nxm.balanceOf(user.address);
    const TCbalanceAfter = await nxm.balanceOf(tokenController.address);

    expect(depositBefore.rewardsShares).to.be.eq(rewardShares);
    expect(depositAfter.rewardsShares).to.be.eq(0);

    expect(TCbalanceBefore).to.be.eq(amount);
    const { accNxmPerRewardShareAtExpiry } = await stakingPool.expiredTranches(firstActiveTrancheId);
    const rewardsWithdrawn = depositBefore.rewardsShares
      .mul(accNxmPerRewardShareAtExpiry.sub(depositBefore.lastAccNxmPerRewardShare))
      .add(depositBefore.pendingRewards);
    expect(TCbalanceAfter).to.be.eq(TCbalanceBefore.sub(rewardsWithdrawn));

    expect(userBalanceAfter).to.be.eq(userBalanceBefore.add(rewardsWithdrawn));
  });

  it('allows to withdraw stake only if tranche is expired', async function () {
    const {
      tokenController,
      nxm,
      stakingPool,
      accounts: {
        members: [user],
      },
    } = this;

    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId,
        destination,
      },
    ]);

    const withdrawStake = true;
    const withdrawRewards = false;
    const trancheIds = [firstActiveTrancheId];

    const depositBefore = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const userBalanceBefore = await nxm.balanceOf(user.address);
    const TCbalanceBefore = await nxm.balanceOf(tokenController.address);

    await stakingPool.connect(user).withdraw([{ tokenId: depositNftId, withdrawStake, withdrawRewards, trancheIds }]);

    const depositAfter = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const userBalanceAfter = await nxm.balanceOf(user.address);
    const TCbalanceAfter = await nxm.balanceOf(tokenController.address);

    expect(depositBefore.stakeShares).to.be.eq(depositAfter.stakeShares);
    expect(userBalanceBefore).to.be.eq(userBalanceAfter);
    expect(TCbalanceBefore).to.be.eq(TCbalanceAfter);
  });

  it('allows to withdraw stake and rewards from multiple tranches', async function () {
    const {
      nxm,
      cover,
      stakingPool,
      tokenController,
      accounts: {
        members: [user],
      },
    } = this;

    const { amount, tokenId, destination, depositNftId } = depositToFixture;
    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    const TRANCHES_NUMBER = 5;

    const withdrawStake = false;
    const withdrawRewards = true;
    const trancheIds = [];

    const userBalanceBefore = await nxm.balanceOf(user.address);
    const TCbalanceBefore = await nxm.balanceOf(tokenController.address);

    for (let i = 0; i < TRANCHES_NUMBER; i++) {
      const { firstActiveTrancheId: currentTranche } = await getTranches();

      await stakingPool.connect(user).depositTo([
        {
          amount,
          trancheId: currentTranche,
          tokenId,
          destination,
        },
      ]);

      trancheIds.push(currentTranche);
      await stakingPool.connect(coverSigner).allocateCapacity(allocationRequest, allocationConfig);
      await increaseTime(TRANCHE_DURATION);
      await mineNextBlock();
    }

    await increaseTime(TRANCHE_DURATION);
    await mineNextBlock();

    const lastTranche = trancheIds[TRANCHES_NUMBER - 1];
    const depositBefore = await stakingPool.deposits(depositNftId, trancheIds[0]);

    await stakingPool.connect(user).withdraw([{ tokenId: depositNftId, withdrawStake, withdrawRewards, trancheIds }]);

    const depositAfter = await stakingPool.deposits(depositNftId, lastTranche);
    const userBalanceAfter = await nxm.balanceOf(user.address);

    expect(depositAfter.rewardsShares).to.be.eq(0);

    expect(TCbalanceBefore).to.be.eq(0);
    const { accNxmPerRewardShareAtExpiry } = await stakingPool.expiredTranches(lastTranche);
    // const rewardsWithdrawn = depositBefore.rewardsShares
    //   .mul(accNxmPerRewardShareAtExpiry.sub(depositBefore.lastAccNxmPerRewardShare))
    //   .add(depositBefore.pendingRewards);

    // expect(userBalanceAfter).to.be.eq(userBalanceBefore.add(rewardsWithdrawn));
  });

  it('update tranches', async function () {
    const {
      cover,
      stakingPool,
      accounts: {
        members: [user],
      },
    } = this;

    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId,
        destination,
      },
    ]);

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);

    const withdrawStake = false;
    const withdrawRewards = true;
    const trancheIds = [firstActiveTrancheId];

    const activeStakeBefore = await stakingPool.activeStake();
    const accNxmPerRewardsShareBefore = await stakingPool.accNxmPerRewardsShare();
    const lastAccNxmUpdateBefore = await stakingPool.lastAccNxmUpdate();
    const stakeSharesSupplyBefore = await stakingPool.stakeSharesSupply();
    const rewardsSharesSupplyBefore = await stakingPool.rewardsSharesSupply();

    await stakingPool.connect(coverSigner).allocateCapacity(allocationRequest, allocationConfig);

    await increaseTime(TRANCHE_DURATION);
    await mineNextBlock();

    await stakingPool.connect(user).withdraw([{ tokenId: depositNftId, withdrawStake, withdrawRewards, trancheIds }]);

    const activeStakeAfter = await stakingPool.activeStake();
    const accNxmPerRewardsShareAfter = await stakingPool.accNxmPerRewardsShare();
    const lastAccNxmUpdateAfter = await stakingPool.lastAccNxmUpdate();
    const stakeSharesSupplyAfter = await stakingPool.stakeSharesSupply();
    const rewardsSharesSupplyAfter = await stakingPool.rewardsSharesSupply();

    expect(activeStakeAfter).to.not.eq(activeStakeBefore);
    expect(accNxmPerRewardsShareAfter).to.not.eq(accNxmPerRewardsShareBefore);
    expect(lastAccNxmUpdateAfter).to.not.eq(lastAccNxmUpdateBefore);
    expect(stakeSharesSupplyAfter).to.not.eq(stakeSharesSupplyBefore);
    expect(rewardsSharesSupplyAfter).to.not.eq(rewardsSharesSupplyBefore);
  });

  it('anyone can call to withdraw stake and rewards for a token id', async function () {
    const {
      cover,
      stakingPool,
      accounts: {
        members: [user],
        nonMembers: [randomUser],
      },
    } = this;

    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId,
        destination,
      },
    ]);

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);

    const withdrawStake = true;
    const withdrawRewards = false;
    const trancheIds = [firstActiveTrancheId];

    await stakingPool.connect(coverSigner).allocateCapacity(allocationRequest, allocationConfig);

    await increaseTime(TRANCHE_DURATION);

    expect(
      await stakingPool
        .connect(randomUser)
        .withdraw([{ tokenId: depositNftId, withdrawStake, withdrawRewards, trancheIds }]),
    ).to.not.be.reverted;
  });

  it('should emit some event', async function () {
    const {
      nxm,
      cover,
      stakingPool,
      accounts: {
        members: [user],
      },
    } = this;

    const { amount, tokenId, destination, depositNftId } = depositToFixture;
    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    const TRANCHES_NUMBER = 3;

    const withdrawStake = true;
    const withdrawRewards = true;
    const trancheIds = [];

    for (let i = 0; i < TRANCHES_NUMBER; i++) {
      const { firstActiveTrancheId: currentTranche } = await getTranches();

      await stakingPool.connect(user).depositTo([
        {
          amount,
          trancheId: currentTranche,
          tokenId,
          destination,
        },
      ]);

      trancheIds.push(currentTranche);
      await stakingPool.connect(coverSigner).allocateCapacity(allocationRequest, allocationConfig);
      await increaseTime(TRANCHE_DURATION);
      await mineNextBlock();
    }

    await increaseTime(TRANCHE_DURATION);
    await mineNextBlock();

    const lastTranche = trancheIds[TRANCHES_NUMBER - 1];
    const depositBefore = await stakingPool.deposits(depositNftId, trancheIds[0]);

    const rewardShares = await getNewRewardShares({
      stakingPool,
      initialStakeShares: 0,
      stakeSharesIncrease: depositBefore.stakeShares,
      initialTrancheId: trancheIds[0],
      newTrancheId: lastTranche,
    });

    await expect(
      stakingPool.connect(user).withdraw([{ tokenId: depositNftId, withdrawStake, withdrawRewards, trancheIds }]),
    )
      .to.emit(stakingPool, 'Withdraw')
      //.withArgs(user.address, depositNftId, trancheIds[0], 0, 0)
      .emit(stakingPool, 'Withdraw')
      //.withArgs(user.address, depositNftId, trancheIds[1], 0, 0)
      .emit(stakingPool, 'Withdraw');
    //.withArgs(user.address, depositNftId, trancheIds[2], 0, 0);
  });
});
