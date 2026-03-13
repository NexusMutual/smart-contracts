const { ethers } = require('ethers');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const { BigIntMath } = require('./helpers');
const { PoolAsset } = require('./constants');

const { parseEther, ZeroAddress } = ethers;

// Cover constants
const GLOBAL_REWARDS_RATIO = 5000n; // 50%
const COVER_PRICE_DENOMINATOR = 10000n; // 100% bps

// StakingPool constants
const REWARDS_DENOMINATOR = 10000n; // 100% bps
const BUCKET_DURATION = BigInt(28 * 24 * 3600); // 28 days

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
  const _rewardPerSecond = (premium * GLOBAL_REWARDS_RATIO) / REWARDS_DENOMINATOR / rewardStreamPeriod;
  return _rewardPerSecond * rewardStreamPeriod;
}

/**
 * @typedef {Object} CoverEditPremium
 * @property {bigint} newPremiumInNxm - Total premium amount in NXM for the edited cover
 * @property {bigint} newPremiumInAsset - Total premium amount in payment asset for the edited cover
 * @property {bigint} extraPremiumInNxm - Additional premium to pay in NXM for the cover amendment
 * @property {bigint} extraPremiumInAsset - Additional premium to pay in payment asset for the cover amendment
 */

/**
 * Calculates premium values for editing cover
 *
 * @param {bigint} coverNXMAmount - Cover amount in NXM (allocation unit rounded)
 * @param {bigint} basePrice - Base price from SP.getBasePrice() (accounts for time smoothing)
 * @param {number|bigint} period - New coverage period in seconds
 * @param {bigint} refundInNxm - Refund amount in NXM from calculateCoverEditRefund()
 * @param {bigint} editAssetPrice - NXM price in cover asset at edit time (18 decimals)
 * @param {number} paymentAsset - Payment assetId
 * @returns {CoverEditPremium}
 */
function calculateCoverEditPremium(coverNXMAmount, basePrice, period, refundInNxm, editAssetPrice, paymentAsset) {
  const newPremiumPerYear = (coverNXMAmount * basePrice) / COVER_PRICE_DENOMINATOR;
  const newPremiumInNxm = (newPremiumPerYear * BigInt(period)) / (365n * 24n * 60n * 60n);

  const newPremiumInAsset =
    paymentAsset === PoolAsset.NXM ? newPremiumInNxm : (newPremiumInNxm * editAssetPrice) / ethers.parseEther('1');

  const extraPremiumInNxm = newPremiumInNxm - refundInNxm;
  const extraPremiumInAsset =
    paymentAsset === PoolAsset.NXM ? extraPremiumInNxm : (extraPremiumInNxm * editAssetPrice) / ethers.parseEther('1');

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
  const newRewardPerSecond =
    (newCover.premiumInNxm * GLOBAL_REWARDS_RATIO) / REWARDS_DENOMINATOR / newRewardStreamPeriod;
  const rewardsToMint = newRewardPerSecond * newRewardStreamPeriod;

  // rewardsToBurn for old cover (unused period) - SP.requestDeallocation
  let rewardsToBurn = 0n;
  if (oldCover.premiumInNxm > 0n) {
    const oldExpiration = BigInt(oldCover.start) + BigInt(oldCover.period);
    const oldExpirationBucketId = BigIntMath.divCeil(oldExpiration, BUCKET_DURATION);
    const rewards = (oldCover.premiumInNxm * GLOBAL_REWARDS_RATIO) / REWARDS_DENOMINATOR;
    const oldRewardStreamPeriod = oldExpirationBucketId * BUCKET_DURATION - BigInt(oldCover.start);
    const oldRewardsPerSecond = rewards / oldRewardStreamPeriod;
    rewardsToBurn = oldRewardsPerSecond * (oldExpirationBucketId * BUCKET_DURATION - BigInt(newCover.start));
  }

  return rewardsToMint - rewardsToBurn;
}

// ====================== STAKING =============================================

function calculateFirstTrancheId(latestTimestamp, period, gracePeriod) {
  return Math.floor((latestTimestamp + Number(period) + Number(gracePeriod)) / (91 * 24 * 3600));
}

// TODO: eject from lib
async function stakeOnly({ stakingPool, staker, period, gracePeriod, trancheIdOffset }) {
  // Staking inputs
  const stakingAmount = parseEther('100');
  const latestTimestamp = await time.latest();
  const firstTrancheId = calculateFirstTrancheId(latestTimestamp, period, gracePeriod);

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
  const latestTimestamp = await time.latest();
  const firstTrancheId = calculateFirstTrancheId(latestTimestamp, period, gracePeriod);

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
  calculatePremium,
  calculateRewards,
  calculateCoverEditPremium,
  calculateCoverEditRefund,
  calculateCoverEditRewards,
  calculateFirstTrancheId,
  stakeOnly,
  stake,
};
