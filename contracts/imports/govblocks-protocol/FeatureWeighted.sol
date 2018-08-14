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
import "./Upgradeable.sol";
import "./GovernanceData.sol";
import "./StandardVotingType.sol";
import "./Master.sol";
import "./Governance.sol";
import "./GBTController.sol";

contract FeatureWeighted is VotingType, Upgradeable {
    using SafeMath for uint;
    address GDAddress;
    address MRAddress;
    address PCAddress;
    address GBTAddress;
    address public masterAddress;
    address SVTAddress;
    address G1Address;
    address GBTCAddress;
    GBTController GBTC;
    Governance G1;
    MemberRoles MR;
    ProposalCategory PC;
    GovernanceData GD;
    StandardVotingType SVT;
    Master MS;
    uint8 constructorCheck;
    mapping(uint => uint[]) allProposalFeatures;

    // function FeatureWeightedInitiate()
    // {
    //     require(constructorCheck == 0);
    //     uint[] option;
    //     allVotes.push(proposalVote(0x00,0,option,now,0,0,0,0));
    //     votingTypeName = "Feature Weighted Voting";
    //     constructorCheck = 1;
    // }

    modifier onlyInternal {
        MS = Master(masterAddress);
        require(MS.isInternal(msg.sender) == true);
        _;
    }

    /// @dev Change master's contract address
    function changeMasterAddress(address _masterContractAddress) {
        if (masterAddress == 0x000)
            masterAddress = _masterContractAddress;
        else {
            MS = Master(masterAddress);
            require(MS.isInternal(msg.sender) == true);
            masterAddress = _masterContractAddress;
        }
    }

    function changeGBTSAddress(address _GBTSAddress) public {
    }

    function updateDependencyAddresses() public {
    }

    function changeAllContractsAddress(address _SVTcontractAddress, address _GDcontractAddress, address _MRcontractAddress, address _PCcontractAddress, address _G1ContractAddress) {
        SVTAddress = _SVTcontractAddress;
        GDAddress = _GDcontractAddress;
        MRAddress = _MRcontractAddress;
        PCAddress = _PCcontractAddress;
        G1Address = _G1ContractAddress;
    }

    function changeGBTControllerAddress(address _GBTCAddress) {
        GBTCAddress = _GBTCAddress;
    }

    // /// @dev Some amount to be paid while using GovBlocks contract service - Approve the contract to spend money on behalf of msg.sender
    // function payableGBTTokensFeatureWeighted(address _member,uint _TokenAmount) internal
    // {
    //     GBTC=GBTController(GBTCAddress);
    //     GD=GovernanceData(GDAddress);
    //     require(_TokenAmount >= GD.GBTStakeValue());
    //     GBTC.receiveGBT(_member,_TokenAmount);
    // }

    // function getTotalVotes()  constant returns (uint votesTotal)
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

    // function addProposalFeature(uint _proposalId,uint[] _featureArray) 
    // {
    //     require(allProposalFeatures[_proposalId].length == 0);
    //     for(uint i=0; i<_featureArray.length; i++)
    //     {
    //         allProposalFeatures[_proposalId].push(_featureArray[i]);
    //     }    
    // }

    // function getMaxLength(uint _verdictOptions,uint _featureLength) internal returns (uint maxLength)
    // {
    //     if(_verdictOptions < _featureLength)
    //         maxLength = _featureLength;
    //     else
    //         maxLength = _verdictOptions;
    // }

    // function addInAllVotes(uint _proposalId,uint[] _optionChosen,uint _GBTPayableTokenAmount,uint _finalVoteValue) internal
    // {
    //     increaseTotalVotes();
    //     allVotes.push(proposalVote(msg.sender,_proposalId,_optionChosen,now,GD.getBalanceOfMember(msg.sender),_GBTPayableTokenAmount,_finalVoteValue,0));
    // }

    // // function getVoteIdByIndex(uint _proposalId,uint _roleId,uint _index)constant returns(uint voteId,uint index)
    // // {
    // //     index= _index;
    // //     return (ProposalRoleVote[_proposalId][_roleId][_index],index);
    // // }

    function addVerdictOption(uint _proposalId, address _member, uint[] _paramInt, bytes32[] _paramBytes32, address[] _paramAddress, uint _GBTPayableTokenAmount, string _optionHash) {
        // SVT=StandardVotingType(SVTAddress);
        // SVT.addVerdictOptionSVT(_proposalId,_member,_paramInt,_paramBytes32,_paramAddress,_GBTPayableTokenAmount,_optionHash);
        // payableGBTTokensFeatureWeighted(_member,_GBTPayableTokenAmount);
    }

    function initiateVerdictOption(uint _proposalId, uint[] _paramInt, bytes32[] _paramBytes32, address[] _paramAddress, uint _GBTPayableTokenAmount, string _optionHash) {
        // addVerdictOption(_proposalId,msg.sender,_paramInt,_paramBytes32,_paramAddress, _GBTPayableTokenAmount, _optionHash);
    }

    // function transferVoteStakeFW(uint _memberStake)
    // {
    //   GBTC=GBTController(GBTCAddress);
    //     if(_memberStake != 0)
    //         GBTC.receiveGBT(msg.sender,_memberStake);
    // }

    function proposalVoting(uint _proposalId, uint[] _optionChosen, uint _GBTPayableTokenAmount) external {
        //     GD=GovernanceData(GDAddress);
        //     MR=MemberRoles(MRAddress);
        //     PC=ProposalCategory(PCAddress);
        //     SVT=StandardVotingType(SVTAddress);

        //     uint voteValue; uint voteLength;
        //     uint currentVotingId; uint category; uint intermediateVerdict;
        //     uint featureLength = allProposalFeatures[_proposalId].length;
        //     (,category,currentVotingId,intermediateVerdict,,) = GD.getProposalDetailsById2(_proposalId);

        //     require(GD.getBalanceOfMember(msg.sender) != 0 && GD.getProposalStatus(_proposalId) == 2 && _optionChosen.length <=  SafeMath.mul(featureLength+1,GD.getTotalVerdictOptions(_proposalId)));
        //     require(MR.getMemberRoleIdByAddress(msg.sender) == PC.getRoleSequencAtIndex(category,currentVotingId));

        //     if(currentVotingId == 0)
        //     {
        //         for(uint i=0; i<_optionChosen.length; i++)
        //         {
        //             require(_optionChosen[i] <= getMaxLength(GD.getTotalVerdictOptions(_proposalId),featureLength));
        //         }
        //     }   
        //     else
        //         require(_optionChosen[0]==intermediateVerdict || _optionChosen[0]==0);

        //     if(AddressProposalVote[msg.sender][_proposalId] == 0)
        //     {
        //         voteLength = getTotalVotes();
        //         submitAndUpdateNewMemberVote(_proposalId,currentVotingId,_optionChosen,featureLength,voteLength);
        //         uint finalVoteValue = SVT.setVoteValue_givenByMember(msg.sender,_proposalId,_GBTPayableTokenAmount);

        //         allProposalVoteAndTokenCount[_proposalId].totalTokenCount[MR.getMemberRoleIdByAddress(msg.sender)] = SafeMath.add(allProposalVoteAndTokenCount[_proposalId].totalTokenCount[MR.getMemberRoleIdByAddress(msg.sender)],GD.getBalanceOfMember(msg.sender));
        //         AddressProposalVote[msg.sender][_proposalId] = voteLength;
        //         ProposalRoleVote[_proposalId][MR.getMemberRoleIdByAddress(msg.sender)].push(voteLength);
        //         GD.setVoteIdAgainstProposal(_proposalId,voteLength);
        //         GD.addInTotalVotes(msg.sender,voteLength);

        //         G1.checkRoleVoteClosing(_proposalId,getVoteLength(_proposalId,PC.getRoleSequencAtIndex(category,currentVotingId)));
        //         addInAllVotes(_proposalId,_optionChosen,_GBTPayableTokenAmount,finalVoteValue);
        //         transferVoteStakeFW(_GBTPayableTokenAmount);
        //     }
        //     else 
        //         changeMemberVote(_proposalId,_optionChosen,featureLength,_GBTPayableTokenAmount);
    }

    // function changeMemberVote(uint _proposalId,uint[] _optionChosen,uint featureLength,uint _GBTPayableTokenAmount) internal
    // {
    //     MR=MemberRoles(MRAddress);
    //     GD=GovernanceData(GDAddress);
    //     SVT=StandardVotingType(SVTAddress);
    //     G1=Governance(G1Address);

    //     uint voteId = AddressProposalVote[msg.sender][_proposalId];
    //     uint[] optionChosen = allVotes[voteId].optionChosen;
    //     uint currentVotingId;
    //     (,,currentVotingId,,,) = GD.getProposalDetailsById2(_proposalId);

    //     revertChangesInMemberVote(_proposalId,currentVotingId,optionChosen,voteId,featureLength);
    //     submitAndUpdateNewMemberVote(_proposalId,currentVotingId,_optionChosen,featureLength,voteId);
    //     allVotes[voteId].optionChosen = _optionChosen;

    //     uint finalVoteValue = SVT.setVoteValue_givenByMember(msg.sender,_proposalId,_GBTPayableTokenAmount);
    //     allVotes[voteId].voteStakeGBT = _GBTPayableTokenAmount;
    //     allVotes[voteId].voteValue = finalVoteValue;
    //     // G1.checkRoleVoteClosing(_proposalId,getVoteLength(_proposalId,PC.getRoleSequencAtIndex(GD.getProposalCategory(_proposalId),currentVotingId)));
    // }

    // function revertChangesInMemberVote(uint _proposalId,uint currentVotingId,uint[] optionChosen,uint voteId,uint featureLength) internal
    // {
    //     uint _finalVoteValue = allVotes[voteId].voteValue;

    //     if(currentVotingId == 0)
    //     {
    //         for(uint i=0; i<optionChosen.length; i=i+featureLength+1)
    //         {
    //             uint sum =0;      
    //             for(uint j=i+1; j<=featureLength+i; j++)
    //             {
    //                 sum = SafeMath.add(sum,optionChosen[j]);
    //             }
    //             uint optionValue = SafeMath.div(SafeMath.mul(sum,100),featureLength);
    //             allProposalVoteAndTokenCount[_proposalId].totalVoteCount[MR.getMemberRoleIdByAddress(msg.sender)][optionChosen[i]] = SafeMath.sub(allProposalVoteAndTokenCount[_proposalId].totalVoteCount[MR.getMemberRoleIdByAddress(msg.sender)][optionChosen[i]],optionValue+_finalVoteValue);  
    //         }
    //     }
    //     else
    //     {
    //         allProposalVoteAndTokenCount[_proposalId].totalVoteCount[MR.getMemberRoleIdByAddress(msg.sender)][optionChosen[0]] = SafeMath.sub(allProposalVoteAndTokenCount[_proposalId].totalVoteCount[MR.getMemberRoleIdByAddress(msg.sender)][optionChosen[0]],_finalVoteValue);
    //     }
    // }

    // function submitAndUpdateNewMemberVote(uint _proposalId,uint currentVotingId,uint[] _optionChosen,uint _featureLength,uint _voteId) internal
    // {
    //     uint _finalVoteValue = allVotes[_voteId].voteValue;

    //     if(currentVotingId == 0)
    //     {
    //         for(uint i=0; i<_optionChosen.length; i=i+_featureLength+1)
    //         {
    //             uint sum =0;
    //             require(msg.sender != GD.getOptionAddressByProposalId(_proposalId,i));

    //             for(uint j=i+1; j<=_featureLength+i; j++)
    //             {
    //                 sum = SafeMath.add(sum,_optionChosen[j]);
    //             }
    //             uint optionValue = SafeMath.div(SafeMath.mul(sum,100),_featureLength);
    //             allProposalVoteAndTokenCount[_proposalId].totalVoteCount[MR.getMemberRoleIdByAddress(msg.sender)][_optionChosen[i]] = SafeMath.add(allProposalVoteAndTokenCount[_proposalId].totalVoteCount[MR.getMemberRoleIdByAddress(msg.sender)][_optionChosen[i]],optionValue+_finalVoteValue);
    //         }
    //     }  
    //     else
    //     {
    //         allProposalVoteAndTokenCount[_proposalId].totalVoteCount[MR.getMemberRoleIdByAddress(msg.sender)][_optionChosen[0]] = SafeMath.add(allProposalVoteAndTokenCount[_proposalId].totalVoteCount[MR.getMemberRoleIdByAddress(msg.sender)][_optionChosen[0]],_finalVoteValue);
    //     }
    // }

    function closeProposalVote(uint _proposalId) {
        //     SVT=StandardVotingType(SVTAddress);
        // SVT.closeProposalVoteSVT(_proposalId);
    }

    function giveReward_afterFinalDecision(uint _proposalId, address _memberAddress) public {
        //     GD=GovernanceData(GDAddress);
        //     G1=Governance(G1Address);

        //     uint voteValueFavour; uint voterStake; uint wrongOptionStake;
        //     uint totalVoteValue; uint totalTokenToDistribute;uint returnTokens;
        //     uint8 finalVerdict;  
        //     uint _featureLength = allProposalFeatures[_proposalId].length;

        //     (,,,,finalVerdict,) = GD.getProposalDetailsById2(_proposalId);

        //     for(uint i=0; i<GD.getVoteLengthById(_proposalId); i++)
        //     {
        //         uint voteid = GD.getVoteIdById(_proposalId,i);
        //         if(allVotes[voteid].optionChosen[0] == finalVerdict)
        //         {
        //             voteValueFavour = SafeMath.add(voteValueFavour,allVotes[voteid].voteValue);
        //         }
        //         else
        //         {
        //             voterStake = SafeMath.add(voterStake,(SafeMath.div(allVotes[voteid].voteStakeGBT,GD.globalRiskFactor())));
        //             returnTokens = SafeMath.sub(allVotes[voteid].voteStakeGBT,SafeMath.div(allVotes[voteid].voteStakeGBT,GD.globalRiskFactor()));
        //             G1.transferBackGBTtoken(allVotes[voteid].voter,returnTokens);
        //         }

        //         // uint voteid = GD.getVoteIdById(_proposalId,i);
        //         // for(uint j=0; j<allVotes[voteid].verdictChosen.length; j=i+_featureLength+1)
        //         // {
        //         //     if(allVotes[voteid].verdictChosen[j] == finalVerdict)
        //         //     {
        //         //         voteValueFavour = SafeMath.add(voteValueFavour,allVotes[voteid].voteValue)+getOptionValue1(voteid,_proposalId,j);
        //         //     }
        //         //     else
        //         //     {
        //         //         voterStake = SafeMath.add(voterStake,SafeMath.mul(allVotes[voteid].voteStakeGBT,(SafeMath.div(SafeMath.mul(1,100),GD.globalRiskFactor())))) + getOptionValue1(voteid,_proposalId,j);
        //         //         returnTokens = SafeMath.mul(allVotes[voteid].voteStakeGBT,(SafeMath.sub(1,(SafeMath.div(SafeMath.mul(1,100),GD.globalRiskFactor())))));
        //         //         G1.transferBackGBTtoken(allVotes[voteid].voter,returnTokens);
        //         //     }
        //         // }
        //     }

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
    //     uint reward;uint transferToken; uint8 finalVerdict;
    //     (,,,,finalVerdict,) = GD.getProposalDetailsById2(_proposalId);
    //      uint addMemberPoints; uint subMemberPoints;
    //     (,,addMemberPoints,,,subMemberPoints)=GD.getMemberReputationPoints();

    //     if(finalVerdict > 0)
    //     {
    //         reward = SafeMath.div(SafeMath.mul(GD.getProposalValue(_proposalId),_totalTokenToDistribute),_totalVoteValue);
    //         transferToken = SafeMath.add(GD.getProposalStake(_proposalId),reward);
    //         G1.transferBackGBTtoken(GD.getProposalOwner(_proposalId),transferToken);

    //         reward = SafeMath.div(SafeMath.mul(GD.getOptionValueByProposalId(_proposalId,finalVerdict),_totalTokenToDistribute),_totalVoteValue);
    //         transferToken = SafeMath.add(GD.getOptionValueByProposalId(_proposalId,finalVerdict),reward);
    //         G1.transferBackGBTtoken(GD.getOptionAddressByProposalId(_proposalId,finalVerdict),transferToken);
    //     }

    //     for(uint i=0; i<GD.getVoteLengthById(_proposalId); i++)
    //     {
    //         uint voteid = GD.getVoteIdById(_proposalId,i);

    //         // if(getOptionValue(voteid,_proposalId,finalVerdict) != 0)
    //         // {
    //         if(allVotes[voteid].optionChosen[0] == finalVerdict)
    //         {
    //             reward = SafeMath.div(SafeMath.mul(allVotes[voteid].voteValue,_totalTokenToDistribute),_totalVoteValue);
    //             transferToken = SafeMath.add(allVotes[voteid].voteStakeGBT,reward);
    //             G1.transferBackGBTtoken(allVotes[voteid].voter,transferToken);
    //             G1.updateMemberReputation1(allVotes[voteid].voter,SafeMath.add(GD.getMemberReputation(allVotes[voteid].voter),addMemberPoints));
    //         }
    //         else
    //         {
    //             G1.updateMemberReputation1(allVotes[voteid].voter,SafeMath.sub(GD.getMemberReputation(allVotes[voteid].voter),subMemberPoints));
    //         }  
    //     }
    //     G1.updateMemberReputation(_proposalId,finalVerdict);
    // }

    // function getOptionValue(uint _voteid,uint _proposalId,uint _finalVerdict) internal returns (uint optionValue)
    // {
    //     uint[] _optionChosen = allVotes[_voteid].optionChosen;
    //     uint _featureLength = allProposalFeatures[_proposalId].length;

    //     for(uint i=0; i<_optionChosen.length; i=i+_featureLength+1)
    //     {
    //         uint sum=0;
    //         require(_optionChosen[i] == _finalVerdict);
    //             for(uint j=i+1; j<=_featureLength+i; j++)
    //             {
    //                 sum = SafeMath.add(sum,_optionChosen[j]);
    //             }
    //             optionValue = SafeMath.div(SafeMath.mul(sum,100),_featureLength);
    //     }
    // }

    // function getOptionValue1(uint _voteid,uint _proposalId,uint _optionIndex) internal returns (uint optionValue)
    // {   
    //     uint[] _optionChosen = allVotes[_voteid].optionChosen;
    //     uint _featureLength = allProposalFeatures[_proposalId].length; uint sum;

    //     for(uint j=_optionIndex+1; j<=_featureLength+_optionIndex; j++)
    //     {
    //         sum = SafeMath.add(sum,_optionChosen[j]);
    //     }
    //     optionValue = SafeMath.div(SafeMath.mul(sum,100),_featureLength);
    // }
}