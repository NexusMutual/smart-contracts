const { ethers } = require('hardhat');
const { expect } = require('chai');
const { getTranches, getNewRewardShares, estimateStakeShares, POOL_FEE_DENOMINATOR } = require('./helpers');
const { setEtherBalance, increaseTime } = require('../../utils/evm');
const { BigNumber } = require('ethers');

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
        initialPrice: 500,
        targetPrice: 500,
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

  it('updates deposit pendingRewards and lastAccNxmPerRewardShare', async function () {
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

    const depositData = await stakingPool.deposits(depositNftId, firstActiveTrancheId);

    expect(depositData.lastAccNxmPerRewardShare).to.equal(0);
    expect(depositData.pendingRewards).to.equal(0);

    // Generate rewards
    const coverRequest = {
      coverId: 0,
      productId: 0,
      amount: parseEther('1000000'),
      period: 3600 * 24 * 30, // 30 days
      gracePeriod: 3600 * 24 * 30,
      globalCapacityRatio: 20000,
      capacityReductionRatio: 0,
      rewardRatio: 10000,
    };
    await stakingPool.connect(this.coverSigner).allocateStake(coverRequest);

    await increaseTime(
      20 * // days
        24 * // hours
        60 * // minutes
        60, // seconds
    );

    // Second deposit
    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId: depositNftId,
        destination,
      },
    ]);

    const secondDepositData = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const secondAccNxmPerRewardsShare = await stakingPool.accNxmPerRewardsShare();

    expect(secondAccNxmPerRewardsShare).to.not.equal(0);
    expect(secondDepositData.lastAccNxmPerRewardShare).to.equal(secondAccNxmPerRewardsShare);
    // TODO: Shouldn't pendingRewards also be updated?
    expect(secondDepositData.pendingRewards).to.equal(0);

    // Last deposit
    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId: depositNftId,
        destination,
      },
    ]);

    const lastDepositData = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const lastAccNxmPerRewardsShare = await stakingPool.accNxmPerRewardsShare();

    expect(lastDepositData).to.not.equal(0);
    expect(lastDepositData.lastAccNxmPerRewardShare).to.equal(lastAccNxmPerRewardsShare);
    expect(lastDepositData.pendingRewards).to.not.equal(0);
    expect(lastDepositData.pendingRewards).to.equal(
      secondDepositData.rewardsShares.mul(
        lastDepositData.lastAccNxmPerRewardShare.sub(secondDepositData.lastAccNxmPerRewardShare),
      ),
    );
  });

  it('updates global variables accNxmPerRewardsShare and lastAccNxmUpdate', async function () {
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

    {
      const accNxmPerRewardsShare = await stakingPool.accNxmPerRewardsShare();
      const lastAccNxmUpdate = await stakingPool.lastAccNxmUpdate();
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

      expect(accNxmPerRewardsShare).to.equal(0);
      expect(lastAccNxmUpdate).to.equal(currentTime);
    }

    // Generate rewards
    const coverRequest = {
      coverId: 0,
      productId: 0,
      amount: parseEther('1000000'),
      period: 3600 * 24 * 30, // 30 days
      gracePeriod: 3600 * 24 * 30,
      globalCapacityRatio: 20000,
      capacityReductionRatio: 0,
      rewardRatio: 10000,
    };
    await stakingPool.connect(this.coverSigner).allocateStake(coverRequest);

    await increaseTime(
      20 * // days
        24 * // hours
        60 * // minutes
        60, // seconds
    );

    // Second deposit
    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId: depositNftId,
        destination,
      },
    ]);

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

    await increaseTime(
      150 * // days
        24 * // hours
        60 * // minutes
        60, // seconds
    );

    await expect(
      stakingPool.connect(user).depositTo([
        {
          amount,
          trancheId: firstActiveTrancheId,
          tokenId: depositNftId,
          destination,
        },
      ]),
    ).to.not.revertedWithPanic('0x12'); // (Division or modulo division by zero)
  });

  it('updates global variables activeStake, stakeSharesSupply and rewardsSharesSupply', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    {
      const activeStake = await stakingPool.activeStake();
      const stakeSharesSupply = await stakingPool.stakeSharesSupply();
      const rewardsSharesSupply = await stakingPool.rewardsSharesSupply();

      expect(activeStake).to.equal(0);
      expect(stakeSharesSupply).to.equal(0);
      expect(rewardsSharesSupply).to.equal(0);
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

  it('updates updates pool manager rewards shares', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination, depositNftId, initialPoolFee } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    {
      const managerDeposit = await stakingPool.deposits(0, firstActiveTrancheId);

      expect(managerDeposit.rewardsShares).to.equal(0);
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
      const userDeposit = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
      const managerDeposit = await stakingPool.deposits(0, firstActiveTrancheId);

      expect(managerDeposit.rewardsShares).to.equal(
        userDeposit.rewardsShares.mul(initialPoolFee).div(POOL_FEE_DENOMINATOR),
      );
    }
  });

  it('updates tranche stake and reward shares', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    {
      const tranche = await stakingPool.tranches(firstActiveTrancheId);
      expect(tranche.stakeShares).to.equal(0);
      expect(tranche.rewardsShares).to.equal(0);
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
      const userDeposit = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
      const managerDeposit = await stakingPool.deposits(0, firstActiveTrancheId);

      const tranche = await stakingPool.tranches(firstActiveTrancheId);
      expect(tranche.stakeShares).to.equal(userDeposit.stakeShares);
      expect(tranche.rewardsShares).to.equal(userDeposit.rewardsShares.add(managerDeposit.rewardsShares));
    }
  });

  it('transfer staked nxm to token controller contract', async function () {
    const { stakingPool, nxm, tokenController } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    const userBalanceBefore = await nxm.balanceOf(user.address);
    const tokenControllerBalanceBefore = await nxm.balanceOf(tokenController.address);

    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId,
        destination,
      },
    ]);

    const userBalanceAfter = await nxm.balanceOf(user.address);
    const tokenControllerBalanceAfter = await nxm.balanceOf(tokenController.address);
    expect(userBalanceAfter).to.equal(userBalanceBefore.sub(amount));
    expect(tokenControllerBalanceAfter).to.equal(tokenControllerBalanceBefore.add(amount));
  });

  it('allows to deposit to multiple tranches', async function () {
    const { stakingPool, nxm, tokenController } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination, initialPoolFee } = depositToFixture;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    const tranches = Array(maxTranche - firstActiveTrancheId + 1)
      .fill(0)
      .map((e, i) => firstActiveTrancheId + i);

    const userBalanceBefore = await nxm.balanceOf(user.address);
    const tokenControllerBalanceBefore = await nxm.balanceOf(tokenController.address);

    const depositToParams = tranches.map(e => {
      return {
        amount,
        trancheId: e,
        tokenId,
        destination,
      };
    });

    await stakingPool.connect(user).depositTo(depositToParams);

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
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination, depositNftId } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    await expect(
      stakingPool.connect(user).depositTo([
        {
          amount,
          trancheId: firstActiveTrancheId,
          tokenId,
          destination,
        },
      ]),
    )
      .to.emit(stakingPool, 'StakeDeposited')
      .withArgs(user.address, amount, firstActiveTrancheId, depositNftId);
  });

  it.skip('reverts if provided tokenId is not valid', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, destination } = depositToFixture;

    const invalidTokenId = 127;
    const { firstActiveTrancheId } = await getTranches();

    {
      const tranche = await stakingPool.tranches(firstActiveTrancheId);
      expect(tranche.stakeShares).to.equal(0);
      expect(tranche.rewardsShares).to.equal(0);
    }

    await expect(
      stakingPool.connect(user).depositTo([
        {
          amount,
          trancheId: firstActiveTrancheId,
          tokenId: invalidTokenId,
          destination,
        },
      ]),
    ).to.be.reverted;
  });
});
