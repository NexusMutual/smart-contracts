const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, setNextBlockBaseFeePerGas, time } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { daysToSeconds } = require('../utils');

const {
  calculateCoverEditPremium,
  calculateCoverEditRefund,
  calculateCoverEditRewards,
  calculatePremium,
  calculateRewards,
  getInternalPrice,
} = nexus.protocol;
const { BigIntMath } = nexus.helpers;
const { PoolAsset } = nexus.constants;

// assetNames reverse lookup
const assetNames = {
  0: 'ETH',
  1: 'DAI',
  2: 'stETH',
  3: 'NXMTY',
  4: 'rETH',
  5: 'SafeTracker',
  6: 'USDC',
  7: 'cbBTC',
  255: 'NXM',
};

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
  const productId = 0;
  const period = daysToSeconds(30);

  const paymentTestConfigs = [
    {
      name: 'ETH',
      paymentAsset: PoolAsset.ETH,
      coverAsset: PoolAsset.ETH,
      getAmount: () => ethers.parseEther('1000'),
      setup: async () => {}, // noop
      getAssetPrice: ({ ramm, pool, tokenController }, coverAsset, timestamp) =>
        getInternalPrice(ramm, pool, tokenController, timestamp), // NXM price in ETH
      getBalance: (contracts, address) => ethers.provider.getBalance(address),
    },
    {
      name: 'USDC',
      paymentAsset: PoolAsset.USDC,
      coverAsset: PoolAsset.USDC,
      getAmount: () => ethers.parseUnits('5000000', 6),
      setup: async ({ usdc, cover }, coverBuyer, amount) => {
        await usdc.mint(coverBuyer.address, amount);
        await usdc.connect(coverBuyer).approve(cover.target, ethers.MaxUint256);
      },
      getAssetPrice: ({ pool }, coverAsset) => pool.getInternalTokenPriceInAsset(coverAsset), // NXM price in USDC
      getBalance: ({ usdc }, address) => usdc.balanceOf(address),
    },
    {
      name: 'cbBTC',
      paymentAsset: PoolAsset.cbBTC,
      coverAsset: PoolAsset.cbBTC,
      getAmount: () => ethers.parseUnits('50', 8),
      setup: async ({ cbBTC, cover }, coverBuyer, amount) => {
        await cbBTC.mint(coverBuyer.address, amount);
        await cbBTC.connect(coverBuyer).approve(cover.target, ethers.MaxUint256);
      },
      getAssetPrice: ({ pool }, coverAsset) => pool.getInternalTokenPriceInAsset(coverAsset), // NXM price in cbBTC
      getBalance: ({ cbBTC }, address) => cbBTC.balanceOf(address),
    },
    {
      name: 'NXM',
      paymentAsset: PoolAsset.NXM,
      coverAsset: PoolAsset.ETH,
      getAmount: () => ethers.parseEther('5000'),
      setup: async ({ token, cover }, coverBuyer) => {
        await token.connect(coverBuyer).approve(cover.target, ethers.MaxUint256);
      },
      getAssetPrice: ({ ramm, pool, tokenController }, coverAsset, timestamp) =>
        getInternalPrice(ramm, pool, tokenController, timestamp), // NXM price in ETH
      getBalance: ({ token }, address) => token.balanceOf(address),
    },
    {
      name: 'NXM',
      paymentAsset: PoolAsset.NXM,
      coverAsset: PoolAsset.USDC,
      getAmount: () => ethers.parseUnits('10000000', 6),
      setup: async ({ token, cover }, coverBuyer) => {
        await token.connect(coverBuyer).approve(cover.target, ethers.MaxUint256);
      },
      getAssetPrice: ({ pool }, coverAsset) => pool.getInternalTokenPriceInAsset(coverAsset), // NXM price in USDC
      getBalance: ({ token }, address) => token.balanceOf(address),
    },
    {
      name: 'NXM',
      paymentAsset: PoolAsset.NXM,
      coverAsset: PoolAsset.cbBTC,
      getAmount: () => ethers.parseUnits('150', 8),
      setup: async ({ token, cover }, coverBuyer) => {
        await token.connect(coverBuyer).approve(cover.target, ethers.MaxUint256);
      },
      getAssetPrice: ({ pool }, coverAsset) => pool.getInternalTokenPriceInAsset(coverAsset), // NXM price in cbBTC
      getBalance: ({ token }, address) => token.balanceOf(address),
    },
  ];

  paymentTestConfigs.forEach(config => {
    describe(`paymentAsset=${assetNames[config.paymentAsset]} / coverAsset=${assetNames[config.coverAsset]}`, () => {
      it('allows to buy against multiple staking pools', async function () {
        const fixture = await loadFixture(setup);
        const { cover, tokenController, stakingProducts, token, pool } = fixture.contracts;
        const [coverBuyer, coverReceiver] = fixture.accounts.members;
        const { NXM_PER_ALLOCATION_UNIT } = fixture.config;

        const amount = config.getAmount();
        await config.setup(fixture.contracts, coverBuyer, amount);

        const product = await stakingProducts.getProduct(1, productId);

        const latestBlock = await ethers.provider.getBlock('latest');
        const nextBlockTimestamp = latestBlock.timestamp + 10;
        const assetPrice = await config.getAssetPrice(fixture.contracts, config.coverAsset, nextBlockTimestamp);

        const coverAmountAllocationsPerPool = [
          amount / 3n, // a third
          amount / 3n, // second third
          amount - (amount / 3n) * 2n, // whatever's left
        ];

        const premiums = coverAmountAllocationsPerPool.map(amount =>
          calculatePremium(
            amount,
            assetPrice,
            period,
            product.bumpedPrice,
            NXM_PER_ALLOCATION_UNIT,
            config.paymentAsset,
          ),
        );
        const rewards = premiums.map(premium => calculateRewards(premium.premiumInNxm, nextBlockTimestamp, period));

        const premiumInNxm = premiums.reduce((total, premium) => total + premium.premiumInNxm, 0n);
        // Calculate premiumInAsset from summed premiumInNxm using same logic as calculatePremium
        const premiumInAsset =
          config.paymentAsset === PoolAsset.NXM ? premiumInNxm : (premiumInNxm * assetPrice) / ethers.parseEther('1');
        const totalRewards = rewards.reduce((total, reward) => total + reward, 0n);

        const stakingPool1Before = await tokenController.stakingPoolNXMBalances(1);
        const stakingPool2Before = await tokenController.stakingPoolNXMBalances(2);
        const stakingPool3Before = await tokenController.stakingPoolNXMBalances(3);
        const poolBalanceBefore = await config.getBalance(fixture.contracts, pool.target);
        const buyerBalanceBefore = await config.getBalance(fixture.contracts, coverBuyer.address);
        const tokenTotalSupplyBefore = await token.totalSupply();

        // NXM uses premiumInNxm for maxPremium (1:1), other assets use sum of individual premiumInAsset
        const maxPremiumInAsset = config.paymentAsset === PoolAsset.NXM ? premiumInNxm : premiumInAsset;
        const buyCoverParams = buyCoverFixture({
          amount,
          coverAsset: config.coverAsset,
          paymentAsset: config.paymentAsset,
          owner: coverReceiver.address,
          premiumInAsset: maxPremiumInAsset,
        });
        const poolAllocationRequests = [
          { poolId: 1, coverAmountInAsset: coverAmountAllocationsPerPool[0] },
          { poolId: 2, coverAmountInAsset: coverAmountAllocationsPerPool[1] },
          { poolId: 3, coverAmountInAsset: coverAmountAllocationsPerPool[2] },
        ];

        await setNextBlockBaseFeePerGas(0);
        await time.setNextBlockTimestamp(nextBlockTimestamp);

        const buyCoverOptions = config.paymentAsset === PoolAsset.ETH ? { value: premiumInAsset, gasPrice: 0 } : {};
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

        expect(buyerBalanceAfter).to.equal(buyerBalanceBefore - premiumInAsset);

        // NXM is burned so no tokens is transferred to pool
        const burned = config.paymentAsset === PoolAsset.NXM ? premiumInNxm : 0n;
        const poolTransferred = config.paymentAsset === PoolAsset.NXM ? 0n : premiumInAsset;

        expect(poolBalanceAfter).to.equal(poolBalanceBefore + poolTransferred);
        expect(tokenTotalSupplyAfter).to.equal(tokenTotalSupplyBefore + totalRewards - burned);
      });

      it('should purchase new cover with bumped price after initialization', async function () {
        const fixture = await loadFixture(setup);
        const { cover, tokenController, stakingProducts, token, pool } = fixture.contracts;
        const [coverBuyer, coverReceiver] = fixture.accounts.members;
        const { NXM_PER_ALLOCATION_UNIT } = fixture.config;

        const amount = config.getAmount();
        await config.setup(fixture.contracts, coverBuyer, amount);

        const latestBlock = await ethers.provider.getBlock('latest');
        const nextBlockTimestamp = latestBlock.timestamp + 10;

        const assetPrice = await config.getAssetPrice(fixture.contracts, config.coverAsset, nextBlockTimestamp);
        const product = await stakingProducts.getProduct(1, productId);

        const { premiumInNxm, premiumInAsset } = calculatePremium(
          amount,
          assetPrice,
          period,
          product.bumpedPrice,
          NXM_PER_ALLOCATION_UNIT,
          config.paymentAsset,
        );

        const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
        const poolBalanceBefore = await config.getBalance(fixture.contracts, pool.target);
        const buyerBalanceBefore = await config.getBalance(fixture.contracts, coverBuyer.address);
        const tokenTotalSupplyBefore = await token.totalSupply();

        const buyCoverParams = buyCoverFixture({
          amount,
          coverAsset: config.coverAsset,
          paymentAsset: config.paymentAsset,
          owner: coverReceiver.address,
          premiumInAsset,
        });

        await setNextBlockBaseFeePerGas(0);
        await time.setNextBlockTimestamp(nextBlockTimestamp);

        const buyCoverOptions = config.paymentAsset === PoolAsset.ETH ? { value: premiumInAsset, gasPrice: 0 } : {};
        await cover
          .connect(coverBuyer)
          .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: amount }], buyCoverOptions);

        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
        const poolBalanceAfter = await config.getBalance(fixture.contracts, pool.target);
        const buyerBalanceAfter = await config.getBalance(fixture.contracts, coverBuyer.address);
        const tokenTotalSupplyAfter = await token.totalSupply();
        const rewards = calculateRewards(premiumInNxm, nextBlockTimestamp, period);

        expect(stakingPoolAfter.rewards).to.equal(stakingPoolBefore.rewards + rewards);
        expect(buyerBalanceAfter).to.equal(buyerBalanceBefore - premiumInAsset);

        // NXM is burned so no tokens is transferred to pool
        const burned = config.paymentAsset === PoolAsset.NXM ? premiumInNxm : 0n;
        const poolTransferred = config.paymentAsset === PoolAsset.NXM ? 0n : premiumInAsset;

        expect(poolBalanceAfter).to.equal(poolBalanceBefore + poolTransferred);
        expect(tokenTotalSupplyAfter).to.equal(tokenTotalSupplyBefore + rewards - burned);
      });

      it('should purchase new cover with calculated price after the drop', async function () {
        const fixture = await loadFixture(setup);
        const { cover, tokenController, stakingProducts, token, pool } = fixture.contracts;
        const [coverBuyer, coverReceiver] = fixture.accounts.members;
        const { NXM_PER_ALLOCATION_UNIT } = fixture.config;
        const [{ targetPrice }] = fixture.stakedProducts;
        const daysElapsed = 1;

        const amount = config.getAmount();
        await config.setup(fixture.contracts, coverBuyer, amount);

        const productId = fixture.products.findIndex(
          ({ product: { initialPriceRatio, useFixedPrice } }) => targetPrice !== initialPriceRatio && !useFixedPrice,
        );
        const product = await stakingProducts.getProduct(1, productId);

        const timeDecayedPrice = product.bumpedPrice - BigInt(daysElapsed) * PRICE_CHANGE_PER_DAY;
        const price = BigIntMath.max(timeDecayedPrice, BigInt(targetPrice));
        const nextTimestamp = product.bumpedPriceUpdateTime + BigInt(daysToSeconds(daysElapsed));
        const assetPrice = await config.getAssetPrice(fixture.contracts, config.coverAsset, nextTimestamp);

        const { premiumInNxm, premiumInAsset } = calculatePremium(
          amount,
          assetPrice,
          period,
          price,
          NXM_PER_ALLOCATION_UNIT,
          config.paymentAsset,
        );

        const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
        const poolBalanceBefore = await config.getBalance(fixture.contracts, pool.target);
        const buyerBalanceBefore = await config.getBalance(fixture.contracts, coverBuyer.address);
        const tokenTotalSupplyBefore = await token.totalSupply();

        const buyCoverParams = buyCoverFixture({
          amount,
          productId,
          coverAsset: config.coverAsset,
          paymentAsset: config.paymentAsset,
          owner: coverReceiver.address,
          premiumInAsset,
        });

        await setNextBlockBaseFeePerGas(0);
        await time.setNextBlockTimestamp(nextTimestamp);

        const buyCoverOptions = config.paymentAsset === PoolAsset.ETH ? { value: premiumInAsset, gasPrice: 0 } : {};
        await cover
          .connect(coverBuyer)
          .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: amount }], buyCoverOptions);

        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
        const poolBalanceAfter = await config.getBalance(fixture.contracts, pool.target);
        const buyerBalanceAfter = await config.getBalance(fixture.contracts, coverBuyer.address);
        const tokenTotalSupplyAfter = await token.totalSupply();
        const rewards = calculateRewards(premiumInNxm, nextTimestamp, period);

        expect(stakingPoolAfter.rewards).to.equal(stakingPoolBefore.rewards + rewards);
        expect(buyerBalanceAfter).to.equal(buyerBalanceBefore - premiumInAsset);

        // NXM is burned so no tokens is transferred to pool
        const burned = config.paymentAsset === PoolAsset.NXM ? premiumInNxm : 0n;
        const poolTransferred = config.paymentAsset === PoolAsset.NXM ? 0n : premiumInAsset;

        expect(poolBalanceAfter).to.equal(poolBalanceBefore + poolTransferred);
        expect(tokenTotalSupplyAfter).to.equal(tokenTotalSupplyBefore + rewards - burned);
      });

      it('should purchase new cover with fixed price', async function () {
        const fixture = await loadFixture(setup);
        const { cover, tokenController, stakingProducts, token, pool } = fixture.contracts;
        const [coverBuyer, coverReceiver] = fixture.accounts.members;
        const { NXM_PER_ALLOCATION_UNIT } = fixture.config;
        const [{ targetPrice }] = fixture.stakedProducts;
        const { products } = fixture;

        const amount = config.getAmount();
        await config.setup(fixture.contracts, coverBuyer, amount);

        const latestBlock = await ethers.provider.getBlock('latest');
        const nextBlockTimestamp = latestBlock.timestamp + 10;
        const assetPrice = await config.getAssetPrice(fixture.contracts, config.coverAsset, nextBlockTimestamp);

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
          config.paymentAsset,
        );

        const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
        const poolBalanceBefore = await config.getBalance(fixture.contracts, pool.target);
        const buyerBalanceBefore = await config.getBalance(fixture.contracts, coverBuyer.address);
        const tokenTotalSupplyBefore = await token.totalSupply();

        // NXM uses premiumInNxm for maxPremium (1:1), other assets use premiumInAsset
        const buyCoverParams = buyCoverFixture({
          amount,
          productId: fixedPriceProductId,
          coverAsset: config.coverAsset,
          paymentAsset: config.paymentAsset,
          owner: coverReceiver.address,
          premiumInAsset,
        });

        await setNextBlockBaseFeePerGas(0);
        await time.setNextBlockTimestamp(nextBlockTimestamp);

        const buyCoverOptions = config.paymentAsset === PoolAsset.ETH ? { value: premiumInAsset, gasPrice: 0 } : {};
        await cover
          .connect(coverBuyer)
          .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: amount }], buyCoverOptions);

        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
        const poolBalanceAfter = await config.getBalance(fixture.contracts, pool.target);
        const buyerBalanceAfter = await config.getBalance(fixture.contracts, coverBuyer.address);
        const tokenTotalSupplyAfter = await token.totalSupply();
        const rewards = calculateRewards(premiumInNxm, nextBlockTimestamp, period);

        expect(stakingPoolAfter.rewards).to.equal(stakingPoolBefore.rewards + rewards);
        expect(buyerBalanceAfter).to.equal(buyerBalanceBefore - premiumInAsset);

        // NXM is burned so no tokens is transferred to pool
        const burned = config.paymentAsset === PoolAsset.NXM ? premiumInNxm : 0n;
        const poolTransferred = config.paymentAsset === PoolAsset.NXM ? 0n : premiumInAsset;

        expect(poolBalanceAfter).to.equal(poolBalanceBefore + poolTransferred);
        expect(tokenTotalSupplyAfter).to.equal(tokenTotalSupplyBefore + rewards - burned);
      });

      it('should edit purchased cover and increase period and amount', async function () {
        const fixture = await loadFixture(setup);
        const { cover, stakingProducts, pool, token } = fixture.contracts;
        const [coverBuyer] = fixture.accounts.members;
        const { NXM_PER_ALLOCATION_UNIT } = fixture.config;

        const { paymentAsset } = config;
        const amount = config.getAmount();
        await config.setup(fixture.contracts, coverBuyer, amount);

        const latestBlock = await ethers.provider.getBlock('latest');
        const buyTimestamp = latestBlock.timestamp + 10;
        const assetPrice = await config.getAssetPrice(fixture.contracts, config.coverAsset, buyTimestamp);
        const product = await stakingProducts.getProduct(1, productId);

        // buy initial cover
        const initialPremium = calculatePremium(
          amount,
          assetPrice,
          period,
          product.bumpedPrice,
          NXM_PER_ALLOCATION_UNIT,
          paymentAsset,
        );

        const buyCoverParams = buyCoverFixture({
          amount,
          coverAsset: config.coverAsset,
          paymentAsset,
          owner: coverBuyer.address,
          premiumInAsset: initialPremium.premiumInAsset,
        });

        const buyCoverOptions =
          paymentAsset === PoolAsset.ETH ? { value: initialPremium.premiumInAsset, gasPrice: 0 } : {};

        await setNextBlockBaseFeePerGas(0);
        await time.setNextBlockTimestamp(buyTimestamp);

        const buyTx = await cover
          .connect(coverBuyer)
          .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: amount }], buyCoverOptions);

        const buyReceipt = await buyTx.wait();
        const buyBlock = await ethers.provider.getBlock(buyReceipt.blockNumber);

        const coverId = await cover.getCoverDataCount();
        const coverData = await cover.getCoverData(coverId);

        // verify contract stored the correct premium for initial cover bought
        const initialCoverAllocations = await cover.getPoolAllocations(coverId);
        const storedInitialPremiumInNxm = initialCoverAllocations.reduce((sum, alloc) => sum + alloc.premiumInNXM, 0n);
        expect(storedInitialPremiumInNxm).to.equal(initialPremium.premiumInNxm);

        const passedPeriod = 10n; // +10s
        const editTimestamp = coverData.start + passedPeriod;
        await time.setNextBlockTimestamp(editTimestamp);

        // calculate cover edit premiums (increasing amount and period by 2x)
        const increasedAmount = amount * 2n;
        const increasedPeriod = BigInt(period) * 2n;
        const editAssetPrice = await config.getAssetPrice(fixture.contracts, config.coverAsset, editTimestamp);

        // IMPORTANT:
        // the initial cover buy can trigger a price bump due to large cover amount
        // 1. re-fetch product state
        // 2. use SP.getBasePrice instead of bumpedPrice to calculate the new premium
        const updatedProduct = await stakingProducts.getProduct(1, productId);
        const basePrice = await stakingProducts.getBasePrice(
          updatedProduct.bumpedPrice,
          updatedProduct.bumpedPriceUpdateTime,
          updatedProduct.targetPrice,
          editTimestamp,
        );

        // premium for the new amount and period without refunds
        const { premiumInAsset: newPremiumInAsset, coverNXMAmount } = calculatePremium(
          increasedAmount,
          editAssetPrice,
          increasedPeriod,
          basePrice, // basePrice instead of bumpedPrice
          NXM_PER_ALLOCATION_UNIT,
          paymentAsset,
        );

        // refund for the unused period
        const { refundInNxm, refundInAsset } = calculateCoverEditRefund(
          period,
          passedPeriod,
          initialPremium.premiumInNxm,
          editAssetPrice,
          paymentAsset,
        );

        const poolBalanceBefore = await config.getBalance(fixture.contracts, pool.target);
        const buyerBalanceBefore = await config.getBalance(fixture.contracts, coverBuyer.address);
        const tokenTotalSupplyBefore = await token.totalSupply();

        const coverEditExtraPremium = newPremiumInAsset - refundInAsset;
        const editCoverParams = buyCoverFixture({
          coverId,
          amount: increasedAmount,
          period: increasedPeriod,
          coverAsset: config.coverAsset,
          paymentAsset,
          owner: coverBuyer.address,
          premiumInAsset: coverEditExtraPremium,
        });
        const editCoverOptions = paymentAsset === PoolAsset.ETH ? { value: coverEditExtraPremium, gasPrice: 0 } : {};

        // execute cover edit (amount and period increased by 2x)
        const editTx = await cover
          .connect(coverBuyer)
          .buyCover(editCoverParams, [{ poolId: 1, coverAmountInAsset: increasedAmount }], editCoverOptions);

        const editReceipt = await editTx.wait();
        const editBlock = await ethers.provider.getBlock(editReceipt.blockNumber);

        const editedCoverId = coverId + 1n;
        const editedCoverData = await cover.getCoverData(editedCoverId);
        const expectedCoverAmount = (coverNXMAmount * editAssetPrice) / ethers.parseEther('1');

        expect(editedCoverData.productId).to.equal(productId);
        expect(editedCoverData.coverAsset).to.equal(config.coverAsset);
        expect(editedCoverData.amount).to.equal(expectedCoverAmount);
        expect(editedCoverData.period).to.equal(increasedPeriod);

        const { newPremiumInNxm, extraPremiumInNxm, extraPremiumInAsset } = calculateCoverEditPremium(
          coverNXMAmount,
          basePrice,
          increasedPeriod,
          refundInNxm,
          editAssetPrice,
          paymentAsset,
        );

        const oldCoverInput = { premiumInNxm: initialPremium.premiumInNxm, start: buyBlock.timestamp, period };
        const newCoverInput = { premiumInNxm: newPremiumInNxm, start: editBlock.timestamp, period: increasedPeriod };
        const rewards = calculateCoverEditRewards(oldCoverInput, newCoverInput);

        // verify the contract stored the correct new premium
        const editedCoverAllocations = await cover.getPoolAllocations(editedCoverId);
        const storedNewPremiumInNxm = editedCoverAllocations.reduce((sum, alloc) => sum + alloc.premiumInNXM, 0n);
        expect(storedNewPremiumInNxm).to.equal(newPremiumInNxm, 'Contract should store the premium we calculated');

        const poolBalAfter = await config.getBalance(fixture.contracts, pool.target);
        const buyerBalAfter = await config.getBalance(fixture.contracts, coverBuyer.address);
        const tokenTotalSupplyAfter = await token.totalSupply();

        expect(buyerBalAfter).to.equal(buyerBalanceBefore - extraPremiumInAsset);

        // NXM is burned so no tokens is transferred to pool
        const burned = config.paymentAsset === PoolAsset.NXM ? extraPremiumInNxm : 0n;
        const poolTransferred = paymentAsset === PoolAsset.NXM ? 0n : extraPremiumInAsset;

        expect(poolBalAfter).to.equal(poolBalanceBefore + poolTransferred);

        const actualSupplyChange = tokenTotalSupplyAfter - tokenTotalSupplyBefore;
        expect(actualSupplyChange).to.equal(rewards - burned);
      });

      it('should revert the purchase of deprecated product', async function () {
        const fixture = await loadFixture(setup);
        const { products } = fixture;
        const { cover } = fixture.contracts;
        const [coverBuyer, coverReceiver] = fixture.accounts.members;

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

        const buyCoverOptions = config.paymentAsset === PoolAsset.ETH ? { value: amount } : {};
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
    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;
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
      PoolAsset.ETH,
    );

    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
    const poolBeforeETH = await ethers.provider.getBalance(pool.target);

    const amountOver = ethers.parseEther('1');
    const balanceBefore = await ethers.provider.getBalance(coverBuyer.address);
    const nftBalanceBefore = await coverNFT.balanceOf(coverBuyer.address);

    await setNextBlockBaseFeePerGas(0);
    await time.setNextBlockTimestamp(nextBlockTimestamp);

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
    const rewards = calculateRewards(premiumInNxm, timestamp, period);

    expect(stakingPoolAfter.rewards).to.equal(stakingPoolBefore.rewards + rewards);
    expect(poolAfterETH).to.equal(poolBeforeETH + premiumInAsset);
  });

  it('should enable non-members to buy cover through the broker with USDC', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, stakingProducts, pool, coverBroker, usdc, coverNFT } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.nonMembers;
    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;
    const { period, productId } = buyCoverFixture();

    const usdcAmount = ethers.parseUnits('10000', 6);
    await usdc.mint(coverBuyer.address, usdcAmount);
    await usdc.connect(coverBuyer).approve(coverBroker.target, usdcAmount);
    await coverBroker.maxApproveCoverContract(usdc.target);

    const nxmPriceInUsdc = await pool.getInternalTokenPriceInAsset(PoolAsset.USDC);
    const product = await stakingProducts.getProduct(1, productId);

    const { premiumInNxm, premiumInAsset } = calculatePremium(
      usdcAmount,
      nxmPriceInUsdc,
      period,
      product.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
      PoolAsset.USDC,
    );
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

    const rewards = calculateRewards(premiumInNxm, timestamp, period);

    expect(stakingPoolAfter.rewards).to.equal(stakingPoolBefore.rewards + rewards);
    expect(poolAfterUSDC).to.equal(poolBeforeUSDC + premiumInAsset);
  });
});
