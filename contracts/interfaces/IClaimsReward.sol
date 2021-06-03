/* Copyright (C) 2021 NexusMutual.io

  This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/ */

interface IClaimsReward {

  /// @dev Decides the next course of action for a given claim.
  function changeClaimStatus(uint claimid) external;

  function getCurrencyAssetAddress(bytes4 currency) external view returns (address);

  function getRewardToBeGiven(
    uint check,
    uint voteid,
    uint flag
  )
  external
  view
  returns (
    uint tokenCalculated,
    bool lastClaimedCheck,
    uint tokens,
    uint perc
  );

  function upgrade(address _newAdd) external;

  function getRewardToBeDistributedByUser(address _add) external view returns (uint total);

  function getRewardAndClaimedStatus(uint check, uint claimId) external view returns (uint reward, bool claimed);


  function claimAllPendingReward(uint records) external;

  function getAllPendingRewardOfUser(address _add) external view returns (uint);

  function _claimStakeCommission(uint _records, address _user) external;
}
