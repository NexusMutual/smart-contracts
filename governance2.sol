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


pragma solidity ^0.4.11;
import "./pool.sol";
import "./governanceData.sol";
import "./master.sol";
import "./SafeMaths.sol";
contract governance2 
{
    using SafeMaths for uint;
    master ms;
    pool p1;
    governanceData gd;
    
    address masterAddress;
    // address poolAddress;
    // address governanceDataAddress;
    
    function changeMasterAddress(address _add)
    {
        if(masterAddress == 0x000){
            masterAddress = _add;
            ms=master(masterAddress);
        }
        else {
          ms=master(masterAddress);
          if(ms.isInternal(msg.sender) == true)
            masterAddress = _add;
          else
            throw;
        }
    }
    modifier onlyInternal {
        // ms=master(masterAddress);
        require(ms.isInternal(msg.sender) == true);
        _; 
    }
    modifier onlyOwner{
        // ms=master(masterAddress);
        require(ms.isOwner(msg.sender) == true);
        _; 
    }
    function changeGovernanceDataAddress(address governanceDataAddress) onlyInternal
    {
        // governanceDataAddress = _add;
        gd=governanceData(governanceDataAddress);
    }
    function changePoolAddress(address poolAddress) onlyInternal
    {
        // poolAddress = _add;
        p1=pool(poolAddress);
    }
    function changeProposalStatus(uint id)
    {
        // gd=governanceData(governanceDataAddress);
        if(gd.getProposalOwner(id) != msg.sender || gd.getProposalStatus(id)!=0) throw;
        
        gd.pushInProposalStatus(id,1);
        gd.updateProposalStatus(id,1);
        gd.updateProposalDateUpd(id);
        // p1=pool(poolAddress);
        p1.closeProposalOraclise(id,gd.getClosingTime());
    
    }
    /// @dev Remove a specified address from the advisory board.
    function removeAB(address memRem)
    {
        // ms=master(masterAddress);
        require(ms.isInternal(msg.sender) == true && ms.isOwner(msg.sender)==true);
        // gd=governanceData(governanceDataAddress);
        if(gd.isAB(memRem) == false) throw;
        gd.removeAB(memRem);
        gd.addMemberStatusUpdate(memRem,0,now);
    }
    /// @dev Edit the short and long description of given proposal id.
    function editProposal(uint id , string sd, string ld) 
    {
        // gd = governanceData(governanceDataAddress);
        if(msg.sender==gd.getProposalOwner(id) && gd.getProposalStatus(id) == 0 )
        {
          gd.addProposalVersion(id,gd.getProposalVersion(id),gd.getProposalDateAdd(id));
          gd.updateProposal(id,sd,0,ld,SafeMaths.add64(gd.getProposalVersion(id),1));
        
        }
        else
          throw;
    }
    /// @dev Adds proposal details.
    /// @param shortDesc ShortDescription about proposal.
    /// @param longDesc LongDescription about proposal.
    /// @param _effect address parameters used for action.
    /// @param value address parameters used for action.
    /// @param cat address parameters used for action.
    /// @param options bytes parameters used for action.
    function addProposal(string shortDesc , string longDesc , address[] _effect , uint[] value , uint16 cat,bytes16[] options)
    {
        // gd = governanceData(governanceDataAddress);
            
        if(cat==2 && gd.checkBurnVoterTokenAgaintClaim(value[0],_effect[0])==1 )
          throw;
            
        uint len = gd.getAllProLength();
            
        gd.addNewProposal(len,msg.sender,shortDesc,longDesc);
        if((gd.isAB(msg.sender)==true && cat==2) || cat==13 || cat==12)
        {
          gd.updateCategorizeDetails(len,cat,msg.sender,_effect,value,options);
          if(cat==2)
            gd.changeBurnVoterTokenAgaintClaim(value[0],_effect[0],1);
            gd.updateCategorisedProposal(len,1);
        }
        gd.addInUserProposals(len,msg.sender);
        if(cat==12 || cat==13)
        {
          changeProposalStatus(len); //submit the proposal as well
        }
        else
          gd.pushInProposalStatus(len,0);    
    }
    ///@dev Sets category for a proposal.
    function categorizeProposal(uint id , uint16 cat , address[] _effect , uint[] val, bytes16[] options)
    {
        // gd = governanceData(governanceDataAddress);
        if(gd.isAB(msg.sender)==false) throw;
        if(gd.isProposalCategorised(id)==1) throw;
        gd.updateCategorizeDetails(id,cat,msg.sender,_effect,val,options);
        gd.updateCategorisedProposal(id,1);
    }
}