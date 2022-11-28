const { parseEther } = require('ethers/lib/utils');
const { ethers, expect } = require('hardhat');
const { daysToSeconds } = require('../../../lib/helpers');
const { setEtherBalance, increaseTime } = require('../../utils/evm');
const { getTranches } = require('./helpers');

describe('setPoolFee', function () {
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

  it('reverts if manager is not the caller', async function () {
    const {
      stakingPool,
      accounts: {
        defaultSender: manager,
        nonMembers: [nonManager],
      },
    } = this;

    await expect(stakingPool.connect(nonManager).setPoolFee(5)).to.be.revertedWith(
      'StakingPool: Only pool manager can call this function',
    );
    await expect(stakingPool.connect(manager).setPoolFee(5)).to.not.be.reverted;
  });

  it('reverts if new fee exceeds max pool fee', async function () {
    const {
      stakingPool,
      accounts: { defaultSender: manager },
    } = this;
    const { maxPoolFee } = initializeParams;

    await expect(stakingPool.connect(manager).setPoolFee(maxPoolFee + 1)).to.be.revertedWith(
      'StakingPool: new fee exceeds max fee',
    );
    await expect(stakingPool.connect(manager).setPoolFee(maxPoolFee)).to.not.be.reverted;
  });

  it('updates pool fee', async function () {
    const {
      stakingPool,
      accounts: { defaultSender: manager },
    } = this;
    const { maxPoolFee } = initializeParams;
    const newPoolFee = maxPoolFee - 2;

    expect(await stakingPool.poolFee()).to.be.eq(maxPoolFee);

    await stakingPool.connect(manager).setPoolFee(newPoolFee);

    expect(await stakingPool.poolFee()).to.be.eq(newPoolFee);
  });

  it('updates pool manager rewards', async function () {
    const {
      stakingPool,
      cover,
      accounts: {
        defaultSender: manager,
        members: [user],
      },
    } = this;

    const allocationRequest = {
      productId: 0,
      coverId: 0,
      amount: parseEther('1'),
      period: daysToSeconds(30),
    };

    const gracePeriod = daysToSeconds(30);
    const { firstActiveTrancheId } = await getTranches(allocationRequest.period, gracePeriod);
    const amount = parseEther('100');
    const tokenId = 0;
    const managerDepositId = 0;
    const { initialPoolFee } = initializeParams;
    const newPoolFee = initialPoolFee - 2;

    await stakingPool.connect(user).depositTo([
      {
        amount,
        trancheId: firstActiveTrancheId,
        tokenId,
        destination: ethers.constants.AddressZero,
      },
    ]);

    // Generate rewards

    const allocationConfig = {
      gracePeriod: daysToSeconds(30),
      globalCapacityRatio: 20000,
      capacityReductionRatio: 0,
      rewardRatio: 5000,
      globalMinPrice: 10000,
    };
    const coverSigner = await ethers.getImpersonatedSigner(cover.address);

    await stakingPool.connect(coverSigner).allocateCapacity(allocationRequest, allocationConfig);
    await increaseTime(daysToSeconds(25));

    const managerDepositBefore = await stakingPool.deposits(managerDepositId, firstActiveTrancheId);

    await stakingPool.connect(manager).setPoolFee(newPoolFee);

    const accNxmPerRewardsShareBefore = await stakingPool.accNxmPerRewardsShare();
    const managerDepositAfter = await stakingPool.deposits(managerDepositId, firstActiveTrancheId);
    const newLastAccNxmPerRewardShare = accNxmPerRewardsShareBefore.sub(managerDepositBefore.lastAccNxmPerRewardShare);

    expect(managerDepositAfter.lastAccNxmPerRewardShare).to.equal(newLastAccNxmPerRewardShare);
    expect(managerDepositAfter.pendingRewards).to.equal(
      managerDepositAfter.lastAccNxmPerRewardShare.mul(managerDepositBefore.rewardsShares),
    );
    expect(managerDepositAfter.rewardsShares).to.equal(
      managerDepositBefore.rewardsShares.mul(newPoolFee).div(initialPoolFee),
    );
  });

  it('emits and PoolFeeChanged', async function () {
    const {
      stakingPool,
      accounts: { defaultSender: manager },
    } = this;
    const { maxPoolFee } = initializeParams;
    const newPoolFee = maxPoolFee - 1;

    await expect(stakingPool.connect(manager).setPoolFee(newPoolFee))
      .to.emit(stakingPool, 'PoolFeeChanged')
      .withArgs(manager.address, newPoolFee);
  });
});
