/* Copyright (C) 2017 NexusMutual.io

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


pragma solidity ^0.4.8;

import "./governanceData.sol";
import "./master.sol";

contract governance2{

    governanceData gd1;
    address governanceDataAddress;
    master ms1;
    address masterAddress;

    function changeMasterAddress(address _add)
    {
        if(masterAddress == 0x000)
            masterAddress = _add;
        else
        {
            ms1=master(masterAddress);
            if(ms1.isInternal(msg.sender) == 1)
                masterAddress = _add;
            else
                throw;
        }
       
    }
    modifier onlyInternal {
        ms1=master(masterAddress);
        require(ms1.isInternal(msg.sender) == 1);
        _; 
    }
    function changeGovernanceDataAddress(address _add) onlyInternal
    {
        governanceDataAddress = _add;
        gd1 = governanceData(governanceDataAddress);
    }

    function editProposal(uint id , string sd, string ld) 
    {
        gd1 = governanceData(governanceDataAddress);
        if(msg.sender==gd1.getProposalOwner(id) && gd1.getProposalStatus(id) == 0 )
        {
            
            uint time = now;
            gd1.addProposalVersion(id,gd1.getProposalVersion(id),gd1.getProposalDateAdd(id));
            gd1.updateProposal(id,sd,0,ld,now,gd1.getProposalVersion(id)+1);
            gd1.unCategoriseProposal(id);
        }
        else
            throw;

    }
    function addProposal(string shortDesc , string longDesc , address _effect , uint value , uint cat)
    {
        gd1 = governanceData(governanceDataAddress);
        if(cat==2 && gd1.checkBurnVoterTokenAgaintClaim(value,_effect)==1)
            throw;
        uint len = gd1.getAllProLength();
        uint time = now;
        gd1.addNewProposal(len,msg.sender,shortDesc,longDesc,time);
        if(gd1.isAB(msg.sender)==1 && cat==2)
        {
            gd1.updateCategorizeDetails(len,_effect,value,cat,msg.sender,time);
            gd1.updateCategorisedProposal(len,1);
            gd1.changeBurnVoterTokenAgaintClaim(value,_effect,1);
        }
        gd1.addInUserProposals(len,msg.sender);
        gd1.pushInProposalStatus(len,0,time);
    }
    function voteABProposal(uint id , int verdict)
    {
        gd1 = governanceData(governanceDataAddress);
        
        if(gd1.isAB(msg.sender)==0) throw;
        uint len = gd1.getVoteLength();
        gd1.incVoteLength();
        gd1.addVote(msg.sender,id,verdict,now);
        gd1.addInUserABVotes(len,msg.sender);
        gd1.addInProposalABVotes(id,len);
        gd1.updateUserProposalABVote(id,verdict,msg.sender);
        if(verdict==1)
            gd1.incPVCABAccept(id);
        else if(verdict==-1)
            gd1.incPVCABDeny(id);

    }
    function voteMember(uint id , int verdict)
    {
        gd1 = governanceData(governanceDataAddress);
        
        if(gd1.isAB(msg.sender)==1) throw;
        uint len = gd1.getVoteLength();
        gd1.incVoteLength();
        gd1.addVote(msg.sender,id,verdict,now);
        gd1.addInUserMemberVotes(len,msg.sender);
        gd1.addInProposalMemberVotes(id,len);
        gd1.updateUserProposalMemberVote(id,verdict,msg.sender);
        if(verdict==1)
            gd1.incPVCMemberAccept(id);
        else if(verdict==-1)
            gd1.incPVCMemberDeny(id);
    }
    
    function categorizeProposal(uint id , uint cat , address _effect , uint val)
    {
        gd1 = governanceData(governanceDataAddress);
        if(gd1.isAB(msg.sender)==0) throw;
        if(gd1.isProposalCategorised(id)==1) throw;
        gd1.updateCategorizeDetails(id,_effect,val,cat,msg.sender,now);
        gd1.updateCategorisedProposal(id,1);
    }
}