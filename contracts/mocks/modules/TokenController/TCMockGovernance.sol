// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;


contract TCMockGovernance {
  mapping(address => uint) public unclaimedGovernanceRewards;
  address public claimRewardLastCalledWithMemberAddress;
  uint public claimRewardLastCalledWithMaxRecords;

  function claimReward(
    address _memberAddress,
    uint _maxRecords
  ) external returns (uint pendingDAppReward) {
    pendingDAppReward = unclaimedGovernanceRewards[_memberAddress];
    claimRewardLastCalledWithMemberAddress = _memberAddress;
    claimRewardLastCalledWithMaxRecords = _maxRecords;
    unclaimedGovernanceRewards[_memberAddress] = 0;
  }

  function getPendingReward(address _memberAddress) external view returns(uint) {
    return unclaimedGovernanceRewards[_memberAddress];
  }

  function setUnclaimedGovernanceRewards(address _memberAddress, uint amount) public {
    unclaimedGovernanceRewards[_memberAddress] = amount;
  }

  function claimRewardLastCalledWith() public view returns (uint maxRecords, address memberAddress) {
    maxRecords = claimRewardLastCalledWithMaxRecords;
    memberAddress = claimRewardLastCalledWithMemberAddress;
  }
}
