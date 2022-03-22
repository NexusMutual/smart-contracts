const { ethers } = require('hardhat');
const keccak256 = require('keccak256');
const { MerkleTree } = require('merkletreejs');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');
const { parseEther, arrayify, hexZeroPad, hexValue } = ethers.utils;
const { BigNumber, BigNumberish, Signature, utils, providers, Contract } = ethers;

// this is designed to work with USDC
async function signPermit (signer, token, chainId, spender, value, deadline, domainVersion) {
  const address = await signer.getAddress();
  const rawSignature = await signer._signTypedData(
    {
      name: await token.name(), // unique name of EIP-712 domain
      version: domainVersion, // version of domain
      chainId,
      verifyingContract: token.address, // address that receives permit
    },
    {
      Permit: [
        {
          name: 'owner',
          type: 'address',
        },
        {
          name: 'spender',
          type: 'address',
        },
        {
          name: 'value',
          type: 'uint256',
        },
        {
          name: 'nonce',
          type: 'uint256',
        },
        {
          name: 'deadline',
          type: 'uint256',
        },
      ],
    },
    {
      owner: address,
      spender,
      value,
      nonce: await token.nonces(address), // current nonce
      deadline,
    },
  );
  return utils.splitSignature(rawSignature);
}

const INCIDENT_STATUS = {
  PENDING: 0,
  ACCEPTED: 1,
  DENIED: 2,
  EXPIRED: 3,
};

const ASSET = {
  ETH: 0,
  DAI: 1,
};

// Converts days to seconds
const daysToSeconds = numberOfDays => numberOfDays * 24 * 60 * 60;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

const getConfigurationStruct = ({ rewardRatio, expectedPayoutRatio }) => [rewardRatio, expectedPayoutRatio];

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
  INCIDENT_STATUS,
  daysToSeconds,
  getPollStruct,
  getConfigurationStruct,
  getIncidentStruct,
  getVoteStruct,
  setTime,
  signPermit,
};
