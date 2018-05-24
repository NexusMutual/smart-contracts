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
import "./nxmToken.sol";
import "./claims.sol";
import "./pool.sol";
import "./governanceData.sol";
import "./nxmToken2.sol";
import "./master.sol";
import "./nxmTokenData.sol";
import "./poolData.sol";
import "./pool3.sol";
import "./SafeMaths.sol";
contract governance {
    using SafeMaths for uint;
    
    address masterAddress;
    // address nxmTokenAddress;
    // address claimAddress;
    address poolAddress;
    // address nxmToken2Address;
    // address governanceDataAddress;
    // address nxmTokenDataAddress;
    // address poolDataAddress;
    // address pool3Address;
    
    master ms;
    pool p1;
    claims c1;
    nxmToken t1;
    nxmToken2 t2;
    nxmTokenData td;
    governanceData gd;
    poolData pd;
    pool3 p3;
    
    category[] public allCategory;
    string[] public status;
    
    function changeMasterAddress(address _add) {
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
    modifier onlyOwner {
        // ms=master(masterAddress);
        require(ms.isOwner(msg.sender) == true);
        _; 
    }
    modifier checkPause {
        // ms=master(masterAddress);
        require(ms.isPause()==false);
        _;
    }
    struct category{
        string name;
        uint64 memberVoteReq;
        uint16 majority;
    }
    function changeToken2Address(address nxmToken2Address) onlyInternal
    {
        // nxmToken2Address = _add;
        t2=nxmToken2(nxmToken2Address);
    }
    function changeGovernanceDataAddress(address governanceDataAddress) onlyInternal
    {
        // governanceDataAddress = _add;
        gd=governanceData(governanceDataAddress);
    }
    function changeTokenDataAddress(address nxmTokenDataAddress) onlyInternal
    {
        // nxmTokenDataAddress = _add;
        td=nxmTokenData(nxmTokenDataAddress);
    }
    
    function changeAllAddress(address nxmTokenAddress,address claimAddress,address pooladd,address poolDataAddress,address pool3Address) onlyInternal
    {
        t1=nxmToken(nxmTokenAddress);
        poolAddress=pooladd;
        p1=pool(poolAddress);
        c1=claims(claimAddress);
        pd=poolData(poolDataAddress);
        p3=pool3(pool3Address);
        // nxmTokenAddress=NXadd;
        // claimAddress=claimAdd;
        // poolDataAddress=poolDataAddr;
        // pool3Address=pool3Addr;
    }
    
    /// @dev Adds a status name
    function addStatus(string stat) onlyInternal
    {
        status.push(stat);
    }
    
    /// @dev Adds category details.
    /// @param cat Category name.
    /// @param mvr Member vote Required 1 if both members and advisory board members vote required, 0 if only advisory board members vote required  
    /// @param maj Majority required for this category to pass. 
    function addCategory(string cat,uint64 mvr,uint16 maj) onlyInternal
    {
        allCategory.push(category(cat,mvr,maj));
    }
    
    function updateCategory(uint id,string name,uint64 mvr,uint16 maj) onlyOwner
    {
        allCategory[id].name=name;
        allCategory[id].memberVoteReq=mvr;
        allCategory[id].majority=maj;
    }
    
    /// @dev Checks if the Tokens of a given User for given Claim Id has been burnt or not.
    /// @return check 1 if the tokens are burnt,0 otherwise. 
    function checkIfTokensAlreadyBurned(uint claimid , address voter) constant returns(bool check)
    {
        // gd=governanceData(governanceDataAddress);
        check = gd.checkIfTokensAlreadyBurned(claimid,voter);
    }
    
    /// @dev Gets the total number of categories.
    function getCategoriesLength() constant returns (uint len) {
        len = allCategory.length;
    }
    
    /// @dev Gets Category details of a given index.
    /// @return id Index value.
    /// @return cat Category name.
    /// @return mvr Member vote Required 1 if both members and advisory board members vote required, 0 if only advisory board members vote required  
    /// @return perc Majority required by this category to get passed. 
    function getCategory(uint index) constant returns (uint id, string cat, uint64 mvr, uint16 perc)
    {
        cat = allCategory[index].name;
        mvr = allCategory[index].memberVoteReq;
        perc= allCategory[index].majority;
        id=index;
    }
   
    /// @dev Changes the closing time of the vote.
    function changeClosingTime(uint _time) onlyOwner
    {
        // gd=governanceData(governanceDataAddress); 
        uint pendingProposalStart = gd.getPendingProposalStart();
        uint len = gd.getAllProLength();
        for(uint i=pendingProposalStart;i<len;i++)
        {
            if(SafeMaths.add(gd.getProposalDateUpd(i), _time) <= now)
            {
                closeProposalVote(i);
            }
            else
            {
                uint64 timeleft = uint64(SafeMaths.sub(SafeMaths.add(gd.getProposalDateUpd(i),_time) ,now));
                // p1=pool(poolAddress);
                p1.closeProposalOraclise(i,timeleft);
            }
        }
    }

    /// @dev Verifies whether a given address is a Advisory Board(AB) Member or not.
    /// @param add User address.
    /// @return _AB true if the address is AB member,false otherwise.
    function isAB(address add) constant returns(bool _AB)
    {
        // gd=governanceData(governanceDataAddress);
        _AB = gd.isAB(add);
    }

    /// @dev Provides the information of a Proposal when given the id.
    /// @param id Proposal id.
    /// @return proposalId Proposal Id.
    /// @return vote final decision of voting, 1 if proposal has been accepted,-1 if proposal has been declined,0 pending voting decision.
    /// @return date timestamp at which proposal has been created.
    /// @return cat Category of proposal.
    /// @return stat Status of proposal.
    /// @return versionNo Current version of proposal
    function getProposalById2(uint id) constant returns(uint proposalId , int8 vote , uint date ,string cat ,string stat , uint16 statusNumber , uint64 versionNo)
    {
        // gd=governanceData(governanceDataAddress);
        uint16 catno;
        (proposalId,vote,date,catno,statusNumber,versionNo) = gd.getProposalById2(id);
        cat = allCategory[catno].name;
        stat = status[statusNumber]; 
    }    
    
    /// @dev Checks if voting time of a given proposal should be closed or not.
    /// @param id Proposal Id.
    /// @return close 1 if voting should be closed,0 in case voting should not be closed.
    function checkProposalVoteClosing(uint id) constant returns(uint8 close)
    {
        // gd=governanceData(governanceDataAddress);
        if( SafeMaths.add(gd.getProposalDateUpd(id) , gd.getClosingTime()) <= now && ((gd.getProposalStatus(id) == 1)|| (gd.getProposalStatus(id) == 2)))
            close=1;
        else
            close=0;
    }
   
    /// @dev Closes the voting of a given proposal.Changes the status and verdict of the proposal by calculating the votes. 
    /// @param id Proposal id.
    function closeProposalVote(uint id)
    {
        // gd=governanceData(governanceDataAddress);
        if(checkProposalVoteClosing(id)==1)
        {
            uint32 accept;
            uint32 deny;
            uint16 maj;
            uint16 category = gd.getProposalCategoryNo(id);
            uint64 mvr;
            // t1=nxmToken(nxmTokenAddress);
            // td=nxmTokenData(nxmTokenDataAddress);
            uint totalMember = td.memberCounter();
            (,,mvr,maj) = getCategory(category);
            if(gd.getProposalStatus(id)==1)
            {
                (accept,deny,,) = gd.getProposalAllVotesCount(id);

                if(SafeMaths.add(accept,deny)>0){
                    // if proposal accepted% >=majority % (by Advisory board)
                    if(SafeMaths.div(SafeMaths.mul(accept,100),(SafeMaths.add(accept,deny)))>=maj)
                    {   // Member vote required 
                        if(mvr==1)
                        {
                            gd.updateProposalStatus(id,2);
                            gd.pushInProposalStatus(id,2);
                            gd.updateProposalDateUpd(id);
                            // p1=pool(poolAddress);
                            p1.closeProposalOraclise(id,gd.getClosingTime());
                        }
                        // Member vote not required
                        else
                        {
                            gd.updateProposalStatus(id,4);
                            gd.pushInProposalStatus(id,4);
                            gd.changeProposalFinalVerdict(id,1);
                            gd.updateProposalDateUpd(id);
                            actionAfterProposalPass(id , category);
                        }
                    }
                    // if proposal is denied
                    else
                    {
                        gd.updateProposalStatus(id,3);
                        gd.pushInProposalStatus(id,3);
                        gd.changeProposalFinalVerdict(id,-1);
                        gd.updateProposalDateUpd(id);
                    }
                }
                // if accept+deny=0
                else
                {
                    gd.updateProposalStatus(id,3);
                    gd.pushInProposalStatus(id,3);
                    gd.changeProposalFinalVerdict(id,-1);
                    gd.updateProposalDateUpd(id);
                }
            }
            else if(gd.getProposalStatus(id)==2)
            {
                (,,accept,deny) = gd.getProposalAllVotesCount(id);
                // when Member Vote Quorum not Achieved
                if(totalMember>0){
                if(SafeMaths.div(SafeMaths.mul((SafeMaths.add(accept,deny)),100),totalMember) < gd.getQuorumPerc())
                {
                    gd.updateProposalStatus(id,7);
                    gd.changeProposalFinalVerdict(id,1);
                    gd.pushInProposalStatus(id,7);
                    gd.updateProposalDateUpd(id);
                    actionAfterProposalPass(id, category);
                }
                else if(SafeMaths.add(accept,deny)>0){
                    // if proposal accepted% >=majority % (by Members)
                    if(SafeMaths.div(SafeMaths.mul(accept,100),(SafeMaths.add(accept,deny)))>=maj)
                    {
                        gd.updateProposalStatus(id,5);
                        gd.changeProposalFinalVerdict(id,1);
                        gd.pushInProposalStatus(id,5);
                        gd.updateProposalDateUpd(id);
                        actionAfterProposalPass(id, category);
                    }
                    // if proposal is denied
                    else
                    {
                        gd.updateProposalStatus(id,6);
                        gd.changeProposalFinalVerdict(id,-1);
                        gd.pushInProposalStatus(id,6);
                        gd.updateProposalDateUpd(id);
                    }
                }
                // if no one vote
                else
                {
                    gd.updateProposalStatus(id,6);
                    gd.changeProposalFinalVerdict(id,-1);
                    gd.pushInProposalStatus(id,6);
                    gd.updateProposalDateUpd(id);
                }
                }
            }
        }
        uint pendingProposalStart = gd.getPendingProposalStart();
        uint len = gd.getAllProLength();
        for(uint j=pendingProposalStart;j<len;j++)
        {
            if(gd.getProposalStatus(j) > 2)
                pendingProposalStart = SafeMaths.add(pendingProposalStart,1);
            else
                break;
        }
        if(j!=pendingProposalStart)
        {
            gd.changePendingProposalStart(j);
        }
    }

    /// @dev When proposal gets accepted,different functions are performed on the basis of Proposal's category number. 
    function actionAfterProposalPass(uint propid, uint16 cat) internal
    {
        // gd=governanceData(governanceDataAddress);
        // t2=nxmToken2(nxmToken2Address);
        // c1=claims(claimAddress);
        // p1=pool(poolAddress);
        // t1=nxmToken(nxmTokenAddress);

        address _add;
        uint value;
        uint value1;
        uint value2;
        bytes16 type0;
        // when category is "Burn fraudulent claim assessor tokens"
        if(cat == 2)
        {
            uint claimid=gd.getProposalValue(propid,0);
            _add = gd.getProposalAddress_Effect(propid,0);
            value = c1.getCATokensLockedAgainstClaim(_add, claimid);
            t2.burnCAToken(claimid,value,_add);
        }
        // when category is "Engage in external services up to the greater of $50,000USD " .
        else if(cat == 6 || cat==7)
        {
            _add = gd.getProposalAddress_Effect(propid,0);
            value = gd.getProposalValue(propid,0);
            if(gd.isAB(_add)==true)
                p1.proposalExtServicesPayout(_add, value, propid);
        }
        // when category is to create new version of contracts
        else if(cat == 10)
        {
            // ms=master(masterAddress);
            ms.switchToRecentVersion();
        }
        else if(cat==12)
        {
            // ms=master(masterAddress);
            value = gd.getProposalValue(propid,0);
            // start/stop emergencyPause
            if(value==0)
                ms.addEmergencyPause(false,"GOV"); 
            else if(value==1)
                ms.addEmergencyPause(true,"GOV");
            
        }
        // changes in investment model
        else if(cat==13)
        {
            // p3=pool3(pool3Address);
            type0= gd.getProposalOptions(propid,0);
            bytes8 type1=bytes8(gd.getProposalOptions(propid,1));
            value = gd.getProposalValue(propid,0);
            if (type0=="addIA")
            {
                _add = gd.getProposalAddress_Effect(propid,0);
                value1 = gd.getProposalValue(propid,1);
                value2 = gd.getProposalValue(propid,2);
                p3.addInvestmentAssetsDetails(type1,_add,uint64(value),uint64(value1),uint8(value2));
            }
            else if(type0=="updIA")
            {
                value1 = gd.getProposalValue(propid,1);
                p3.updateInvestmentAssetHoldingPerc(type1,uint64(value),uint64(value1));
            }
            else if(type0=="updCA")
            {
                p3.updateCurrencyAssetDetails(bytes4(type1),uint64(value));
            }
        }
        //change relayer address
        else if(cat==14)
        {
            // pd=poolData1(poolDataAddress);
            pd.change0xFeeRecipient(gd.getProposalAddress_Effect(propid,0));
        }
    }
    /// @dev Changes the status of a given proposal when Proposal has insufficient funds.
    /// @param propid Proposal Id.
    function changeStatusFromPool(uint propid) onlyInternal
    {
        // gd=governanceData(governanceDataAddress);
        if(msg.sender == poolAddress)
        {
            gd.updateProposalStatus(propid,8);
            gd.pushInProposalStatus(propid,8);
            gd.updateProposalDateUpd(propid);
        }
    }

    /// @dev Adds the given address in the Advisory Board Members.
    function joinAB(address memAdd)
    {
        // ms=master(masterAddress);
        if( ms.isInternal(msg.sender) != true && ms.isOwner(msg.sender) != true) throw;
        // gd=governanceData(governanceDataAddress);
        // t1=nxmToken(nxmTokenAddress);
        uint tokensHeld = t1.balanceOf(memAdd);
        uint totalTokens = t1.totalSupply();
        if(gd.isAB(memAdd) == true || ((SafeMaths.mul(tokensHeld,100))/totalTokens) < 10) throw;
        gd.joinAB(memAdd);
        gd.addMemberStatusUpdate(memAdd,1,now);
    }
    
    /// @dev Registers an Advisroy Board Member's vote
    /// @param id Proposal id.
    /// @param verdict 1 if vote is in favour,-1 if vote is in against.
    function voteABProposal(uint id , int8 verdict)
    {
        // gd = governanceData(governanceDataAddress);
        if(gd.isAB(msg.sender)==false) throw;
        uint len = gd.getVoteLength();
        gd.incVoteLength();
        gd.addVote(msg.sender,id,verdict);
        gd.addInUserABVotes(len,msg.sender);
        gd.addInProposalABVotes(id,len);
        gd.updateUserProposalABVote(id,verdict,msg.sender);
        if(verdict==1)
            gd.incPVCABAccept(id);
        else if(verdict==-1)
            gd.incPVCABDeny(id);
    }
    /// @dev Members can give the votes(either in favor or in against) to a Proposal.
    /// @param id Proposal id.
    /// @param verdict 1 if vote is in favour,-1 if vote is in against.
    function voteMember(uint id , int8 verdict)
    {
        // gd = governanceData(governanceDataAddress);
        if(gd.isAB(msg.sender)==true) throw;
        uint len = gd.getVoteLength();
        gd.incVoteLength();
        gd.addVote(msg.sender,id,verdict);
        gd.addInUserMemberVotes(len,msg.sender);
        gd.addInProposalMemberVotes(id,len);
        gd.updateUserProposalMemberVote(id,verdict,msg.sender);
        if(verdict==1)
            gd.incPVCMemberAccept(id);
        else if(verdict==-1)
            gd.incPVCMemberDeny(id);
    }
    
    /// @dev Allow AB Members to Start Emergency Pause
    function startEmergencyPause () checkPause {
        if(isAB(msg.sender)==true){
            // ms=master(masterAddress);
            ms.addEmergencyPause(true,"AB"); //Start Emergency Pause
            // p1=pool(poolAddress);
            p1.closeEmergencyPause(ms.getPauseTime()); //oraclize callback of 4 weeks
            // c1=claims(claimAddress);
            c1.PauseAllPendingClaimsVoting();   //Pause Voting of all pending Claims
        }
    }   
}
