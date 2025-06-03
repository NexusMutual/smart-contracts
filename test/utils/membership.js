const { ethers } = require('hardhat');
const { arrayify, defaultAbiCoder, keccak256 } = ethers;

const MEMBERSHIP_APPROVAL = ethers.encodeBytes32String('MEMBERSHIP_APPROVAL');

const signMembershipApproval = async ({ address, nonce, chainId, kycAuthSigner }) => {
  const message = defaultAbiCoder.encode(
    ['bytes32', 'uint256', 'address', 'uint256'],
    [MEMBERSHIP_APPROVAL, nonce, address, chainId || ethers.network.config.chainId || 1],
  );
  const hash = keccak256(message);
  const signature = await kycAuthSigner.signMessage(arrayify(hash));
  return signature;
};

module.exports = { signMembershipApproval };
