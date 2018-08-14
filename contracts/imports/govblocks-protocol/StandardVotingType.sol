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

import "./ProposalCategory.sol";
import "./GovernanceData.sol";
import "./VotingType.sol";
import "./Pool.sol";
import "./Master.sol";
import "./Governance.sol";
import "./Upgradeable.sol";
import "./MemberRoles.sol";
import "./GBTStandardToken.sol";
import "./BasicToken.sol";
import "./GovBlocksMaster.sol";

contract StandardVotingType is Upgradeable{
    address public masterAddress;
    GovBlocksMaster GBM;
    BasicToken BT;
    GBTStandardToken GBTS;
    Master MS;
    Pool P1;
    Governance GOV;
    MemberRoles MR;
    ProposalCategory PC;
    GovernanceData GD;
    VotingType VT;

    modifier onlyInternal {
        MS = Master(masterAddress);
        require(MS.isInternal(msg.sender));
        _;
    }

    /// @dev Changes master's contract address
    /// @param _masterContractAddress New master contract address
    function changeMasterAddress(address _masterContractAddress) {
        if (masterAddress == address(0))
            masterAddress = _masterContractAddress;
        else {
            MS = Master(masterAddress);
            require(MS.isInternal(msg.sender));
            masterAddress = _masterContractAddress;
        }
    }

    modifier onlyMaster {
        require(msg.sender == masterAddress);
        _;
    }

    /*
    /// @dev Changes Global objects of the contracts || Uses latest version
    /// @param contractName Contract name 
    /// @param contractAddress Contract addresses
    function changeAddress(bytes4 contractName, address contractAddress) onlyInternal
    {
        if(contractName == 'GD'){
            GD = GovernanceData(contractAddress);
        } else if(contractName == 'MR'){
            MR = memberRoles(contractAddress);
        } else if(contractName == 'PC'){
            PC = ProposalCategory(contractAddress);
        } else if(contractName == 'GV'){
            GOV = Governance(contractAddress);
        } else if(contractName == 'PL'){
            P1 = Pool(contractAddress);
        }
    }
    */

    /// @dev updates dependancies
    function updateDependencyAddresses() onlyInternal {
        MS = Master(masterAddress);
        GD = GovernanceData(MS.getLatestAddress("GD"));
        MR = MemberRoles(MS.getLatestAddress("MR"));
        PC = ProposalCategory(MS.getLatestAddress("PC"));
        GOV = Governance(MS.getLatestAddress("GV"));
        P1 = Pool(MS.getLatestAddress("PL"));
    }

    /// @dev Changes GBT standard token address
    /// @param _GBTSAddress GBT standard token address
    function changeGBTSAddress(address _GBTSAddress) onlyMaster {
        GBTS = GBTStandardToken(_GBTSAddress);
    }
    /*
    /// @dev Sets vote value given by member
    /// @param _memberAddress Member address
    /// @param _proposalId Proposal id
    /// @param _memberStake Member stake
    /// @return finalVoteValue Final vote value
    function setVoteValue_givenByMember(address _memberAddress, uint _proposalId, uint _memberStake) onlyInternal returns(uint finalVoteValue) {
        uint tokensHeld = SafeMath.div((SafeMath.mul(SafeMath.mul(GBTS.balanceOf(_memberAddress), 100), 100)), GBTS.totalSupply());
        uint value = SafeMath.mul(Math.max256(_memberStake, GD.scalingWeight()), Math.max256(tokensHeld, GD.membershipScalingFactor()));
        finalVoteValue = SafeMath.mul(GD.getMemberReputation(_memberAddress), value);
    }

    /// @dev Closes Proposal Voting after All voting layers done with voting or Time out happens.
    /// @param _proposalId Proposal id
    function closeProposalVoteSVT(uint _proposalId) onlyInternal {
        VT = VotingType(GD.getProposalVotingType(_proposalId));
        uint totalVoteValue = 0;
        uint8 category = GD.getProposalCategory(_proposalId);
        uint8 currentVotingId = GD.getProposalCurrentVotingId(_proposalId);
        uint32 _mrSequenceId = PC.getRoleSequencAtIndex(category, currentVotingId);
        require(GOV.checkForClosing(_proposalId, _mrSequenceId) == 1);

        uint[] memory finalVoteValue = new uint[](GD.getTotalSolutions(_proposalId));
        for (uint8 i = 0; i < GD.getAllVoteIdsLengthByProposalRole(_proposalId, _mrSequenceId); i++) {
            uint voteId = GD.getVoteIdAgainstProposalRole(_proposalId, _mrSequenceId, i);
            uint solutionChosen = GD.getSolutionByVoteIdAndIndex(voteId, 0);
            uint voteValue = GD.getVoteValue(voteId);
            totalVoteValue = totalVoteValue + voteValue;
            finalVoteValue[solutionChosen] = finalVoteValue[solutionChosen] + voteValue;
        }

        uint8 max = 0;
        for (i = 0; i < finalVoteValue.length; i++) {
            if (finalVoteValue[max] < finalVoteValue[i]) {
                max = i;
            }
        }

        if (checkForThreshold(_proposalId, _mrSequenceId)) {
            closeProposalVoteSVT1(finalVoteValue[max], totalVoteValue, category, _proposalId, max);
        } else {
            uint8 interVerdict = GD.getProposalIntermediateVerdict(_proposalId);

            GOV.updateProposalDetails(_proposalId, currentVotingId, max, interVerdict);
            if (GD.getProposalCurrentVotingId(_proposalId) + 1 < PC.getRoleSequencLength(GD.getProposalCategory(_proposalId)))
                GD.changeProposalStatus(_proposalId, 7);
            else
                GD.changeProposalStatus(_proposalId, 6);
            GOV.changePendingProposalStart();
        }
    }

    function closeProposalVoteSVT1(uint maxVoteValue, uint totalVoteValue, uint8 category, uint _proposalId, uint8 max) internal {
        uint _closingTime;
        uint _majorityVote;
        uint8 currentVotingId = GD.getProposalCurrentVotingId(_proposalId);
        (, _closingTime, _majorityVote) = PC.getCategoryData3(category, currentVotingId);
        if (SafeMath.div(SafeMath.mul(maxVoteValue, 100), totalVoteValue) >= _majorityVote) {
            if (max > 0) {
                currentVotingId = currentVotingId + 1;
                if (currentVotingId < PC.getRoleSequencLength(GD.getProposalCategory(_proposalId))) {
                    GOV.updateProposalDetails(_proposalId, currentVotingId, max, 0);
                    P1.closeProposalOraclise(_proposalId, _closingTime);
                    GD.callOraclizeCallEvent(_proposalId, GD.getProposalDateUpd(_proposalId), PC.getClosingTimeAtIndex(category, currentVotingId));
                } else {
                    GOV.updateProposalDetails(_proposalId, currentVotingId, max, max);
                    GD.changeProposalStatus(_proposalId, 3);
                    VT.giveRewardAfterFinalDecision(_proposalId);
                }
            } else {
                GOV.updateProposalDetails(_proposalId, currentVotingId, max, max);
                GD.changeProposalStatus(_proposalId, 4);
                VT.giveRewardAfterFinalDecision(_proposalId);
                GOV.changePendingProposalStart();
            }
        } else {
            GOV.updateProposalDetails(_proposalId, currentVotingId, max, GD.getProposalIntermediateVerdict(_proposalId));
            GD.changeProposalStatus(_proposalId, 5);
            GOV.changePendingProposalStart();
        }

    }

    function checkForThreshold(uint _proposalId, uint32 _mrSequenceId) internal constant returns(bool) {
        uint thresHoldValue;
        if (_mrSequenceId == 2) {
            address dAppTokenAddress = GBM.getDappTokenAddress(MS.dAppName());
            BT = BasicToken(dAppTokenAddress);
            uint totalTokens;

            for (uint8 i = 0; i < GD.getAllVoteIdsLengthByProposalRole(_proposalId, _mrSequenceId); i++) {
                uint voteId = GD.getVoteIdAgainstProposalRole(_proposalId, _mrSequenceId, i);
                address voterAddress = GD.getVoterAddress(voteId);
                totalTokens = totalTokens + BT.balanceOf(voterAddress);
            }

            thresHoldValue = totalTokens * 100 / BT.totalSupply();
            if (thresHoldValue > GD.quorumPercentage())
                return true;
        } else {
            thresHoldValue = (GD.getAllVoteIdsLengthByProposalRole(_proposalId, _mrSequenceId) * 100) / MR.getAllMemberLength(_mrSequenceId);
            if (thresHoldValue > GD.quorumPercentage())
                return true;
        }
    }*/
}