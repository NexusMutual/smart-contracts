const { ethers } = require('hardhat');
const { parseEther } = ethers.utils;

const CLAIM_STATUS = {
  PENDING: 0,
  ACCEPTED: 1,
  DENIED: 2,
};

const PAYOUT_STATUS = {
  PENDING: 0,
  COMPLETE: 1,
  UNCLAIMED: 2,
  DENIED: 3,
};

const ASSET = {
  ETH: 0,
  DAI: 1,
};

const coverDetailsFixture = {
  productId: 0,
  coverAsset: ASSET.ETH,
  amount: parseEther('100'),
  start: 0,
  period: 30 * 24 * 3600, // 30 days
  gracePeriod: 7 * 24 * 3600, // 7 days
  globalRewardsRatio: 0,
  globalCapacityRatio: 20000,
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
    params.globalRewardsRatio,
    params.globalCapacityRatio,
  );
};

const submitClaim =
  ({ accounts, contracts }) =>
  async ({
    coverId = 0,
    amount = parseEther('1'),
    coverPeriod = 0,
    coverAsset = 0,
    ipfsMetadata = '',
    sender,
    value,
  }) => {
    const [deposit] = await contracts.individualClaims.getAssessmentDepositAndReward(amount, coverPeriod, coverAsset);
    return await contracts.individualClaims
      .connect(sender || accounts[0])
      .submitClaim(coverId, amount, ipfsMetadata, { value: value || deposit });
  };

module.exports = {
  ASSET,
  CLAIM_STATUS,
  PAYOUT_STATUS,
  createMockCover,
  submitClaim,
};
