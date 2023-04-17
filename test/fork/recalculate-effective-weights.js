const { ethers } = require('hardhat');
const { expect } = require('chai');
const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { setEtherBalance } = require('../utils/evm');
const { parseEther, defaultAbiCoder, toUtf8Bytes } = ethers.utils;
const { BigNumber } = ethers;
const { daysToSeconds } = require('../../lib/helpers');
const {
  V2Addresses,
  UserAddress,
  submitGovernanceProposal,
  getConfig,
  getProductsInPool,
  isCoverAssetSupported,
  getAssetContractInstance,
} = require('./utils');
const {
  calculateBasePrice,
  calculateBasePremium,
  calculateSurgePremium,
  calculatePriceBump,
} = require('../unit/StakingPool/helpers');
const { assetToNXM, NXMToAsset } = require('../integration/utils/assetPricing');
const { verifyPoolWeights } = require('./staking-pool-utils');
const { calculateFirstTrancheId } = require('../integration/utils/staking');
const evm = require('./evm')();

const ETH_ASSET_ID = 0b0;
const DAI_ASSET_ID = 0b1;
const ST_ETH_ASSET_ID = 0b10;

describe('recalculateEffectiveWeight', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);
    const hugh = await ethers.getImpersonatedSigner(UserAddress.HUGH);
    await setEtherBalance(hugh.address, parseEther('1000'));

    this.hugh = hugh;

    // Upgrade StakingProducts
    const codes = ['SP'].map(code => toUtf8Bytes(code));
    const pool = await ethers.getContractAt('Pool', V2Addresses.Pool);
    const governance = await ethers.getContractAt('Governance', V2Addresses.Governance);
    const cover = await ethers.getContractAt('Cover', V2Addresses.Cover);
    const stakingProducts = await ethers.getContractAt('StakingProducts', V2Addresses.StakingProducts);
    const stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', V2Addresses.StakingPoolFactory);
    const stakingProductsImpl = await ethers.deployContract('StakingProducts', [
      cover.address,
      stakingPoolFactory.address,
    ]);
    const stakingPool2 = await ethers.getContractAt('StakingPool', await cover.stakingPool(2));

    const addresses = [stakingProductsImpl].map(c => c.address);
    const memberRoles = await ethers.getContractAt('MemberRoles', V2Addresses.MemberRoles);
    const { memberArray: abMembersAddresses } = await memberRoles.members(1);

    const abMembers = [];
    for (const address of abMembersAddresses) {
      const abSigner = await ethers.getImpersonatedSigner(address);
      await setEtherBalance(address, parseEther('1000'));
      abMembers.push(abSigner);
    }

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [codes, addresses]),
      abMembers,
      governance,
    );

    this.stakingPoolFactory = stakingPoolFactory;
    this.stakingPool = stakingPool2;
    this.cover = cover;
    this.stakingProducts = stakingProducts;
    this.pool = pool;

    this.config = await getConfig.call(this);
  });

  it('should recalculate effective weight for all products in all pools', async function () {
    const { stakingPoolFactory, stakingProducts, config } = this;

    const poolCount = await stakingPoolFactory.stakingPoolCount();

    for (let i = 0; i <= poolCount; i++) {
      await stakingProducts.recalculateEffectiveWeightsForAllProducts(i);
      await verifyPoolWeights(stakingProducts, i, config);
    }
  });

  it('should buy a cover and bump the price towards the target weight', async function () {
    // Note this test doesn't fix the effective weights first
    const { stakingProducts, stakingPool, cover, config, pool } = this;

    // cover buy details
    const coverBuyer = this.hugh;
    const poolId = 2;
    const amountETH = parseEther('1');
    const period = daysToSeconds(45);
    const commissionRatio = 0;

    // recalculate effective weights
    const totalEffectiveWeightBefore = await stakingProducts.getTotalEffectiveWeight(poolId);
    await stakingProducts.recalculateEffectiveWeightsForAllProducts(poolId);
    expect(await stakingProducts.getTotalEffectiveWeight(poolId)).to.be.lte(totalEffectiveWeightBefore);

    // get products in pool with target weight > 0
    const productsInThisPool = await getProductsInPool.call(this, { poolId });
    for (const stakedProduct of productsInThisPool) {
      // get product details
      const coverProduct = await cover.products(stakedProduct.productId);

      // get supported cover asset
      let coverAsset = 0;
      if (await isCoverAssetSupported(pool, ETH_ASSET_ID, coverProduct.coverAssets)) {
        coverAsset = ETH_ASSET_ID;
      } else if (await isCoverAssetSupported(pool, DAI_ASSET_ID, coverProduct.coverAssets)) {
        coverAsset = DAI_ASSET_ID;
      } else if (await isCoverAssetSupported(pool, ST_ETH_ASSET_ID, coverProduct.coverAssets)) {
        coverAsset = ST_ETH_ASSET_ID;
      } else {
        throw new Error('Cover asset not implemented');
      }

      // convert cover amount to NXM for premium calculations
      const amountInNXM = await assetToNXM(pool, amountETH, coverAsset, config);

      // get cover product info and make sure not deprecated
      const { capacityReductionRatio, useFixedPrice, isDeprecated } = await cover.products(stakedProduct.productId);
      expect(isDeprecated).to.be.equal(false);

      // calculate which tranches the cover will be active in
      const block = await ethers.provider.getBlock('latest');
      const productType = await cover.productTypes(coverProduct.productType);
      const trancheIdStart = calculateFirstTrancheId(block, period, productType.gracePeriod);
      const currentTrancheId = Math.floor(block.timestamp / config.TRANCHE_DURATION);
      const trancheCount = 8 - (currentTrancheId - trancheIdStart);

      // get capacity and allocations
      const trancheCapacities = await stakingPool.getTrancheCapacities(
        stakedProduct.productId,
        trancheIdStart,
        trancheCount,
        config.GLOBAL_CAPACITY_RATIO,
        capacityReductionRatio,
      );
      const totalCapacity = trancheCapacities.reduce((a, b) => a.add(b), BigNumber.from(0));
      const allocations = await stakingPool.getActiveAllocations(stakedProduct.productId);
      const initialCapacityUsed = allocations.reduce((a, b) => a.add(b), BigNumber.from(0));

      const { timestamp: now } = await ethers.provider.getBlock('latest');

      // Calculate prices and premiums
      const basePrice = calculateBasePrice(now, stakedProduct, config.PRICE_CHANGE_PER_DAY);
      expect(basePrice).to.be.eq(
        await stakingProducts.getBasePrice(
          stakedProduct.bumpedPrice,
          stakedProduct.bumpedPriceUpdateTime,
          stakedProduct.targetPrice,
          now,
        ),
      );
      const priceBump = calculatePriceBump(
        amountInNXM,
        config.PRICE_BUMP_RATIO,
        totalCapacity,
        config.NXM_PER_ALLOCATION_UNIT,
      );
      const basePremium = calculateBasePremium(amountInNXM, basePrice, period, config);
      const { surgePremium, surgePremiumSkipped } = calculateSurgePremium(
        amountInNXM,
        initialCapacityUsed,
        totalCapacity,
        period,
        config,
      );
      const maxPremiumInNXM = basePremium.add(surgePremium).sub(surgePremiumSkipped);
      const maxPremiumInAsset = await NXMToAsset(pool, maxPremiumInNXM, coverAsset, config);

      // approve cover asset to cover contract
      if (coverAsset !== ETH_ASSET_ID) {
        const asset = await getAssetContractInstance(pool, coverAsset);
        await asset.connect(coverBuyer).approve(cover.address, maxPremiumInAsset);
      }

      // buy new cover
      await cover.connect(coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyer.address,
          productId: stakedProduct.productId,
          coverAsset,
          amount: amountETH,
          period, // 30 days
          maxPremiumInAsset,
          paymentAsset: coverAsset,
          commissionRatio,
          commissionDestination: coverBuyer.address,
          ipfsData: '',
        },
        [{ poolId, coverAmountInAsset: amountETH, skip: false }],
        { value: coverAsset === ETH_ASSET_ID ? maxPremiumInAsset : 0 },
      );
      const { timestamp } = await ethers.provider.getBlock('latest');

      // get staked product details
      const { bumpedPrice, bumpedPriceUpdateTime, targetPrice } = await stakingProducts.getProduct(
        poolId,
        stakedProduct.productId,
      );

      if (!useFixedPrice) {
        expect(bumpedPriceUpdateTime).to.be.equal(timestamp);
        expect(bumpedPrice).to.be.equal(basePrice.add(priceBump));
      } else {
        expect(targetPrice).to.be.equal(stakedProduct.targetPrice);
        expect(bumpedPrice).to.be.equal(stakedProduct.bumpedPrice);
      }
    }
  });
});
