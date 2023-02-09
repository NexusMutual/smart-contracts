const { expect } = require('chai');
const { ethers } = require('hardhat');
const { getTranches, setTime } = require('./helpers');
const { AddressZero, MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;
const { daysToSeconds } = require('../../../lib/helpers');
const { setEtherBalance } = require('../utils').evm;

const initialProduct = {
  productId: 0,
  weight: 75,
  initialPrice: 255,
  targetPrice: 386,
};

const poolInitParams = {
  poolId: 0,
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

const DEFAULT_PERIOD = daysToSeconds(30);
const DEFAULT_GRACE_PERIOD = daysToSeconds(30);
const stakedNxmAmount = parseEther('1235');

describe('burnStake', function () {
  beforeEach(async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const { defaultSender: manager } = this.accounts;
    const { TRANCHE_DURATION } = this.config;
    const { poolId, initialPoolFee, maxPoolFee, products, ipfsDescriptionHash } = poolInitParams;

    this.coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(this.coverSigner.address, parseEther('1'));

    await cover.setProductType(productTypeFixture, initialProduct.productId);
    await cover.setProduct(coverProductTemplate, initialProduct.productId);

    await stakingPool.connect(this.coverSigner).initialize(
      manager.address,
      false, // isPrivatePool
      initialPoolFee,
      maxPoolFee,
      products,
      poolId,
      ipfsDescriptionHash,
    );

    await nxm.mint(manager.address, MaxUint256.div(1e6));
    await nxm.connect(manager).approve(tokenController.address, MaxUint256);

    // Deposit into pool
    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);
    await stakingPool.connect(manager).depositTo(stakedNxmAmount, firstActiveTrancheId + 1, 0, AddressZero);

    // Move to the beginning of the next tranche
    const { firstActiveTrancheId: trancheId } = await getTranches();
    await setTime(TRANCHE_DURATION.mul(trancheId + 1).toNumber());
  });

  it('should revert if the caller is not the cover contract', async function () {
    const { stakingPool } = this;
    await expect(stakingPool.burnStake(10)).to.be.revertedWithCustomError(stakingPool, 'OnlyCoverContract');
  });

  it('should block the pool if 100% of the stake is burned', async function () {
    const { stakingPool } = this;
    const {
      members: [member],
    } = this.accounts;

    // burn all of the active stake
    const activeStake = await stakingPool.getActiveStake();
    await stakingPool.connect(this.coverSigner).burnStake(activeStake);
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
    const { stakingPool } = this;
    const {
      members: [member],
    } = this.accounts;

    // burn activeStake - 1
    const activeStake = await stakingPool.getActiveStake();
    await stakingPool.connect(this.coverSigner).burnStake(activeStake.sub(1));

    // deposit should work
    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);
    await expect(stakingPool.connect(member).depositTo(stakedNxmAmount, firstActiveTrancheId, 0, AddressZero)).to.not.be
      .reverted;

    // Burn all activeStake
    await stakingPool.connect(this.coverSigner).burnStake(stakedNxmAmount.add(1));

    // deposit should fail
    await expect(
      stakingPool.connect(member).depositTo(stakedNxmAmount, firstActiveTrancheId, 0, AddressZero),
    ).to.be.revertedWithCustomError(stakingPool, 'PoolHalted');
  });
});
