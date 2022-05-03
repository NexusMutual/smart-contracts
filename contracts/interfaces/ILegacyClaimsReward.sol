// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface ILegacyClaimsReward {

  /// @dev Decides the next course of action for a given claim.
  function changeClaimStatus(uint claimid) external;

  function transferRewards() external;

  function getCurrencyAssetAddress(bytes4 currency) external view returns (address);

  function upgrade(address _newAdd) external;
}
