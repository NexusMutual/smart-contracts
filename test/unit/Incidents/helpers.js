const { ethers } = require('hardhat');
const keccak256 = require('keccak256');
const { MerkleTree } = require('merkletreejs');
const { parseEther, arrayify, hexZeroPad, hexValue } = ethers.utils;
const { BigNumber } = ethers;

const STATUS = {
  PENDING: 0,
  ACCEPTED: 1,
  DENIED: 2,
};

const ASSET = {
  ETH: 0,
  DAI: 1,
};

// Converts days to seconds
const daysToSeconds = numberOfDays => numberOfDays * 24 * 60 * 60;

const getConfigurationStruct = ({ rewardRatio, incidentExpectedPayoutRatio }) => [
  rewardRatio,
  incidentExpectedPayoutRatio,
];

const getPollStruct = ({ accepted, denied, start, end }) => [accepted, denied, start, end];

const getVoteStruct = ({ accepted, denied, start, end }) => [accepted, denied, start, end];

const getIncidentStruct = ({
  productId,
  date,
  payoutAsset,
  activeCoverAmount,
  expectedPayoutRatio,
  assessmentDepositRatio,
}) => [productId, date, payoutAsset, activeCoverAmount, expectedPayoutRatio, assessmentDepositRatio];

module.exports = {
  ASSET,
  STATUS,
  daysToSeconds,
  getPollStruct,
  getConfigurationStruct,
  getIncidentStruct,
  getVoteStruct,
};
