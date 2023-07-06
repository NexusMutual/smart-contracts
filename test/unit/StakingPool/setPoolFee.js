const { ethers } = require('hardhat');
const { expect } = require('chai');
const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

const { daysToSeconds } = require('../utils').helpers;
const { setEtherBalance, increaseTime } = require('../utils').evm;
const { getTranches } = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const allocationRequestTemplate = {
  productId: 0,
  coverId: 0,
  allocationId: 0,
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

const product = {
  productId: 0,
  weight: 100,
  initialPrice: '500',
  targetPrice: '500',
};

const initializeParams = {
  poolId: 1,
  isPrivatePool: false,
  initialPoolFee: 5, // 5%
  maxPoolFee: 5, // 5%
  products: [product],
  ipfsDescriptionHash: 'Description Hash',
};

async function setPoolFeeSetup() {
  const fixture = await setup();
  const { stakingPool, stakingProducts, cover, tokenController } = fixture;
  const { poolId, initialPoolFee, maxPoolFee, products, isPrivatePool, ipfsDescriptionHash } = initializeParams;
  const coverSigner = await ethers.getImpersonatedSigner(cover.address);
  const manager = fixture.accounts.defaultSender;

  await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));
  await stakingPool
    .connect(coverSigner)
    .initialize(isPrivatePool, initialPoolFee, maxPoolFee, poolId, ipfsDescriptionHash);
  await tokenController.setStakingPoolManager(poolId, manager.address);

  await stakingProducts.connect(fixture.coverSigner).setInitialProducts(poolId, products);

  return fixture;
}

describe('setPoolFee', function () {
  it('reverts if manager is not the caller', async function () {
    const fixture = await loadFixture(setPoolFeeSetup);
    const {
      stakingPool,
      accounts: {
        defaultSender: manager,
        nonMembers: [nonManager],
      },
    } = fixture;

    await expect(stakingPool.connect(nonManager).setPoolFee(5)).to.be.revertedWithCustomError(
      stakingPool,
      'OnlyManager',
    );
    await expect(stakingPool.connect(manager).setPoolFee(5)).to.not.be.reverted;
  });

  it('reverts if new fee exceeds max pool fee', async function () {
    const fixture = await loadFixture(setPoolFeeSetup);
    const { stakingPool } = fixture;
    const manager = fixture.accounts.defaultSender;

    const { maxPoolFee } = initializeParams;

    await expect(stakingPool.connect(manager).setPoolFee(maxPoolFee + 1)).to.be.revertedWithCustomError(
      stakingPool,
      'PoolFeeExceedsMax',
    );
    await expect(stakingPool.connect(manager).setPoolFee(maxPoolFee)).to.not.be.reverted;
  });

  it('updates pool fee', async function () {
    const fixture = await loadFixture(setPoolFeeSetup);
    const { stakingPool } = fixture;
    const manager = fixture.accounts.defaultSender;

    const { maxPoolFee } = initializeParams;
    const newPoolFee = maxPoolFee - 2;

    expect(await stakingPool.getPoolFee()).to.be.equal(maxPoolFee);

    await stakingPool.connect(manager).setPoolFee(newPoolFee);

    expect(await stakingPool.getPoolFee()).to.be.equal(newPoolFee);
  });

  it('updates pool manager rewards', async function () {
    const fixture = await loadFixture(setPoolFeeSetup);
    const { stakingPool, cover } = fixture;
    const manager = fixture.accounts.defaultSender;
    const [user] = fixture.accounts.members;

    const allocationRequest = { ...allocationRequestTemplate };

    const { firstActiveTrancheId } = await getTranches(allocationRequest.period, allocationRequest.gracePeriod);
    const trancheId = firstActiveTrancheId + 1;

    const depositAmount = parseEther('100');
    const tokenId = 0; // new deposit
    const managerDepositId = 0; // manager position id
    const { initialPoolFee } = initializeParams;
    const newPoolFee = initialPoolFee - 2;

    await stakingPool.connect(user).depositTo(depositAmount, trancheId, tokenId, AddressZero);

    // Generate rewards
    const coverAmount = parseEther('1');
    const previousPremium = 0;
    const coverSigner = await ethers.getImpersonatedSigner(cover.address);

    await stakingPool.connect(coverSigner).requestAllocation(coverAmount, previousPremium, allocationRequest);
    await increaseTime(daysToSeconds(25));

    const depositBefore = await stakingPool.deposits(managerDepositId, trancheId);

    await stakingPool.connect(manager).setPoolFee(newPoolFee);

    const accNxmPerRewardsShareAfter = await stakingPool.getAccNxmPerRewardsShare();
    const depositAfter = await stakingPool.deposits(managerDepositId, trancheId);

    const expectedLastAccNxmPerRewardShare = accNxmPerRewardsShareAfter.sub(depositBefore.lastAccNxmPerRewardShare);
    expect(depositAfter.lastAccNxmPerRewardShare).to.equal(expectedLastAccNxmPerRewardShare);

    const expectedPendingRewards = depositAfter.lastAccNxmPerRewardShare
      .mul(depositBefore.rewardsShares)
      .div(parseEther('1'));
    expect(depositAfter.pendingRewards).to.equal(expectedPendingRewards);

    const expectedRewardsShares = depositBefore.rewardsShares.mul(newPoolFee).div(initialPoolFee);
    expect(depositAfter.rewardsShares).to.equal(expectedRewardsShares);
  });

  it('emits and PoolFeeChanged', async function () {
    const fixture = await loadFixture(setPoolFeeSetup);
    const { stakingPool } = fixture;
    const manager = fixture.accounts.defaultSender;

    const { maxPoolFee } = initializeParams;
    const newPoolFee = maxPoolFee - 1;

    await expect(stakingPool.connect(manager).setPoolFee(newPoolFee))
      .to.emit(stakingPool, 'PoolFeeChanged')
      .withArgs(manager.address, newPoolFee);
  });
});
