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
import "./NXMToken.sol";
import "./claims.sol";
import "./pool.sol";
import "./governanceData.sol";
import "./NXMToken2.sol";
import "./master.sol";
import "./NXMTokenData.sol";

contract governance {
    master ms1;
    address masterAddress;
    NXMToken t1;
    address nxad;
    address claimAd;
    pool p1;
    address poolAd;
    claims c1;
    NXMToken2 t2;
    address public token2Address;
    address governanceDataAddress;
    NXMTokenData td1;
    address tokenDataAddress;
    governanceData gd1;
    category[] public allCategory;
    string[] public status;
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
    struct category{
        string name;
        uint memberVoteReq;
        uint majority;
    }
    function changeToken2Address(address _add) onlyInternal
    {
        token2Address = _add;
        t2 = NXMToken2(token2Address);
    }
    function changeGovernanceDataAddress(address _add) onlyInternal
    {
        governanceDataAddress = _add;
        gd1=governanceData(governanceDataAddress);
    }
    /// @dev Adds a status name
    function addStatus(string stat) onlyInternal
    {
        status.push(stat);
    }
     function changeTokenDataAddress(address _add) onlyInternal
    {
        tokenDataAddress = _add;
        td1=NXMTokenData(tokenDataAddress);
    }
    /// @dev Adds category details.
    /// @param cat Category name.
    /// @param mvr Member vote Required/not, 1 if both members and advisory board members vote required, 0 if only advisory board voting is required  
    /// @param maj Majority% required by this category to get the proposal passed. 
    function addCategory(string cat,uint mvr,uint maj) onlyInternal
    {
        allCategory.push(category(cat,mvr,maj));
    }
    /// @dev Checks if the Tokens of a given User for a given Claim Id has been burnt or not.
    /// @return check 1 if the tokens are burnt,0 otherwise. 
    function checkIfTokensAlreadyBurned(uint claimid , address voter) constant returns(uint check)
    {
        gd1=governanceData(governanceDataAddress);
        check = gd1.checkIfTokensAlreadyBurned(claimid,voter);
    }
    /// @dev Gets the total number of categories.
    function getCategoriesLength() constant returns (uint len){
        len = allCategory.length;
    }
    function changeAllAddress(address NXadd,address claimAdd,address pooladd) onlyInternal
    {
        nxad = NXadd;
        claimAd=claimAdd;
        poolAd=pooladd;
    }
    /// @dev Gets Category details at a given index.
    /// @param id Index value.
    /// @param cat Category name.
    /// @param mvr Member vote Required/not, 1 if both members and advisory board members vote required, 0 if only advisory board voting is required  
    /// @param perc Majority% required by this category to get the proposal passed. 
    function getCategory(uint index) constant returns ( uint id , string cat , uint mvr , uint perc)
    {
        cat = allCategory[index].name;
        mvr = allCategory[index].memberVoteReq;
        perc = allCategory[index].majority;
        id=index;
    } 
    /// @dev Changes the total number of members.
    function changeTotalMember(uint num) onlyInternal
    {
        gd1=governanceData(governanceDataAddress);
        gd1.changeTotalMember(num);
    }
    /// @dev Changes the Quorum Percentage required.
    function changeQuorumperc(uint perc) onlyOwner
    {
        gd1=governanceData(governanceDataAddress);
        gd1.changeQuorumperc(perc);
    }
    /// @dev Changes the time (in seconds) after which voting for a proposal is closed.
    function changeClosingTime(uint _time) onlyOwner
    {
        gd1=governanceData(governanceDataAddress);
        uint closingTime = _time;  
        uint pendingProposalStart = gd1.getPendingProposalStart();
        uint len = gd1.getAllProLength();
        for(uint i=pendingProposalStart;i<len;i++)
        {
            if(gd1.getProposalDateUpd(i) + closingTime <= now)
            {
                closeProposalVote(i);
            }
            else
            {
                uint timeleft = gd1.getProposalDateUpd(i)+closingTime -now;
                p1=pool(poolAd);
                p1.closeProposalOraclise(i,closingTime);
            }
        }
    }

    /// @dev Gets the total number of Proposals created till date.
    function getAllProLength() constant returns(uint len)
    {
        gd1=governanceData(governanceDataAddress);
        len = gd1.getAllProLength();
    }

    /// @dev Verifies whether a given address is an Advisory Board(AB) Member or not.
    /// @param add User address.
    /// @return _AB 1 if the address is an AB member,0 otherwise.
    function isAB(address add) constant returns(uint _AB)
    {
        gd1=governanceData(governanceDataAddress);
        _AB = gd1.isAB(add);
    }

     /// @dev Gets the Number of proposals which are pending.
     /// @return len Number of pending proposals.
    function getAllProLengthFromNewStart() constant returns(uint len)
    {
        gd1=governanceData(governanceDataAddress);
        len = gd1.getAllProLengthFromNewStart();
    }

    /// @dev Provides the information of a given Proposal id.
    /// @param id Proposal id.
    /// @return proposalId Proposal Id.
    /// @return vote final decision, 1 if proposal has been accepted,-1 if proposal has been declined,0 pending voting decision.
    /// @return date timestamp at which proposal has been created.
    /// @return cat Category of proposal.
    /// @return stat Status of proposal.
    /// @return versionNo Current version of proposal
    function getProposalById2(uint id) constant returns(uint proposalId , int vote , uint date ,string cat ,string stat , uint statusNumber , uint versionNo)
    {
        gd1=governanceData(governanceDataAddress);
        uint statno;
        uint catno;
        (proposalId,vote,date,catno,statno,statusNumber,versionNo) = gd1.getProposalById2(id);
        cat = allCategory[catno].name;
        stat = status[statno]; 
    }    
    /// @dev Changes the status of a given proposal.
    /// @param id Proposal Id.
    function changeProposalStatus(uint id)
    {
        gd1=governanceData(governanceDataAddress);
        if(gd1.getProposalOwner(id) != msg.sender || gd1.getProposalStatus(id)!=0) throw;
        uint time= now;
        gd1.pushInProposalStatus(id,1,time);
        gd1.updateProposalStatus(id,1);
        gd1.updateProposalDateUpd(id,time);
        p1=pool(poolAd);
        p1.closeProposalOraclise(id,gd1.getClosingTime());

    }

    /// @dev Checks if voting on a proposal should be closed or not.
    /// @param id Proposal Id.
    /// @return close 1 if voting should be closed,0 in case voting should not be closed.
    function checkProposalVoteClosing(uint id) constant returns(uint close)
    {
        gd1=governanceData(governanceDataAddress);
        if( gd1.getProposalDateUpd(id) + gd1.getClosingTime() <= now && ((gd1.getProposalStatus(id) == 1)|| (gd1.getProposalStatus(id) == 2)))
            close=1;
        else
            close=0;
    }
   
    /// @dev Closes the voting of a given proposal. Changes the status and verdict of the proposal by calculating the votes. 
    /// @param id Proposal id.
    function closeProposalVote(uint id)
    {
        gd1=governanceData(governanceDataAddress);
        if(checkProposalVoteClosing(id)==1)
        {
            uint accept;
            uint deny;
            uint maj;
            uint category = gd1.getProposalCategoryNo(id);
            uint mvr;
            t1=NXMToken(nxad);
            
            td1=NXMTokenData(tokenDataAddress);
            uint totalMember = td1.memberCounter();
            (,,mvr,maj) = getCategory(category);
            if(gd1.getProposalStatus(id)==1)
            {
                (accept,deny,,) = gd1.getProposalAllVotesCount(id);
                /// if proposal accept% >=majority required% (by Advisory board)
                if(accept*100/(accept+deny)>=maj)
                {   /// If Member vote is required 
                    if(mvr==1)
                    {
                        gd1.updateProposalStatus(id,2);
                        gd1.pushInProposalStatus(id,2,now);
                        gd1.updateProposalDateUpd(id,now);
                        p1=pool(poolAd);
                        p1.closeProposalOraclise(id,gd1.getClosingTime());
                    }
                    /// If Member vote is not required
                    else
                    {
                        gd1.updateProposalStatus(id,4);
                        gd1.pushInProposalStatus(id,4,now);
                        gd1.changeProposalFinalVerdict(id,1);
                        gd1.updateProposalDateUpd(id,now);
                        if(category==2 || category==6 ||category==7)
                        {
                            actionAfterProposalPass(id , category);
                        }
                    }
                }
                /// if proposal is denied
                else
                {
                    gd1.updateProposalStatus(id,3);
                    gd1.pushInProposalStatus(id,3,now);
                    gd1.changeProposalFinalVerdict(id,-1);
                    gd1.updateProposalDateUpd(id,now);
                }
            }
            else if(gd1.getProposalStatus(id)==2)
            {
                (,,accept,deny) = gd1.getProposalAllVotesCount(id);
                /// If Member Vote Quorum not Achieved
                if((accept+deny)*100/totalMember < gd1.getQuorumPerc())
                {
                    gd1.updateProposalStatus(id,7);
                    gd1.changeProposalFinalVerdict(id,1);
                    gd1.pushInProposalStatus(id,7,now);
                    gd1.updateProposalDateUpd(id,now);
                    if(category==2 || category==6 || category==7 || category==10)
                    {
                        actionAfterProposalPass(id , category);
                    }
                }
                /// if proposal accepted% >=majority % (by Members)
                else if(accept*100/(accept+deny)>=maj)
                {
                    gd1.updateProposalStatus(id,5);
                    gd1.changeProposalFinalVerdict(id,1);
                    gd1.pushInProposalStatus(id,5,now);
                    gd1.updateProposalDateUpd(id,now);
                    if(category==2 || category==6 || category==7 || category==10)
                    {
                        actionAfterProposalPass(id , category);
                    }
                }
                /// if proposal is denied
                else
                {
                    gd1.updateProposalStatus(id,6);
                    gd1.changeProposalFinalVerdict(id,-1);
                    gd1.pushInProposalStatus(id,6,now);
                    gd1.updateProposalDateUpd(id,now);
                }
            }
        }
        uint pendingProposalStart = gd1.getPendingProposalStart();
        uint len = gd1.getAllProLength();
        for(uint j=pendingProposalStart;j<len;j++)
        {
            if(gd1.getProposalStatus(j) > 2)
                pendingProposalStart += 1;
            else
                break;
        }
        
        if(j!=pendingProposalStart)
        {
            gd1.changePendingProposalStart(j);
        }
        
    }

    /// @dev When proposal gets accepted, different functions are performed on the basis of Proposal's category number. 
    function actionAfterProposalPass(uint propid , uint cat) internal
    {
        gd1=governanceData(governanceDataAddress);
        t2 = NXMToken2(token2Address);
        c1=claims(claimAd);
        p1=pool(poolAd);
        t1=NXMToken(nxad);
        address _add;
        uint value;
        // when category is "Burn fraudulent claim assessor tokens"
        if(cat == 2)
        {
            uint claimid=gd1.getProposalValue(propid);
            _add = gd1.getProposalAddress_Effect(propid);
            value = c1.getCATokensLockedAgainstClaim(_add , claimid);
            t2.burnCAToken(claimid,value,_add);
        }
        // when category is "Engage in external services up to the greater of $50,000USD " .
        else if(cat == 6)
        {
            _add = gd1.getProposalAddress_Effect(propid);
            value = gd1.getProposalValue(propid);
            if(gd1.isAB(_add)==1)
                p1.proposalExtServicesPayout( _add ,  value , propid);
        }
        // when category is  "Engage in external services up to the greater of $50,000USD "and Member vote are required.
        else if(cat == 7)
        {
             _add = gd1.getProposalAddress_Effect(propid);
            value = gd1.getProposalValue(propid);
            if(gd1.isAB(_add)==1)
                p1.proposalExtServicesPayout( _add ,  value , propid);
        }
        /// when category is to create new version of contracts
        else if(cat == 10)
        {
            ms1=master(masterAddress);
            ms1.switchToRecentVersion();
        }
    }
    /// @dev Changes the status of a given proposal when Proposal has insufficient funds.
    /// @param propid Proposal Id.
    function changeStatusFromPool(uint propid) onlyInternal
    {
        gd1=governanceData(governanceDataAddress);
        if(msg.sender == poolAd)
        {
            uint time=now;
            gd1.updateProposalStatus(propid,8);
            gd1.pushInProposalStatus(propid,8,time);
            gd1.updateProposalDateUpd(propid,now);
        }
    }

    /// @dev Adds the given address in the Advisory Board Members.
    function joinAB(address memAdd)
    {
       ms1=master(masterAddress);
       if( ms1.isInternal(msg.sender) != 1 && ms1.isOwner(msg.sender)!=1) throw;
        gd1=governanceData(governanceDataAddress);
        t1=NXMToken(nxad);
        uint tokensHeld = t1.balanceOf(memAdd);
        uint totalTokens = t1.totalSupply();
        if(gd1.isAB(memAdd) == 1 || ((tokensHeld*100)/totalTokens) < 10) throw;
        gd1.joinAB(memAdd);
        gd1.addMemberStatusUpdate(memAdd,1,now);

    }

    /// @dev Removes the given address from the Advisory Board Members.
    function removeAB(address memRem)
    {
       ms1=master(masterAddress);
       if( ms1.isInternal(msg.sender) != 1 && ms1.isOwner(msg.sender)!=1) throw;
        gd1=governanceData(governanceDataAddress);
        if(gd1.isAB(memRem) == 0) throw;
        gd1.removeAB(memRem);
        gd1.addMemberStatusUpdate(memRem,0,now);
    }
}



        



        

