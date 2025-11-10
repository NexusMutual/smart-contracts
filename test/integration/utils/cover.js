const { ethers, nexus } = require('hardhat');

const { parseEther } = ethers;
const { PoolAsset } = nexus.constants;
const { BigIntMath } = nexus.helpers;

const REWARD_DENOMINATOR = 10000n;

/**
 * Creates a cover for testing claims
 * @param {Object} cover - Cover contract instance
 * @param {Object} owner - Cover owner account
 * @param {Object} options - Cover options
 * @returns {number} Cover ID
 */
async function createCover(
  cover,
  owner,
  { coverAsset = PoolAsset.ETH, amount = parseEther('0.1'), periodDays = 30, productId = 0 } = {},
) {
  const paymentAsset = coverAsset; // Pay in same asset as cover
  const commissionRatio = 500; // 5% commission
  const commissionDestination = owner.address;
  const ipfsData = '';

  const daysToSeconds = days => BigInt(days) * 24n * 60n * 60n;
  const maxPremiumInAsset = (amount * 260n) / 10000n; // 2.6% of coverage amount
  const value = coverAsset === PoolAsset.ETH ? maxPremiumInAsset : 0n;

  const coverTx = await cover.connect(owner).buyCover(
    {
      owner: owner.address,
      coverId: 0,
      productId,
      coverAsset,
      amount,
      period: daysToSeconds(periodDays),
      maxPremiumInAsset,
      paymentAsset,
      commissionRatio,
      commissionDestination,
      ipfsData,
    },
    [{ poolId: 1, coverAmountInAsset: amount }], // Use pool 1 for simplicity
    { value },
  );

  const receipt = await coverTx.wait();
  const event = receipt.logs.find(event => event.fragment?.name === 'CoverBought');
  const coverId = event?.args.coverId;

  if (!coverId) {
    throw new Error('CoverBought event not found');
  }

  return coverId;
}

module.exports = {
  createCover,
};
