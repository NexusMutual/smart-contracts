const { ethers } = require('hardhat');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');

// this is designed to work with USDC
async function signPermit(signer, token, chainId, spender, value, deadline, domainVersion) {
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
  return ethers.utils.splitSignature(rawSignature);
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
  coverAsset,
  activeCoverAmount,
  expectedPayoutRatio,
  assessmentDepositRatio,
}) => [productId, date, coverAsset, activeCoverAmount, expectedPayoutRatio, assessmentDepositRatio];

module.exports = {
  ASSET,
  INCIDENT_STATUS,
  getPollStruct,
  getConfigurationStruct,
  getIncidentStruct,
  getVoteStruct,
  setTime,
  signPermit,
};
