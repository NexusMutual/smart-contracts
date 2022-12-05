const { BigNumber } = require('ethers');
const { parseEther } = require('ethers/lib/utils');
const { ethers, expect } = require('hardhat');
const { daysToSeconds } = require('../../../lib/helpers');
const { setEtherBalance, increaseTime, mineNextBlock } = require('../../utils/evm');
const {
  getTranches,
  TRANCHE_DURATION,
  getNewRewardShares,
  calculateStakeAndRewardsWithdrawAmounts,
} = require('./helpers');

describe.only('withdraw', function () {
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
    ipfsDescriptionHash: 'Description Hash',
  };

  // FIXME: Amount of NXM to be minted before their use as rewards on withdrawal events
  const nxmRewards = parseEther('10');

  const depositToFixture = {
    ...initializeParams,
    amount: parseEther('100'),
    trancheId: 0,
    tokenId: 1,
    destination: ethers.constants.AddressZero,
    depositNftId: 1,
  };

  // Rewards allocation
  const allocationRequest = {
    productId: 0,
    coverId: 0,
    period: daysToSeconds(10),
    gracePeriod: daysToSeconds(10),
    previousStart: 0,
    previousExpiration: 0,
    previousRewardsRatio: 5000,
    useFixedPrice: false,
    globalCapacityRatio: 20000,
    capacityReductionRatio: 0,
    rewardRatio: 5000,
    globalMinPrice: 10000,
  };

  beforeEach(async function () {
    const {
      stakingPool,
      cover,
      tokenController,
      accounts: {
        defaultSender: manager,
        internalContracts: [internal],
      },
    } = this;

    const { poolId, initialPoolFee, maxPoolFee, productInitializationParams, isPrivatePool, ipfsDescriptionHash } =
      initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    await stakingPool
      .connect(coverSigner)
      .initialize(
        manager.address,
        isPrivatePool,
        initialPoolFee,
        maxPoolFee,
        productInitializationParams,
        poolId,
        ipfsDescriptionHash,
      );

    const internalSigner = await ethers.getImpersonatedSigner(internal.address);

    await tokenController.connect(internalSigner).mintStakingPoolNXMRewards(nxmRewards, initializeParams.poolId);
  });

  it('reverts if trying to withdraw stake locked in governance', async function () {
    const { nxm, stakingPool } = this;
    const manager = this.accounts.defaultSender;
    const [user] = this.accounts.members;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId: 0, // new position,
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
    const { nxm, cover, stakingPool } = this;
    const [user] = this.accounts.members;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId: 0, // new position
        destination,
      },
    ]);

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await stakingPool.connect(coverSigner).requestAllocation(amount, 0, allocationRequest);

    await increaseTime(TRANCHE_DURATION);

    const withdrawStake = true;
    const withdrawRewards = false;
    const trancheIds = [firstActiveTrancheId];

    const depositBefore = await stakingPool.deposits(tokenId, firstActiveTrancheId);
    const userBalanceBefore = await nxm.balanceOf(user.address);

    await stakingPool.connect(user).withdraw([{ tokenId, withdrawStake, withdrawRewards, trancheIds }]);

    const depositAfter = await stakingPool.deposits(tokenId, firstActiveTrancheId);
    const userBalanceAfter = await nxm.balanceOf(user.address);

    expect(depositBefore.stakeShares).to.be.eq(Math.sqrt(amount));
    expect(depositAfter.stakeShares).to.be.eq(0);
    expect(userBalanceAfter).to.be.eq(userBalanceBefore.add(amount));
  });

  it('transfers nxm stake and rewards from token controller to nft owner', async function () {
    const { nxm, cover, stakingPool, tokenController } = this;
    const [user] = this.accounts.members;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId: 0, // new position,
        destination,
      },
    ]);

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await stakingPool.connect(coverSigner).requestAllocation(amount, 0, allocationRequest);

    await increaseTime(TRANCHE_DURATION);
    await mineNextBlock();

    const withdrawStake = true;
    const withdrawRewards = true;
    const trancheIds = [firstActiveTrancheId];

    const tcBalanceBefore = await nxm.balanceOf(tokenController.address);
    const deposit = await stakingPool.deposits(tokenId, firstActiveTrancheId);

    await stakingPool.connect(user).withdraw([{ tokenId, withdrawStake, withdrawRewards, trancheIds }]);

    const tcBalanceAfter = await nxm.balanceOf(tokenController.address);

    expect(tcBalanceBefore).to.be.eq(amount.add(nxmRewards));

    const { accNxmPerRewardShareAtExpiry } = await stakingPool.expiredTranches(firstActiveTrancheId);
    const rewardsWithdrawn = deposit.rewardsShares
      .mul(accNxmPerRewardShareAtExpiry.sub(deposit.lastAccNxmPerRewardShare))
      .add(deposit.pendingRewards);

    expect(tcBalanceAfter).to.be.eq(tcBalanceBefore.sub(rewardsWithdrawn).sub(amount));
  });

  it('allows to withdraw only rewards', async function () {
    const { nxm, cover, stakingPool } = this;
    const [user] = this.accounts.members;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId: 0, // new position
        destination,
      },
    ]);

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);

    const withdrawStake = false;
    const withdrawRewards = true;
    const trancheIds = [firstActiveTrancheId];

    const depositBefore = await stakingPool.deposits(tokenId, firstActiveTrancheId);
    const userBalanceBefore = await nxm.balanceOf(user.address);

    const rewardShares = await getNewRewardShares({
      stakingPool,
      initialStakeShares: 0,
      stakeSharesIncrease: depositBefore.stakeShares,
      initialTrancheId: firstActiveTrancheId,
      newTrancheId: firstActiveTrancheId,
    });
    await stakingPool.connect(coverSigner).requestAllocation(amount, 0, allocationRequest);

    await increaseTime(TRANCHE_DURATION);

    await stakingPool.connect(user).withdraw([{ tokenId, withdrawStake, withdrawRewards, trancheIds }]);

    const depositAfter = await stakingPool.deposits(tokenId, firstActiveTrancheId);
    const userBalanceAfter = await nxm.balanceOf(user.address);

    expect(depositBefore.rewardsShares).to.be.eq(rewardShares);
    expect(depositAfter.rewardsShares).to.be.eq(0);

    const { accNxmPerRewardShareAtExpiry } = await stakingPool.expiredTranches(firstActiveTrancheId);
    const rewardsWithdrawn = depositBefore.rewardsShares
      .mul(accNxmPerRewardShareAtExpiry.sub(depositBefore.lastAccNxmPerRewardShare))
      .add(depositBefore.pendingRewards);

    expect(userBalanceAfter).to.be.eq(userBalanceBefore.add(rewardsWithdrawn));
  });

  it('allows to withdraw stake only if tranche is expired', async function () {
    const { tokenController, nxm, stakingPool } = this;
    const [user] = this.accounts.members;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId: 0, // new position
        destination,
      },
    ]);

    const withdrawStake = true;
    const withdrawRewards = true;
    const trancheIds = [firstActiveTrancheId];

    const depositBefore = await stakingPool.deposits(tokenId, firstActiveTrancheId);
    const userBalanceBefore = await nxm.balanceOf(user.address);
    const tcBalanceBefore = await nxm.balanceOf(tokenController.address);

    await expect(stakingPool.connect(user).withdraw([{ tokenId, withdrawStake, withdrawRewards, trancheIds }])).to.not
      .be.reverted;

    const depositAfter = await stakingPool.deposits(tokenId, firstActiveTrancheId);
    const userBalanceAfter = await nxm.balanceOf(user.address);
    const tcBalanceAfter = await nxm.balanceOf(tokenController.address);

    // Nothing changes
    expect(depositBefore.stakeShares).to.be.eq(depositAfter.stakeShares);
    expect(userBalanceBefore).to.be.eq(userBalanceAfter);
    expect(tcBalanceBefore).to.be.eq(tcBalanceAfter);
  });

  it('allows to withdraw stake and rewards from multiple tranches', async function () {
    const { nxm, cover, stakingPool, tokenController } = this;
    const [user] = this.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const TRANCHES_NUMBER = 5;
    const trancheIds = [];

    const withdrawStake = true;
    const withdrawRewards = true;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    for (let i = 0; i < TRANCHES_NUMBER; i++) {
      const { firstActiveTrancheId: currentTranche } = await getTranches();

      await stakingPool.connect(user).depositTo([
        {
          amount,
          trancheId: currentTranche,
          tokenId: i === 0 ? 0 : tokenId, // Only create new position for the first tranche
          destination,
        },
      ]);

      trancheIds.push(currentTranche);
      await stakingPool.connect(coverSigner).requestAllocation(amount, 0, allocationRequest);
      await increaseTime(TRANCHE_DURATION);
      await mineNextBlock();
    }

    const depositsBeforeWithdraw = {};
    for (const tranche of trancheIds) {
      depositsBeforeWithdraw[tranche] = await stakingPool.deposits(tokenId, tranche);
    }

    const userBalanceBefore = await nxm.balanceOf(user.address);
    const tcBalanceBefore = await nxm.balanceOf(tokenController.address);

    await stakingPool.connect(user).withdraw([{ tokenId, withdrawStake, withdrawRewards, trancheIds }]);

    const lastTranche = trancheIds[TRANCHES_NUMBER - 1];
    const depositAfter = await stakingPool.deposits(tokenId, lastTranche);
    const userBalanceAfter = await nxm.balanceOf(user.address);
    const tcBalanceAfter = await nxm.balanceOf(tokenController.address);

    expect(depositAfter.rewardsShares).to.be.eq(0);

    let rewardsWithdrawn = BigNumber.from(0);
    let stakeWithdrawn = BigNumber.from(0);
    for (const tranche of trancheIds) {
      const { rewards, stake } = await calculateStakeAndRewardsWithdrawAmounts(
        stakingPool,
        depositsBeforeWithdraw[tranche],
        tranche,
      );

      rewardsWithdrawn = rewardsWithdrawn.add(rewards);
      stakeWithdrawn = stakeWithdrawn.add(stake);
    }

    expect(userBalanceAfter).to.be.eq(userBalanceBefore.add(rewardsWithdrawn).add(stakeWithdrawn));
    expect(tcBalanceAfter).to.be.eq(tcBalanceBefore.sub(rewardsWithdrawn).sub(stakeWithdrawn));
  });

  it('update tranches', async function () {
    const { cover, stakingPool } = this;
    const [user] = this.accounts.members;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId: 0, // new position,
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

    await stakingPool.connect(coverSigner).requestAllocation(amount, 0, allocationRequest);

    await increaseTime(TRANCHE_DURATION);
    await mineNextBlock();

    await stakingPool.connect(user).withdraw([{ tokenId, withdrawStake, withdrawRewards, trancheIds }]);

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
    const { cover, stakingPool, nxm } = this;
    const [user] = this.accounts.members;
    const [randomUser] = this.accounts.nonMembers;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId: 0, // new position
        destination,
      },
    ]);

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);

    const withdrawStake = true;
    const withdrawRewards = false;
    const trancheIds = [firstActiveTrancheId];

    await stakingPool.connect(coverSigner).requestAllocation(amount, 0, allocationRequest);

    const deposit = await stakingPool.deposits(tokenId, firstActiveTrancheId);
    await increaseTime(TRANCHE_DURATION);

    const userBalanceBefore = await nxm.balanceOf(user.address);
    const randomUserBalanceBefore = await nxm.balanceOf(randomUser.address);

    await expect(stakingPool.connect(randomUser).withdraw([{ tokenId, withdrawStake, withdrawRewards, trancheIds }])).to
      .not.be.reverted;

    const { stake } = await calculateStakeAndRewardsWithdrawAmounts(stakingPool, deposit, firstActiveTrancheId);

    const userBalanceAfter = await nxm.balanceOf(user.address);
    const randomUserBalanceAfter = await nxm.balanceOf(randomUser.address);

    expect(randomUserBalanceAfter).to.eq(randomUserBalanceBefore);
    expect(userBalanceAfter).to.eq(userBalanceBefore.add(stake));
  });

  it('should emit some event', async function () {
    const { cover, stakingPool } = this;
    const [user] = this.accounts.members;

    const { amount, tokenId, destination } = depositToFixture;
    const coverSigner = await ethers.getImpersonatedSigner(cover.address);

    const TRANCHES_NUMBER = 3;
    const trancheIds = [];

    const withdrawStake = true;
    const withdrawRewards = true;

    for (let i = 0; i < TRANCHES_NUMBER; i++) {
      const { firstActiveTrancheId: currentTranche } = await getTranches();

      await stakingPool.connect(user).depositTo([
        {
          amount: amount.mul(i * 5 + 1),
          trancheId: currentTranche,
          tokenId: i === 0 ? 0 : tokenId, // Only create new position for the first tranche
          destination,
        },
      ]);

      trancheIds.push(currentTranche);
      await stakingPool.connect(coverSigner).requestAllocation(amount, 0, allocationRequest);
      await increaseTime(TRANCHE_DURATION);
      await mineNextBlock();
    }

    const depositsBeforeWithdraw = {};
    for (const tranche of trancheIds) {
      depositsBeforeWithdraw[tranche] = await stakingPool.deposits(tokenId, tranche);
    }

    // Update expiredTranches
    await stakingPool.processExpirations(true);

    const stakes = [];
    const rewards = [];
    for (const tranche of trancheIds) {
      const { rewards: currentReward, stake } = await calculateStakeAndRewardsWithdrawAmounts(
        stakingPool,
        depositsBeforeWithdraw[tranche],
        tranche,
      );

      stakes.push(stake);
      rewards.push(currentReward);
    }

    await expect(stakingPool.connect(user).withdraw([{ tokenId, withdrawStake, withdrawRewards, trancheIds }]))
      .to.emit(stakingPool, 'Withdraw')
      .withArgs(user.address, tokenId, trancheIds[0], stakes[0], rewards[0])
      .to.emit(stakingPool, 'Withdraw')
      .withArgs(user.address, tokenId, trancheIds[1], stakes[1], rewards[1])
      .to.emit(stakingPool, 'Withdraw')
      .withArgs(user.address, tokenId, trancheIds[2], stakes[2], rewards[2]);
  });
});
