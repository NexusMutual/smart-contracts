const { ethers, network } = require('hardhat');
const { arrayify, formatBytes32String, defaultAbiCoder, keccak256 } = ethers.utils;

const MEMBERSHIP_APPROVAL = formatBytes32String('MEMBERSHIP_APPROVAL');

const signMembershipApproval = async ({ address, nonce, chainId, kycAuthSigner }) => {
  const message = defaultAbiCoder.encode(
    ['bytes32', 'uint256', 'address', 'uint256'],
    [MEMBERSHIP_APPROVAL, nonce, address, chainId || network.config.chainId || 1],
  );
  const hash = keccak256(message);
  const signature = await kycAuthSigner.signMessage(arrayify(hash));
  return signature;
};

module.exports = { signMembershipApproval };
