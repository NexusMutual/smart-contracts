const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, setNextBlockBaseFeePerGas } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { setNextBlockTime } = require('../../utils/evm');
const { daysToSeconds, calculateRewards } = require('../utils');

const { calculatePremium, getInternalPrice } = nexus.protocol;
const { BigIntMath } = nexus.helpers;
const { PoolAsset } = nexus.constants;

const PRICE_CHANGE_PER_DAY = 200n;

const buyCoverFixture = (overrides = {}) => ({
  coverId: 0,
  owner: ethers.ZeroAddress,
  productId: 0,
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

describe('buyCover', function () {
  const productId = 0; // Default product for all tests
  const period = daysToSeconds(30); // Default period for all tests

  // Test configurations for payment assets
  const paymentTestConfigs = [
    {
      name: 'ETH',
      paymentAsset: PoolAsset.ETH,
      coverAsset: PoolAsset.ETH,
      getAmount: () => ethers.parseEther('1'),
      setup: async () => {}, // No setup needed for ETH
      getAssetPrice: ({ ramm, pool, tokenController }, paymentAsset, timestamp) =>
        getInternalPrice(ramm, pool, tokenController, timestamp), // Get NXM price in ETH
      getPremiumInAsset: (premiumInNxm, assetPrice) => (premiumInNxm * assetPrice) / ethers.parseEther('1'),
      getBalance: (contracts, address) => ethers.provider.getBalance(address),
    },
    {
      name: 'USDC',
      paymentAsset: PoolAsset.USDC,
      coverAsset: PoolAsset.USDC,
      getAmount: () => ethers.parseUnits('100000', 6),
      setup: async ({ usdc, cover }, coverBuyer, amount) => {
        await usdc.mint(coverBuyer.address, amount);
        await usdc.connect(coverBuyer).approve(cover.target, ethers.MaxUint256);
      },
      getAssetPrice: ({ pool }, paymentAsset) => pool.getInternalTokenPriceInAsset(paymentAsset),
      getPremiumInAsset: (premiumInNxm, assetPrice) => (premiumInNxm * assetPrice) / ethers.parseEther('1'),
      getBalance: ({ usdc }, address) => usdc.balanceOf(address),
    },
    {
      name: 'NXM',
      paymentAsset: PoolAsset.NXM,
      coverAsset: PoolAsset.ETH,
      getAmount: () => ethers.parseEther('1'),
      setup: async ({ token, cover }, coverBuyer) => {
        await token.connect(coverBuyer).approve(cover.target, ethers.MaxUint256);
      },
      getAssetPrice: ({ ramm, pool, tokenController }, paymentAsset, timestamp) =>
        getInternalPrice(ramm, pool, tokenController, timestamp),
      getPremiumInAsset: premiumInNxm => premiumInNxm, // NXM: 1:1 with premiumInNxm
      getBalance: ({ token }, address) => token.balanceOf(address),
    },
  ];

  paymentTestConfigs.forEach(config => {
    describe(`paymentAsset=${config.name} / coverAsset=${config.name === 'NXM' ? 'ETH' : config.name}`, function () {
      it('allows to buy against multiple staking pools', async function () {
        const fixture = await loadFixture(setup);
        const { cover, tokenController, stakingProducts, token, pool } = fixture.contracts;
        const [coverBuyer, coverReceiver] = fixture.accounts.members;
        const { GLOBAL_REWARDS_RATIO, NXM_PER_ALLOCATION_UNIT, BUCKET_DURATION } = fixture.config;

        // Set base fee to 0 to allow gasPrice: 0 transactions (isolates balance changes from gas costs)
        await setNextBlockBaseFeePerGas(0);

        const amount = config.getAmount();
        await config.setup(fixture.contracts, coverBuyer, amount);

        const product = await stakingProducts.getProduct(1, productId);

        const latestBlock = await ethers.provider.getBlock('latest');
        const nextBlockTimestamp = latestBlock.timestamp + 10;
        const assetPrice = await config.getAssetPrice(fixture.contracts, config.paymentAsset, nextBlockTimestamp);

        const coverAmountAllocationsPerPool = [
          amount / 3n, // a third
          amount / 3n, // second third
          amount - (amount / 3n) * 2n, // whatever's left
        ];

        const premiums = coverAmountAllocationsPerPool.map(amount =>
          calculatePremium(amount, assetPrice, period, product.bumpedPrice, NXM_PER_ALLOCATION_UNIT),
        );
        const rewards = premiums.map(premium =>
          calculateRewards(premium.premiumInNxm, nextBlockTimestamp, period, GLOBAL_REWARDS_RATIO, BUCKET_DURATION),
        );

        const premiumInNxm = premiums.reduce((total, premium) => total + premium.premiumInNxm, 0n);
        const premiumInAsset = config.getPremiumInAsset(premiumInNxm, assetPrice);
        const totalRewards = rewards.reduce((total, reward) => total + reward, 0n);

        const stakingPool1Before = await tokenController.stakingPoolNXMBalances(1);
        const stakingPool2Before = await tokenController.stakingPoolNXMBalances(2);
        const stakingPool3Before = await tokenController.stakingPoolNXMBalances(3);
        const poolBalanceBefore = await config.getBalance(fixture.contracts, pool.target);
        const buyerBalanceBefore = await config.getBalance(fixture.contracts, coverBuyer.address);
        const tokenTotalSupplyBefore = await token.totalSupply();

        // NXM uses premiumInNxm for maxPremium (1:1), other assets use premiumInAsset
        const maxPremiumInAsset = config.paymentAsset === PoolAsset.NXM ? premiumInNxm : premiumInAsset;
        const buyCoverParams = buyCoverFixture({
          amount,
          coverAsset: config.coverAsset,
          paymentAsset: config.paymentAsset,
          owner: coverReceiver.address,
          maxPremiumInAsset,
        });
        const poolAllocationRequests = [
          { poolId: 1, coverAmountInAsset: coverAmountAllocationsPerPool[0] },
          { poolId: 2, coverAmountInAsset: coverAmountAllocationsPerPool[1] },
          { poolId: 3, coverAmountInAsset: coverAmountAllocationsPerPool[2] },
        ];

        await setNextBlockTime(nextBlockTimestamp);
        // ETH requires value parameter, ERC20 tokens (USDC, NXM) do not
        // Set gasPrice: 0 for ETH to isolate balance changes from gas costs
        const buyCoverOptions = config.paymentAsset === PoolAsset.ETH ? { value: maxPremiumInAsset, gasPrice: 0 } : {};
        await cover.connect(coverBuyer).buyCover(buyCoverParams, poolAllocationRequests, buyCoverOptions);

        const stakingPool1After = await tokenController.stakingPoolNXMBalances(1);
        const stakingPool2After = await tokenController.stakingPoolNXMBalances(2);
        const stakingPool3After = await tokenController.stakingPoolNXMBalances(3);
        const poolBalanceAfter = await config.getBalance(fixture.contracts, pool.target);
        const buyerBalanceAfter = await config.getBalance(fixture.contracts, coverBuyer.address);
        const tokenTotalSupplyAfter = await token.totalSupply();

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

        // Buyer balance decreases by premium paid (recalculate to get actual amount for payment asset)
        const buyerPremium = config.getPremiumInAsset(premiumInNxm, assetPrice);
        expect(buyerBalanceAfter).to.equal(buyerBalanceBefore - buyerPremium);

        // NXM is burned so no tokens is transferred to pool
        const poolTransferred = config.paymentAsset === PoolAsset.NXM ? 0n : premiumInAsset;
        const burned = config.paymentAsset === PoolAsset.NXM ? premiumInNxm : 0n; // NXM premium payment is burned
        expect(poolBalanceAfter).to.equal(poolBalanceBefore + poolTransferred);
        expect(tokenTotalSupplyAfter).to.equal(tokenTotalSupplyBefore + totalRewards - burned);
      });

      it('should purchase new cover with bumped price after initialization', async function () {
        const fixture = await loadFixture(setup);
        const { cover, tokenController, stakingProducts, token, pool } = fixture.contracts;
        const [coverBuyer, coverReceiver] = fixture.accounts.members;
        const { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO, BUCKET_DURATION } = fixture.config;

        // Set base fee to 0 to allow gasPrice: 0 transactions (isolates balance changes from gas costs)
        await setNextBlockBaseFeePerGas(0);

        const amount = config.getAmount();
        await config.setup(fixture.contracts, coverBuyer, amount);

        const latestBlock = await ethers.provider.getBlock('latest');
        const nextBlockTimestamp = latestBlock.timestamp + 10;

        const assetPrice = await config.getAssetPrice(fixture.contracts, config.paymentAsset, nextBlockTimestamp);
        const product = await stakingProducts.getProduct(1, productId);

        const { premiumInNxm, premiumInAsset } = calculatePremium(
          amount,
          assetPrice,
          period,
          product.bumpedPrice,
          NXM_PER_ALLOCATION_UNIT,
        );

        const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
        const poolBalanceBefore = await config.getBalance(fixture.contracts, pool.target);
        const buyerBalanceBefore = await config.getBalance(fixture.contracts, coverBuyer.address);
        const tokenTotalSupplyBefore = await token.totalSupply();

        // NXM uses premiumInNxm for maxPremium (1:1), other assets use premiumInAsset
        const maxPremiumInAsset = config.paymentAsset === PoolAsset.NXM ? premiumInNxm : premiumInAsset;
        const buyCoverParams = buyCoverFixture({
          amount,
          coverAsset: config.coverAsset,
          paymentAsset: config.paymentAsset,
          owner: coverReceiver.address,
          maxPremiumInAsset,
        });

        await setNextBlockTime(nextBlockTimestamp);
        // ETH requires value parameter, ERC20 tokens (USDC, NXM) do not
        // Set gasPrice: 0 for ETH to isolate balance changes from gas costs
        const buyCoverOptions = config.paymentAsset === PoolAsset.ETH ? { value: maxPremiumInAsset, gasPrice: 0 } : {};
        await cover
          .connect(coverBuyer)
          .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: amount }], buyCoverOptions);

        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
        const poolBalanceAfter = await config.getBalance(fixture.contracts, pool.target);
        const buyerBalanceAfter = await config.getBalance(fixture.contracts, coverBuyer.address);
        const tokenTotalSupplyAfter = await token.totalSupply();
        const rewards = calculateRewards(
          premiumInNxm,
          nextBlockTimestamp,
          period,
          GLOBAL_REWARDS_RATIO,
          BUCKET_DURATION,
        );

        expect(stakingPoolAfter.rewards).to.equal(stakingPoolBefore.rewards + rewards);

        // Buyer balance decreases by premium paid (recalculate to get actual amount for payment asset)
        const buyerPremium = config.getPremiumInAsset(premiumInNxm, assetPrice);
        expect(buyerBalanceAfter).to.equal(buyerBalanceBefore - buyerPremium);

        // NXM is burned so no tokens is transferred to pool
        const poolTransferred = config.paymentAsset === PoolAsset.NXM ? 0n : premiumInAsset;
        const burned = config.paymentAsset === PoolAsset.NXM ? premiumInNxm : 0n; // NXM premium payment is burned
        expect(poolBalanceAfter).to.equal(poolBalanceBefore + poolTransferred);
        expect(tokenTotalSupplyAfter).to.equal(tokenTotalSupplyBefore + rewards - burned);
      });

      it('should purchase new cover with calculated price after the drop', async function () {
        const fixture = await loadFixture(setup);
        const { cover, tokenController, stakingProducts, token, pool } = fixture.contracts;
        const [coverBuyer, coverReceiver] = fixture.accounts.members;
        const { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO, BUCKET_DURATION } = fixture.config;
        const [{ targetPrice }] = fixture.stakedProducts;
        const daysElapsed = 1;

        // Set base fee to 0 to isolate balance changes from gas costs
        await setNextBlockBaseFeePerGas(0);

        const amount = config.getAmount();
        await config.setup(fixture.contracts, coverBuyer, amount);

        const productId = fixture.products.findIndex(
          ({ product: { initialPriceRatio, useFixedPrice } }) => targetPrice !== initialPriceRatio && !useFixedPrice,
        );
        const product = await stakingProducts.getProduct(1, productId);

        const timeDecayedPrice = product.bumpedPrice - BigInt(daysElapsed) * PRICE_CHANGE_PER_DAY;
        const price = BigIntMath.max(timeDecayedPrice, BigInt(targetPrice));
        const nextTimestamp = product.bumpedPriceUpdateTime + BigInt(daysToSeconds(daysElapsed));
        const assetPrice = await config.getAssetPrice(fixture.contracts, config.paymentAsset, nextTimestamp);

        const { premiumInNxm, premiumInAsset } = calculatePremium(
          amount,
          assetPrice,
          period,
          price,
          NXM_PER_ALLOCATION_UNIT,
        );

        const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
        const poolBalanceBefore = await config.getBalance(fixture.contracts, pool.target);
        const buyerBalanceBefore = await config.getBalance(fixture.contracts, coverBuyer.address);
        const tokenTotalSupplyBefore = await token.totalSupply();

        // NXM uses premiumInNxm for maxPremium (1:1), other assets use premiumInAsset
        const maxPremiumInAsset = config.paymentAsset === PoolAsset.NXM ? premiumInNxm : premiumInAsset;
        const buyCoverParams = buyCoverFixture({
          amount,
          productId,
          coverAsset: config.coverAsset,
          paymentAsset: config.paymentAsset,
          owner: coverReceiver.address,
          maxPremiumInAsset,
        });

        await setNextBlockTime(Number(nextTimestamp));
        // ETH requires value parameter, ERC20 tokens (USDC, NXM) do not
        // Set gasPrice: 0 for ETH to isolate balance changes from gas costs
        const buyCoverOptions = config.paymentAsset === PoolAsset.ETH ? { value: maxPremiumInAsset, gasPrice: 0 } : {};
        await cover
          .connect(coverBuyer)
          .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: amount }], buyCoverOptions);

        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
        const poolBalanceAfter = await config.getBalance(fixture.contracts, pool.target);
        const buyerBalanceAfter = await config.getBalance(fixture.contracts, coverBuyer.address);
        const tokenTotalSupplyAfter = await token.totalSupply();
        const rewards = calculateRewards(premiumInNxm, nextTimestamp, period, GLOBAL_REWARDS_RATIO, BUCKET_DURATION);

        expect(stakingPoolAfter.rewards).to.equal(stakingPoolBefore.rewards + rewards);

        // Buyer balance decreases by premium paid (recalculate to get actual amount for payment asset)
        const buyerPremium = config.getPremiumInAsset(premiumInNxm, assetPrice);
        expect(buyerBalanceAfter).to.equal(buyerBalanceBefore - buyerPremium);

        // NXM is burned so no tokens is transferred to pool
        const poolTransferred = config.paymentAsset === PoolAsset.NXM ? 0n : premiumInAsset;
        const burned = config.paymentAsset === PoolAsset.NXM ? premiumInNxm : 0n; // NXM premium payment is burned
        expect(poolBalanceAfter).to.equal(poolBalanceBefore + poolTransferred);
        expect(tokenTotalSupplyAfter).to.equal(tokenTotalSupplyBefore + rewards - burned);
      });

      it('should purchase new cover with fixed price', async function () {
        const fixture = await loadFixture(setup);
        const { cover, tokenController, stakingProducts, token, pool } = fixture.contracts;
        const [coverBuyer, coverReceiver] = fixture.accounts.members;
        const { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO, BUCKET_DURATION } = fixture.config;
        const [{ targetPrice }] = fixture.stakedProducts;
        const { products } = fixture;

        // Set base fee to 0 to isolate balance changes from gas costs
        await setNextBlockBaseFeePerGas(0);

        const amount = config.getAmount();
        await config.setup(fixture.contracts, coverBuyer, amount);

        const latestBlock = await ethers.provider.getBlock('latest');
        const nextBlockTimestamp = latestBlock.timestamp + 10;
        const assetPrice = await config.getAssetPrice(fixture.contracts, config.paymentAsset, nextBlockTimestamp);

        const fixedPriceProductId = products.findIndex(
          p => targetPrice !== p.product.initialPriceRatio && p.product.useFixedPrice,
        );

        const product = await stakingProducts.getProduct(1, fixedPriceProductId);
        const { premiumInNxm, premiumInAsset } = calculatePremium(
          amount,
          assetPrice,
          period,
          product.targetPrice,
          NXM_PER_ALLOCATION_UNIT,
        );

        const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
        const poolBalanceBefore = await config.getBalance(fixture.contracts, pool.target);
        const buyerBalanceBefore = await config.getBalance(fixture.contracts, coverBuyer.address);
        const tokenTotalSupplyBefore = await token.totalSupply();

        // NXM uses premiumInNxm for maxPremium (1:1), other assets use premiumInAsset
        const maxPremiumInAsset = config.paymentAsset === PoolAsset.NXM ? premiumInNxm : premiumInAsset;
        const buyCoverParams = buyCoverFixture({
          amount,
          productId: fixedPriceProductId,
          coverAsset: config.coverAsset,
          paymentAsset: config.paymentAsset,
          owner: coverReceiver.address,
          maxPremiumInAsset,
        });

        await setNextBlockTime(nextBlockTimestamp);
        // ETH requires value parameter, ERC20 tokens (USDC, NXM) do not
        // Set gasPrice: 0 for ETH to isolate balance changes from gas costs
        const buyCoverOptions = config.paymentAsset === PoolAsset.ETH ? { value: maxPremiumInAsset, gasPrice: 0 } : {};
        await cover
          .connect(coverBuyer)
          .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: amount }], buyCoverOptions);

        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
        const poolBalanceAfter = await config.getBalance(fixture.contracts, pool.target);
        const buyerBalanceAfter = await config.getBalance(fixture.contracts, coverBuyer.address);
        const tokenTotalSupplyAfter = await token.totalSupply();
        const rewards = calculateRewards(
          premiumInNxm,
          nextBlockTimestamp,
          period,
          GLOBAL_REWARDS_RATIO,
          BUCKET_DURATION,
        );

        expect(stakingPoolAfter.rewards).to.equal(stakingPoolBefore.rewards + rewards);

        // Buyer balance decreases by premium paid (recalculate to get actual amount for payment asset)
        const buyerPremium = config.getPremiumInAsset(premiumInNxm, assetPrice);
        expect(buyerBalanceAfter).to.equal(buyerBalanceBefore - buyerPremium);

        // NXM is burned so no tokens is transferred to pool
        const poolTransferred = config.paymentAsset === PoolAsset.NXM ? 0n : premiumInAsset;
        const burned = config.paymentAsset === PoolAsset.NXM ? premiumInNxm : 0n; // NXM premium payment is burned
        expect(poolBalanceAfter).to.equal(poolBalanceBefore + poolTransferred);
        expect(tokenTotalSupplyAfter).to.equal(tokenTotalSupplyBefore + rewards - burned);
      });

      it('should revert the purchase of deprecated product', async function () {
        const fixture = await loadFixture(setup);
        const { products } = fixture;
        const { cover } = fixture.contracts;
        const [coverBuyer, coverReceiver] = fixture.accounts.members;

        // Set base fee to 0 to allow gasPrice: 0 transactions (isolates balance changes from gas costs)
        await setNextBlockBaseFeePerGas(0);

        const amount = config.getAmount();
        await config.setup(fixture.contracts, coverBuyer, amount);

        const productId = products.findIndex(({ product: { isDeprecated } }) => isDeprecated);

        const buyCoverParams = buyCoverFixture({
          amount,
          productId,
          coverAsset: config.coverAsset,
          paymentAsset: config.paymentAsset,
          owner: coverReceiver.address,
          maxPremiumInAsset: amount,
        });
        // ETH requires value parameter, ERC20 tokens (USDC, NXM) do not
        // Set gasPrice: 0 for ETH to isolate balance changes from gas costs
        const buyCoverOptions = config.paymentAsset === PoolAsset.ETH ? { value: amount, gasPrice: 0 } : {};
        const buyCover = cover
          .connect(coverBuyer)
          .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: amount }], buyCoverOptions);

        await expect(buyCover).to.revertedWithCustomError(cover, 'ProductDeprecated');
      });
    });
  });
});

describe('CoverBroker - buyCover', function () {
  it('should revert with InvalidOwnerAddress if params.owner is zero address', async function () {
    const fixture = await loadFixture(setup);
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
    const fixture = await loadFixture(setup);
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
    const fixture = await loadFixture(setup);
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
    const fixture = await loadFixture(setup);
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
    const fixture = await loadFixture(setup);
    const { tokenController, stakingProducts, pool, ramm, coverBroker, coverNFT } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.nonMembers;
    const { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO, BUCKET_DURATION } = fixture.config;
    const [{ targetPrice }] = fixture.stakedProducts;
    const { period, amount } = buyCoverFixture();

    const latestBlock = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = latestBlock.timestamp + 10;

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
    const fixture = await loadFixture(setup);
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
