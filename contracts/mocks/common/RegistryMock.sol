// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../mocks/generic/RegistryGeneric.sol";

contract RegistryMock is RegistryGeneric {

  mapping(address => uint) private contractIndexByAddress;
  mapping(uint => address payable) private contractAddressByIndex;
  mapping(uint => bool) private contractTypeByIndex;

  mapping(uint memberId => address member) internal members;
  mapping(address member => uint memberId) internal memberIds;
  uint internal memberCount;

  uint internal pauseConfig;

  /* == EMERGENCY PAUSE == */

  function confirmPauseConfig(uint config) external override {
    pauseConfig = config;
  }

  function getPauseConfig() public override view returns (uint config) {
    return pauseConfig;
  }

  /* == MEMBERSHIP AND AB MANAGEMENT == */
  function isMember(address member) external override view returns (bool) {
    return memberIds[member] > 0;
  }

  function getMemberId(address member) external override view returns (uint) {
    return memberIds[member];
  }

  function getMemberCount() external override view returns (uint) {
    return memberCount;
  }

  function join(address member, bytes memory) external override payable {
    memberCount++;
    memberIds[member] = memberCount;
    members[memberCount] = member;
  }

  /* == CONTRACT MANAGEMENT == */

  function addContract(uint index, address contractAddress, bool isProxy) external override {
    contractIndexByAddress[contractAddress] = index;
    contractAddressByIndex[index] = payable(contractAddress);
    contractTypeByIndex[index] = isProxy;
  }

  function removeContract(uint index) external override {
    address contractAddress = contractAddressByIndex[index];
    require(contractAddress != address(0), "Contract does not exist");

    delete contractIndexByAddress[contractAddress];
    delete contractAddressByIndex[index];
    delete contractTypeByIndex[index];
  }

  function getContractAddressByIndex(uint index) external override view returns (address payable) {
    return contractAddressByIndex[index];
  }

  function getContractIndexByAddress(address contractAddress) external override view returns (uint) {
    return contractIndexByAddress[contractAddress];
  }
}
