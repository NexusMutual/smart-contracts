// /* Copyright (C) 2017 GovBlocks.io

//   This program is free software: you can redistribute it and/or modify
//     it under the terms of the GNU General Public License as published by
//     the Free Software Foundation, either version 3 of the License, or
//     (at your option) any later version.

//   This program is distributed in the hope that it will be useful,
//     but WITHOUT ANY WARRANTY; without even the implied warranty of
//     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//     GNU General Public License for more details.

//   You should have received a copy of the GNU General Public License
//     along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity 0.5.7;

import "../Governance.sol";


contract GovernanceMock is Governance {
    function _initiateGovernance() external {
        allVotes.push(ProposalVote(address(0), 0, 0));
        totalProposals = 1;
        // allProposal.push(ProposalStruct(address(0), now));
        allDelegation.push(DelegateVote(address(0), address(0), now));
        tokenHoldingTime = 1 * 7 days;
        maxDraftTime = 2 * 7 days;
        maxVoteWeigthPer = 5;
        maxFollowers = 40;
        roleIdAllowedToCatgorize = uint(MemberRoles.Role.AdvisoryBoard);
        specialResolutionMajPerc = 75;
    }

}