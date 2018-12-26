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

pragma solidity 0.4.24;
contract IGovernance{




    /// @dev Creates a new proposal
    /// @param _proposalDescHash Proposal description hash through IPFS having Short and long description of proposal
    /// @param _categoryId This id tells under which the proposal is categorized i.e. Proposal's Objective
    function createProposal(
        string _proposalTitle, 
        string _proposalSD, 
        string _proposalDescHash, 
        uint _categoryId
    ) external 
    {
    }

    /// @dev Edits the details of an existing proposal and creates new version
    /// @param _proposalId Proposal id that details needs to be updated
    /// @param _proposalDescHash Proposal description hash having long and short description of proposal.
    function updateProposal(
        uint _proposalId, 
        string _proposalTitle, 
        string _proposalSD, 
        string _proposalDescHash
    ) 
        external
    {
    }

    /// @dev Categorizes proposal to proceed further. Categories shows the proposal objective.
    function categorizeProposal(
        uint _proposalId, 
        uint _categoryId,
        uint _incentives
    ) external
    {
    }

    /// @dev Initiates add solution 
    /// @param _solutionHash Solution hash having required data against adding solution
    function addSolution(
        uint _proposalId,
        string _solutionHash, 
        bytes _action
    ) 
        external 
    {
    }

    /// @dev Opens proposal for voting
    function openProposalForVoting(uint _proposalId) 
        external
    {
    }

    /// @dev Submit proposal with solution
    /// @param _proposalId Proposal id
    /// @param _solutionHash Solution hash contains  parameters, values and description needed according to proposal
    function submitProposalWithSolution(
        uint _proposalId, 
        string _solutionHash, 
        bytes _action
    ) 
        external 
    {   
    }



    /// @dev Creates a new proposal with solution and votes for the solution
    /// @param _proposalDescHash Proposal description hash through IPFS having Short and long description of proposal
    /// @param _categoryId This id tells under which the proposal is categorized i.e. Proposal's Objective
    /// @param _solutionHash Solution hash contains  parameters, values and description needed according to proposal
    function createProposalwithSolution(
        string _proposalTitle, 
        string _proposalSD, 
        string _proposalDescHash,
        uint _categoryId, 
        string _solutionHash, 
        bytes _action
    ) 
        external
    {   
    }    

    /// @dev Casts vote
    /// @param _proposalId Proposal id
    /// @param _solutionChosen solution chosen while voting. _solutionChosen[0] is the chosen solution
    function submitVote(uint32 _proposalId, uint64 _solutionChosen) external {
    } 

    function canCloseProposal(uint _proposalId) 
        public 
        view 
        returns(uint closeValue) 
    {
    }

    function closeProposal(uint _proposalId) external {
    }

    function claimReward(address _memberAddress, uint[] _proposals) 
        external returns(uint pendingDAppReward) 
    {
    }

    function pauseProposal(uint _proposalId)
    {
    }

    function resumeProposal(uint _proposalId)
    {
    }

    function proposal(uint _proposalId) external view returns(uint proposalId, uint category, uint status, uint finalVerdict, uint totalReward)
    {
    }

    function callRewardClaimed(address _member, uint[] _voterProposals, uint _gbtReward)
    external
    {
    }

    function  allowedToCatgorize() public returns(uint roleId) {
    }
    

    event Proposal(
        address indexed proposalOwner,
        uint256 indexed proposalId,
        uint256 dateAdd,
        string proposalTitle,
        string proposalSD,
        string proposalDescHash
    );

    event Solution(
        uint256 indexed proposalId,
        address indexed solutionOwner,
        uint256 indexed solutionId,
        string solutionDescHash,
        uint256 dateAdd
    );

    event Vote(
        address indexed from,
        uint256 indexed proposalId,
        uint256 indexed voteId,
        uint256 dateAdd,
        uint256 solutionChosen
    );

    event RewardClaimed(
        address indexed member,
        uint[] voterProposals,
        uint gbtReward
    );

}