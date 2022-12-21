const { ethers } = require('hardhat');
const { expect } = require('chai');

const { getTranches, getNewRewardShares, estimateStakeShares, TRANCHE_DURATION } = require('./helpers');
const { setEtherBalance, increaseTime, setNextBlockTime, mineNextBlock } = require('../utils').evm;
const { daysToSeconds } = require('../utils').helpers;

const { BigNumber } = ethers;
const { AddressZero, MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;

const productFixture = {
  productId: 0,
  weight: 100,
  initialPrice: 500,
  targetPrice: 500,
};

const depositToFixture = {
  poolId: 0,
  initialPoolFee: 5, // 5%
  maxPoolFee: 5, // 5%
  productInitializationParams: [productFixture],
  amount: parseEther('100'),
  trancheId: 0,
  tokenId: 0,
  destination: AddressZero,
  depositNftId: 1,
  ipfsDescriptionHash: 'Description Hash',
};

const DEFAULT_PERIOD = daysToSeconds(30);
const DEFAULT_GRACE_PERIOD = daysToSeconds(30);

describe('depositTo', function () {
  beforeEach(async function () {
    const { stakingPool, cover } = this;
    const { defaultSender: manager } = this.accounts;
    const { poolId, initialPoolFee, maxPoolFee, productInitializationParams, ipfsDescriptionHash } = depositToFixture;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));
    this.coverSigner = coverSigner;

    await stakingPool
      .connect(coverSigner)
      .initialize(
        manager.address,
        false,
        initialPoolFee,
        maxPoolFee,
        productInitializationParams,
        poolId,
        ipfsDescriptionHash,
      );

    // Move to the beginning of the next tranche
    const { firstActiveTrancheId: trancheId } = await getTranches();
    await setNextBlockTime((trancheId + 1) * TRANCHE_DURATION);
    await mineNextBlock();
  });

  it('reverts if caller is not cover contract or manager when pool is private', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const manager = this.accounts.defaultSender;
    const [user] = this.accounts.members;

    const { amount, tokenId, destination } = depositToFixture;
    const { firstActiveTrancheId: trancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    await stakingPool.connect(manager).setPoolPrivacy(true);

    await expect(stakingPool.connect(user).depositTo(amount, trancheId, tokenId, destination)).to.be.revertedWith(
      'StakingPool: The pool is private',
    );

    const coverContractAsSigner = await ethers.getImpersonatedSigner(cover.address);

    await nxm.mint(manager.address, amount);
    await nxm.connect(manager).approve(tokenController.address, amount);

    await expect(stakingPool.connect(coverContractAsSigner).depositTo(amount, trancheId, tokenId, destination)).to.not
      .be.reverted;

    await nxm.mint(manager.address, amount);
    await nxm.connect(manager).approve(tokenController.address, amount);

    await expect(stakingPool.connect(manager).depositTo(amount, trancheId, tokenId, destination)).to.not.be.reverted;
  });

  it('reverts if deposit amount is 0', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;
    const { trancheId, tokenId, destination } = depositToFixture;

    await expect(stakingPool.connect(user).depositTo(0, trancheId, tokenId, destination)).to.be.revertedWith(
      'StakingPool: Insufficient deposit amount',
    );
  });

  it('reverts if tranche id is not active', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const { maxTranche } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);
    const trancheId = maxTranche + 1;

    await expect(stakingPool.connect(user).depositTo(amount, trancheId, tokenId, destination)).to.be.revertedWith(
      'StakingPool: Requested tranche is not yet active',
    );
  });

  it('reverts if requested tranche expired', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);
    const trancheId = firstActiveTrancheId - 2;

    await expect(stakingPool.connect(user).depositTo(amount, trancheId, tokenId, destination)).to.be.revertedWith(
      'StakingPool: Requested tranche has expired',
    );
  });

  it('mints a new nft if token is 0', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;
    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const totalSupplyBefore = await stakingPool.totalSupply();
    expect(totalSupplyBefore).to.equal(1);

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    const totalSupplyAfter = await stakingPool.totalSupply();
    expect(totalSupplyAfter).to.equal(2);

    const owner = await stakingPool.ownerOf(depositNftId);
    expect(owner).to.equal(user.address);
  });

  it('mints a new nft to destination if token is 0', async function () {
    const { stakingPool } = this;
    const [user1, user2] = this.accounts.members;
    const { amount, tokenId, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    const totalSupplyBefore = await stakingPool.totalSupply();
    expect(totalSupplyBefore).to.equal(1);

    await stakingPool.connect(user1).depositTo(amount, firstActiveTrancheId, tokenId, user2.address);

    const totalSupplyAfter = await stakingPool.totalSupply();
    expect(totalSupplyAfter).to.equal(2);

    const owner = await stakingPool.ownerOf(depositNftId);
    expect(owner).to.equal(user2.address);
  });

  it('register deposit to the new nft', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;
    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);
    const newStakeShares = await estimateStakeShares({ amount, stakingPool });

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    const deposit = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const newRewardShares = await getNewRewardShares({
      stakingPool,
      initialStakeShares: 0,
      stakeSharesIncrease: deposit.stakeShares,
      initialTrancheId: firstActiveTrancheId,
      newTrancheId: firstActiveTrancheId,
    });
    expect(deposit.pendingRewards).to.equal(0);
    expect(deposit.lastAccNxmPerRewardShare).to.equal(0);
    expect(deposit.stakeShares).to.equal(newStakeShares);
    expect(deposit.rewardsShares).to.equal(newRewardShares);
  });

  it('register deposit to an existing nft', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;
    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    // first deposit
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);
    const firstDepositData = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const newStakeShares = await estimateStakeShares({ amount, stakingPool });

    // deposit to the same tokenId
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, depositNftId, destination);

    const updatedDepositData = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const newRewardShares = await getNewRewardShares({
      stakingPool,
      initialStakeShares: firstDepositData.stakeShares,
      stakeSharesIncrease: newStakeShares,
      initialTrancheId: firstActiveTrancheId,
      newTrancheId: firstActiveTrancheId,
    });
    expect(updatedDepositData.pendingRewards).to.equal(0);
    expect(updatedDepositData.lastAccNxmPerRewardShare).to.equal(0);
    expect(updatedDepositData.stakeShares).to.equal(firstDepositData.stakeShares.add(newStakeShares));
    expect(updatedDepositData.rewardsShares).to.equal(firstDepositData.rewardsShares.add(newRewardShares));
  });

  it('updates deposit pendingRewards and lastAccNxmPerRewardShare', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;
    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    // Generate rewards
    const allocationRequest = {
      productId: 0,
      coverId: MaxUint256,
      period: daysToSeconds(30),
      gracePeriod: daysToSeconds(30),
      previousStart: 0,
      previousExpiration: 0,
      previousRewardsRatio: 5000,
      useFixedPrice: false,
      globalCapacityRatio: 20000,
      capacityReductionRatio: 0,
      rewardRatio: 5000,
      globalMinPrice: 10000,
    };

    const { firstActiveTrancheId } = await getTranches(allocationRequest.period, allocationRequest.gracePeriod);

    // first deposit
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);
    const depositData = await stakingPool.deposits(depositNftId, firstActiveTrancheId);

    expect(depositData.lastAccNxmPerRewardShare).to.equal(0);
    expect(depositData.pendingRewards).to.equal(0);

    const coverAmount = parseEther('1');
    const previousPremium = 0;
    await stakingPool.connect(this.coverSigner).requestAllocation(coverAmount, previousPremium, allocationRequest);
    await increaseTime(daysToSeconds(20));

    // Second deposit
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, depositNftId, destination);
    const secondDepositData = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const secondAccNxmPerRewardsShare = await stakingPool.accNxmPerRewardsShare();

    expect(secondDepositData.lastAccNxmPerRewardShare).to.not.equal(0);
    expect(secondDepositData.lastAccNxmPerRewardShare).to.equal(secondAccNxmPerRewardsShare);
    expect(secondDepositData.pendingRewards).to.not.equal(0);
    expect(secondDepositData.pendingRewards).to.equal(
      depositData.rewardsShares
        .mul(secondDepositData.lastAccNxmPerRewardShare.sub(depositData.lastAccNxmPerRewardShare))
        .div(parseEther('1')),
    );

    // Last deposit
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, depositNftId, destination);
    const lastDepositData = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const lastAccNxmPerRewardsShare = await stakingPool.accNxmPerRewardsShare();

    expect(lastDepositData.lastAccNxmPerRewardShare).to.not.equal(0);
    expect(lastDepositData.lastAccNxmPerRewardShare).to.equal(lastAccNxmPerRewardsShare);
    expect(lastDepositData.pendingRewards).to.not.equal(0);
    expect(lastDepositData.pendingRewards).to.equal(
      secondDepositData.pendingRewards.add(
        secondDepositData.rewardsShares
          .mul(lastDepositData.lastAccNxmPerRewardShare.sub(secondDepositData.lastAccNxmPerRewardShare))
          .div(parseEther('1')),
      ),
    );
  });

  it('updates global variables accNxmPerRewardsShare and lastAccNxmUpdate', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;
    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const allocationRequest = {
      productId: 0,
      coverId: MaxUint256,
      period: daysToSeconds(30),
      gracePeriod: daysToSeconds(30),
      previousStart: 0,
      previousExpiration: 0,
      previousRewardsRatio: 5000,
      useFixedPrice: false,
      globalCapacityRatio: 20000,
      capacityReductionRatio: 0,
      rewardRatio: 5000,
      globalMinPrice: 10000,
    };

    const { firstActiveTrancheId } = await getTranches(allocationRequest.period, allocationRequest.gracePeriod);

    // first deposit
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    {
      const accNxmPerRewardsShare = await stakingPool.accNxmPerRewardsShare();
      const lastAccNxmUpdate = await stakingPool.lastAccNxmUpdate();
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

      expect(accNxmPerRewardsShare).to.equal(0);
      expect(lastAccNxmUpdate).to.equal(currentTime);
    }

    // Generate rewards
    const coverAmount = parseEther('1');
    const previousPremium = 0;
    await stakingPool.connect(this.coverSigner).requestAllocation(coverAmount, previousPremium, allocationRequest);
    await increaseTime(daysToSeconds(20));

    // Second deposit
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, depositNftId, destination);

    {
      const accNxmPerRewardsShare = await stakingPool.accNxmPerRewardsShare();
      const lastAccNxmUpdate = await stakingPool.lastAccNxmUpdate();
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

      const depositData = await stakingPool.deposits(depositNftId, firstActiveTrancheId);

      expect(accNxmPerRewardsShare).to.not.equal(0);
      expect(accNxmPerRewardsShare).to.equal(depositData.lastAccNxmPerRewardShare);
      expect(lastAccNxmUpdate).to.equal(currentTime);
    }
  });

  it('should not revert with division by zero', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;
    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const allocationRequest = {
      productId: 0,
      coverId: MaxUint256,
      period: daysToSeconds(30),
      gracePeriod: daysToSeconds(30),
      previousStart: 0,
      previousExpiration: 0,
      previousRewardsRatio: 5000,
      useFixedPrice: false,
      globalCapacityRatio: 20000,
      capacityReductionRatio: 0,
      rewardRatio: 5000,
      globalMinPrice: 10000,
    };

    const { firstActiveTrancheId } = await getTranches(allocationRequest.period, allocationRequest.gracePeriod);

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    const coverAmount = parseEther('1');
    const previousPremium = 0;
    await stakingPool.connect(this.coverSigner).requestAllocation(coverAmount, previousPremium, allocationRequest);

    await increaseTime(daysToSeconds(150));

    await expect(
      stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, depositNftId, destination),
    ).to.not.revertedWithPanic('0x12'); // division or modulo division by zero
  });

  it('updates global variables activeStake, stakeSharesSupply and rewardsSharesSupply', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;
    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    {
      const activeStake = await stakingPool.activeStake();
      const stakeSharesSupply = await stakingPool.stakeSharesSupply();
      const rewardsSharesSupply = await stakingPool.rewardsSharesSupply();

      expect(activeStake).to.equal(0);
      expect(stakeSharesSupply).to.equal(0);
      expect(rewardsSharesSupply).to.equal(0);
    }

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    {
      const userDeposit = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
      const managerDeposit = await stakingPool.deposits(0, firstActiveTrancheId);

      const activeStake = await stakingPool.activeStake();
      const stakeSharesSupply = await stakingPool.stakeSharesSupply();
      const rewardsSharesSupply = await stakingPool.rewardsSharesSupply();

      expect(activeStake).to.equal(amount);
      expect(stakeSharesSupply).to.equal(userDeposit.stakeShares);
      expect(rewardsSharesSupply).to.equal(userDeposit.rewardsShares.add(managerDeposit.rewardsShares));
    }
  });

  it('updates pool manager rewards shares', async function () {
    const { stakingPool } = this;
    const { POOL_FEE_DENOMINATOR } = this.config;
    const [user] = this.accounts.members;
    const { amount, tokenId, destination, depositNftId, initialPoolFee } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    {
      const managerDeposit = await stakingPool.deposits(0, firstActiveTrancheId);

      expect(managerDeposit.rewardsShares).to.equal(0);
    }

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    {
      const userDeposit = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
      const managerDeposit = await stakingPool.deposits(0, firstActiveTrancheId);

      expect(managerDeposit.rewardsShares).to.equal(
        userDeposit.rewardsShares.mul(initialPoolFee).div(POOL_FEE_DENOMINATOR),
      );
    }
  });

  it('updates tranche stake and reward shares', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;
    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    {
      const tranche = await stakingPool.tranches(firstActiveTrancheId);
      expect(tranche.stakeShares).to.equal(0);
      expect(tranche.rewardsShares).to.equal(0);
    }

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    {
      const userDeposit = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
      const managerDeposit = await stakingPool.deposits(0, firstActiveTrancheId);

      const tranche = await stakingPool.tranches(firstActiveTrancheId);
      expect(tranche.stakeShares).to.equal(userDeposit.stakeShares);
      expect(tranche.rewardsShares).to.equal(userDeposit.rewardsShares.add(managerDeposit.rewardsShares));
    }
  });

  it('transfer staked nxm to token controller contract', async function () {
    const { stakingPool, nxm, tokenController } = this;
    const [user] = this.accounts.members;
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
    const { stakingPool, nxm, tokenController } = this;
    const { POOL_FEE_DENOMINATOR } = this.config;
    const [user] = this.accounts.members;
    const { amount, tokenId, destination, initialPoolFee } = depositToFixture;

    const { firstActiveTrancheId, maxTranche } = await getTranches(daysToSeconds(0), DEFAULT_GRACE_PERIOD);

    const tranches = Array(maxTranche - firstActiveTrancheId + 1)
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
    for (let depositNftId = 1; depositNftId <= tranches.length; depositNftId++) {
      const trancheId = tranches[depositNftId - 1];
      const deposit = await stakingPool.deposits(depositNftId, trancheId);

      const newRewardShares = await getNewRewardShares({
        stakingPool,
        initialStakeShares: totalStakeShares,
        stakeSharesIncrease: deposit.stakeShares,
        initialTrancheId: trancheId,
        newTrancheId: trancheId,
      });
      const newStakeShares =
        depositNftId === 1 ? Math.sqrt(amount) : amount.mul(totalStakeShares).div(amount.mul(depositNftId - 1));

      expect(deposit.pendingRewards).to.equal(0);
      expect(deposit.lastAccNxmPerRewardShare).to.equal(0);
      expect(deposit.stakeShares).to.equal(newStakeShares);
      expect(deposit.rewardsShares).to.be.approximately(newRewardShares.toNumber(), 1);

      const managerDeposit = await stakingPool.deposits(0, trancheId);
      expect(managerDeposit.rewardsShares).to.equal(
        deposit.rewardsShares.mul(initialPoolFee).div(POOL_FEE_DENOMINATOR),
      );

      const tranche = await stakingPool.tranches(trancheId);
      expect(tranche.stakeShares).to.equal(deposit.stakeShares);
      expect(tranche.rewardsShares).to.equal(deposit.rewardsShares.add(managerDeposit.rewardsShares));

      totalStakeShares = totalStakeShares.add(deposit.stakeShares);
    }
  });

  it('emits StakeDeposited event', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;
    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    await expect(stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination))
      .to.emit(stakingPool, 'StakeDeposited')
      .withArgs(user.address, amount, firstActiveTrancheId, depositNftId);
  });

  it('reverts if provided tokenId is not valid', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;
    const { amount, destination } = depositToFixture;

    const invalidTokenId = 127;
    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    {
      const tranche = await stakingPool.tranches(firstActiveTrancheId);
      expect(tranche.stakeShares).to.equal(0);
      expect(tranche.rewardsShares).to.equal(0);
    }

    await expect(
      stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, invalidTokenId, destination),
    ).to.be.revertedWith('NOT_MINTED');
  });

  it('should revert if trying to deposit, while nxm is locked for governance vote', async function () {
    const { stakingPool, nxm } = this;
    const [user] = this.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    // Simulate member vote lock
    await nxm.setLock(user.address, 1e6);

    await expect(
      stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination),
    ).to.be.revertedWith('Staking: NXM is locked for voting in governance');
  });
});
