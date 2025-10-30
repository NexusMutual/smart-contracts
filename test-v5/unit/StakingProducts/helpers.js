const { expect } = require('chai');
const { ethers } = require('hardhat');

const { setEtherBalance } = require('../utils').evm;

const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;

const daysToSeconds = days => days * 24 * 60 * 60;

const buyCoverParamsTemplate = {
  owner: AddressZero,
  coverId: 0,
  productId: 0,
  coverAsset: 0, // ETH
  amount: parseEther('1'),
  period: daysToSeconds('30'),
  maxPremiumInAsset: parseEther('100'),
  paymentAsset: 0,
  payWithNXM: false,
  commissionRatio: 1,
  commissionDestination: AddressZero,
  ipfsData: 'ipfs data',
};

const allocationRequestTemplate = {
  coverId: 0,
  period: daysToSeconds('30'),
  gracePeriod: daysToSeconds('7'),
};

const initialProductTemplate = {
  productId: 0,
  weight: 100, // 1.00
  initialPrice: 500, // 5%
  targetPrice: 100, // 1%
};

const newProductTemplate = {
  productId: 0,
  recalculateEffectiveWeight: true,
  setTargetWeight: true,
  targetWeight: 100,
  setTargetPrice: true,
  targetPrice: 500,
};

const newProductWithMinPriceTemplate = {
  ...newProductTemplate,
  productId: 200,
};

const burnStakeParams = {
  allocationId: 1,
  productId: 1,
  start: 0,
  period: buyCoverParamsTemplate.period,
  deallocationAmount: 0,
};

const TRANCHE_DURATION = daysToSeconds(91);

async function getCurrentTrancheId() {
  const { timestamp } = await ethers.provider.getBlock('latest');
  return Math.floor(timestamp / TRANCHE_DURATION);
}

async function verifyProduct(params) {
  const { coverProducts } = this;
  let { product, productParams } = params;

  const [_initialPrice] = await coverProducts.getInitialPrices([productParams.productId]);

  if (!productParams.bumpedPriceUpdateTime) {
    const { timestamp } = await ethers.provider.getBlock('latest');
    productParams = { ...productParams, bumpedPriceUpdateTime: timestamp };
  }

  expect(product.targetWeight).to.be.equal(productParams.targetWeight);
  expect(product.targetPrice).to.be.equal(productParams.targetPrice);

  expect(product.bumpedPriceUpdateTime).to.be.equal(productParams.bumpedPriceUpdateTime);
  expect(product.bumpedPrice).to.be.equal(_initialPrice);
}

async function verifyInitialProduct(params) {
  let { product, initialProduct } = params;

  if (!initialProduct.bumpedPriceUpdateTime) {
    const { timestamp } = await ethers.provider.getBlock('latest');
    initialProduct = { ...initialProduct, bumpedPriceUpdateTime: timestamp };
  }

  expect(product.targetWeight).to.be.equal(initialProduct.weight);
  expect(product.targetPrice).to.be.equal(initialProduct.targetPrice);
  expect(product.bumpedPriceUpdateTime).to.be.equal(initialProduct.bumpedPriceUpdateTime);
  expect(product.bumpedPrice).to.be.equal(initialProduct.initialPrice);
}

async function depositTo(params) {
  const { stakingPool, nxm, tokenController } = this;
  const { staker, amount } = params;

  // Get capacity in staking pool
  await nxm.mint(staker.address, BigNumber.from(2).pow(128));
  await nxm.connect(staker).approve(tokenController.address, amount);
  const trancheId = (await getCurrentTrancheId()) + 2;
  await stakingPool.connect(staker).depositTo(amount, trancheId, /* token id: */ 0, staker.address);
}

async function allocateCapacity({ amount, productId }) {
  const { stakingPool, coverSigner, coverProductTemplate } = this;

  const { GLOBAL_CAPACITY_RATIO, GLOBAL_REWARDS_RATIO, DEFAULT_MIN_PRICE_RATIO } = this.config;

  const allocationRequest = {
    ...allocationRequestTemplate,
    productId,
    capacityRatio: GLOBAL_CAPACITY_RATIO,
    capacityReductionRatio: coverProductTemplate.capacityReductionRatio,
    useFixedPrice: coverProductTemplate.useFixedPrice,
    rewardRatio: GLOBAL_REWARDS_RATIO,
    productMinPrice: DEFAULT_MIN_PRICE_RATIO,
  };

  await stakingPool.connect(coverSigner).requestAllocation(amount, allocationRequest);
}

async function setStakedProducts(params) {
  const { stakingProducts } = this;
  const [manager] = this.accounts.members;

  let { productIds, targetWeight } = params;

  if (targetWeight === undefined) {
    targetWeight = 100;
  }

  const products = productIds.map(productId => ({ ...newProductTemplate, productId, targetWeight }));

  await stakingProducts.connect(manager).setProducts(this.poolId, products);
}

async function burnStake(params) {
  const { stakingPool, cover } = this;
  const { amount, start } = params;

  // Impersonate cover contract
  const coverSigner = await ethers.getImpersonatedSigner(cover.address);
  const balance = await coverSigner.getBalance();

  if (balance.lt(parseEther('1'))) {
    await setEtherBalance(cover.address, parseEther('100000'));
  }

  await stakingPool.connect(coverSigner).burnStake(amount, { ...burnStakeParams, start });
}

module.exports = {
  daysToSeconds,
  verifyProduct,
  verifyInitialProduct,
  depositTo,
  allocateCapacity,
  initialProductTemplate,
  newProductTemplate,
  newProductWithMinPriceTemplate,
  buyCoverParamsTemplate,
  setStakedProducts,
  burnStake,
  burnStakeParams,
};
