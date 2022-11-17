const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;
const daysToSeconds = days => days * 24 * 60 * 60;
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');

const ProductTypeFixture = {
  claimMethod: 1,
  gracePeriodInDays: 7,
};

const coverProductTemplate = {
  productType: 1,
  yieldTokenAddress: AddressZero,
  coverAssets: 1111,
  initialPriceRatio: 500,
  capacityReductionRatio: 0,
};

const initialProductTemplate = {
  productId: 0,
  weight: 100, // 1.00
  initialPrice: 500, // 5%
  targetPrice: 100, // 1%
};

const newProductTemplate = {
  productId: 0,
  setTargetWeight: true,
  recalculateEffectiveWeight: true,
  targetWeight: 100,
  setTargetPrice: true,
  targetPrice: 500,
};

const buyCoverParamsTemplate = {
  owner: AddressZero,
  productId: 0,
  coverAsset: 0, // ETH
  amount: parseEther('100'),
  period: daysToSeconds('30'),
  maxPremiumInAsset: parseEther('100'),
  paymentAsset: 0,
  payWithNXM: false,
  commissionRatio: 1,
  commissionDestination: AddressZero,
  ipfsData: 'ipfs data',
};

const withdrawRequestTemplate = {
  tokenId: 1,
  withdrawStake: true,
  withdrawRewards: true,
  trancheIds: [],
};

describe('burnStake', function () {
  // Create a default deposit request to the staking pool
  const depositRequest = async (stakingPool, amount, destination) => {
    const tokenId = 0;
    const block = await ethers.provider.getBlock('latest');
    const currentTrancheId = Math.floor(block.timestamp / daysToSeconds(91));
    return {
      amount,
      trancheId: currentTrancheId + 4,
      tokenId,
      destination,
    };
  };

  it('Should burn half of stake and update shares properly', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const [manager, staker, stakerTwo, coverBuyer] = this.accounts.members;
    const DECIMALS_18 = BigNumber.from(10).pow(18);
    const stakeAmountInNxm = BigNumber.from(100000);
    const stakeAmount = stakeAmountInNxm.mul(DECIMALS_18);

    // Initialize pool and set products
    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    await cover.setProduct({ ...coverProductTemplate }, 0);
    await stakingPool.connect(manager).setProducts([{ ...newProductTemplate }]);

    // Deposit into pool
    await nxm.connect(staker).approve(tokenController.address, stakeAmount);
    const request = await depositRequest(stakingPool, stakeAmount, staker.address);
    await stakingPool.connect(staker).depositTo([request]);

    // Buy coverage
    const coverBuyParams = { ...buyCoverParamsTemplate, owner: coverBuyer.address, amount: stakeAmount };
    await cover.connect(coverBuyer).allocateCapacity(coverBuyParams, 1, stakingPool.address);

    // Burn stake
    const amountToBurn = stakeAmount.div(2);
    await cover.performStakeBurn(stakingPool.address, amountToBurn);
    expect(await stakingPool.totalActiveStake()).to.be.equal(amountToBurn);

    {
      // 2nd deposit
      await nxm.connect(stakerTwo).approve(tokenController.address, stakeAmount);
      const request = await depositRequest(stakingPool, stakeAmount, stakerTwo.address);
      await stakingPool.connect(stakerTwo).depositTo([request]);
    }

    // Expire all activeTranches
    let { timestamp } = await ethers.provider.getBlock('latest');
    timestamp += daysToSeconds('728');
    await setNextBlockTime(timestamp);
    await mineNextBlock();
    await stakingPool.updateTranches(true);

    {
      // 1st staker withdraw
      const depositId = 1;
      const deposit = await stakingPool.deposits(depositId, request.trancheId);
      const expiredTranche = await stakingPool.expiredTranches(request.trancheId);
      const stakeToWithdraw = expiredTranche.stakeAmountAtExpiry
        .mul(deposit.stakeShares)
        .div(expiredTranche.stakeShareSupplyAtExpiry);

      // Withdraw nxm
      const balanceBefore = await nxm.balanceOf(staker.address);
      await expect(
        stakingPool.connect(staker).withdraw([{ ...withdrawRequestTemplate, trancheIds: [request.trancheId] }]),
      )
        .to.emit(nxm, 'Transfer')
        .withArgs(tokenController.address, staker.address, stakeToWithdraw);
      const balanceAfter = await nxm.balanceOf(staker.address);
      expect(balanceAfter).to.be.equal(balanceBefore.add(stakeToWithdraw));
    }

    {
      // 2nd staker withdraw
      const depositId = 2;
      const deposit = await stakingPool.deposits(depositId, request.trancheId);
      const expiredTranche = await stakingPool.expiredTranches(request.trancheId);
      const stakeToWithdraw = expiredTranche.stakeAmountAtExpiry
        .mul(deposit.stakeShares)
        .div(expiredTranche.stakeShareSupplyAtExpiry);

      // Withdraw nxm
      const balanceBefore = await nxm.balanceOf(stakerTwo.address);
      await stakingPool
        .connect(stakerTwo)
        .withdraw([{ ...withdrawRequestTemplate, tokenId: depositId, trancheIds: [request.trancheId] }]);
      const balanceAfter = await nxm.balanceOf(stakerTwo.address);
      expect(balanceAfter).to.be.equal(balanceBefore.add(stakeToWithdraw));
    }
  });

  it('Should revert if burn is not called from Cover contract', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const [manager, staker] = this.accounts.members;
    const DECIMALS_18 = BigNumber.from(10).pow(18);
    const stakeAmountInNxm = BigNumber.from(100000);
    const stakeAmount = stakeAmountInNxm.mul(DECIMALS_18);

    // Initialize pool and set products
    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    await cover.setProduct({ ...coverProductTemplate }, 0);
    await stakingPool.connect(manager).setProducts([{ ...newProductTemplate }]);

    // Deposit into pool
    await nxm.connect(staker).approve(tokenController.address, stakeAmount);
    const request = await depositRequest(stakingPool, stakeAmount, manager.address);
    await stakingPool.connect(staker).depositTo([request]);

    await cover.performStakeBurn(stakingPool.address, 1);

    await expect(stakingPool.burnStake(1)).to.be.revertedWith(
      'StakingPool: Only Cover contract can call this function',
    );
  });

  it.skip('Should burn and deposit until stakeShares overflows', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const [manager, staker] = this.accounts.members;
    // const stakeAmount = BigNumber.from(2).pow(64).sub(1);
    const DECIMALS_18 = BigNumber.from(10).pow(18);
    const stakeAmountInNxm = BigNumber.from(100);
    const stakeAmount = stakeAmountInNxm.mul(DECIMALS_18);

    // Initialize pool and set products
    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    await cover.setProduct({ ...coverProductTemplate }, 0);
    await stakingPool.connect(manager).setProducts([{ ...newProductTemplate }]);
    let { timestamp } = await ethers.provider.getBlock('latest');
    let totalBurns = 0;
    let totalDeposits = 0;
    let totalBurned = BigNumber.from(0);
    const depositsBetweenBurns = 10;
    let failed;
    while (!failed) {
      try {
        for (let i = 0; i < depositsBetweenBurns; i++) {
          // Deposit into staking pool
          await nxm.connect(staker).approve(tokenController.address, stakeAmount);
          const request = await depositRequest(stakingPool, stakeAmount, manager.address);
          await stakingPool.connect(staker).depositTo([request]);

          ++totalDeposits;
        }

        let activeStake = BigNumber.from(0);
        const activeTranches = await stakingPool.getActiveTranches();
        activeTranches.map(t => (activeStake = activeStake.add(t.activeStake)));
        const amountToBurn = activeStake.mul(5).div(10);
        totalBurns++;
        totalBurned = totalBurned.add(amountToBurn);

        // Burn
        await cover.performStakeBurn(stakingPool.address, amountToBurn);
        timestamp += daysToSeconds('1');
        await setNextBlockTime(timestamp);
        await mineNextBlock();
      } catch (e) {
        console.log(e);
        failed = true;
        console.log('number of deposits: ', totalDeposits);
        console.log('number of burns: ', totalBurns);
      }
    }
  });

  it('Should burn 99.99% of a large stake and not cause rounding issues', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;
    const stakeAmount = BigNumber.from(9).pow(18);
    const UINT16_MAX = BigNumber.from(2).pow(16).sub(1);
    let productIdCounter = 0;
    // Initialize Products
    const products = await Promise.all(
      Array(20)
        .fill('')
        .map(() => {
          const product = { ...newProductTemplate, productId: productIdCounter++ };
          cover.setProduct({ ...coverProductTemplate }, product.productId);
          return product;
        }),
    );

    // Initialize pool and set products
    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    await stakingPool.connect(manager).setProducts(products);

    // Deposit into staking pool
    await nxm.connect(staker).approve(tokenController.address, stakeAmount);
    const request = await depositRequest(stakingPool, stakeAmount, manager.address);
    await stakingPool.connect(staker).depositTo([request]);

    const ratio = await cover.getPriceAndCapacityRatios([0]);
    const { requestedTranchesCapacity } = await stakingPool.getTrancheCapacities(
      0,
      request.trancheId,
      8,
      ratio._globalCapacityRatio,
      ratio._capacityReductionRatios[0],
    );
    // Build CoverBuy parameters
    const coverageAmount = requestedTranchesCapacity.mul(BigNumber.from(10).pow(16));
    const coverId = 1;
    const coverBuyParams = Array(20)
      .fill('')
      .map(() => {
        return {
          ...buyCoverParamsTemplate,
          owner: coverBuyer.address,
          productId: --productIdCounter,
          amount: coverageAmount,
        };
      });

    // Buy covers
    await Promise.all(
      coverBuyParams.map(cb => {
        return cover.connect(coverBuyer).allocateCapacity(cb, coverId, stakingPool.address);
      }),
    );

    // Burn stake
    await cover.performStakeBurn(stakingPool.address, stakeAmount.sub(1));

    // Recalculate effective weight
    const productIds = products.map(p => {
      return p.productId;
    });
    const maxWeight = await stakingPool.MAX_TOTAL_WEIGHT();
    expect(await stakingPool.totalEffectiveWeight()).to.be.equal(maxWeight);
    await stakingPool.recalculateEffectiveWeights(productIds);
    expect(await stakingPool.totalEffectiveWeight()).to.be.equal(UINT16_MAX.mul(productIds.length));

    // lower product 10 to half weight to add half weight on another product
    const newProducts = [
      { ...newProductTemplate, targetWeight: 50, productId: 10 },
      { ...newProductTemplate, productId: 50 },
    ];
    await cover.setProduct({ ...coverProductTemplate }, newProducts[1].productId);
    await expect(stakingPool.connect(manager).setProducts(newProducts)).to.be.revertedWith(
      'StakingPool: Total max effective weight exceeded',
    );

    {
      // Deposit into staking pool
      await nxm.connect(staker).approve(tokenController.address, stakeAmount);
      const request = await depositRequest(stakingPool, stakeAmount, manager.address);
      await stakingPool.connect(staker).depositTo([request]);
    }
  });

  it('Should be able to lower target weights after a burn puts totalEffectiveWeight above the max', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;
    const stakeAmount = BigNumber.from(2).pow(64).sub(1);
    const UINT16_MAX = BigNumber.from(2).pow(16).sub(1);
    let productIdCounter = 0;
    // Initialize Products
    const products = await Promise.all(
      Array(200)
        .fill('')
        .map(() => {
          const product = { ...newProductTemplate, productId: productIdCounter++, targetWeight: 10 };
          cover.setProduct({ ...coverProductTemplate }, product.productId);
          return product;
        }),
    );

    // Initialize pool and set products
    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    await stakingPool.connect(manager).setProducts(products);

    // Deposit into staking pool
    await nxm.connect(staker).approve(tokenController.address, stakeAmount);
    const request = await depositRequest(stakingPool, stakeAmount, manager.address);
    await stakingPool.connect(staker).depositTo([request]);

    // Build CoverBuy parameters
    const coverageAmount = stakeAmount.div(20);
    const coverId = 1;
    const coverBuyParams = Array(200)
      .fill('')
      .map(() => {
        return {
          ...buyCoverParamsTemplate,
          owner: coverBuyer.address,
          productId: --productIdCounter,
          amount: coverageAmount,
        };
      });

    // Buy covers
    await Promise.all(
      coverBuyParams.map(cb => {
        return cover.connect(coverBuyer).allocateCapacity(cb, coverId, stakingPool.address);
      }),
    );

    // Burn stake
    await cover.performStakeBurn(stakingPool.address, stakeAmount.sub(1));

    // Recalculate effective weight
    const productIds = products.map(p => {
      return p.productId;
    });
    const maxWeight = await stakingPool.MAX_TOTAL_WEIGHT();
    expect(await stakingPool.totalEffectiveWeight()).to.be.equal(maxWeight);
    await stakingPool.recalculateEffectiveWeights(productIds);
    expect(await stakingPool.totalEffectiveWeight()).to.be.equal(UINT16_MAX.mul(productIds.length));

    // Remove all products
    const productEdits = Array(200)
      .fill('')
      .map(() => {
        return {
          ...newProductTemplate,
          productId: productIdCounter++,
          targetWeight: 0,
        };
      });

    await stakingPool.connect(manager).setProducts(productEdits);
    const product0 = await stakingPool.products(0);
    expect(product0.targetWeight).to.be.equal(0);
    expect(await stakingPool.totalEffectiveWeight()).to.be.gt(maxWeight);
    const buyCoverParams = {
      ...buyCoverParamsTemplate,
      owner: coverBuyer.address,
      productId: 0,
      amount: coverageAmount,
    };
    await expect(
      cover.connect(coverBuyer).allocateCapacity(buyCoverParams, coverId, stakingPool.address),
    ).to.be.revertedWith('StakingPool: Insufficient capacity');
  });

  it('Should burn 100% of the current stake when fully allocated', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;
    const UINT16_MAX = BigNumber.from(2).pow(16).sub(1);
    const stakeAmount = parseEther('1');

    let productIdCounter = 0;
    const initialProducts = Array(20)
      .fill('')
      .map(() => ({ ...initialProductTemplate, productId: productIdCounter++ }));

    // Add products to cover contract
    await Promise.all(
      initialProducts.map(({ productId, initialPrice: initialPriceRatio }) => [
        cover.setProduct({ ...coverProductTemplate, initialPriceRatio }, productId),
        cover.setProductType(ProductTypeFixture, productId),
      ]),
    );
    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, initialProducts, 0);

    // Get capacity in staking pool
    await nxm.connect(staker).approve(tokenController.address, stakeAmount);
    const request = await depositRequest(stakingPool, stakeAmount, manager.address);
    await stakingPool.connect(staker).depositTo([request]);

    const ratio = await cover.getPriceAndCapacityRatios([0]);
    const { totalCapacity } = await stakingPool.getActiveTrancheCapacities(
      0,
      ratio._globalCapacityRatio,
      ratio._capacityReductionRatios[0],
    );
    expect(totalCapacity).to.be.equal(200);

    // Initialize Products and CoverBuy requests
    const coverageAmount = stakeAmount.mul(2);
    const coverId = 1;
    const coverBuyParams = Array(20)
      .fill('')
      .map(() => {
        return {
          ...buyCoverParamsTemplate,
          owner: coverBuyer.address,
          productId: --productIdCounter,
          amount: coverageAmount,
        };
      });
    await Promise.all(
      coverBuyParams.map(cb => {
        return cover.connect(coverBuyer).allocateCapacity(cb, coverId, stakingPool.address);
      }),
    );

    // Burn all stake
    await cover.performStakeBurn(stakingPool.address, stakeAmount);
    expect(await stakingPool.totalActiveStake()).to.be.equal(0);

    {
      const { totalCapacity } = await stakingPool.getActiveTrancheCapacities(
        productIdCounter,
        ratio._globalCapacityRatio,
        ratio._capacityReductionRatios[0],
      );
      expect(totalCapacity).to.be.equal(0);
    }

    const productIds = initialProducts.map(p => {
      return p.productId;
    });
    await stakingPool.recalculateEffectiveWeights(productIds);
    const product10 = await stakingPool.products(10);
    expect(product10.lastEffectiveWeight).to.be.equal(UINT16_MAX);
    expect(await stakingPool.totalEffectiveWeight()).to.be.eq(UINT16_MAX.mul(productIds.length));

    // lower product 10 to half weight to add half weight on another product
    const newProducts = [
      { ...newProductTemplate, targetWeight: 50, productId: 10 },
      { ...newProductTemplate, productId: 50 },
    ];
    await cover.setProduct({ ...coverProductTemplate }, newProducts[1].productId);
    await expect(stakingPool.connect(manager).setProducts(newProducts)).to.be.revertedWith(
      'StakingPool: Total max effective weight exceeded',
    );
  });

  it('Should not revert if burning more stake than exists in pool', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const [manager, staker] = this.accounts.members;
    const DECIMALS_18 = BigNumber.from(10).pow(18);
    const stakeAmountInNxm = BigNumber.from(100000);
    const stakeAmount = stakeAmountInNxm.mul(DECIMALS_18);

    // Initialize pool and set products
    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    await cover.setProduct({ ...coverProductTemplate }, 0);
    await stakingPool.connect(manager).setProducts([{ ...newProductTemplate }]);

    // Deposit into pool
    await nxm.connect(staker).approve(tokenController.address, stakeAmount);
    const request = await depositRequest(stakingPool, stakeAmount, manager.address);
    await stakingPool.connect(staker).depositTo([request]);

    await cover.performStakeBurn(stakingPool.address, stakeAmount.add(1));
    expect(await stakingPool.totalActiveStake()).to.be.equal(0);
    await cover.performStakeBurn(stakingPool.address, stakeAmount);
  });

  it('Should revert depositing into a pool with all of its stake burned', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const [manager, staker] = this.accounts.members;
    const DECIMALS_18 = BigNumber.from(10).pow(18);
    const stakeAmountInNxm = BigNumber.from(100000);
    const stakeAmount = stakeAmountInNxm.mul(DECIMALS_18);

    // Initialize pool and set products
    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    await cover.setProduct({ ...coverProductTemplate }, 0);
    await stakingPool.connect(manager).setProducts([{ ...newProductTemplate }]);

    // Deposit into pool
    await nxm.connect(staker).approve(tokenController.address, stakeAmount);
    const request = await depositRequest(stakingPool, stakeAmount, manager.address);
    await stakingPool.connect(staker).depositTo([request]);

    await cover.performStakeBurn(stakingPool.address, stakeAmount.add(1));
    expect(await stakingPool.totalActiveStake()).to.be.equal(0);

    // Deposit
    await nxm.connect(staker).approve(tokenController.address, stakeAmount);
    await expect(stakingPool.connect(staker).depositTo([request])).to.be.revertedWithPanic(0x12);
  });

  it('Should expire burned stake, resetting stakeShare values', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;
    const { BUCKET_DURATION, TRANCHE_DURATION } = this.config;
    const DECIMALS_18 = BigNumber.from(10).pow(18);
    const stakeAmountInNxm = BigNumber.from(100000);
    const stakeAmount = stakeAmountInNxm.mul(DECIMALS_18);

    // Initialize pool and set products
    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    await cover.setProduct({ ...coverProductTemplate }, 0);
    await stakingPool.connect(manager).setProducts([{ ...newProductTemplate }]);

    // Deposit into pool
    await nxm.connect(staker).approve(tokenController.address, stakeAmount);
    const request = await depositRequest(stakingPool, stakeAmount, manager.address);
    await stakingPool.connect(staker).depositTo([request]);

    // Buy coverage
    const coverBuyParams = { ...buyCoverParamsTemplate, owner: coverBuyer.address, amount: stakeAmount };
    await cover.connect(coverBuyer).allocateCapacity(coverBuyParams, 1, stakingPool.address);

    // Burn stake
    await cover.performStakeBurn(stakingPool.address, stakeAmount);
    expect(await stakingPool.totalActiveStake()).to.be.equal(0);
    const firstActiveBucketId = await stakingPool.firstActiveBucketId();
    const firstActiveTrancheId = await stakingPool.firstActiveTrancheId();

    let { timestamp } = await ethers.provider.getBlock('latest');
    const numTranches = 8;
    const secondsForward = TRANCHE_DURATION.mul(numTranches).toNumber();
    timestamp += secondsForward;
    await setNextBlockTime(timestamp);
    await mineNextBlock();

    await cover.performStakeBurn(stakingPool.address, stakeAmount);
    expect(await stakingPool.firstActiveBucketId()).to.be.equal(
      firstActiveBucketId.add(Math.floor(secondsForward / BUCKET_DURATION)),
    );
    expect(await stakingPool.firstActiveTrancheId()).to.be.equal(firstActiveTrancheId.add(numTranches));

    const { stakeShares, activeStake } = await stakingPool.tranches(request.trancheId);
    expect(activeStake).to.be.equal(0);
    expect(stakeShares).to.be.equal(0);
    {
      // Deposit into pool
      await nxm.connect(staker).approve(tokenController.address, stakeAmount);
      const request = await depositRequest(stakingPool, stakeAmount, manager.address);
      await stakingPool.connect(staker).depositTo([request]);
      const { stakeShares, activeStake } = await stakingPool.tranches(request.trancheId);
      expect(activeStake).to.be.equal(stakeAmount);
      expect(stakeShares).to.be.gt(0);
      // TODO: sqrt value off by small fraction..
      // expect(activeStake).to.be.equal(stakeShares.mul(stakeShares));
    }

    {
      // Buy coverage
      const coverBuyParams = { ...buyCoverParamsTemplate, owner: coverBuyer.address, amount: stakeAmount };
      await cover.connect(coverBuyer).allocateCapacity(coverBuyParams, 1, stakingPool.address);
    }
  });
});
