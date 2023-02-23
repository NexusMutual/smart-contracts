const { ethers } = require('hardhat');

function stakingPoolAddressAt(poolFactoryAddress, poolId) {
  const initCodeHash = '203b477dc328f1ceb7187b20e5b1b0f0bc871114ada7e9020c9ac112bbfb6920';
  const salt = Buffer.from(poolId.toString(16).padStart(64, '0'), 'hex');
  const initCodeHashHex = Buffer.from(initCodeHash, 'hex');
  const stakingPoolAddress = ethers.utils.getCreate2Address(poolFactoryAddress, salt, initCodeHashHex);
  return stakingPoolAddress;
}

module.exports = { stakingPoolAddressAt };
