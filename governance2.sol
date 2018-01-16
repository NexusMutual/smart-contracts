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


pragma solidity 0.4.11;
import "./pool.sol";
import "./governanceData.sol";
//import "./governance.sol";
import "./master.sol";
contract governance2 
{
  master ms1;
  pool p1;
  governanceData gd1;
  //governance g1;
  address masterAddress;
  address poolAddress;
  address governanceDataAddress;
 // address governanceAddress;
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
  modifier onlyOwner{
    ms1=master(masterAddress);
    require(ms1.isOwner(msg.sender) == 1);
    _; 
  }
  function changeGovernanceDataAddress(address _add) onlyInternal
  {
    governanceDataAddress = _add;
    gd1=governanceData(governanceDataAddress);
  }
  function changePoolAddress(address _add) onlyInternal
  {
    poolAddress = _add;
  }
  // function changeGovernanceAddress(address _to) onlyInternal
  // {
  //   governanceAddress = _to;
  // }
    function changeProposalStatus(uint id)
    {
        gd1=governanceData(governanceDataAddress);
        if(gd1.getProposalOwner(id) != msg.sender || gd1.getProposalStatus(id)!=0) throw;
        //uint time= now;
        gd1.pushInProposalStatus(id,1);
        gd1.updateProposalStatus(id,1);
        gd1.updateProposalDateUpd(id);
        p1=pool(poolAddress);
        p1.closeProposalOraclise(id,gd1.getClosingTime());

    }
    function removeAB(address memRem)
    {
       ms1=master(masterAddress);
       if( ms1.isInternal(msg.sender) != 1 && ms1.isOwner(msg.sender)!=1) throw;
        gd1=governanceData(governanceDataAddress);
        if(gd1.isAB(memRem) == 0) throw;
        gd1.removeAB(memRem);
        gd1.addMemberStatusUpdate(memRem,0,now);
    }
    function editProposal(uint id , string sd, string ld) 
    {
      gd1 = governanceData(governanceDataAddress);
      if(msg.sender==gd1.getProposalOwner(id) && gd1.getProposalStatus(id) == 0 )
      {
        gd1.addProposalVersion(id,gd1.getProposalVersion(id),gd1.getProposalDateAdd(id));
        gd1.updateProposal(id,sd,0,ld,gd1.getProposalVersion(id)+1);
            //gd1.unCategoriseProposal(id);
      }
      else
        throw;

    }
    function addProposal(string shortDesc , string longDesc , address[] _effect , uint[] value , uint16 cat,bytes16[] options)
    {
        gd1 = governanceData(governanceDataAddress);
        
       if(cat==2  && gd1.checkBurnVoterTokenAgaintClaim(value[0],_effect[0])==1 )
          throw;
        
        uint len = gd1.getAllProLength();
        //uint64 time = uint64(now);
        gd1.addNewProposal(len,msg.sender,shortDesc,longDesc);
        if((gd1.isAB(msg.sender)==1 && (cat==2 || cat==12)) || cat==13)
        {
            // gd1.updateCategorizeDetails2(len,cat,msg.sender);
            // for(uint j=0; j<_effect.length;i++)
            // {
                gd1.updateCategorizeDetails(len,cat,msg.sender,_effect,value,options);
                if(cat==2)
                gd1.changeBurnVoterTokenAgaintClaim(value[0],_effect[0],1);
            // }
            gd1.updateCategorisedProposal(len,1);
        }
        gd1.addInUserProposals(len,msg.sender);
        if(cat==12 || cat==13)
        {
            changeProposalStatus(len); //submit the proposal as well
        }
        else
            gd1.pushInProposalStatus(len,0);    
    }
    function categorizeProposal(uint id , uint16 cat , address[] _effect , uint[] val, bytes16[] options)
    {
        gd1 = governanceData(governanceDataAddress);
        if(gd1.isAB(msg.sender)==0) throw;
        if(gd1.isProposalCategorised(id)==1) throw;
            gd1.updateCategorizeDetails(id,cat,msg.sender,_effect,val,options);
        // for(uint i=0;i<_effect.length;i++)
        // {
        //     gd1.updateCategorizeDetails(id,_effect[i],val[i],options[i]);    
        // }
        gd1.updateCategorisedProposal(id,1);
    }
}