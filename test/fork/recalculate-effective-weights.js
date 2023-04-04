const { ethers } = require('hardhat');
const { expect } = require('chai');
const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { setEtherBalance } = require('../utils/evm');
const { parseEther, defaultAbiCoder, toUtf8Bytes } = ethers.utils;
const { BigNumber } = ethers;
const { daysToSeconds } = require('../../lib/helpers');
const { V2Addresses, UserAddress, submitGovernanceProposal, getActiveProductsInPool } = require('./utils');
const {
  calculateBasePrice,
  calculateBasePremium,
  calculateSurgePremium,
  calculatePriceBump,
} = require('../unit/StakingPool/helpers');
const { verifyPoolWeights } = require('./staking-pool-utils');
const evm = require('./evm')();
describe('recalculateEffectiveWeight', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);
    const hugh = await ethers.getImpersonatedSigner(UserAddress.HUGH);
    await setEtherBalance(hugh.address, parseEther('1000'));

    this.hugh = hugh;

    // Upgrade StakingProducts
    const codes = ['SP'].map(code => toUtf8Bytes(code));
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
  });

  it('should recalculate effective weight for all products in all pools', async function () {
    const { stakingPoolFactory, stakingProducts } = this;

    const poolCount = await stakingPoolFactory.stakingPoolCount();

    for (let i = 0; i <= poolCount; i++) {
      await stakingProducts.recalculateEffectiveWeightsForAllProducts(i);
      await verifyPoolWeights(stakingProducts, i);
    }
  });

  it('should buy a cover and bump the price towards the target weight', async function () {
    // Note this test doesn't fix the effective weights first
    const { stakingProducts, cover, config } = this;

    // cover buy details
    const coverAsset = 0; // ETH
    const poolId = 2;
    const amount = parseEther('1');
    const period = daysToSeconds(45);
    const commissionRatio = 0;

    const productsInThisPool = await getActiveProductsInPool.call(this, { poolId });
    // pick a random product
    const randomProduct = productsInThisPool[Math.floor(Math.random() * (productsInThisPool.length - 1))];
    console.log('buying cover for product: ', randomProduct.productId, 'in pool: ', poolId);
    const { capacityReductionRatio } = await cover.products(randomProduct.productId);

    const { totalCapacity } = await this.stakingPool.getActiveTrancheCapacities(
      randomProduct.productId,
      config.GLOBAL_CAPACITY_RATIO,
      capacityReductionRatio,
    );
    const allocations = await this.stakingPool.getActiveAllocations(randomProduct.productId);
    let initialCapacityUsed = BigNumber.from(0);

    for (const allocation of allocations) {
      initialCapacityUsed = initialCapacityUsed.add(allocation);
    }

    const { timestamp: now } = await ethers.provider.getBlock('latest');

    const basePrice = calculateBasePrice(now, randomProduct, config.PRICE_CHANGE_PER_DAY);

    const priceBump = calculatePriceBump(
      amount,
      config.PRICE_BUMP_RATIO,
      totalCapacity,
      config.NXM_PER_ALLOCATION_UNIT,
    );

    const basePremium = calculateBasePremium(amount, basePrice, period, config);

    const { surgePremium, surgePremiumSkipped } = calculateSurgePremium(
      amount,
      initialCapacityUsed,
      totalCapacity,
      period,
      config,
    );

    // TODO: fix maxPremiumInAsset calculations
    const maxPremiumInAssetTooLow = basePremium.add(surgePremium).sub(surgePremiumSkipped);
    console.log('maxPremiumInAssetTooLow', maxPremiumInAssetTooLow.toString());
    const maxPremiumInAsset = amount;

    await cover.connect(this.hugh).buyCover(
      {
        coverId: 0,
        owner: this.hugh.address,
        productId: randomProduct.productId,
        coverAsset,
        amount,
        period, // 30 days
        maxPremiumInAsset,
        paymentAsset: coverAsset,
        commissionRatio,
        commissionDestination: this.hugh.address,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount, skip: false }],
      { value: maxPremiumInAsset },
    );

    const { timestamp } = await ethers.provider.getBlock('latest');
    const { bumpedPrice, bumpedPriceUpdateTime, targetPrice } = await stakingProducts.getProduct(
      poolId,
      randomProduct.productId,
    );

    // check bumped price
    if (BigNumber.from(bumpedPrice).eq(targetPrice)) {
      expect(bumpedPrice).to.be.equal(randomProduct.targetPrice);
    } else if (BigNumber.from(bumpedPrice).gt(targetPrice)) {
      // TODO: price bump calculation is off for product 71
      console.log('priceBump', priceBump.toString());
      expect(bumpedPrice).to.be.equal(basePrice.add(priceBump));
    } else if (BigNumber.from(bumpedPrice).lt(targetPrice)) {
      console.log('bumped price is below target price');
      console.log('bumpedPrice', bumpedPrice.toString());
      console.log('targetPrice', targetPrice.toString());
      // expect(bumpedPrice).to.be.gt(randomProduct.bumpedPrice);
    }

    // if it was already bumped in the last day, it shouldn't be bumped again
    // TODO: see if this is still failing after this is merged:
    // https://github.com/NexusMutual/smart-contracts/pull/824
    if (timestamp - randomProduct.bumpedPriceUpdateTime < daysToSeconds(1)) {
      expect(bumpedPriceUpdateTime).to.be.eq(randomProduct.bumpedPriceUpdateTime);
      expect(bumpedPrice).to.be.eq(randomProduct.bumpedPrice);
    } else {
      expect(bumpedPriceUpdateTime).to.be.equal(timestamp);
    }
  });
});
