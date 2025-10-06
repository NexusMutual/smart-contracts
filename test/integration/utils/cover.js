const { nexus } = require('hardhat');

const { BigIntMath } = nexus.helpers;

const REWARD_DENOMINATOR = 10000n;

function calculateRewards(premium, timestamp, period, rewardRatio, bucketDuration) {
  const expirationBucket = BigIntMath.divCeil(BigInt(timestamp) + BigInt(period), bucketDuration);
  const rewardStreamPeriod = expirationBucket * bucketDuration - BigInt(timestamp);
  const rewardPerSecond = (premium * rewardRatio) / REWARD_DENOMINATOR / rewardStreamPeriod;
  return rewardPerSecond * rewardStreamPeriod;
}

module.exports = {
  calculateRewards,
};
