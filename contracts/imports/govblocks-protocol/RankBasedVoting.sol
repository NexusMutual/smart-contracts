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

pragma solidity ^0.4.24;
import "./VotingType.sol";
import "./GovernanceData.sol";
import "./StandardVotingType.sol";
import "./MemberRoles.sol";
import "./ProposalCategory.sol";
import "./Governance.sol";
import "./Upgradeable.sol";
import "./Math.sol";
import "./SafeMath.sol";
import "./Master.sol";
import "./GBTController.sol";
// import "./zeppelin-solidity/contracts/math/Math.sol";
// import "./zeppelin-solidity/contracts/math/SafeMath.sol";

contract RankBasedVoting is VotingType, Upgradeable {
    using SafeMath for uint;
    address GDAddress;
    address MRAddress;
    address PCAddress;
    address BTAddress;
    address public masterAddress;
    address G1Address;
    address SVTAddress;
    address GBTCAddress;
    GBTController GBTC;
    MemberRoles MR;
    Governance G1;
    BasicToken BT;
    ProposalCategory PC;
    GovernanceData GD;
    StandardVotingType SVT;
    uint8 constructorCheck;
    Master MS;
    mapping(uint => uint8) verdictOptionsByVoteId;

    // function RankBasedVotingInitiate()
    // {
    //     require(constructorCheck == 0 );
    //     uint[] option;
    //     allVotes.push(proposalVote(address(0),0,option,now,0,0,0,0));
    //     votingTypeName = "Ranking Based Voting";
    //     constructorCheck = 1;
    // }

    modifier onlyInternal {
        MS = Master(masterAddress);
        require(MS.isInternal(msg.sender));
        _;
    }

    /// @dev Change master's contract address
    function changeMasterAddress(address _masterContractAddress) {
        if (masterAddress == address(0))
            masterAddress = _masterContractAddress;
        else {
            MS = Master(masterAddress);
            require(MS.isInternal(msg.sender));
            masterAddress = _masterContractAddress;
        }
    }

    /// @dev just to adhere to the interface
    function changeGBTSAddress(address _GBTAddress) {
    }

    function updateDependencyAddresses() public {
    }

    // /// @dev Some amount to be paid while using GovBlocks contract service - Approve the contract to spend money on behalf of msg.sender
    // function payableGBTTokensRankBasedVoting(address _member,uint _TokenAmount) public
    // {
    //     GBTC=GBTController(GBTCAddress);
    //     GD=GovernanceData(GDAddress);
    //     require(_TokenAmount >= GD.GBTStakeValue());
    //     GBTC.receiveGBT(_member,_TokenAmount);
    // }

    function changeAllContractsAddress(address _StandardVotingAddress, address _GDcontractAddress, address _MRcontractAddress, address _PCcontractAddress, address _G1ContractAddress) {
        SVTAddress = _StandardVotingAddress;
        GDAddress = _GDcontractAddress;
        MRAddress = _MRcontractAddress;
        PCAddress = _PCcontractAddress;
        G1Address = _G1ContractAddress;
    }

    function changeGBTControllerAddress(address _GBTCAddress) {
        GBTCAddress = _GBTCAddress;
    }

    // function getTotalVotes() constant returns (uint votesTotal)
    // {
    //     return(allVotes.length);
    // }

    // function increaseTotalVotes() internal returns (uint _totalVotes)
    // {
    //     _totalVotes = SafeMath.add(allVotesTotal,1);  
    //     allVotesTotal=_totalVotes;
    // }

    // function getVoteDetailByid(uint _voteid) public constant returns(address voter,uint proposalId,uint[] optionChosen,uint dateSubmit,uint voterTokens,uint voteStakeGBT,uint voteValue)
    // {
    //     return(allVotes[_voteid].voter,allVotes[_voteid].proposalId,allVotes[_voteid].optionChosen,allVotes[_voteid].dateSubmit,allVotes[_voteid].voterTokens,allVotes[_voteid].voteStakeGBT,allVotes[_voteid].voteValue);
    // }

    // /// @dev Get the vote count for options of proposal when giving Proposal id and Option index.
    // function getProposalVoteAndTokenCountByRoleId(uint _proposalId,uint _roleId,uint _optionIndex) constant returns(uint totalVoteValue,uint totalToken)
    // {
    //     totalVoteValue = allProposalVoteAndTokenCount[_proposalId].totalVoteCount[_roleId][_optionIndex];
    //     totalToken = allProposalVoteAndTokenCount[_proposalId].totalTokenCount[_roleId];
    // }

    // function addInAllVotes(uint _proposalId,uint[] _optionChosen,uint _GBTPayableTokenAmount,uint _finalVoteValue) internal
    // {
    //     increaseTotalVotes();
    //     allVotes.push(proposalVote(msg.sender,_proposalId,_optionChosen,now,GD.getBalanceOfMember(msg.sender),_GBTPayableTokenAmount,_finalVoteValue,0));
    // }

    // function getVoteIdByIndex(uint _proposalId,uint _roleId,uint _index)constant returns(uint voteId,uint index)
    // {
    //     index= _index;
    //     return (ProposalRoleVote[_proposalId][_roleId][_index],index);
    // }

    // function transferVoteStakeRB(uint _memberStake)
    // {
    //     GBTC=GBTController(GBTCAddress);
    //     if(_memberStake != 0)
    //         GBTC.receiveGBT(msg.sender,_memberStake);
    // }

    function addVerdictOption(uint _proposalId, address _member, uint[] _paramInt, bytes32[] _paramBytes32, address[] _paramAddress, uint _GBTPayableTokenAmount, string _optionHash) {
        // SVT=StandardVotingType(SVTAddress);
        // SVT.addVerdictOptionSVT(_proposalId,_member,_paramInt,_paramBytes32,_paramAddress,_GBTPayableTokenAmount,_optionHash);
        // payableGBTTokensRankBasedVoting(_member,_GBTPayableTokenAmount);
    }

    function initiateVerdictOption(uint _proposalId, uint[] _paramInt, bytes32[] _paramBytes32, address[] _paramAddress, uint _GBTPayableTokenAmount, string _optionHash) {
        // addVerdictOption(_proposalId,msg.sender,_paramInt,_paramBytes32,_paramAddress, _GBTPayableTokenAmount, _optionHash);
    }

    function proposalVoting(uint _proposalId, uint[] _optionChosen, uint _GBTPayableTokenAmount) external {
        //     GD=GovernanceData(GDAddress);
        //     MR=MemberRoles(MRAddress);
        //     PC=ProposalCategory(PCAddress);
        //     SVT=StandardVotingType(SVTAddress);
        //     G1=Governance(G1Address);

        //     uint8 currentVotingId; uint8 category; uint8 intermediateVerdict;
        //     uint8 verdictOptions;
        //     (,category,currentVotingId,intermediateVerdict,,) = GD.getProposalDetailsById2(_proposalId);
        //     (,,,verdictOptions) = GD.getProposalOptionAll(_proposalId);

        //     require(GD.getBalanceOfMember(msg.sender) != 0 && GD.getProposalStatus(_proposalId) == 2);
        //     require(MR.getMemberRoleIdByAddress(msg.sender) == PC.getRoleSequencAtIndex(category,currentVotingId) && _optionChosen.length <= verdictOptions);

        //     if(currentVotingId == 0)
        //     {   
        //         for(uint i=0; i<_optionChosen.length; i++)
        //         {
        //             require(_optionChosen[i] < verdictOptions && msg.sender != GD.getOptionAddressByProposalId(_proposalId,i));
        //         }
        //     }   
        //     else
        //         require(_optionChosen[0]==intermediateVerdict || _optionChosen[0]==0);

        //     if(getVoteId_againstMember(msg.sender,_proposalId) == 0)
        //     {
        //         uint votelength = getTotalVotes();
        //         submitAndUpdateNewMemberVote(_proposalId,currentVotingId,_optionChosen,verdictOptions);
        //         uint finalVoteValue = SVT.setVoteValue_givenByMember(msg.sender,_proposalId,_GBTPayableTokenAmount);

        //         allProposalVoteAndTokenCount[_proposalId].totalTokenCount[MR.getMemberRoleIdByAddress(msg.sender)] = SafeMath.add(allProposalVoteAndTokenCount[_proposalId].totalTokenCount[MR.getMemberRoleIdByAddress(msg.sender)],GD.getBalanceOfMember(msg.sender));
        //         ProposalRoleVote[_proposalId][MR.getMemberRoleIdByAddress(msg.sender)].push(votelength);
        //         AddressProposalVote[msg.sender][_proposalId] = votelength;
        //         verdictOptionsByVoteId[votelength] = verdictOptions;
        //         GD.setVoteIdAgainstProposal(_proposalId,votelength);
        //         GD.addInTotalVotes(msg.sender,votelength);

        //         G1.checkRoleVoteClosing(_proposalId,getVoteLength(_proposalId,PC.getRoleSequencAtIndex(category,currentVotingId)));  
        //         addInAllVotes(_proposalId,_optionChosen,_GBTPayableTokenAmount,finalVoteValue);
        //         transferVoteStakeRB(_GBTPayableTokenAmount);
        //     }
        //     else 
        //         changeMemberVote(_proposalId,_optionChosen,_GBTPayableTokenAmount);
    }

    function changeMemberVote(uint _proposalId, uint[] _optionChosen, uint _GBTPayableTokenAmount) internal {
        //     MR=MemberRoles(MRAddress);
        //     GD=GovernanceData(GDAddress);
        //     SVT=StandardVotingType(SVTAddress);
        //     G1=Governance(G1Address);

        //     uint voteId = getVoteId_againstMember(msg.sender,_proposalId);
        //     uint[] optionChosen = allVotes[voteId].optionChosen;

        //     uint8 verdictOptions; 
        //     (,,,verdictOptions) = GD.getProposalOptionAll(_proposalId);
        //     uint8 currentVotingId;
        //     (,,currentVotingId,,,) = GD.getProposalDetailsById2(_proposalId);

        //     allVotes[voteId].optionChosen = _optionChosen;
        //     verdictOptionsByVoteId[voteId] = verdictOptions;
        //     revertChangesInMemberVote(_proposalId,currentVotingId,optionChosen,voteId);
        //     submitAndUpdateNewMemberVote(_proposalId,currentVotingId,_optionChosen,verdictOptions);

        //     uint finalVoteValue = SVT.setVoteValue_givenByMember(msg.sender,_proposalId,_GBTPayableTokenAmount);
        //     allVotes[voteId].voteStakeGBT = _GBTPayableTokenAmount;
        //     allVotes[voteId].voteValue = finalVoteValue;
        //     // G1.checkRoleVoteClosing(_proposalId,getVoteLength(_proposalId,roleId));
    }

    function revertChangesInMemberVote(uint _proposalId, uint _currentVotingId, uint[] _optionChosen, uint _voteId) internal {
        //     uint _finalVoteValue = allVotes[_voteId].voteValue;

        //     if(_currentVotingId == 0)
        //     {
        //         uint previousVerdictOptions = verdictOptionsByVoteId[_voteId];
        //         for(uint i=0; i<_optionChosen.length; i++)
        //         {
        //             uint sum = SafeMath.add(sum,(SafeMath.sub(previousVerdictOptions,i)));
        //         }

        //         for(i=0; i<_optionChosen.length; i++)
        //         {
        //             uint optionValue = SafeMath.div(SafeMath.mul(SafeMath.sub(previousVerdictOptions,i),100),sum);
        //             allProposalVoteAndTokenCount[_proposalId].totalVoteCount[MR.getMemberRoleIdByAddress(msg.sender)][_optionChosen[i]] = SafeMath.sub(allProposalVoteAndTokenCount[_proposalId].totalVoteCount[MR.getMemberRoleIdByAddress(msg.sender)][_optionChosen[i]],optionValue+_finalVoteValue);
        //         }
        //     }
        //     else
        //     {
        //         allProposalVoteAndTokenCount[_proposalId].totalVoteCount[MR.getMemberRoleIdByAddress(msg.sender)][_optionChosen[0]] = SafeMath.sub(allProposalVoteAndTokenCount[_proposalId].totalVoteCount[MR.getMemberRoleIdByAddress(msg.sender)][_optionChosen[0]],_finalVoteValue);
        //     }

    }

    function submitAndUpdateNewMemberVote(uint _proposalId, uint _currentVotingId, uint[] _optionChosen, uint _verdictOptions) internal {
        //     uint roleId = MR.getMemberRoleIdByAddress(msg.sender);
        //     uint voteId = getVoteId_againstMember(msg.sender,_proposalId);
        //     uint _finalVoteValue = allVotes[voteId].voteValue;
        //     if(_currentVotingId == 0)
        //     {
        //         for(uint i=0; i<_optionChosen.length; i++)
        //         {
        //             uint sum = SafeMath.add(sum,(SafeMath.sub(_verdictOptions ,i)));
        //         }

        //         for(i=0; i<_optionChosen.length; i++)
        //         {
        //             uint optionValue = SafeMath.div(SafeMath.mul(SafeMath.sub(_verdictOptions,i),100),sum);
        //             allProposalVoteAndTokenCount[_proposalId].totalVoteCount[roleId][_optionChosen[i]] = SafeMath.add(allProposalVoteAndTokenCount[_proposalId].totalVoteCount[roleId][_optionChosen[i]],optionValue+_finalVoteValue);
        //         }
        //     } 
        //     else
        //     {   
        //         allProposalVoteAndTokenCount[_proposalId].totalVoteCount[roleId][_optionChosen[0]] = SafeMath.add(allProposalVoteAndTokenCount[_proposalId].totalVoteCount[roleId][_optionChosen[0]],_finalVoteValue);
        //     }
    }

    function closeProposalVote(uint _proposalId) {
        //     SVT=StandardVotingType(SVTAddress);
        //     SVT.closeProposalVoteSVT(_proposalId);
    }

    function giveReward_afterFinalDecision(uint _proposalId, address _memberAddress) public {
        //     GD=GovernanceData(GDAddress);
        //     uint voteValueFavour; uint voterStake; uint wrongOptionStake; uint returnTokens;
        //     uint totalVoteValue; uint totalTokenToDistribute;
        //     uint8 finalVerdict; 
        //     (,,,,finalVerdict,) = GD.getProposalDetailsById2(_proposalId);

        //     for(uint i=0; i<GD.getVoteLengthById(_proposalId); i++)
        //     {
        //         uint voteid = GD.getVoteIdById(_proposalId,i);

        //         if(getOptionById(voteid,0) == finalVerdict)
        //         {
        //             voteValueFavour = SafeMath.add(voteValueFavour,allVotes[voteid].voteValue);
        //         }
        //         else
        //         {
        //             voterStake = SafeMath.add(voterStake,(SafeMath.div(allVotes[voteid].voteStakeGBT,GD.globalRiskFactor())));
        //             returnTokens = SafeMath.sub(allVotes[voteid].voteStakeGBT,SafeMath.div(allVotes[voteid].voteStakeGBT,GD.globalRiskFactor()));
        //             G1.transferBackGBTtoken(allVotes[voteid].voter,returnTokens);
        //         }

        //         // uint voteid = GD.getVoteIdByProposalId(_proposalId,i);
        //         // for(uint j=0; j<allVotes[voteid].verdictChosen.length; j++)
        //         // {
        //         //     if(allVotes[voteid].verdictChosen[j] == finalVerdict)
        //         //     {
        //                 // voteValueFavour = SafeMath.add(voteValueFavour,getOptionValue(voteid,_proposalId,j)+allVotes[voteid].voteValue);
        //         //     }
        //         //     else
        //         //     {
        //         //         voterStake = SafeMath.add(voterStake,SafeMath.mul(allVotes[voteid].voteStakeGBT,(SafeMath.div(SafeMath.mul(1,100),GD.globalRiskFactor())))) + getOptionValue(voteid,_proposalId,j);
        //         //         returnTokens = SafeMath.mul(allVotes[voteid].voteStakeGBT,(SafeMath.sub(1,(SafeMath.div(SafeMath.mul(1,100),GD.globalRiskFactor())))));
        //         //         G1.transferBackGBTtoken(allVotes[voteid].voter,returnTokens);
        //         //     }
        //         // }
        // }

        //     for(i=0; i<GD.getOptionAddedAddressLength(_proposalId); i++)
        //     {
        //         if(i!= finalVerdict)         
        //             wrongOptionStake = SafeMath.add(wrongOptionStake,GD.getOptionStakeByProposalId(_proposalId,i));
        //     }

        //     totalVoteValue = SafeMath.add(GD.getOptionValueByProposalId(_proposalId,finalVerdict),voteValueFavour);
        //     totalTokenToDistribute = SafeMath.add(wrongOptionStake,voterStake);

        //     if(finalVerdict>0)
        //         totalVoteValue = SafeMath.add(totalVoteValue,GD.getProposalValue(_proposalId));
        //     else
        //         totalTokenToDistribute = SafeMath.add(totalTokenToDistribute,GD.getProposalStake(_proposalId));

        //     distributeReward(_proposalId,totalTokenToDistribute,totalVoteValue);
    }

    // function distributeReward(uint _proposalId,uint _totalTokenToDistribute,uint _totalVoteValue) internal
    // {
    //     GD=GovernanceData(GDAddress);
    //     G1=Governance(G1Address);

    //     uint addMemberPoints; uint subMemberPoints; uint reward;uint transferToken; uint8 finalVerdict; 
    //     (,,,,finalVerdict,) = GD.getProposalDetailsById2(_proposalId);
    //     (,,addMemberPoints,,,subMemberPoints)=GD.getMemberReputationPoints();

    //     if(finalVerdict > 0)
    //     {
    //         reward = SafeMath.div(SafeMath.mul(GD.getProposalValue(_proposalId),_totalTokenToDistribute),_totalVoteValue);
    //         transferToken = SafeMath.add(GD.getProposalStake(_proposalId),reward);
    //         G1.transferBackGBTtoken(GD.getProposalOwner(_proposalId),transferToken);

    //         reward = SafeMath.div(SafeMath.mul(GD.getOptionValueByProposalId(_proposalId,finalVerdict),_totalTokenToDistribute),_totalVoteValue);
    //         transferToken = SafeMath.add(GD.getOptionStakeByProposalId(_proposalId,finalVerdict),reward);
    //         G1.transferBackGBTtoken(GD.getOptionAddressByProposalId(_proposalId,finalVerdict),transferToken);
    //     }

    //     for(uint i=0; i<GD.getVoteLengthById(_proposalId); i++)
    //     {
    //         uint voteid = GD.getVoteIdById(_proposalId,i);

    //         // for(uint j=0; j<allVotes[voteid].optionChosen.length; j++)
    //         // {
    //             // if(allVotes[voteid].optionChosen[j] == finalVerdict)
    //             if(allVotes[voteid].optionChosen[0] == finalVerdict)
    //             {
    //                 // uint optionValue = getOptionValue(voteid,_proposalId,j);
    //                 reward = SafeMath.div(SafeMath.mul(allVotes[voteid].voteValue,_totalTokenToDistribute),_totalVoteValue);
    //                 transferToken = SafeMath.add(allVotes[voteid].voteStakeGBT,reward);
    //                 G1.transferBackGBTtoken(allVotes[voteid].voter,transferToken);
    //                 G1.updateMemberReputation1(allVotes[voteid].voter,SafeMath.add(addMemberPoints,GD.getMemberReputation(allVotes[voteid].voter)));
    //             }
    //             else
    //             {
    //                 G1.updateMemberReputation1(allVotes[voteid].voter,SafeMath.sub(GD.getMemberReputation(allVotes[voteid].voter),subMemberPoints));
    //             }

    //         // }        
    //     }
    //     G1.updateMemberReputation(_proposalId,finalVerdict);
    // }

    // function getOptionValue(uint voteid,uint _proposalId,uint _optionIndex) internal returns (uint optionValue)
    // {
    //     uint[] _optionChosen = allVotes[voteid].optionChosen;
    //     uint8 _verdictOptions; 
    //     (,,,_verdictOptions) = GD.getProposalOptionAll(_proposalId);

    //     for(uint i=0; i<_optionChosen.length; i++)
    //     {
    //         uint sum = SafeMath.add(sum,(SafeMath.sub(_verdictOptions ,i)));
    //     }
    //     optionValue = SafeMath.div(SafeMath.mul(SafeMath.sub(_verdictOptions,_optionIndex),100),sum);
    // }

}