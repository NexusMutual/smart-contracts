const { ethers, artifacts } = require('hardhat');
const { bytesToHex, hexToBytes } = require('ethereum-cryptography/utils');
const { keccak256 } = require('ethereum-cryptography/keccak');

async function stakingPoolAddressAt(poolFactoryAddress, poolId) {
  const { bytecode: proxyBytecode } = await artifacts.readArtifact('MinimalBeaconProxy');
  const initCodeHash = bytesToHex(keccak256(hexToBytes(proxyBytecode.replace(/^0x/i, ''))));

  const salt = Buffer.from(poolId.toString(16).padStart(64, '0'), 'hex');
  const initCodeHashHex = Buffer.from(initCodeHash, 'hex');
  const stakingPoolAddress = ethers.utils.getCreate2Address(poolFactoryAddress, salt, initCodeHashHex);
  return stakingPoolAddress;
}

module.exports = { stakingPoolAddressAt };
