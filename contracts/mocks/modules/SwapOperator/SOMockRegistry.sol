// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import '../../generic/RegistryGeneric.sol';

contract SOMockRegistry is RegistryGeneric {

  mapping(address contractAddress => uint index) public contractIndexes;
  mapping(uint index => address payable contractAddress) public contractAddresses;
  uint public pauseConfig;

  function setContractAddress(uint index, address payable contractAddress) external {
    require(isValidContractIndex(index), InvalidContractIndex());
    contractIndexes[contractAddress] = index;
    contractAddresses[index] = contractAddress;
  }

  function setPauseConfig(uint config) external {
    pauseConfig = config;
  }

  function getPauseConfig() external view override returns (uint) {
    return pauseConfig;
  }

  function isValidContractIndex(uint index) public pure override returns (bool) {
    // cheap validation that only one bit is set (i.e. it's a power of two)
    unchecked { return index & (index - 1) == 0 && index > 0; }
  }

  function getContractAddressByIndex(uint index) external view override returns (address payable) {
    require(isValidContractIndex(index), InvalidContractIndex());
    return contractAddresses[index];
  }

  function getContractIndexByAddress(address contractAddress) external view override returns (uint) {
    return contractIndexes[contractAddress];
  }

}
