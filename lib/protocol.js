const { ethers } = require('ethers');
const { parseEther, ZeroAddress } = ethers;
const { BigIntMath } = require('./helpers');
const { PoolAsset } = require('./constants');

// Cover constants
const GLOBAL_REWARDS_RATIO = 5000n; // 50%
const COVER_PRICE_DENOMINATOR = 10000n; // 100% bps

// StakingPool constants
const REWARDS_DENOMINATOR = 10000n; // 100% bps
const BUCKET_DURATION = BigInt(28 * 24 * 3600); // 28 days

function getObservationIndex(timestamp, { PERIOD_SIZE, GRANULARITY }) {
  if (timestamp % PERIOD_SIZE > 1) {
    return (timestamp / PERIOD_SIZE + 1n) % GRANULARITY;
  }
  return (timestamp / PERIOD_SIZE) % GRANULARITY;
}

// ======================== RAMM ==============================================

// TODO: eject from lib - we'll clearly not use it outside of tests
/**
 * Calculates the internal NXM token price in ETH for given states
 */
function calculateInternalPrice(currentState, observations, capital, supply, currentTimestamp, constants) {
  const { GRANULARITY } = constants;
  const currentIdx = getObservationIndex(BigInt(currentTimestamp), constants);
  const previousIdx = (currentIdx + 1n) % GRANULARITY;

  const firstObservation = observations[Number(previousIdx)];
  const currentObservation = observations[Number(currentIdx)];

  const elapsed = BigInt(currentTimestamp) - firstObservation.timestamp;

  const spotPriceA = (parseEther('1') * currentState.eth) / currentState.nxmA;
  const spotPriceB = (parseEther('1') * currentState.eth) / currentState.nxmB;

  const averagePriceA = (currentObservation.priceCumulativeAbove - firstObservation.priceCumulativeAbove) / elapsed;

  const averagePriceB = (currentObservation.priceCumulativeBelow - firstObservation.priceCumulativeBelow) / elapsed;

  const priceA = BigIntMath.min(averagePriceA, spotPriceA);
  const priceB = BigIntMath.max(averagePriceB, spotPriceB);
  const bookValue = (parseEther('1') * capital) / supply;

  const internalPrice = priceA + priceB - bookValue;
  const maxPrice = (parseEther('1') * 3n * capital) / supply; // 300% BV
  const minPrice = (parseEther('1') * 35n * capital) / (supply * 100n); // 35% BV

  return BigIntMath.max(BigIntMath.min(internalPrice, maxPrice), minPrice);
}

// TODO: eject from lib - we'll clearly not use it outside of tests
/**
 * Calculates the expected internal NXM price in ETH
 */
async function getInternalPrice(ramm, pool, tokenController, timestamp) {
  const capital = await pool.getPoolValueInEth();
  const supply = await tokenController.totalSupply();
  const mcrValue = await pool.getMCR();
  const context = {
    capital,
    supply,
    mcr: mcrValue,
  };

  const GRANULARITY = await ramm.GRANULARITY();
  const PERIOD_SIZE = await ramm.PERIOD_SIZE();
  const previousState = await ramm.loadState();
  const previousObservations = [];

  for (let i = 0; i < 3; i++) {
    const observation = await ramm.observations(i);
    previousObservations[i] = {
      priceCumulativeAbove: observation.priceCumulativeAbove,
      priceCumulativeBelow: observation.priceCumulativeBelow,
      timestamp: observation.timestamp,
    };
  }

  const state = {
    nxmA: previousState.nxmA,
    nxmB: previousState.nxmB,
    eth: previousState.eth,
    budget: previousState.budget,
    ratchetSpeedB: previousState.ratchetSpeedB,
    timestamp: previousState.timestamp,
  };

  const [currentState] = await ramm._getReserves(state, context, timestamp);
  const observations = await ramm._updateTwap(state, previousObservations, context, timestamp);

  return calculateInternalPrice(currentState, observations, capital, supply, timestamp, { GRANULARITY, PERIOD_SIZE });
}

// ======================= COVER ==============================================

/**
 * Calculates the premium for purchasing cover
 *
 * @param {bigint} amount - Cover amount in cover asset
 * @param {bigint} nxmPriceInCoverAsset - NXM price in cover asset (18 decimals)
 * @param {number|bigint} period - Coverage period in seconds
 * @param {bigint} price - Price from product.bumpedPrice or getBasePrice()
 * @param {bigint} allocationUnit - NXM allocation unit (NXM_PER_ALLOCATION_UNIT)
 * @param {number} paymentAsset - Payment asset (PoolAsset enum)
 * @returns {{premiumInNxm: bigint, premiumInAsset: bigint, coverNXMAmount: bigint}}
 */
function calculatePremium(amount, nxmPriceInCoverAsset, period, price, allocationUnit, paymentAsset) {
  const nxmAmount = (amount * parseEther('1')) / nxmPriceInCoverAsset;

  const coverNXMAmount =
    nxmAmount % allocationUnit === 0n ? nxmAmount : (nxmAmount / allocationUnit + 1n) * allocationUnit;

  const annualizedPremiumNxm = (coverNXMAmount * price) / COVER_PRICE_DENOMINATOR;
  const premiumInNxm = (annualizedPremiumNxm * BigInt(period)) / (365n * 24n * 60n * 60n);

  const premiumInAsset =
    paymentAsset === PoolAsset.NXM ? premiumInNxm : (premiumInNxm * nxmPriceInCoverAsset) / parseEther('1');

  return { premiumInNxm, premiumInAsset, coverNXMAmount };
}

/**
 * Calculates rewards minted when allocating staking pool capacity for cover
 *
 * @param {bigint} premium - Premium in NXM
 * @param {number|bigint} timestamp - Cover start timestamp
 * @param {number|bigint} period - Coverage period in seconds
 * @returns {bigint} Total rewards to mint
 */
function calculateRewards(premium, timestamp, period) {
  const expirationBucket = BigIntMath.divCeil(BigInt(timestamp) + BigInt(period), BUCKET_DURATION);
  const rewardStreamPeriod = expirationBucket * BUCKET_DURATION - BigInt(timestamp);
  const _rewardPerSecond = (premium * GLOBAL_REWARDS_RATIO / REWARDS_DENOMINATOR) / rewardStreamPeriod;
  return _rewardPerSecond * rewardStreamPeriod;
}

/**
 * Calculates premium values for editing cover
 *
 * @param {bigint} coverNXMAmount - Cover amount in NXM (allocation unit rounded)
 * @param {bigint} basePrice - Base price from SP.getBasePrice() (accounts for time smoothing)
 * @param {number|bigint} period - New coverage period in seconds
 * @param {bigint} refundInNxm - Refund amount in NXM from calculateCoverEditRefund()
 * @param {bigint} editAssetPrice - NXM price in cover asset at edit time (18 decimals)
 * @param {number} paymentAsset - Payment asset (PoolAsset enum)
 * @returns {{newPremiumInNxm: bigint, newPremiumInAsset: bigint, extraPremiumInNxm: bigint, extraPremiumInAsset: bigint}}
 */
function calculateCoverEditPremium(coverNXMAmount, basePrice, period, refundInNxm, editAssetPrice, paymentAsset) {
  const newPremiumPerYear = (coverNXMAmount * basePrice) / COVER_PRICE_DENOMINATOR;
  const newPremiumInNxm = (newPremiumPerYear * BigInt(period)) / (365n * 24n * 60n * 60n);

  const newPremiumInAsset =
    paymentAsset === PoolAsset.NXM
      ? newPremiumInNxm
      : (newPremiumInNxm * editAssetPrice) / ethers.parseEther('1');

  const extraPremiumInNxm = newPremiumInNxm - refundInNxm;
  const extraPremiumInAsset =
    paymentAsset === PoolAsset.NXM
      ? extraPremiumInNxm
      : (extraPremiumInNxm * editAssetPrice) / ethers.parseEther('1');

  return { newPremiumInNxm, newPremiumInAsset, extraPremiumInNxm, extraPremiumInAsset };
}

/**
 * Calculates refund for unused cover period
 *
 * @param {number|bigint} period - Original coverage period in seconds
 * @param {bigint} passedPeriod - Time elapsed since cover start (seconds)
 * @param {bigint} premiumInNxm - Original premium in NXM
 * @param {bigint} editAssetPrice - NXM price in cover asset at edit time (18 decimals)
 * @param {number} paymentAsset - Payment asset (PoolAsset enum)
 * @returns {{refundInNxm: bigint, refundInAsset: bigint}}
 */
function calculateCoverEditRefund(period, passedPeriod, premiumInNxm, editAssetPrice, paymentAsset) {
  const remainingPeriod = BigInt(period) - passedPeriod;
  const refundInNxm = (premiumInNxm * remainingPeriod) / BigInt(period);
  const refundInAsset =
    paymentAsset === PoolAsset.NXM ? refundInNxm : (refundInNxm * editAssetPrice) / ethers.parseEther('1');
  return { refundInNxm, refundInAsset };
}

/**
 * @typedef {Object} CoverRewardsInput
 * @property {bigint} premiumInNxm - Cover premium in NXM
 * @property {number|bigint} start - Cover start timestamp
 * @property {number|bigint} period - Coverage period in seconds
 */

/**
 * Calculates net rewards for cover edit operation
 *
 * @param {CoverRewardsInput} oldCover - Original cover premiumInNxm, start and period
 * @param {CoverRewardsInput} newCover - New cover premiumInNxm, start and period
 * @returns {bigint} Net rewards (minted - burned)
 */
function calculateCoverEditRewards(oldCover, newCover) {
  // rewardsToMint for new cover (added period) - SP.allocate
  const newExpirationBucket = BigIntMath.divCeil(BigInt(newCover.start) + BigInt(newCover.period), BUCKET_DURATION);
  const newRewardStreamPeriod = newExpirationBucket * BUCKET_DURATION - BigInt(newCover.start);
  const newRewardPerSecond = (newCover.premiumInNxm * GLOBAL_REWARDS_RATIO / REWARDS_DENOMINATOR) / newRewardStreamPeriod;
  const rewardsToMint = newRewardPerSecond * newRewardStreamPeriod;

  // rewardsToBurn for old cover (unused period) - SP.requestDeallocation
  let rewardsToBurn = 0n;
  if (oldCover.premiumInNxm > 0n) {
    const oldExpiration = BigInt(oldCover.start) + BigInt(oldCover.period);
    const oldExpirationBucketId = BigIntMath.divCeil(oldExpiration, BUCKET_DURATION);
    const rewards = oldCover.premiumInNxm * GLOBAL_REWARDS_RATIO / REWARDS_DENOMINATOR;
    const oldRewardStreamPeriod = oldExpirationBucketId * BUCKET_DURATION - BigInt(oldCover.start);
    const oldRewardsPerSecond = rewards / oldRewardStreamPeriod;
    rewardsToBurn = oldRewardsPerSecond * (oldExpirationBucketId * BUCKET_DURATION - BigInt(newCover.start));
  }

  return rewardsToMint - rewardsToBurn;
}

// ====================== STAKING =============================================

function calculateFirstTrancheId(lastBlock, period, gracePeriod) {
  return Math.floor((lastBlock.timestamp + Number(period) + Number(gracePeriod)) / (91 * 24 * 3600));
}

// TODO: eject from lib
async function stakeOnly({ stakingPool, staker, period, gracePeriod, trancheIdOffset }) {
  // Staking inputs
  const stakingAmount = parseEther('100');
  const lastBlock = await ethers.provider.getBlock('latest');
  const firstTrancheId = calculateFirstTrancheId(lastBlock, period, gracePeriod);

  // Stake to open up capacity
  await stakingPool.connect(staker).depositTo(
    stakingAmount,
    firstTrancheId + trancheIdOffset,
    0, // new position
    ZeroAddress, // destination
  );
}

// TODO: eject from lib
async function stake({ contracts, stakingPool, staker, productId, period, gracePeriod, amount = 0 }) {
  const { stakingProducts } = contracts;

  // Staking inputs
  const stakingAmount = amount !== 0n ? amount : parseEther('10000');
  const lastBlock = await ethers.provider.getBlock('latest');
  const firstTrancheId = calculateFirstTrancheId(lastBlock, period, gracePeriod);

  // Stake to open up capacity
  await stakingPool.connect(staker).depositTo(
    stakingAmount,
    firstTrancheId,
    0, // new position
    ZeroAddress, // destination
  );

  const stakingProductParams = {
    productId,
    recalculateEffectiveWeight: true,
    setTargetWeight: true,
    targetWeight: 100, // 1
    setTargetPrice: true,
    targetPrice: 100, // 1%
  };

  // Set staked products
  const managerSigner = await ethers.getSigner(await stakingPool.manager());
  const poolId = await stakingPool.getPoolId();
  await stakingProducts.connect(managerSigner).setProducts(poolId, [stakingProductParams]);
}

module.exports = {
  calculateInternalPrice,
  getInternalPrice,
  calculatePremium,
  calculateRewards,
  calculateCoverEditPremium,
  calculateCoverEditRefund,
  calculateCoverEditRewards,
  calculateRewards,
  calculateFirstTrancheId,
  stakeOnly,
  stake,
};
