const { ethers, nexus } = require('hardhat');
const { parseEther, toBeHex } = ethers;

const { PoolAsset } = nexus.constants;

const coverDetailsFixture = {
  productId: 0,
  coverAsset: PoolAsset.ETH,
  amount: parseEther('100'),
  start: 0,
  period: 30 * 24 * 3600, // 30 days
  gracePeriod: 7 * 24 * 3600, // 7 days
  rewardsRatio: 0,
  capacityRatio: 20000,
};

const createMockCover = async (cover, coverDetails) => {
  const params = { ...coverDetailsFixture, ...coverDetails };
  await cover.createMockCover(
    params.owner,
    params.productId,
    params.coverAsset,
    params.amount,
    params.start,
    params.period,
    params.gracePeriod,
    params.rewardsRatio,
    params.capacityRatio,
  );
};

const submitClaim =
  ({ accounts, contracts, config }) =>
  async ({ coverId = 0, amount = parseEther('1'), ipfsMetadata = toBeHex(0, 32), sender, value }) => {
    return await contracts.claims
      .connect(sender || accounts.members[0])
      .submitClaim(coverId, amount, ipfsMetadata, { value: value ?? config.claimDepositInETH });
  };

const daysToSeconds = days => days * 24 * 60 * 60;

module.exports = {
  createMockCover,
  submitClaim,
  daysToSeconds,
};
