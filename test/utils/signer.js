const { ethers, network } = require('hardhat');
const { impersonateAccount, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const { JsonRpcProvider, JsonRpcSigner, parseEther } = ethers;

const getSigner = async address => {
  if (network.name !== 'hardhat') {
    return new JsonRpcSigner(new JsonRpcProvider(network.config.url), address);
  }

  await impersonateAccount(address);
  return ethers.getSigner(address);
};

const getFundedSigner = async (address, amount = parseEther('1000')) => {
  await setBalance(address, amount);
  return getSigner(address);
};

module.exports = {
  getSigner,
  getFundedSigner,
};
