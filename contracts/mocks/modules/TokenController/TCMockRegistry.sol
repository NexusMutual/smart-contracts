// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/RegistryGeneric.sol";

contract TCMockRegistry is RegistryGeneric {
  // contracts
  mapping(uint index => Contract) internal contracts;
  mapping(address contractAddress => uint index) internal contractIndexes;

  SystemPause internal systemPause; // 3 slots

  function addContract(uint index, address contractAddress, bool isProxy) external override {
    contracts[index] = Contract({addr: contractAddress, isProxy: isProxy});
    contractIndexes[contractAddress] = index;
  }

  function getContractIndexByAddress(address contractAddress) external override view returns (uint) {
    return contractIndexes[contractAddress];
  }

  function getContractAddressByIndex(uint index) external override view returns (address payable) {
    return payable(contracts[index].addr);
  }

  function getPauseConfig() public override view returns (uint config) {
    return systemPause.config;
  }

  function setPauseConfig(uint config) external {
    systemPause.config = uint48(config);
  }
}
