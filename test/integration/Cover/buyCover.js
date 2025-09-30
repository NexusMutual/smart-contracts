const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, setNextBlockBaseFeePerGas } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { setNextBlockTime } = require('../../utils/evm');
const { daysToSeconds } = require('../utils');

const { calculatePremium, getInternalPrice } = nexus.protocol;
const { BigIntMath } = nexus.helpers;
const { PoolAsset } = nexus.constants;

const REWARD_DENOMINATOR = 10000n;
const PRICE_CHANGE_PER_DAY = 200n;

function calculateRewards(premium, timestamp, period, rewardRatio, bucketDuration) {
  const expirationBucket = BigIntMath.divCeil(BigInt(timestamp) + BigInt(period), bucketDuration);
  const rewardStreamPeriod = expirationBucket * bucketDuration - BigInt(timestamp);
  const rewardPerSecond = (premium * rewardRatio) / REWARD_DENOMINATOR / rewardStreamPeriod;
  return rewardPerSecond * rewardStreamPeriod;
}

const stakedProductParamTemplate = {
  productId: 0, // Use Product 0 which allows all pools
  recalculateEffectiveWeight: true,
  setTargetWeight: true,
  targetWeight: 100,
  setTargetPrice: true,
  targetPrice: 100,
};

const buyCoverFixture = (overrides = {}) => ({
  coverId: 0,
  owner: ethers.ZeroAddress,
  productId: stakedProductParamTemplate.productId,
  coverAsset: PoolAsset.ETH,
  amount: ethers.parseEther('1'),
  period: daysToSeconds(30),
  maxPremiumInAsset: ethers.MaxUint256,
  paymentAsset: PoolAsset.ETH,
  commissionRatio: 0,
  commissionDestination: ethers.ZeroAddress,
  ipfsData: 'ipfs data',
  ...overrides,
});

async function buyCoverSetup() {
  const fixture = await loadFixture(setup);
  const { products } = fixture;
  const [manager1, manager2, manager3] = fixture.accounts.stakingPoolManagers;
  const { stakingProducts } = fixture.contracts;

  const { targetPrice } = stakedProductParamTemplate;
  const productIdWithBumpedPrice = products.findIndex(
    p => targetPrice !== p.product.initialPriceRatio && !p.product.useFixedPrice,
  );
  const productIdWithFixedPrice = products.findIndex(
    p => targetPrice !== p.product.initialPriceRatio && p.product.useFixedPrice,
  );
  const productIdIsDeprecated = products.findIndex(p => p.product.isDeprecated);

  await stakingProducts
    .connect(manager1)
    .setProducts(1, [
      stakedProductParamTemplate,
      { ...stakedProductParamTemplate, productId: productIdWithBumpedPrice },
      { ...stakedProductParamTemplate, productId: productIdWithFixedPrice },
      { ...stakedProductParamTemplate, productId: productIdIsDeprecated },
    ]);
  await stakingProducts.connect(manager2).setProducts(2, [stakedProductParamTemplate]);
  await stakingProducts.connect(manager3).setProducts(3, [stakedProductParamTemplate]);

  return fixture;
}

describe('buyCover', function () {
  it('allows to buy against multiple staking pools', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tokenController, stakingProducts, ramm, pool } = fixture.contracts;
    const [coverBuyer, coverReceiver] = fixture.accounts.members;
    const { GLOBAL_REWARDS_RATIO, NXM_PER_ALLOCATION_UNIT, BUCKET_DURATION } = fixture.config;
    const { productId, period, amount } = buyCoverFixture();

    const product = await stakingProducts.getProduct(1, productId);

    const latestBlock = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = latestBlock.timestamp + 10;
    const nxmPrice = await getInternalPrice(ramm, pool, tokenController, nextBlockTimestamp);

    const coverAmountAllocationsPerPool = [
      amount / 3n, // a third
      amount / 3n, // second third
      amount - (amount / 3n) * 2n, // whatever's left
    ];

    const premiums = coverAmountAllocationsPerPool.map(amount =>
      calculatePremium(amount, nxmPrice, period, product.bumpedPrice, NXM_PER_ALLOCATION_UNIT),
    );
    const rewards = premiums.map(premium =>
      calculateRewards(premium.premiumInNxm, nextBlockTimestamp, period, GLOBAL_REWARDS_RATIO, BUCKET_DURATION),
    );

    const premiumInNxm = premiums.reduce((total, premium) => total + premium.premiumInNxm, 0n);
    const premiumInAsset = (premiumInNxm * nxmPrice) / ethers.parseEther('1');

    const stakingPool1Before = await tokenController.stakingPoolNXMBalances(1);
    const stakingPool2Before = await tokenController.stakingPoolNXMBalances(2);
    const stakingPool3Before = await tokenController.stakingPoolNXMBalances(3);

    const buyCoverParams = buyCoverFixture({ owner: coverReceiver.address, maxPremiumInAsset: premiumInAsset });
    const poolAllocationRequests = [
      { poolId: 1, coverAmountInAsset: coverAmountAllocationsPerPool[0] },
      { poolId: 2, coverAmountInAsset: coverAmountAllocationsPerPool[1] },
      { poolId: 3, coverAmountInAsset: coverAmountAllocationsPerPool[2] },
    ];

    await setNextBlockTime(nextBlockTimestamp);
    await cover.connect(coverBuyer).buyCover(buyCoverParams, poolAllocationRequests, { value: premiumInAsset });

    const stakingPool1After = await tokenController.stakingPoolNXMBalances(1);
    const stakingPool2After = await tokenController.stakingPoolNXMBalances(2);
    const stakingPool3After = await tokenController.stakingPoolNXMBalances(3);

    // validate that rewards increased
    expect(stakingPool1After.rewards).to.equal(stakingPool1Before.rewards + rewards[0]);
    expect(stakingPool2After.rewards).to.equal(stakingPool2Before.rewards + rewards[1]);
    expect(stakingPool3After.rewards).to.equal(stakingPool3Before.rewards + rewards[2]);

    const coverId = await cover.getCoverDataCount();
    const poolAllocations = await cover.getPoolAllocations(coverId);

    for (let i = 0; i < 3; i++) {
      expect(poolAllocations[i].poolId).to.equal(i + 1);
      expect(poolAllocations[i].coverAmountInNXM).to.equal(premiums[i].coverNXMAmount);
      expect(poolAllocations[i].premiumInNXM).to.equal(premiums[i].premiumInNxm);
    }
  });

  it('should purchase new cover with bumped price after initialization', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tokenController, stakingProducts, pool, ramm } = fixture.contracts;
    const [coverBuyer, coverReceiver] = fixture.accounts.members;
    const { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO, BUCKET_DURATION } = fixture.config;
    const { period, amount, productId } = buyCoverFixture();

    const latestBlock = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = latestBlock.timestamp + 10;

    const ethRate = await getInternalPrice(ramm, pool, tokenController, nextBlockTimestamp);
    const product = await stakingProducts.getProduct(1, productId); // poolId1, productId 0 (has bumped pricing)

    const { premiumInNxm, premiumInAsset } = calculatePremium(
      amount,
      ethRate,
      period,
      product.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
    const poolBeforeETH = await ethers.provider.getBalance(pool.target);
    const buyCoverParams = buyCoverFixture({ owner: coverReceiver.address, maxPremiumInAsset: premiumInAsset });

    await setNextBlockTime(nextBlockTimestamp);
    await cover
      .connect(coverBuyer)
      .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: amount }], { value: premiumInAsset });

    const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
    const poolAfterETH = await ethers.provider.getBalance(pool.target);
    const rewards = calculateRewards(premiumInNxm, nextBlockTimestamp, period, GLOBAL_REWARDS_RATIO, BUCKET_DURATION);

    expect(stakingPoolAfter.rewards).to.equal(stakingPoolBefore.rewards + rewards);
    expect(poolAfterETH).to.equal(poolBeforeETH + premiumInAsset);
  });

  it('should purchase new cover with calculated price after the drop', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tokenController, stakingProducts, pool, ramm } = fixture.contracts;
    const [coverBuyer, coverReceiver] = fixture.accounts.members;
    const { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO, BUCKET_DURATION } = fixture.config;
    const { period, amount } = buyCoverFixture();
    const { targetPrice } = stakedProductParamTemplate;
    const daysElapsed = 1;

    const productId = fixture.products.findIndex(
      ({ product: { initialPriceRatio, useFixedPrice } }) => targetPrice !== initialPriceRatio && !useFixedPrice,
    );
    const product = await stakingProducts.getProduct(1, productId);

    const timeDecayedPrice = product.bumpedPrice - BigInt(daysElapsed) * PRICE_CHANGE_PER_DAY;
    const price = BigIntMath.max(timeDecayedPrice, BigInt(targetPrice));
    const nextTimestamp = product.bumpedPriceUpdateTime + BigInt(daysToSeconds(daysElapsed));
    const ethRate = await getInternalPrice(ramm, pool, tokenController, nextTimestamp);

    const { premiumInNxm, premiumInAsset } = calculatePremium(amount, ethRate, period, price, NXM_PER_ALLOCATION_UNIT);

    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
    const poolBeforeETH = await ethers.provider.getBalance(pool.target);
    const buyCoverParams = buyCoverFixture({
      productId,
      owner: coverReceiver.address,
      maxPremiumInAsset: premiumInAsset,
    });

    await setNextBlockTime(Number(nextTimestamp));
    await cover
      .connect(coverBuyer)
      .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: amount }], { value: premiumInAsset });

    const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
    const poolAfterETH = await ethers.provider.getBalance(pool.target);
    const rewards = calculateRewards(premiumInNxm, nextTimestamp, period, GLOBAL_REWARDS_RATIO, BUCKET_DURATION);

    expect(stakingPoolAfter.rewards).to.equal(stakingPoolBefore.rewards + rewards);
    expect(poolAfterETH).to.equal(poolBeforeETH + premiumInAsset);
  });

  it('should purchase new cover with fixed price', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tokenController, stakingProducts, pool, ramm } = fixture.contracts;
    const [coverBuyer, coverReceiver] = fixture.accounts.members;
    const { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO, BUCKET_DURATION } = fixture.config;
    const { products } = fixture;
    const { period, amount } = buyCoverFixture();
    const { targetPrice } = stakedProductParamTemplate;

    const latestBlock = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = latestBlock.timestamp + 10;
    const ethRate = await getInternalPrice(ramm, pool, tokenController, nextBlockTimestamp);

    const fixedPriceProductId = products.findIndex(
      p => targetPrice !== p.product.initialPriceRatio && p.product.useFixedPrice,
    );

    const product = await stakingProducts.getProduct(1, fixedPriceProductId);
    const { premiumInNxm, premiumInAsset } = calculatePremium(
      amount,
      ethRate,
      period,
      product.targetPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
    const poolBeforeETH = await ethers.provider.getBalance(pool.target);
    const buyCoverParams = buyCoverFixture({
      productId: fixedPriceProductId,
      owner: coverReceiver.address,
      maxPremiumInAsset: premiumInAsset,
    });

    await setNextBlockTime(nextBlockTimestamp);
    await cover
      .connect(coverBuyer)
      .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: amount }], { value: premiumInAsset });

    const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
    const poolAfterETH = await ethers.provider.getBalance(pool.target);
    const rewards = calculateRewards(premiumInNxm, nextBlockTimestamp, period, GLOBAL_REWARDS_RATIO, BUCKET_DURATION);

    expect(stakingPoolAfter.rewards).to.equal(stakingPoolBefore.rewards + rewards);
    expect(poolAfterETH).to.equal(poolBeforeETH + premiumInAsset);
  });

  it('should revert the purchase of deprecated product', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { products } = fixture;
    const { cover } = fixture.contracts;
    const [coverBuyer, coverReceiver] = fixture.accounts.members;
    const { amount } = buyCoverFixture();

    const productId = products.findIndex(({ product: { isDeprecated } }) => isDeprecated);

    const buyCoverParams = buyCoverFixture({ productId, owner: coverReceiver.address, maxPremiumInAsset: amount });
    const buyCover = cover
      .connect(coverBuyer)
      .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: amount }], { value: amount });

    await expect(buyCover).to.revertedWithCustomError(cover, 'ProductDeprecated');
  });
});

describe('CoverBroker - buyCover', function () {
  it('should revert with InvalidOwnerAddress if params.owner is zero address', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { coverBroker } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.nonMembers;

    const buyCoverParams = buyCoverFixture({ paymentAsset: 1, owner: ethers.ZeroAddress });
    const buyCover = coverBroker
      .connect(coverBuyer)
      .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: ethers.parseEther('1') }], {
        value: ethers.parseEther('1'),
      });

    await expect(buyCover).to.revertedWithCustomError(coverBroker, 'InvalidOwnerAddress');
  });

  it('should revert with InvalidOwnerAddress if params.owner is CoverBroker address', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { coverBroker } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.nonMembers;

    const buyCoverParams = buyCoverFixture({ paymentAsset: 1, owner: coverBroker.target });
    const allocations = [{ poolId: 1, coverAmountInAsset: ethers.parseEther('1') }];
    const buyCover = coverBroker
      .connect(coverBuyer)
      .buyCover(buyCoverParams, allocations, { value: ethers.parseEther('1') });

    await expect(buyCover).to.revertedWithCustomError(coverBroker, 'InvalidOwnerAddress');
  });

  it('should revert with InvalidPaymentAsset if paymentAsset is NXM asset ID (255)', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { coverBroker } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.nonMembers;

    const buyCoverParams = buyCoverFixture({ paymentAsset: PoolAsset.NXM, owner: coverBuyer.address });
    const allocations = [{ poolId: 1, coverAmountInAsset: ethers.parseEther('1') }];
    const buyCover = coverBroker
      .connect(coverBuyer)
      .buyCover(buyCoverParams, allocations, { value: ethers.parseEther('1') });

    await expect(buyCover).to.revertedWithCustomError(coverBroker, 'InvalidPaymentAsset');
  });

  it('should revert with InvalidPayment if paymentAsset is not ETH and msg.value > 0', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { coverBroker } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.nonMembers;

    const buyCoverParams = buyCoverFixture({ paymentAsset: PoolAsset.USDC, owner: coverBuyer.address });
    const allocations = [{ poolId: 1, coverAmountInAsset: ethers.parseEther('1') }];
    const buyCover = coverBroker
      .connect(coverBuyer)
      .buyCover(buyCoverParams, allocations, { value: ethers.parseEther('1') });

    await expect(buyCover).to.revertedWithCustomError(coverBroker, 'InvalidPayment');
  });

  it('should enable non-members to buy cover through the broker with ETH', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { tokenController, stakingProducts, pool, ramm, coverBroker, coverNFT } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.nonMembers;
    const { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO, BUCKET_DURATION } = fixture.config;
    const { period, amount } = buyCoverFixture();

    const latestBlock = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = latestBlock.timestamp + 10;

    const { targetPrice } = stakedProductParamTemplate;
    const productId = fixture.products.findIndex(
      ({ product: { initialPriceRatio, useFixedPrice } }) => targetPrice !== initialPriceRatio && useFixedPrice,
    );

    const ethRate = await getInternalPrice(ramm, pool, tokenController, nextBlockTimestamp);
    const product = await stakingProducts.getProduct(1, productId);
    const { premiumInNxm, premiumInAsset } = calculatePremium(
      amount,
      ethRate,
      period,
      product.targetPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
    const poolBeforeETH = await ethers.provider.getBalance(pool.target);

    const amountOver = ethers.parseEther('1');
    const balanceBefore = await ethers.provider.getBalance(coverBuyer.address);
    const nftBalanceBefore = await coverNFT.balanceOf(coverBuyer.address);

    await setNextBlockBaseFeePerGas(0);
    await setNextBlockTime(nextBlockTimestamp);

    const buyCoverParams = buyCoverFixture({
      paymentAsset: PoolAsset.ETH,
      productId,
      owner: coverBuyer.address,
      maxPremiumInAsset: premiumInAsset,
    });
    const allocations = [{ poolId: 1, coverAmountInAsset: amount }];

    await coverBroker
      .connect(coverBuyer)
      .buyCover(buyCoverParams, allocations, { value: premiumInAsset + amountOver, gasPrice: 0 });

    const balanceAfter = await ethers.provider.getBalance(coverBuyer.address);
    const nftBalanceAfter = await coverNFT.balanceOf(coverBuyer.address);

    expect(nftBalanceAfter).to.equal(nftBalanceBefore + 1n);
    expect(balanceAfter).to.equal(balanceBefore - premiumInAsset); // amountOver should have been refunded

    const { timestamp } = await ethers.provider.getBlock('latest');
    const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
    const poolAfterETH = await ethers.provider.getBalance(pool.target);
    const rewards = calculateRewards(premiumInNxm, timestamp, period, GLOBAL_REWARDS_RATIO, BUCKET_DURATION);

    expect(stakingPoolAfter.rewards).to.equal(stakingPoolBefore.rewards + rewards);
    expect(poolAfterETH).to.equal(poolBeforeETH + premiumInAsset);
  });

  it('should enable non-members to buy cover through the broker with USDC', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { tokenController, stakingProducts, pool, coverBroker, usdc, coverNFT } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.nonMembers;
    const { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO, BUCKET_DURATION } = fixture.config;
    const { period, productId } = buyCoverFixture();

    const usdcAmount = ethers.parseUnits('10000', 6);
    await usdc.mint(coverBuyer.address, usdcAmount);
    await usdc.connect(coverBuyer).approve(coverBroker.target, usdcAmount);
    await coverBroker.maxApproveCoverContract(usdc.target);

    const nxmPriceInUsdc = await pool.getInternalTokenPriceInAsset(PoolAsset.USDC);
    const product = await stakingProducts.getProduct(1, productId);

    const { premiumInNxm } = calculatePremium(
      usdcAmount,
      nxmPriceInUsdc,
      period,
      product.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const premiumInAsset = (premiumInNxm * nxmPriceInUsdc) / ethers.parseEther('1');
    const amountOver = ethers.parseUnits('100', 6);
    const maxPremiumInAsset = premiumInAsset + amountOver;

    const userBalanceBefore = await usdc.balanceOf(coverBuyer.address);
    const poolBeforeUSDC = await usdc.balanceOf(pool.target);
    const nftBalanceBefore = await coverNFT.balanceOf(coverBuyer.address);
    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(2); // pool 2

    const buyCoverParams = buyCoverFixture({
      amount: usdcAmount,
      productId,
      owner: coverBuyer.address,
      maxPremiumInAsset,
      coverAsset: PoolAsset.USDC,
      paymentAsset: PoolAsset.USDC,
    });
    await coverBroker.connect(coverBuyer).buyCover(buyCoverParams, [{ poolId: 2, coverAmountInAsset: usdcAmount }]);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const userBalanceAfter = await usdc.balanceOf(coverBuyer.address);
    const poolAfterUSDC = await usdc.balanceOf(pool.target);
    const nftBalanceAfter = await coverNFT.balanceOf(coverBuyer.address);
    const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(2); // pool 2

    expect(nftBalanceAfter).to.equal(nftBalanceBefore + 1n);
    expect(userBalanceAfter).to.equal(userBalanceBefore - premiumInAsset);

    const rewards = calculateRewards(premiumInNxm, timestamp, period, GLOBAL_REWARDS_RATIO, BUCKET_DURATION);

    expect(stakingPoolAfter.rewards).to.equal(stakingPoolBefore.rewards + rewards);
    expect(poolAfterUSDC).to.equal(poolBeforeUSDC + premiumInAsset);
  });
});
