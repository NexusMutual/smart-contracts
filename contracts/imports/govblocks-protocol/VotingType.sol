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

/**
 * @title votingType interface for All Types of voting.
 */

pragma solidity ^0.4.24;

contract VotingType {
    string public votingTypeName;

    function addSolution(uint _proposalId, address _memberAddress, uint _solutionStake, string _solutionHash, uint _dateAdd, uint _validityUpto, uint8 _v, bytes32 _r, bytes32 _s, bytes32 _lockTokenTxHash, bytes _action) public;

    function initiateAddSolution(uint _proposalId, uint _solutionStake, string _solutionHash, uint _validityUpto, uint8 _v, bytes32 _r, bytes32 _s, bytes32 _lockTokenTxHash, bytes _action) public;

    function proposalVoting(uint64 _proposalId, uint64[] _solutionChosen, uint _voteStake, uint _validityUpto, uint8 _v, bytes32 _r, bytes32 _s, bytes32 _lockTokenTxHash) external;

    function closeProposalVote(uint _proposalId) public;

    function giveRewardAfterFinalDecision(uint _proposalId) internal;
}