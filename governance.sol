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
import "./NXMToken.sol";
import "./claims.sol";
import "./pool.sol";
import "./governanceData.sol";
import "./NXMToken2.sol";
import "./master.sol";
import "./NXMTokenData.sol";
import "./poolData1.sol";
import "./pool3.sol";
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
    address poolDataAddress;
    governanceData gd1;
    poolData1 pd1;
    pool3 p3;
    address pool3Address;
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
      modifier checkPause
    {
         ms1=master(masterAddress);
         require(ms1.isPause()==0);
         _;
    }
    struct category{
        string name;
        uint64 memberVoteReq;
        uint16 majority;
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
    // function changePoolDataAddress(address _add) onlyInternal
    // {
    //     poolDataAddress=_add;
    //     pd1=poolData1(poolDataAddress);
    // }
    // function changePool3Address(address _add) onlyInternal 
    // {
    //     pool3Address=_add;
    //     p3=pool3(pool3Address);
    // }
    
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
    function checkIfTokensAlreadyBurned(uint claimid , address voter) constant returns(uint8 check)
    {
        gd1=governanceData(governanceDataAddress);
        check = gd1.checkIfTokensAlreadyBurned(claimid,voter);
    }
    /// @dev Gets the total number of categories.
    function getCategoriesLength() constant returns (uint len){
        len = allCategory.length;
    }
    function changeAllAddress(address NXadd,address claimAdd,address pooladd,address poolDataAddr,address pool3Addr) onlyInternal
    {
        nxad = NXadd;
        claimAd=claimAdd;
        poolAd=pooladd;
        poolDataAddress=poolDataAddr;
        pool3Address=pool3Addr;
    }
    /// @dev Gets Category details of a given index.
    /// @return id Index value.
    /// @return cat Category name.
    /// @return mvr Member vote Required 1 if both members and advisory board members vote required, 0 if only advisory board members vote required  
    /// @return perc Majority required by this category to get passed. 
    function getCategory(uint index) constant returns ( uint id , string cat , uint64 mvr , uint16 perc)
    {
        cat = allCategory[index].name;
        mvr = allCategory[index].memberVoteReq;
        perc = allCategory[index].majority;
        id=index;
    } 
    /// @dev Changes the number of total member.
    // function changeTotalMember(uint num) onlyInternal
    // {
    //     gd1=governanceData(governanceDataAddress);
    //     gd1.changeTotalMember(num);
    // }
    /// @dev Changes the Quorum Percentage number.
    // function changeQuorumperc(uint32 perc) onlyOwner
    // {
    //     gd1=governanceData(governanceDataAddress);
    //     gd1.changeQuorumperc(perc);
    // }
    /// @dev Changes the closing time of the vote.
    function changeClosingTime(uint _time) onlyOwner
    {
        gd1=governanceData(governanceDataAddress); 
        uint pendingProposalStart = gd1.getPendingProposalStart();
        uint len = gd1.getAllProLength();
        for(uint i=pendingProposalStart;i<len;i++)
        {
            if(gd1.getProposalDateUpd(i) + _time <= now)
            {
                closeProposalVote(i);
            }
            else
            {
                uint64 timeleft = uint64(gd1.getProposalDateUpd(i)+_time -now);
                p1=pool(poolAd);
                p1.closeProposalOraclise(i,timeleft);
            }
        }
    }

    /// @dev Gets the total number of Proposals created till date.
    // function getAllProLength() constant returns(uint len)
    // {
    //     gd1=governanceData(governanceDataAddress);
    //     len = gd1.getAllProLength();
    // }

    /// @dev Verifies whether a given address is a Advisory Board(AB) Member or not.
    /// @param add User address.
    /// @return _AB 1 if the address is AB member,0 otherwise.
    function isAB(address add) constant returns(uint8 _AB)
    {
        gd1=governanceData(governanceDataAddress);
        _AB = gd1.isAB(add);
    }

     /// @dev Gets the Number of proposals which are pending.
     /// @return len Number of pending proposals.
    // function getAllProLengthFromNewStart() constant returns(uint len)
    // {
    //     gd1=governanceData(governanceDataAddress);
    //     len = gd1.getAllProLengthFromNewStart();
    // }

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
        gd1=governanceData(governanceDataAddress);
        uint16 catno;
        (proposalId,vote,date,catno,statusNumber,versionNo) = gd1.getProposalById2(id);
        cat = allCategory[catno].name;
        stat = status[statusNumber]; 
    }    
    /// @dev Changes the status of a given proposal.
    /// @param id Proposal Id.
    // function changeProposalStatus(uint id)
    // {
    //     gd1=governanceData(governanceDataAddress);
    //     if(gd1.getProposalOwner(id) != msg.sender || gd1.getProposalStatus(id)!=0) throw;
    //     //uint time= now;
    //     gd1.pushInProposalStatus(id,1);
    //     gd1.updateProposalStatus(id,1);
    //     gd1.updateProposalDateUpd(id);
    //     p1=pool(poolAd);
    //     p1.closeProposalOraclise(id,gd1.getClosingTime());

    // }

    /// @dev Checks if voting time of a given proposal should be closed or not.
    /// @param id Proposal Id.
    /// @return close 1 if voting should be closed,0 in case voting should not be closed.
    function checkProposalVoteClosing(uint id) constant returns(uint8 close)
    {
        gd1=governanceData(governanceDataAddress);
        if( gd1.getProposalDateUpd(id) + gd1.getClosingTime() <= now && ((gd1.getProposalStatus(id) == 1)|| (gd1.getProposalStatus(id) == 2)))
            close=1;
        else
            close=0;
    }
   
    /// @dev Closes the voting of a given proposal.Changes the status and verdict of the proposal by calculating the votes. 
    /// @param id Proposal id.
    function closeProposalVote(uint id)
    {
        gd1=governanceData(governanceDataAddress);
        if(checkProposalVoteClosing(id)==1)
        {
            uint32 accept;
            uint32 deny;
            uint16 maj;
            uint16 category = gd1.getProposalCategoryNo(id);
            uint64 mvr;
            t1=NXMToken(nxad);
            
            td1=NXMTokenData(tokenDataAddress);
            uint totalMember = td1.memberCounter();
            (,,mvr,maj) = getCategory(category);
            if(gd1.getProposalStatus(id)==1)
            {
                (accept,deny,,) = gd1.getProposalAllVotesCount(id);

                if(accept+deny>0){
                    // if proposal accepted% >=majority % (by Advisory board)
                    if(accept*100/(accept+deny)>=maj)
                    {   // Member vote required 
                        if(mvr==1)
                        {
                            gd1.updateProposalStatus(id,2);
                            gd1.pushInProposalStatus(id,2);
                            gd1.updateProposalDateUpd(id);
                            p1=pool(poolAd);
                            p1.closeProposalOraclise(id,gd1.getClosingTime());
                        }
                        // Member vote not required
                        else
                        {
                            gd1.updateProposalStatus(id,4);
                            gd1.pushInProposalStatus(id,4);
                            gd1.changeProposalFinalVerdict(id,1);
                            gd1.updateProposalDateUpd(id);
                            // if(category==2 || category==6 ||category==12)
                            // {
                                actionAfterProposalPass(id , category);
                            // }
                        }
                    }
                    // if proposal is denied
                    else
                    {
                        gd1.updateProposalStatus(id,3);
                        gd1.pushInProposalStatus(id,3);
                        gd1.changeProposalFinalVerdict(id,-1);
                        gd1.updateProposalDateUpd(id);
                    }
                }
                // if accept+deny=0
                else
                {
                    gd1.updateProposalStatus(id,3);
                    gd1.pushInProposalStatus(id,3);
                    gd1.changeProposalFinalVerdict(id,-1);
                    gd1.updateProposalDateUpd(id);
                }
            }
            else if(gd1.getProposalStatus(id)==2)
            {
                (,,accept,deny) = gd1.getProposalAllVotesCount(id);
                // when Member Vote Quorum not Achieved
                if((accept+deny)*100/totalMember < gd1.getQuorumPerc())
                {
                    gd1.updateProposalStatus(id,7);
                    gd1.changeProposalFinalVerdict(id,1);
                    gd1.pushInProposalStatus(id,7);
                    gd1.updateProposalDateUpd(id);
                    // if(category==2 || category==6 || category==7 || category==10 || category==12 || category==13 || category==14)
                    // {
                        actionAfterProposalPass(id , category);
                    // }
                }
                else if(accept+deny>0){
                    // if proposal accepted% >=majority % (by Members)
                    if(accept*100/(accept+deny)>=maj)
                    {
                        gd1.updateProposalStatus(id,5);
                        gd1.changeProposalFinalVerdict(id,1);
                        gd1.pushInProposalStatus(id,5);
                        gd1.updateProposalDateUpd(id);
                        // if(category==2 || category==6 || category==7 || category==10 || category==12 || category==13 || category==14)
                        // {
                            actionAfterProposalPass(id , category);
                        // }
                    }
                    // if proposal is denied
                    else
                    {
                        gd1.updateProposalStatus(id,6);
                        gd1.changeProposalFinalVerdict(id,-1);
                        gd1.pushInProposalStatus(id,6);
                        gd1.updateProposalDateUpd(id);
                    }
                }
                // if no one vote
                else
                {
                    gd1.updateProposalStatus(id,6);
                    gd1.changeProposalFinalVerdict(id,-1);
                    gd1.pushInProposalStatus(id,6);
                    gd1.updateProposalDateUpd(id);
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

    /// @dev When proposal gets accepted,different functions are performed on the basis of Proposal's category number. 
    function actionAfterProposalPass(uint propid, uint16 cat) internal
    {
        gd1=governanceData(governanceDataAddress);
        t2 = NXMToken2(token2Address);
        c1=claims(claimAd);
        p1=pool(poolAd);
        t1=NXMToken(nxad);

        address _add;
        uint value;
        uint value1;
        bytes16 type0;
        // when category is "Burn fraudulent claim assessor tokens"
        if(cat == 2)
        {
            uint claimid=gd1.getProposalValue(propid,0);
            _add = gd1.getProposalAddress_Effect(propid,0);
            value = c1.getCATokensLockedAgainstClaim(_add, claimid);
            t2.burnCAToken(claimid,value,_add);
        }
        // when category is "Engage in external services up to the greater of $50,000USD " .
        else if(cat == 6 || cat==7)
        {
            _add = gd1.getProposalAddress_Effect(propid,0);
            value = gd1.getProposalValue(propid,0);
            if(gd1.isAB(_add)==1)
                p1.proposalExtServicesPayout( _add, value, propid);
        }
        // when category is to create new version of contracts
        else if(cat == 10)
        {
            ms1=master(masterAddress);
            ms1.switchToRecentVersion();
        }
        else if(cat==12)
        {
            ms1=master(masterAddress);
            value = gd1.getProposalValue(propid,0);
            // start/stop emergencyPause
            if(value==0)
            ms1.addEmergencyPause(false,"GOV"); 
            else if(value==1)
            ms1.addEmergencyPause(true,"GOV");
            
        }
        // changes in investment model
        else if(cat==13)
        {
            p3=pool3(pool3Address);
            type0= gd1.getProposalOptions(propid,0);
            bytes16 type1=gd1.getProposalOptions(propid,1);
            value = gd1.getProposalValue(propid,0);
            if (type0=="addIA")
            {
                _add = gd1.getProposalAddress_Effect(propid,0);
                value1 = gd1.getProposalValue(propid,1);
                p3.addInvestmentAssetsDetails(type1,_add,uint64(value),uint64(value1));
            }
            else if(type0=="updIA")
            {
                value1 = gd1.getProposalValue(propid,1);
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
              pd1=poolData1(poolDataAddress);
              pd1.change0xFeeRecipient(gd1.getProposalAddress_Effect(propid,0));
        }
    }
    /// @dev Changes the status of a given proposal when Proposal has insufficient funds.
    /// @param propid Proposal Id.
    function changeStatusFromPool(uint propid) onlyInternal
    {
        gd1=governanceData(governanceDataAddress);
        if(msg.sender == poolAd)
        {
            gd1.updateProposalStatus(propid,8);
            gd1.pushInProposalStatus(propid,8);
            gd1.updateProposalDateUpd(propid);
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
    // function removeAB(address memRem)
    // {
    //    ms1=master(masterAddress);
    //    if( ms1.isInternal(msg.sender) != 1 && ms1.isOwner(msg.sender)!=1) throw;
    //     gd1=governanceData(governanceDataAddress);
    //     if(gd1.isAB(memRem) == 0) throw;
    //     gd1.removeAB(memRem);
    //     gd1.addMemberStatusUpdate(memRem,0,now);
    // }

    //Governance 2
    /// @dev Edits a proposal and uncategorizes it. Only owner of a proposal can edit it.
    /// @param id Proposal Id.
    /// @param sd New Short Description of the proposal.
    /// @param ld New Long Description of the proposal.
    // function editProposal(uint id , string sd, string ld) 
    // {
    //     gd1 = governanceData(governanceDataAddress);
    //     if(msg.sender==gd1.getProposalOwner(id) && gd1.getProposalStatus(id) == 0 )
    //     {
    //         gd1.addProposalVersion(id,gd1.getProposalVersion(id),gd1.getProposalDateAdd(id));
    //         gd1.updateProposal(id,sd,0,ld,gd1.getProposalVersion(id)+1);
    //         //gd1.unCategoriseProposal(id);
    //     }
    //     else
    //         throw;

    // }
    /// @dev Creates a New Proposal 
    /// @param shortDesc Short Description of Proposal.
    /// @param longDesc Long Description of Proposal.
    /// @param _effect Address of user that will be effected with proposal's decision.
    /// @param value Amount, i.e. number of tokens to be burned or amount to be transferred in case of external services 
    /// @param cat Category Number of Proposal.
    // function addProposal(string shortDesc , string longDesc , address[] _effect , uint[] value , uint16 cat,bytes16[] options)
    // {
    //     gd1 = governanceData(governanceDataAddress);
    //     for(uint i=0; i<_effect.length;i++)
    //     {
    //         if(cat==2 && gd1.checkBurnVoterTokenAgaintClaim(value[i],_effect[i])==1)
    //             throw;
    //     }
    //     uint len = gd1.getAllProLength();
    //     //uint64 time = uint64(now);
    //     gd1.addNewProposal(len,msg.sender,shortDesc,longDesc);
    //     if(gd1.isAB(msg.sender)==1 && (cat==2 || cat==12))
    //     {
    //         gd1.updateCategorizeDetails2(len,cat,msg.sender);
    //         for(uint j=0; j<_effect.length;i++)
    //         {
    //             gd1.updateCategorizeDetails(len,_effect[j],value[j],options[j]);
                
    //             gd1.changeBurnVoterTokenAgaintClaim(value[j],_effect[j],1);
    //         }
    //         gd1.updateCategorisedProposal(len,1);
    //     }
    //     gd1.addInUserProposals(len,msg.sender);
    //     if(cat==12)
    //     {
    //         changeProposalStatus(len); //submit the proposal as well
    //     }
    //     else
    //         gd1.pushInProposalStatus(len,0);    
    // }
    /// @dev Registers an Advisroy Board Member's vote
    /// @param id Proposal id.
    /// @param verdict 1 if vote is in favour,-1 if vote is in against.
    function voteABProposal(uint id , int8 verdict)
    {
        gd1 = governanceData(governanceDataAddress);
        
        if(gd1.isAB(msg.sender)==0) throw;
        uint len = gd1.getVoteLength();
        gd1.incVoteLength();
        gd1.addVote(msg.sender,id,verdict);
        gd1.addInUserABVotes(len,msg.sender);
        gd1.addInProposalABVotes(id,len);
        gd1.updateUserProposalABVote(id,verdict,msg.sender);
        if(verdict==1)
            gd1.incPVCABAccept(id);
        else if(verdict==-1)
            gd1.incPVCABDeny(id);
    }
    /// @dev Members can give the votes(either in favor or in against) to a Proposal.
    /// @param id Proposal id.
    /// @param verdict 1 if vote is in favour,-1 if vote is in against.
    function voteMember(uint id , int8 verdict)
    {
        gd1 = governanceData(governanceDataAddress);
        
        if(gd1.isAB(msg.sender)==1) throw;
        uint len = gd1.getVoteLength();
        gd1.incVoteLength();
        gd1.addVote(msg.sender,id,verdict);
        gd1.addInUserMemberVotes(len,msg.sender);
        gd1.addInProposalMemberVotes(id,len);
        gd1.updateUserProposalMemberVote(id,verdict,msg.sender);
        if(verdict==1)
            gd1.incPVCMemberAccept(id);
        else if(verdict==-1)
            gd1.incPVCMemberDeny(id);
    }
    /// @dev Allows advisory board members to categorize proposals.Updates the Categorization details of a given proposal. 
    /// @param id Proposal Id.
    /// @param cat Category of proposal.
    /// @param _effect address of user which will get effected by proposal's decision.
    /// @param val depend upon the category of proposal. (Example: 1. if category is claim, then val will be Claim Id.2.For burning of tokens, val will be number of tokens that will be burned)
    // function categorizeProposal(uint id , uint16 cat , address[] _effect , uint[] val, bytes16[] options)
    // {
    //     gd1 = governanceData(governanceDataAddress);
    //     if(gd1.isAB(msg.sender)==0) throw;
    //     if(gd1.isProposalCategorised(id)==1) throw;
    //         gd1.updateCategorizeDetails2(id,cat,msg.sender);
    //     for(uint i=0;i<_effect.length;i++)
    //     {
    //         gd1.updateCategorizeDetails(id,_effect[i],val[i],options[i]);    
    //     }
    //     gd1.updateCategorisedProposal(id,1);
    // }

    /// @dev Allow AB Members to Start Emergency Pause
    function startEmergencyPause () checkPause {
        if(isAB(msg.sender)==1){
            ms1=master(masterAddress);
            ms1.addEmergencyPause(true,"AB"); //Start Emergency Pause
            p1=pool(poolAd);
            p1.closeEmergencyPause(ms1.getPauseTime()); //oraclize callback of 4 weeks
            c1=claims(claimAd);
            c1.PauseAllPendingClaimsVoting();   //Pause Voting of all pending Claims
        }
    }   
}
