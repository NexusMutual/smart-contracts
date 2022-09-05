const { ethers } = require('hardhat');
const keccak256 = require('keccak256');
const { MerkleTree } = require('merkletreejs');
const { parseEther, arrayify, hexZeroPad, hexValue } = ethers.utils;
const { BigNumber } = ethers;
const { Zero } = ethers.constants;

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

// Converts days to seconds
const daysToSeconds = numberOfDays => numberOfDays * 24 * 60 * 60;

const submitClaim = ({ accounts, contracts, config }) => async ({
  coverId = 0,
  segmentId = 0,
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
    .submitClaim(coverId, segmentId, amount, ipfsMetadata, {
      value: value || deposit,
    });
};

const getConfigurationStruct = ({ rewardRatio, minAssessmentDepositRatio }) => [rewardRatio, minAssessmentDepositRatio];

const getPollStruct = ({ accepted, denied, start, end }) => [accepted, denied, start, end];

const getVoteStruct = ({ accepted, denied, start, end }) => [accepted, denied, start, end];

const getClaimDetailsStruct = ({
  amount,
  coverId,
  coverPeriod,
  coverAsset,
  nxmPriceSnapshot,
  minAssessmentDepositRatio,
  payoutRedeemed,
}) => [amount, coverId, coverPeriod, coverAsset, nxmPriceSnapshot, minAssessmentDepositRatio, payoutRedeemed];

const getIncidentDetailsStruct = ({
  productId,
  date,
  coverAsset,
  activeCoverAmount,
  expectedPayoutRatio,
  minAssessmentDepositRatio,
}) => [productId, date, coverAsset, activeCoverAmount, expectedPayoutRatio, minAssessmentDepositRatio];

module.exports = {
  ASSET,
  CLAIM_STATUS,
  PAYOUT_STATUS,
  daysToSeconds,
  submitClaim,
  getPollStruct,
  getConfigurationStruct,
  getClaimDetailsStruct,
  getIncidentDetailsStruct,
  getVoteStruct,
};
