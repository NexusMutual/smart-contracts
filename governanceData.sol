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
import "./master.sol";
contract governanceData {
    master ms1;
    address masterAddress;
    struct proposal{
        uint id;
        address owner;
        int finalVerdict;
        uint date_add;
        uint date_upd;
        uint category;
        uint status;
        string shortDesc;
        string longDesc;
        address categorizedBy;
        address address_effect;
        uint value;
        uint version;
    }
    struct versionData{
        uint version;
        string shortDesc;
        string longDesc;
        uint date_add;
    }


    struct Status{
        uint movedTo;
        uint date;
    }
    
    struct vote{
        address voter;
        uint proposalId;
        int verdict;
        uint date_submit;
    }
    struct VoteCount{
        uint acceptAB;
        uint denyAB;
        uint acceptMember;
        uint denyMember;
    } 
    uint public closingTime;
    uint public pendingProposalStart;
    uint public proposalLength;
    uint public totalMember;
    uint public quorumPerc;
     mapping(uint=>versionData[]) proposalIdVersions;
    mapping(uint=>mapping(address=>uint)) burnVoterTokenAgaintClaim;
   
    proposal[] allPro;
    vote[] allVotes;
    uint public vote_length;
    mapping(uint=>uint)  categorized;
    mapping ( address=>uint[] )  proposal_user;
    mapping (uint=>uint[])  proposalABVotes;
    mapping (uint=>uint[])  proposalMemberVotes;    
    mapping (address=>uint[])  user_AB_Votes; 
    mapping (address=>uint[])  user_Member_Votes; 
    mapping (address=>mapping(uint=>int))  userProposalABVote;
    mapping (address=>mapping(uint=>int))  userProposalMemberVote;
    mapping (uint=>Status[])  proposalStatus;
    mapping (address=>Status[])  member_status;
    mapping (uint=>VoteCount)  proposalVoteCount;
    
    mapping (address=>uint) public AB;
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

    function governanceData()
    {
        closingTime = 600;
        pendingProposalStart=0;
        quorumPerc=25;
        proposalLength = 0;
        
    }
    function checkIfTokensAlreadyBurned(uint claimid , address voter) constant returns(uint check)
    {
        if(burnVoterTokenAgaintClaim[claimid][voter]==1)
            check=1;
        else
            check=0;
    }
    function getProposalCategoryNo(uint id) constant returns(uint catno)
    {
        catno = allPro[id].category;
    }
    function changeTotalMember(uint num) onlyInternal
    {
        totalMember = num;
    }
    function getTotalMember() constant returns(uint num)
    {
        num = totalMember;
    }
    function getQuorumPerc() constant returns(uint perc)
    {
        perc = quorumPerc;
    }
    function changeQuorumperc(uint perc) onlyInternal
    {
        quorumPerc = perc;
    }
    function changeClosingTime(uint _time) onlyInternal
    {
        closingTime = _time;   
    }
    function getClosingTime()constant returns(uint time)
    {
        time = closingTime;
    }
    function getPendingProposalStart() constant returns(uint pps)
    {
        pps = pendingProposalStart;
    }
    function changePendingProposalStart(uint start) onlyInternal
    {
        pendingProposalStart = start;
    }
    function getAllProLength() constant returns(uint len)
    {
        len = allPro.length;    
    }
    function getProposalDateUpd(uint id) constant returns(uint dateupd)
    {
        dateupd = allPro[id].date_upd;
    }
    function updateProposalDateUpd(uint id , uint _date) onlyInternal
    {
        allPro[id].date_upd =_date;
    }
    function changeProposalFinalVerdict(uint id ,int verdict) onlyInternal
    {
        allPro[id].finalVerdict = verdict;
    }
    function isAB(address add) constant returns(uint _AB)
    {
        if(AB[add]==1)
            _AB=1;
        else
            _AB=0;
    }
    function getProposalOwner(uint id) constant returns(address own)
    {
        own = allPro[id].owner;
    }
    function getProposalStatus(uint id) constant returns(uint stat)
    {
       return allPro[id].status;
    }
    function getProposalSD(uint id) constant returns(string sd)
    {
        sd = allPro[id].shortDesc;
    }
    function getProposalLD(uint id) constant returns(string ld)
    {
        ld = allPro[id].longDesc;
    }
    function getProposalVersion(uint id) constant returns(uint vers)
    {
        vers = allPro[id].version;
    }
    function getProposalDateAdd(uint id) constant returns(uint _dateadd)
    {
        _dateadd = allPro[id].date_add;
    }
    function addProposalVersion(uint id,uint vno ,uint _date) onlyInternal
    {
        proposalIdVersions[id].push(versionData(vno ,allPro[id].shortDesc,allPro[id].longDesc,_date));            
    }
    function updateProposal(uint id,string sd,uint cat,string ld,uint _time,uint vno) onlyInternal
    {
        allPro[id].shortDesc = sd;
        allPro[id].category = cat;
        allPro[id].longDesc = ld;
        allPro[id].date_upd = _time;
        allPro[id].date_add = _time;
        allPro[id].version = vno;
    }
    function unCategoriseProposal(uint id) onlyInternal
    {
        allPro[id].category = 0;
    }
    function getAllProLengthFromNewStart() constant returns(uint len)
    {
        len = allPro.length - pendingProposalStart;
    }
    function checkBurnVoterTokenAgaintClaim(uint claimid,address _add)constant returns(uint check)
    {
        check = burnVoterTokenAgaintClaim[claimid][_add];
    }
    function changeBurnVoterTokenAgaintClaim(uint claimid,address _add , uint change) onlyInternal
    {
        burnVoterTokenAgaintClaim[claimid][_add] = change;
    }
    function addNewProposal(uint id,address _add,string sd,string ld,uint time) onlyInternal
    {
        allPro.push(proposal(id,_add,0,time,time,0,0,sd,ld,0,0,0,0));
    }
    function updateCategorizeDetails(uint id,address _effect,uint value,uint cat,address sender,uint time) onlyInternal
    {
        allPro[id].address_effect = _effect;
        allPro[id].value = value;
        allPro[id].category = cat;
        allPro[id].categorizedBy = msg.sender;
        allPro[id].date_upd = time;
    }
    function updateCategorisedProposal(uint id , uint categorised) onlyInternal
    {
        categorized[id]=categorised;
    }
    function isProposalCategorised(uint id)constant returns(uint check)
    {
        check=categorized[id];
    }
    function addInUserProposals(uint id , address _add) onlyInternal
    {
        proposal_user[_add].push(id);
    }
    function pushInProposalStatus(uint id , uint status,uint time) onlyInternal
    {
        proposalStatus[id].push(Status(status,time));
    }
    function getProposalById1(uint id,address _add) constant returns(int userABVote , uint proposalId , address owner ,string SD, string LD ,int userMemberVote, uint date_upd )
    {
        return(userProposalABVote[_add][id],allPro[id].id,allPro[id].owner,allPro[id].shortDesc,allPro[id].longDesc,userProposalMemberVote[_add][id],allPro[id].date_upd);
    }
    function getProposalById2(uint id) constant returns(uint proposalId , int vote , uint date ,uint cat ,uint stat , uint statusNumber , uint versionNo)
    {
       return(id,allPro[id].finalVerdict,allPro[id].date_add,allPro[id].category,allPro[id].status,allPro[id].status,allPro[id].version);
    } 
    function getVoteLength() constant returns(uint len)
    {
        len = vote_length;
    }
    function incVoteLength() onlyInternal
    {
        vote_length++;
    }
    function addVote(address _add,uint id,int verdict,uint time) onlyInternal
    {
        allVotes.push(vote(_add,id,verdict,time));
    }
    function addInUserABVotes(uint id,address _add) onlyInternal
    {
        user_AB_Votes[_add].push(id);
    }
    function addInUserMemberVotes(uint id ,address _add) onlyInternal
    {
        user_Member_Votes[_add].push(id);
    }
    function addInProposalABVotes(uint pid,uint vid) onlyInternal
    {
        proposalABVotes[pid].push(vid);
    }
    function addInProposalMemberVotes(uint pid , uint vid) onlyInternal
    {
        proposalMemberVotes[pid].push(vid);
    }
    function updateUserProposalABVote(uint pid,int verdict ,address _of) onlyInternal
    {
        userProposalABVote[_of][pid]=verdict;
    }
    function updateUserProposalMemberVote(uint pid ,int verdict , address _of) onlyInternal
    {
        userProposalMemberVote[_of][pid]=verdict;
    }
    function incPVCABAccept(uint id) onlyInternal
    {
        proposalVoteCount[id].acceptAB +=1;
    }
    function incPVCABDeny(uint id) onlyInternal
    {
        proposalVoteCount[id].denyAB +=1;
    }
    function incPVCMemberAccept(uint id) onlyInternal
    {
        proposalVoteCount[id].acceptMember +=1;
    }
    function incPVCMemberDeny(uint id) onlyInternal
    {
        proposalVoteCount[id].denyMember +=1;
    }
    function getProposalAllVotesCount(uint id) constant returns(uint ABAccept,uint ABDeny,uint MemberAccept,uint MemberDeny)
    {
        return(proposalVoteCount[id].acceptAB,proposalVoteCount[id].denyAB,proposalVoteCount[id].acceptMember,proposalVoteCount[id].denyMember);
    }
    function updateProposalStatus(uint id ,uint stat) onlyInternal
    {
        allPro[id].status = stat;
    }

    function getproposalIdVersions(uint proposalid,uint ind) constant returns( uint version,string shortDesc,string longDesc,uint date_add)
    {
       return  (proposalIdVersions[proposalid][ind].version,proposalIdVersions[proposalid][ind].shortDesc,proposalIdVersions[proposalid][ind].longDesc,proposalIdVersions[proposalid][ind].date_add);
    }

    function getVoteDetail(uint voteid) constant returns( address voter,uint proposalId,int verdict,uint date_submit)
    {
        return(allVotes[voteid].voter,allVotes[voteid].proposalId,allVotes[voteid].verdict,allVotes[voteid].date_submit);
    }

    function isCategorised(uint proposalid) constant returns(uint res)
    {
        return categorized[proposalid];
    }
    function getProposalValue(uint id)constant returns(uint val)
    {
        val = allPro[id].value;
    }
    function getProposalAddress_Effect(uint id)constant returns(address _add)
    {
        _add = allPro[id].address_effect;
    }
    function joinAB(address memAdd) onlyInternal
    {
        AB[memAdd] = 1;
    }
    function removeAB(address memRem) onlyInternal
    {
        AB[memRem] = 0;
    }
    function addMemberStatusUpdate(address _add ,uint status , uint time) onlyInternal
    {
        member_status[_add].push(Status(status,time));
    }

    function getProposalById3(uint id) constant returns(address categorizedBy,address address_effect,uint value)
    {
        return(allPro[id].categorizedBy,allPro[id].address_effect,allPro[id].value);
    }

    function getProposalUpdate(uint id) constant returns(uint date_upd)
    {
       return allPro[id].date_upd;
    }

    
}



        



        

