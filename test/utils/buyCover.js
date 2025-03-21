const { ethers } = require('hardhat');
const { _TypedDataEncoder } = ethers.utils;

async function signCoverOrder(contractAddress, params, signer) {
  const { chainId } = await ethers.provider.getNetwork();

  const domain = {
    name: 'NexusMutualCoverOrder',
    version: '1',
    chainId,
    verifyingContract: contractAddress,
  };

  const types = {
    ExecuteOrder: [
      { name: 'coverId', type: 'uint256' },
      { name: 'productId', type: 'uint24' },
      { name: 'amount', type: 'uint96' },
      { name: 'period', type: 'uint32' },
      { name: 'paymentAsset', type: 'uint8' },
      { name: 'coverAsset', type: 'uint8' },
      { name: 'owner', type: 'address' },
      { name: 'ipfsData', type: 'string' },
      { name: 'commissionRatio', type: 'uint16' },
      { name: 'commissionDestination', type: 'address' },
      { name: 'executionDetails', type: 'ExecutionDetails' },
    ],
    ExecutionDetails: [
      { name: 'notBefore', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'maxPremiumInAsset', type: 'uint256' },
      { name: 'maxNumberOfRenewals', type: 'uint8' },
      { name: 'renewWhenLeft', type: 'uint32' },
    ],
  };

  // Populate any ENS names
  const resolveName = async name => this.provider.resolveName(name);
  const populated = await _TypedDataEncoder.resolveNames(domain, types, params, resolveName);

  const digest = _TypedDataEncoder.hash(populated.domain, types, populated.value);

  const signature = signer._signTypedData(domain, types, params);

  return { digest, signature };
}

module.exports = {
  signCoverOrder,
};
