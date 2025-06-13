const { ethers } = require('hardhat');
const { expect } = require('chai');
const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

const { daysToSeconds } = require('../utils').helpers;
const { increaseTime } = require('../utils').evm;
const { getTranches } = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const allocationRequestTemplate = {
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
};

async function setPoolFeeSetup() {
  const fixture = await loadFixture(setup);
  const { stakingPool, stakingProducts, tokenController } = fixture;
  const { poolId, initialPoolFee, maxPoolFee, products, isPrivatePool } = initializeParams;
  const manager = fixture.accounts.defaultSender;

  await stakingPool
    .connect(fixture.stakingProductsSigner)
    .initialize(isPrivatePool, initialPoolFee, maxPoolFee, poolId);
  await tokenController.setStakingPoolManager(poolId, manager.address);

  await stakingProducts.connect(fixture.stakingProductsSigner).setInitialProducts(poolId, products);

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

    const feeDenominator = await stakingPool.POOL_FEE_DENOMINATOR();
    await stakingPool.connect(user).depositTo(depositAmount, trancheId, tokenId, AddressZero);

    // Generate rewards
    const coverAmount = parseEther('1');
    const coverSigner = await ethers.getImpersonatedSigner(cover.address);

    await stakingPool.connect(coverSigner).requestAllocation(coverAmount, allocationRequest);
    await increaseTime(daysToSeconds(25));

    const rewardsSharesSupplyBefore = await stakingPool.getRewardsSharesSupply();
    const trancheBefore = await stakingPool.getTranche(trancheId);
    const managerDepositBefore = await stakingPool.deposits(managerDepositId, trancheId);

    const expectedFeeSharesBefore = trancheBefore.stakeShares
      .mul(initialPoolFee)
      .div(feeDenominator.sub(initialPoolFee));

    const expectedTrancheRewardsSharesBefore = trancheBefore.stakeShares.add(expectedFeeSharesBefore);
    expect(trancheBefore.rewardsShares).to.equal(expectedTrancheRewardsSharesBefore);

    await stakingPool.connect(manager).setPoolFee(newPoolFee);

    const accNxmPerRewardsShareAfter = await stakingPool.getAccNxmPerRewardsShare();
    const rewardsSharesSupplyAfter = await stakingPool.getRewardsSharesSupply();
    const trancheAfter = await stakingPool.getTranche(trancheId);

    const expectedFeeSharesAfter = trancheAfter.stakeShares.mul(newPoolFee).div(feeDenominator.sub(newPoolFee));
    const expectedTrancheRewardsSharesAfter = trancheAfter.stakeShares.add(expectedFeeSharesAfter);

    expect(trancheAfter.stakeShares).to.equal(trancheBefore.stakeShares);
    expect(trancheAfter.rewardsShares).to.equal(expectedTrancheRewardsSharesAfter);

    const managerDepositAfter = await stakingPool.deposits(managerDepositId, trancheId);
    expect(managerDepositAfter.lastAccNxmPerRewardShare).to.equal(accNxmPerRewardsShareAfter);

    const expectedPendingRewards = accNxmPerRewardsShareAfter
      .mul(managerDepositBefore.rewardsShares)
      .div(parseEther('1'));

    expect(managerDepositAfter.pendingRewards).to.equal(expectedPendingRewards);
    expect(managerDepositAfter.rewardsShares).to.equal(expectedFeeSharesAfter);

    const expectedRewardsShareSupplyAfter = rewardsSharesSupplyBefore
      .sub(expectedFeeSharesBefore)
      .add(expectedFeeSharesAfter);
    expect(rewardsSharesSupplyAfter).to.equal(expectedRewardsShareSupplyAfter);
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
