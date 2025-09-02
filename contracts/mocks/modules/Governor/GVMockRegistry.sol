// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/RegistryGeneric.sol";

contract GVMockRegistry is RegistryGeneric {

  // contracts
  mapping(uint index => Contract) internal contracts;
  mapping(address contractAddress => uint index) internal contractIndexes;

  uint public membersCount;
  mapping(uint memberId => address member) public members;
  mapping(address member => uint memberId) public memberIds;
  mapping(uint memberId => uint seat) public memberToSeat;

  SystemPause internal systemPause;

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

  function isAdvisoryBoardMember(address member) external override view returns (bool) {
    uint memberId = memberIds[member];
    return memberToSeat[memberId] != 0;
  }

  function isAdvisoryBoardMemberById(uint memberId) external override view returns (bool) {
    return memberToSeat[memberId] != 0;
  }

  function isMember(address member) external override view returns (bool) {
    return memberIds[member] != 0;
  }

  function setAdvisoryBoardMember(address member, uint seat) public {
    uint memberId = memberIds[member];
    memberToSeat[memberId] = seat;
  }

  function setMember(address member) public {
    uint memberId = ++membersCount;
    members[memberId] = member;
    memberIds[member] = memberId;
  }

  // Override the functions that Governor needs
  function getMemberId(address member) external override view returns (uint) {
    return memberIds[member];
  }

  function getMemberAddress(uint memberId) external override view returns (address) {
    return members[memberId];
  }

  function getAdvisoryBoardSeat(address member) external override view returns (uint) {
    uint memberId = memberIds[member];
    uint seat = memberToSeat[memberId];
    require(seat != 0, NotAdvisoryBoardMember());
    return seat;
  }

  function swapAdvisoryBoardMember(uint from, uint to) external override {
    // This is a mock implementation - in real contract it would swap the seats
    require(from > 0 && to > 0, "Invalid member IDs");
    require(from <= membersCount && to <= membersCount, "Member ID out of range");

    // Swap the seats
    uint tempSeat = memberToSeat[from];
    memberToSeat[from] = memberToSeat[to];
    memberToSeat[to] = tempSeat;
  }
}
