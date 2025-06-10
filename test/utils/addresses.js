const { ethers, artifacts } = require('hardhat');
const { bytesToHex, hexToBytes } = require('ethereum-cryptography/utils');
const { keccak256 } = require('ethereum-cryptography/keccak');

const { parseEther, getCreate2Address } = ethers;

async function stakingPoolAddressAt(poolFactoryAddress, poolId) {
  const { bytecode: proxyBytecode } = await artifacts.readArtifact('MinimalBeaconProxy');
  const initCodeHash = bytesToHex(keccak256(hexToBytes(proxyBytecode.replace(/^0x/i, ''))));

  const salt = ethers.solidityPackedKeccak256(['uint256'], [poolId]);
  const initCodeHashHex = '0x6909600037600051600c52600c6000f3fe73bebebebebebebebebebebebebebebebebebebebe5af43d6000803e606057fd5bf3';

  const stakingPoolAddress = getCreate2Address(poolFactoryAddress, salt, initCodeHashHex);
  return stakingPoolAddress;
}

module.exports = { stakingPoolAddressAt };
