const { expect } = require('chai');
const { ethers } = require('hardhat');
const { getCurrentTrancheId, calculateBasePrice } = require('./helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');
const { AddressZero, MaxUint256, WeiPerEther } = ethers.constants;
const { parseEther } = ethers.utils;
const daysToSeconds = days => days * 24 * 60 * 60;

describe('calculatePremium unit tests', function () {
  const buyCoverParamsTemplate = {
    owner: AddressZero,
    coverId: MaxUint256,
    productId: 0,
    coverAsset: 0, // ETH
    amount: parseEther('4800'),
    period: daysToSeconds('91.25'),
    maxPremiumInAsset: parseEther('100'),
    paymentAsset: 0,
    payWithNXM: false,
    commissionRatio: 1,
    commissionDestination: AddressZero,
    ipfsData: 'ipfs data',
  };

  const coverProductTemplate = {
    productType: 1,
    yieldTokenAddress: AddressZero,
    coverAssets: 1111,
    initialPriceRatio: 2000, // 20%
    capacityReductionRatio: 0,
    useFixedPrice: false,
  };

  const productInitializationParams = [
    {
      productId: 0,
      weight: 100, // 1.00
      initialPrice: coverProductTemplate.initialPriceRatio,
      targetPrice: 200, // 2%}
    },
  ];

  const coverId = 0;
  const productId = 0;

  beforeEach(async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const { defaultSender: manager } = this.accounts;
    const [staker] = this.accounts.members;
    const productId = 0;
    // Set global product and product type
    await cover.setProduct(coverProductTemplate, productId);
    await cover.setProductType({ claimMethod: 1, gracePeriod: daysToSeconds('7') }, productId);

    // Initialize staking pool
    const poolId = 0;
    const isPrivatePool = false;
    const ipfsDescriptionHash = 'Staking pool 1';
    const maxPoolFee = 10; // 10%
    const initialPoolFee = 7; // 7%

    await cover.initializeStaking(
      stakingPool.address,
      manager.address,
      isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      poolId,
      ipfsDescriptionHash,
    );

    // Deposit into pool
    const amount = parseEther('50000');
    await nxm.connect(staker).approve(tokenController.address, amount);
    await stakingPool.connect(staker).depositTo([
      {
        tokenId: 0,
        amount,
        destination: staker.address,
        trancheId: (await getCurrentTrancheId()) + 3,
      },
    ]);
  });

  async function moveDaysForward(days) {
    let { timestamp } = await ethers.provider.getBlock('latest');
    timestamp += daysToSeconds(days.toString());
    await setNextBlockTime(timestamp);
    await mineNextBlock();
  }

  it('should correctly calculate the premium', async function () {
    const { stakingPool, cover } = this;
    const { GLOBAL_CAPACITY_RATIO, PRICE_CHANGE_PER_DAY } = this.config;

    await moveDaysForward(183);

    const { totalCapacity } = await stakingPool.getActiveTrancheCapacities(
      buyCoverParamsTemplate.productId,
      GLOBAL_CAPACITY_RATIO,
      coverProductTemplate.capacityReductionRatio,
    );

    // 1st cover buy
    {
      const product = await stakingPool.products(productId);
      const basePrice = await calculateBasePrice(stakingPool, product, PRICE_CHANGE_PER_DAY);
      const premiumPerYear = await stakingPool.calculatePremiumPerYear(
        basePrice,
        buyCoverParamsTemplate.amount.div(WeiPerEther.div(100)),
        0, // initialCapacityUsed
        totalCapacity,
      );

      await cover.allocateCapacity({ ...buyCoverParamsTemplate }, coverId, stakingPool.address);
      expect(await cover.lastPremium()).to.be.equal(premiumPerYear.div(4));
    }

    // 2nd cover buy
    {
      await moveDaysForward(3);
      const product = await stakingPool.products(productId);
      expect(product.nextPrice).to.be.equal(296);
      const activeAllocationsArray = await stakingPool.getActiveAllocations(productId);
      const activeAllocations = activeAllocationsArray.reduce((x, y) => {
        return x.add(y);
      });

      const amount = parseEther('24000');
      const basePrice = await calculateBasePrice(stakingPool, product, PRICE_CHANGE_PER_DAY);
      const premiumPerYear = await stakingPool.calculatePremiumPerYear(
        basePrice,
        amount.div(WeiPerEther.div(100)),
        activeAllocations, // initialCapacityUsed
        totalCapacity,
      );
      const buyCoverParams = { ...buyCoverParamsTemplate, amount };
      await cover.allocateCapacity(buyCoverParams, coverId + 1, stakingPool.address);

      expect(await cover.lastPremium()).to.be.equal(amount.div(4).mul(basePrice).div(10000));
      expect(await cover.lastPremium()).to.be.equal(premiumPerYear.div(4));
    }

    // 3rd cover buy
    {
      await moveDaysForward(5);
      const product = await stakingPool.products(productId);
      expect(product.nextPrice).to.be.equal(680);
      const amount = parseEther('24000');
      const basePrice = await calculateBasePrice(stakingPool, product, PRICE_CHANGE_PER_DAY);
      const buyCoverParams = { ...buyCoverParamsTemplate, amount };
      await cover.allocateCapacity(buyCoverParams, coverId, stakingPool.address);
      expect(await cover.lastPremium()).to.be.equal(amount.div(4).mul(basePrice).div(10000));
    }

    //  4th cover buy
    {
      await moveDaysForward(5);
      const product = await stakingPool.products(productId);
      expect(product.nextPrice).to.be.equal(910);
      const amount = parseEther('24000');
      const basePrice = await calculateBasePrice(stakingPool, product, PRICE_CHANGE_PER_DAY);
      const buyCoverParams = { ...buyCoverParamsTemplate, amount };
      await cover.allocateCapacity(buyCoverParams, coverId, stakingPool.address);
      expect(await cover.lastPremium()).to.be.equal(amount.div(4).mul(basePrice).div(10000));
    }

    // 5th cover buy
    {
      await moveDaysForward(15);
      const product = await stakingPool.products(productId);
      expect(product.nextPrice).to.be.equal(1140);
      const amount = parseEther('16000');
      const buyCoverParams = { ...buyCoverParamsTemplate, amount };
      await cover.allocateCapacity(buyCoverParams, coverId, stakingPool.address);
      // TODO: Calculate surge premium and verify
      // const basePrice = await calculateBasePrice(stakingPool, product, PRICE_CHANGE_PER_DAY);
      // expect(await cover.lastPremium()).to.be.equal(amount.div(4).mul(basePrice).div(10000));
    }
    // 6th cover buy
    {
      await moveDaysForward(10);
      const product = await stakingPool.products(productId);
      expect(product.nextPrice).to.be.equal(710);
      const activeAllocationsArray = await stakingPool.getActiveAllocations(productId);
      const activeAllocations = activeAllocationsArray.reduce((x, y) => {
        return x.add(y);
      });

      const amount = parseEther('4800');
      const basePrice = await calculateBasePrice(stakingPool, product, PRICE_CHANGE_PER_DAY);
      const premiumPerYear = await stakingPool.calculatePremiumPerYear(
        basePrice,
        amount.div(WeiPerEther.div(100)),
        activeAllocations, // initialCapacityUsed
        totalCapacity,
      );
      const buyCoverParams = { ...buyCoverParamsTemplate, amount };
      await cover.allocateCapacity(buyCoverParams, coverId, stakingPool.address);

      // TODO: Calculate surge premium
      // expect(await cover.lastPremium()).to.be.equal(amount.div(4).mul(basePrice).div(10000));
      expect(await cover.lastPremium()).to.be.equal(premiumPerYear.div(4));
    }
    // final calculations
    {
      const product = await stakingPool.products(productId);
      expect(product.nextPrice).to.be.equal(306);
    }
  });
});
