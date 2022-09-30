const { ethers } = require('hardhat');
const { getContractAddress } = require('@ethersproject/address');
const { getAccounts } = require('./accounts');

const getDeployAddressAfter = async txCount => {
  const signers = await ethers.getSigners();
  const { defaultSender } = getAccounts(signers);
  const transactionCount = await defaultSender.getTransactionCount();
  return getContractAddress({
    from: defaultSender.address,
    nonce: transactionCount + txCount,
  });
};

module.exports = { getDeployAddressAfter };
