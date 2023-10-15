const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { getTranches, moveTimeToNextTranche } = require('./helpers');
const { daysToSeconds } = require('../../../lib/helpers');

const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

const DEFAULT_PERIOD = daysToSeconds(30);
const DEFAULT_GRACE_PERIOD = daysToSeconds(30);

const initialProduct = {
  productId: 0,
  weight: 100,
  initialPrice: 255,
  targetPrice: 386,
};

const poolInitParams = {
  poolId: 1,
  initialPoolFee: 5, // 5%
  maxPoolFee: 5, // 5%
  products: [initialProduct],
  ipfsDescriptionHash: 'Description Hash',
};

const productTypeFixture = {
  claimMethod: 1,
  gracePeriod: daysToSeconds(7), // 7 days
};

const coverProductTemplate = {
  productType: 1,
  yieldTokenAddress: AddressZero,
  coverAssets: 1111,
  initialPriceRatio: 500,
  capacityReductionRatio: 0,
  isDeprecated: false,
  useFixedPrice: false,
};

const stakedNxmAmount = parseEther('100');
const burnAmount = parseEther('10');
const setup = require('./setup');

async function burnStakeSetup() {
  const fixture = await loadFixture(setup);
  const { stakingPool, stakingProducts, cover } = fixture;
  const [staker] = fixture.accounts.members;
  const { poolId, initialPoolFee, maxPoolFee, products, ipfsDescriptionHash } = poolInitParams;

  await cover.setProductType(productTypeFixture, initialProduct.productId);
  await cover.setProduct(coverProductTemplate, initialProduct.productId);

  await stakingPool.connect(fixture.stakingProductsSigner).initialize(
    false, // isPrivatePool
    initialPoolFee,
    maxPoolFee,
    poolId,
    ipfsDescriptionHash,
  );

  await stakingProducts.connect(fixture.stakingProductsSigner).setInitialProducts(poolId, products);

  // Move to the beginning of the next tranche
  const currentTrancheId = await moveTimeToNextTranche(1);

  // Deposit into pool
  await stakingPool.connect(staker).depositTo(stakedNxmAmount, currentTrancheId, 0, AddressZero);
  await stakingPool.connect(staker).depositTo(stakedNxmAmount, currentTrancheId + 1, 0, AddressZero);
  await stakingPool.connect(staker).depositTo(stakedNxmAmount, currentTrancheId + 2, 0, AddressZero);

  return fixture;
}

describe('burnStake', function () {
  it('should revert if the caller is not the cover contract', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool } = fixture;
    await expect(stakingPool.burnStake(10)).to.be.revertedWithCustomError(stakingPool, 'OnlyCoverContract');
  });

  it('should block the pool if 100% of the stake is burned', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool } = fixture;
    const {
      members: [member],
    } = fixture.accounts;

    // burn all of the active stake
    const activeStake = await stakingPool.getActiveStake();
    await stakingPool.connect(fixture.coverSigner).burnStake(activeStake);
    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    // depositTo and extendDeposit should revert
    await expect(
      stakingPool.connect(member).depositTo(stakedNxmAmount, firstActiveTrancheId, 0, AddressZero),
    ).to.be.revertedWithCustomError(stakingPool, 'PoolHalted');
    await expect(stakingPool.connect(member).extendDeposit(0, 0, 0, 0)).to.be.revertedWithCustomError(
      stakingPool,
      'PoolHalted',
    );
  });

  it('should not block pool if 99% of the stake is burned', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool } = fixture;
    const {
      members: [member],
    } = fixture.accounts;

    // burn activeStake - 1
    const activeStake = await stakingPool.getActiveStake();
    await stakingPool.connect(fixture.coverSigner).burnStake(activeStake.sub(1));

    // deposit should work
    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);
    await expect(stakingPool.connect(member).depositTo(stakedNxmAmount, firstActiveTrancheId, 0, AddressZero)).to.not.be
      .reverted;

    // Burn all activeStake
    await stakingPool.connect(fixture.coverSigner).burnStake(stakedNxmAmount.add(1));

    // deposit should fail
    await expect(
      stakingPool.connect(member).depositTo(stakedNxmAmount, firstActiveTrancheId, 0, AddressZero),
    ).to.be.revertedWithCustomError(stakingPool, 'PoolHalted');
  });

  it('reduces activeStake', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool } = fixture;

    const activeStakeBefore = await stakingPool.getActiveStake();

    await stakingPool.connect(fixture.coverSigner).burnStake(burnAmount);

    const activeStakeAfter = await stakingPool.getActiveStake();
    expect(activeStakeAfter).to.equal(activeStakeBefore.sub(burnAmount));
  });

  it('emits StakeBurned event', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool } = fixture;

    await expect(stakingPool.connect(fixture.coverSigner).burnStake(burnAmount))
      .to.emit(stakingPool, 'StakeBurned')
      .withArgs(burnAmount);
  });

  it('burns staked NXM in token controller', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool, nxm, tokenController } = fixture;

    const poolId = await stakingPool.getPoolId();

    const balanceBefore = await nxm.balanceOf(tokenController.address);
    const tcBalancesBefore = await tokenController.stakingPoolNXMBalances(poolId);

    await stakingPool.connect(fixture.coverSigner).burnStake(burnAmount);

    const balanceAfter = await nxm.balanceOf(tokenController.address);
    const tcBalancesAfter = await tokenController.stakingPoolNXMBalances(poolId);

    expect(balanceAfter).to.equal(balanceBefore.sub(burnAmount));
    expect(tcBalancesAfter.deposits).to.equal(tcBalancesBefore.deposits.sub(burnAmount));
  });

  it('works correctly if burnAmount > initialStake', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool, nxm, tokenController } = fixture;

    const poolId = await stakingPool.getPoolId();

    const initialStake = await stakingPool.getActiveStake();
    const balanceBefore = await nxm.balanceOf(tokenController.address);
    const tcBalancesBefore = await tokenController.stakingPoolNXMBalances(poolId);

    const burnAmount = initialStake.add(parseEther('1'));

    // leaves 1 wei to avoid division by zero
    const actualBurnedAmount = initialStake.sub(1);
    await expect(stakingPool.connect(fixture.coverSigner).burnStake(burnAmount))
      .to.emit(stakingPool, 'StakeBurned')
      .withArgs(actualBurnedAmount);

    const activeStakeAfter = await stakingPool.getActiveStake();
    const balanceAfter = await nxm.balanceOf(tokenController.address);
    const tcBalancesAfter = await tokenController.stakingPoolNXMBalances(poolId);

    expect(activeStakeAfter).to.equal(initialStake.sub(actualBurnedAmount));
    expect(balanceAfter).to.equal(balanceBefore.sub(actualBurnedAmount));
    expect(tcBalancesAfter.deposits).to.equal(tcBalancesBefore.deposits.sub(actualBurnedAmount));
  });
});
