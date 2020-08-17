/* Copyright (C) 2017 GovBlocks.io
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

pragma solidity ^0.5.0;

contract IProposalCategory {

  event Category(
    uint indexed categoryId,
    string categoryName,
    string actionHash
  );

  /// @dev Adds new category
  /// @param _name Category name
  /// @param _memberRoleToVote Voting Layer sequence in which the voting has to be performed.
  /// @param _allowedToCreateProposal Member roles allowed to create the proposal
  /// @param _majorityVotePerc Majority Vote threshold for Each voting layer
  /// @param _quorumPerc minimum threshold percentage required in voting to calculate result
  /// @param _closingTime Vote closing time for Each voting layer
  /// @param _actionHash hash of details containing the action that has to be performed after proposal is accepted
  /// @param _contractAddress address of contract to call after proposal is accepted
  /// @param _contractName name of contract to be called after proposal is accepted
  /// @param _incentives rewards to distributed after proposal is accepted
  function addCategory(
    string calldata _name,
    uint _memberRoleToVote,
    uint _majorityVotePerc,
    uint _quorumPerc,
    uint[] calldata _allowedToCreateProposal,
    uint _closingTime,
    string calldata _actionHash,
    address _contractAddress,
    bytes2 _contractName,
    uint[] calldata _incentives
  )
  external;

  /// @dev gets category details
  function category(uint _categoryId)
  external
  view
  returns (
    uint categoryId,
    uint memberRoleToVote,
    uint majorityVotePerc,
    uint quorumPerc,
    uint[] memory allowedToCreateProposal,
    uint closingTime,
    uint minStake
  );

  ///@dev gets category action details
  function categoryAction(uint _categoryId)
  external
  view
  returns (
    uint categoryId,
    address contractAddress,
    bytes2 contractName,
    uint defaultIncentive
  );

  /// @dev Gets Total number of categories added till now
  function totalCategories() external view returns (uint numberOfCategories);

  /// @dev Updates category details
  /// @param _categoryId Category id that needs to be updated
  /// @param _name Category name
  /// @param _memberRoleToVote Voting Layer sequence in which the voting has to be performed.
  /// @param _allowedToCreateProposal Member roles allowed to create the proposal
  /// @param _majorityVotePerc Majority Vote threshold for Each voting layer
  /// @param _quorumPerc minimum threshold percentage required in voting to calculate result
  /// @param _closingTime Vote closing time for Each voting layer
  /// @param _actionHash hash of details containing the action that has to be performed after proposal is accepted
  /// @param _contractAddress address of contract to call after proposal is accepted
  /// @param _contractName name of contract to be called after proposal is accepted
  /// @param _incentives rewards to distributed after proposal is accepted
  function updateCategory(
    uint _categoryId,
    string memory _name,
    uint _memberRoleToVote,
    uint _majorityVotePerc,
    uint _quorumPerc,
    uint[] memory _allowedToCreateProposal,
    uint _closingTime,
    string memory _actionHash,
    address _contractAddress,
    bytes2 _contractName,
    uint[] memory _incentives
  )
  public;

}
