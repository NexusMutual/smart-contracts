const { ethers, expect } = require('hardhat');
const { MaxUint256, AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

const { daysToSeconds } = require('../utils').helpers;
const { setEtherBalance, increaseTime } = require('../utils').evm;
const { getTranches } = require('./helpers');

const allocationRequestTemplate = {
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
    ipfsDescriptionHash: 'Description Hash',
  };

  beforeEach(async function () {
    const {
      stakingPool,
      cover,
      accounts: { defaultSender: manager },
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

    const allocationRequest = { ...allocationRequestTemplate };

    const { firstActiveTrancheId } = await getTranches(allocationRequest.period, allocationRequest.gracePeriod);
    const trancheId = firstActiveTrancheId + 1;

    const depositAmount = parseEther('100');
    const tokenId = 0;
    const managerDepositId = 0;
    const { initialPoolFee } = initializeParams;
    const newPoolFee = initialPoolFee - 2;

    await stakingPool.connect(user).depositTo(depositAmount, trancheId, tokenId, AddressZero);

    // Generate rewards
    const coverAmount = parseEther('1');
    const previousPremium = 0;
    const coverSigner = await ethers.getImpersonatedSigner(cover.address);

    await stakingPool.connect(coverSigner).requestAllocation(coverAmount, previousPremium, allocationRequest);
    await increaseTime(daysToSeconds(25));

    const managerDepositBefore = await stakingPool.deposits(managerDepositId, trancheId);

    await stakingPool.connect(manager).setPoolFee(newPoolFee);

    const accNxmPerRewardsShareBefore = await stakingPool.accNxmPerRewardsShare();
    const managerDepositAfter = await stakingPool.deposits(managerDepositId, trancheId);
    const newLastAccNxmPerRewardShare = accNxmPerRewardsShareBefore.sub(managerDepositBefore.lastAccNxmPerRewardShare);

    expect(managerDepositAfter.lastAccNxmPerRewardShare).to.equal(newLastAccNxmPerRewardShare);
    expect(managerDepositAfter.pendingRewards).to.equal(
      managerDepositAfter.lastAccNxmPerRewardShare.mul(managerDepositBefore.rewardsShares).div(parseEther('1')),
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
