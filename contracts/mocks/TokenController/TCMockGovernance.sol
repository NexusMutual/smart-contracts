// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../abstract/LegacyMasterAware.sol";
import "../../interfaces/IGovernance.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IProposalCategory.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/IMinimalStakingPool.sol";
import "../../interfaces/IMinimalCover.sol";

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

  function setUnclaimedGovernanceRewards(address _memberAddress, uint amount) public {
    unclaimedGovernanceRewards[_memberAddress] = amount;
  }

  function claimRewardLastCalledWith() public view returns (uint maxRecords, address memberAddress) {
    maxRecords = claimRewardLastCalledWithMaxRecords;
    memberAddress = claimRewardLastCalledWithMemberAddress;
  }
}
