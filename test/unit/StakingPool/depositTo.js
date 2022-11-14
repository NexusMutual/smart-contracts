const { ethers } = require('hardhat');
const { expect } = require('chai');
const { getTranches, getNewRewardShares, estimateStakeShares } = require('./helpers');
const { setEtherBalance, increaseTime } = require('../../utils/evm');

const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

describe('depositTo', function () {
  const depositToFixture = {
    poolId: 0,
    initialPoolFee: 5, // 5%
    maxPoolFee: 5, // 5%
    productInitializationParams: [
      {
        productId: 0,
        weight: 100,
        initialPrice: '500',
        targetPrice: '500',
      },
    ],
    amount: parseEther('100'),
    trancheId: 0,
    tokenId: 0,
    destination: AddressZero,
    depositNftId: 1,
  };

  before(async function () {
    const { stakingPool, cover } = this;
    const { defaultSender: manager } = this.accounts;

    const { poolId, initialPoolFee, maxPoolFee, productInitializationParams } = depositToFixture;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));
    this.coverSigner = coverSigner;

    await stakingPool
      .connect(coverSigner)
      .initialize(manager.address, false, initialPoolFee, maxPoolFee, productInitializationParams, poolId);
  });

  it('reverts if caller is not cover contract or manager when pool is private', async function () {
    const { stakingPool, cover } = this;
    const {
      members: [user],
      defaultSender: manager,
    } = this.accounts;

    const { amount, trancheId, tokenId, destination } = depositToFixture;

    await stakingPool.connect(manager).setPoolPrivacy(true);

    await expect(
      stakingPool.connect(user).depositTo([
        {
          amount,
          trancheId,
          tokenId,
          destination,
        },
      ]),
    ).to.be.revertedWith('StakingPool: The pool is private');

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);

    await expect(
      stakingPool.connect(coverSigner).depositTo([
        {
          amount,
          trancheId,
          tokenId,
          destination,
        },
      ]),
    ).to.not.be.revertedWith('StakingPool: The pool is private');

    await expect(
      stakingPool.connect(manager).depositTo([
        {
          amount,
          trancheId,
          tokenId,
          destination,
        },
      ]),
    ).to.not.be.revertedWith('StakingPool: The pool is private');
  });

  it('reverts if deposit amount is 0', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { trancheId, tokenId, destination } = depositToFixture;

    await expect(
      stakingPool.connect(user).depositTo([
        {
          amount: 0,
          trancheId,
          tokenId,
          destination,
        },
      ]),
    ).to.be.revertedWith('StakingPool: Insufficient deposit amount');
  });

  it('reverts if tranche id is not active', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    const { maxTranche } = await getTranches();

    await expect(
      stakingPool.connect(user).depositTo([
        {
          amount,
          trancheId: maxTranche + 1,
          tokenId,
          destination,
        },
      ]),
    ).to.be.revertedWith('StakingPool: Requested tranche is not yet active');
  });

  it('reverts if requested tranche expired', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    await expect(
      stakingPool.connect(user).depositTo([
        {
          amount,
          trancheId: firstActiveTrancheId - 1,
          tokenId,
          destination,
        },
      ]),
    ).to.be.revertedWith('StakingPool: Requested tranche has expired');
  });

  it('mints a new nft if token is 0', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    {
      const totalSupply = await stakingPool.totalSupply();
      expect(totalSupply).to.equal(1);
    }

    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId,
        destination,
      },
    ]);

    {
      const totalSupply = await stakingPool.totalSupply();
      expect(totalSupply).to.equal(2);
    }

    const owner = await stakingPool.ownerOf(depositNftId);
    expect(owner).to.equal(user.address);
  });

  it('mints a new nft to destination if token is 0', async function () {
    const { stakingPool } = this;
    const {
      members: [user1, user2],
    } = this.accounts;

    const { amount, tokenId, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    {
      const totalSupply = await stakingPool.totalSupply();
      expect(totalSupply).to.equal(1);
    }

    await stakingPool.connect(user1).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId,
        destination: user2.address,
      },
    ]);

    {
      const totalSupply = await stakingPool.totalSupply();
      expect(totalSupply).to.equal(2);
    }

    const owner = await stakingPool.ownerOf(depositNftId);
    expect(owner).to.equal(user2.address);
  });

  it('register deposit to the new nft', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();
    const newStakeShares = await estimateStakeShares({ amount, stakingPool });

    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId,
        destination,
      },
    ]);

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
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    // first deposit
    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId,
        destination,
      },
    ]);

    const firstDepositData = await stakingPool.deposits(depositNftId, firstActiveTrancheId);

    const newStakeShares = await estimateStakeShares({ amount, stakingPool });

    // deposit to the same tokenId
    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId: depositNftId,
        destination,
      },
    ]);

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

  it('updates deposit stakeShares, rewardShares, pendingRewards and lastAccNxmPerRewardShare', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    // first deposit
    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId,
        destination,
      },
    ]);

    // Generate rewards
    const coverRequest = {
      coverId: 0,
      productId: 0,
      amount: parseEther('1'),
      period: 3600 * 24 * 30, // 30 days
      gracePeriod: 3600 * 24 * 30,
      globalCapacityRatio: 20000,
      capacityReductionRatio: 0,
      rewardRatio: 5000,
    };
    await stakingPool.connect(this.coverSigner).allocateStake(coverRequest);

    await increaseTime(
      25 * // days
        24 * // hours
        60 * // minutes
        60, // seconds
    );

    const firstDepositData = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const newStakeShares = await estimateStakeShares({ amount, stakingPool });

    // deposit to the same tokenId
    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId: depositNftId,
        destination,
      },
    ]);

    const updatedDepositData = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const newRewardShares = await getNewRewardShares({
      stakingPool,
      initialStakeShares: firstDepositData.stakeShares,
      stakeSharesIncrease: newStakeShares,
      initialTrancheId: firstActiveTrancheId,
      newTrancheId: firstActiveTrancheId,
    });

    // TODO: How can I make pendingRewards and lastAccNxmPerRewardShare to not be 0?
    expect(updatedDepositData.pendingRewards).to.equal(0);
    expect(updatedDepositData.lastAccNxmPerRewardShare).to.equal(0);
    expect(updatedDepositData.stakeShares).to.equal(firstDepositData.stakeShares.add(newStakeShares));
    expect(updatedDepositData.rewardsShares).to.equal(firstDepositData.rewardsShares.add(newRewardShares));
  });

  it('should not revert with division by zero', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

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

    // Generate rewards
    const coverRequest = {
      coverId: 0,
      productId: 0,
      amount: parseEther('1'),
      period: 3600 * 24 * 30, // 30 days
      gracePeriod: 3600 * 24 * 30,
      globalCapacityRatio: 20000,
      capacityReductionRatio: 0,
      rewardRatio: 5000,
    };
    await stakingPool.connect(this.coverSigner).allocateStake(coverRequest);

    // Multiple buckets/tranches expired?
    await increaseTime(
      150 * // days
        24 * // hours
        60 * // minutes
        60, // seconds
    );

    // Reverts with Error: VM Exception while processing transaction:
    // reverted with panic code 0x12 (Division or modulo division by zero)
    // at StakingPool.updateTranches (contracts/modules/staking/StakingPool.sol:283)
    // at StakingPool.depositTo (contracts/modules/staking/StakingPool.sol:353)
    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId: depositNftId,
        destination,
      },
    ]);
  });
});
