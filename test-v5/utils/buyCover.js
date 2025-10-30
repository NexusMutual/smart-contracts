const { ethers } = require('hardhat');
const { _TypedDataEncoder } = ethers.utils;

async function signLimitOrder(contractAddress, params, signer) {
  const { chainId } = await ethers.provider.getNetwork();

  const domain = {
    name: 'NexusMutualLimitOrders',
    version: '1.0.0',
    chainId,
    verifyingContract: contractAddress,
  };

  const types = {
    ExecuteOrder: [
      { name: 'orderDetails', type: 'OrderDetails' },
      { name: 'executionDetails', type: 'ExecutionDetails' },
    ],
    OrderDetails: [
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
    ],
    ExecutionDetails: [
      { name: 'buyer', type: 'address' },
      { name: 'notExecutableBefore', type: 'uint256' },
      { name: 'executableUntil', type: 'uint256' },
      { name: 'renewableUntil', type: 'uint256' },
      { name: 'renewablePeriodBeforeExpiration', type: 'uint256' },
      { name: 'maxPremiumInAsset', type: 'uint256' },
    ],
  };

  // Populate any ENS names
  const resolveName = async name => ethers.provider.resolveName(name);
  const populated = await _TypedDataEncoder.resolveNames(domain, types, params, resolveName);

  const digest = _TypedDataEncoder.hash(populated.domain, types, populated.value);

  const signature = signer._signTypedData(domain, types, params);

  return { digest, signature };
}

module.exports = {
  signLimitOrder,
};
