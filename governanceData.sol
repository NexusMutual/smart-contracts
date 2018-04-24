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
import "./master.sol";
import "./SafeMaths.sol";
contract governanceData
{
    using SafeMaths for uint;
    master ms;
    address masterAddress;
    struct proposal
    {
        uint id;
        address owner;
        int8 finalVerdict;
        uint date_add;
        uint date_upd;
        uint16 category;
        uint16 status;
        string shortDesc;
        string longDesc;
        address categorizedBy;
        address[] address_effect;
        uint[] value;
        uint64 version;
        bytes16[] options;
    }
    struct versionData
    {
        uint64 version;
        string shortDesc;
        string longDesc;
        uint date_add;
    }


    struct Status
    {
        uint movedTo;
        uint date;
    }
    
    struct vote
    {
        address voter;
        uint proposalId;
        int8 verdict;
        uint date_submit;
    }
    struct VoteCount
    {
        uint32 acceptAB;
        uint32 denyAB;
        uint32 acceptMember;
        uint32 denyMember;
    } 
    uint64 public closingTime;
    uint public pendingProposalStart;
    uint public proposalLength;
    uint public totalMember;
    uint32 public quorumPerc;
    mapping(uint=>versionData[]) proposalIdVersions;
    mapping(uint=>mapping(address=>uint8)) burnVoterTokenAgaintClaim;
   
    proposal[] allPro;
    vote[] allVotes;
    uint public vote_length;
    mapping(uint=>uint8)  categorized;
    mapping (address=>uint[] )  proposal_user;
    mapping (uint=>uint[])  proposalABVotes;
    mapping (uint=>uint[])  proposalMemberVotes;    
    mapping (address=>uint[])  user_AB_Votes; 
    mapping (address=>uint[])  user_Member_Votes; 
    mapping (address=>mapping(uint=>int8))  userProposalABVote;
    mapping (address=>mapping(uint=>int8))  userProposalMemberVote;
    mapping (uint=>Status[])  proposalStatus;
    mapping (address=>Status[])  member_status;
    mapping (uint=>VoteCount)  proposalVoteCount;
    mapping (address=>bool) public AB;
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

    function governanceData()
    {
        closingTime = 600;
        pendingProposalStart=0;
        quorumPerc=25;
        proposalLength = 0;
        
    }
    /// @dev Checks if the Tokens of a User for a given Claim Id has already been burnt or not.
    /// @return check 1 if the tokens are burnt,0 otherwise. 
    function checkIfTokensAlreadyBurned(uint claimid , address voter) constant returns(bool check)
    {
        if(burnVoterTokenAgaintClaim[claimid][voter]==1)
            check=true;
        else
            check=false;
    }
    /// @dev Gets the Category Number of a given proposal.
    function getProposalCategoryNo(uint id) constant returns(uint16 catno)
    {
        catno = allPro[id].category;
    }

    /// @dev Changes the total number of members.
    function changeTotalMember(uint num) onlyInternal
    {
        totalMember = num;
    }
    /// @dev Gets the total number of members.
    function getTotalMember() constant returns(uint num)
    {
        num = totalMember;
    }
    /// @dev Gets the Quorum Percentage.
    function getQuorumPerc() constant returns(uint32 perc)
    {
        perc = quorumPerc;
    }
    /// @dev Changes the Quorum Percentage.
    function changeQuorumperc(uint32 perc) onlyInternal
    {
        quorumPerc = perc;
    }
    /// @dev Changes the time(in milliseconds) after which proposal voting is closed.
    function changeClosingTime(uint64 _time) onlyInternal
    {
        closingTime = _time;   
    }
    /// @dev Gets the time(in milliseconds) after which proposal voting is closed.
    function getClosingTime()constant returns(uint64 time)
    {
        time = closingTime;
    }
    /// @dev Gets pending proposal start variable, which is the lowest proposal id with status number < 2(either draft status or pending vote status).
    function getPendingProposalStart() constant returns(uint pps)
    {
        pps = pendingProposalStart;
    }
     /// @dev Changes pending proposal start variable, which is the lowest proposal id with status number < 2(either draft status or pending vote status).
    function changePendingProposalStart(uint start) onlyInternal
    {
        pendingProposalStart = start;
    }
    /// @dev Gets the Number of the Proposals created till date.
    function getAllProLength() constant returns(uint len)
    {
        len = allPro.length;    
    }
  
    /// @dev Gets the timestamp of a given proposal at which Proposal's details has been last updated/changed.
    function getProposalDateUpd(uint id) constant returns(uint dateupd)
    {
        dateupd = allPro[id].date_upd;
    }

    /// @dev Sets the timestamp of a given proposal at which Proposal's details has been updated/changed.
    function updateProposalDateUpd(uint id) onlyInternal
    {
        allPro[id].date_upd=now;
    }

    /// @dev Sets the verdict of a given Proposal Id. 1 if the given proposal has been accepted ,-1 if declined. 
    function changeProposalFinalVerdict(uint id ,int8 verdict) onlyInternal
    {
        allPro[id].finalVerdict = verdict;
    }
    
    /// @dev Verifies whether a given address is a Advisory Board(AB) Member or not.
    /// @param add User address.
    /// @return _AB 1 if the address is an AB member,0 otherwise.
    function isAB(address add) constant returns(bool _AB)
    {
        if(AB[add]==true)
            _AB=true;
        else
            _AB=false;
    }
    /// @dev Gets the address of the owner of a given proposal.
    function getProposalOwner(uint id) constant returns(address own)
    {
        own = allPro[id].owner;
    }
    /// @dev Gets the status id of a given proposal.
    function getProposalStatus(uint id) constant returns(uint stat)
    {
       return allPro[id].status;
    }
    /// @dev Gets the Short Description of a given proposal.
    function getProposalSD(uint id) constant returns(string sd)
    {
        sd = allPro[id].shortDesc;
    }
    /// @dev Gets the Long Description of a given proposal.
    function getProposalLD(uint id) constant returns(string ld)
    {
        ld = allPro[id].longDesc;
    }
    /// @dev Gets the latest version number of a given proposal.
    function getProposalVersion(uint id) constant returns(uint64 vers)
    {
        vers = allPro[id].version;
    }

    /// @dev Gets the date of creation  of a given proposal.
    function getProposalDateAdd(uint id) constant returns(uint _dateadd)
    {
        _dateadd = allPro[id].date_add;
    }

    /// @dev Stores the information of a given version number of a given proposal.Maintains the record of all the versions of a proposal.
    function addProposalVersion(uint id,uint64 vno ,uint _date) onlyInternal
    {
        proposalIdVersions[id].push(versionData(vno ,allPro[id].shortDesc,allPro[id].longDesc,_date));            
    }
   
    /// @dev Edits the details of an existing proposal.
    /// @param id Exisiting Proposal Id 
    /// @param sd New Short Description.
    /// @param cat New Category Number.
    /// @param ld New Long Description.
    /// @param vno New version number. (Last version number+1)
    function updateProposal(uint id,string sd,uint16 cat,string ld,uint64 vno) onlyInternal
    {
        allPro[id].shortDesc = sd;
        allPro[id].category = cat;
        allPro[id].longDesc = ld;
        allPro[id].date_upd = now;
        allPro[id].date_add = now;
        allPro[id].version = vno;
    }
    
    /// @dev Gets the Number of proposals which are pending.
    function getAllProLengthFromNewStart() constant returns(uint len)
    {
        len = SafeMaths.sub(allPro.length , pendingProposalStart);
    }
    /// @dev Checks if the tokens of a given address have been burnt or not against a given claim id.
    /// @return check 1 if the tokens have been burnt,0 otherwise.
    function checkBurnVoterTokenAgaintClaim(uint claimid,address _add)constant returns(uint8 check)
    {
        check = burnVoterTokenAgaintClaim[claimid][_add];
    }
    /// @dev Changes the flag indicating whether CA tokens against a claim id have been burnt.
    /// @param claimid claim Id.
    /// @param _add User's address 
    /// @param change 1.
    function changeBurnVoterTokenAgaintClaim(uint claimid,address _add , uint8 change) onlyInternal
    {
        burnVoterTokenAgaintClaim[claimid][_add] = change;
    }

    /// @dev Creates a new proposal 
    /// @param id Proposal id.
    /// @param _add address of Owner of proposal.
    /// @param sd Short Description of proposal.
    /// @param ld Long Description of proposal.
    function addNewProposal(uint id,address _add,string sd,string ld) onlyInternal
    {
        allPro.push(proposal(id,_add,0,now,now,0,0,sd,ld,0,new address[](0),new uint[](0),0,new bytes16[](0)));
    }
    ///@dev Update proposal details when advisory board catogorizes it.
    function updateCategorizeDetails(uint id,uint16 cat,address sender,address[] _effect,uint[] value,bytes16[] option)onlyInternal
    {
        allPro[id].category = cat;
        allPro[id].categorizedBy =sender;
        allPro[id].date_upd = now;
        allPro[id].address_effect=_effect;
        allPro[id].value=value;
        allPro[id].options=option;
    }
   
    /// @dev Updates the Category Number of a given proposal.
    function updateCategorisedProposal(uint id , uint8 categorised) onlyInternal
    {
        categorized[id]=categorised;
    }
    /// @dev Verifies if a given proposal has been categorized or not.
    /// @param check 1 if proposal is categorized, 0 otherwise.
    function isProposalCategorised(uint id)constant returns(uint8 check)
    {
        check=categorized[id];
    }
    /// @dev Adds a given Proposal Id to a given address.Maintains the record of all the proposals created by an address.
    function addInUserProposals(uint id , address _add) onlyInternal
    {
        proposal_user[_add].push(id);
    }
    /// @dev Stores the Status information of a given proposal.
    /// @param id Proposal Id.
    /// @param status Status number of the proposal.
    function pushInProposalStatus(uint id , uint16 status) onlyInternal
    {
        proposalStatus[id].push(Status(status,now));
    }
    /// @dev Provides the information of a Proposal when given the id and address.
    /// @param id Proposal Id.
    /// @param _add User's address.
    /// @return userABVote 1 if vote given by user (as a Advisory Board) is in favor,-1 if vote is against the proposal,0 if vote is not given.
    /// @return proposalId Proposal id.
    /// @return owner Proposal's owner address.
    /// @return  SD Short Description of proposal.
    /// @return LD Long Description of proposal.
    /// @return userMemberVote 1 if vote given by user (as a Member) is in favor,-1 if vote is against the proposal,0 if vote is not given.
    /// @return date_upd last timestamp at which proposal has been updated
    function getProposalById1(uint id,address _add) constant returns(int8 userABVote , uint proposalId , address owner ,string SD, string LD ,int8 userMemberVote, uint date_upd )
    {
        return(userProposalABVote[_add][id],allPro[id].id,allPro[id].owner,allPro[id].shortDesc,allPro[id].longDesc,userProposalMemberVote[_add][id],allPro[id].date_upd);
    }
    /// @dev Provides the information of a Proposal when given the id.
    /// @param id Proposal id.
    /// @return proposalId Proposal Id.
    /// @return vote final decision of voting, 1 if proposal has been accepted,-1 if proposal has been declined,0 if voting decision is pending.
    /// @return date timestamp at which proposal has been created.
    /// @return cat Category of proposal.
    /// @return stat Status of proposal.
    /// @return versionNo Current version of proposal
    function getProposalById2(uint id) constant returns(uint proposalId , int8 vote , uint date ,uint16 cat ,uint16 stat , uint64 versionNo)
    {
       return(id,allPro[id].finalVerdict,allPro[id].date_add,allPro[id].category,allPro[id].status,allPro[id].version);
    } 
    /// @dev Gets the total number of votes given till date.
    function getVoteLength() constant returns(uint len)
    {
        len = vote_length;
    }
    /// @dev Increases the number of votes by 1.
    function incVoteLength() onlyInternal
    {
        vote_length=SafeMaths.add(vote_length,1);
    }
    /// @dev Adds the vote details.
    /// @param _add Voter's address.
    /// @param id Proposal's Id.
    /// @param verdict 1 if vote is in the favour,-1 if vote is against the proposal.
    function addVote(address _add,uint id,int8 verdict) onlyInternal
    {
        allVotes.push(vote(_add,id,verdict,now));
    }
    /// @dev Maps the given vote Id against the given Advisory board member's address.Maintains the record of all the votes an AB member has given till date.
    function addInUserABVotes(uint id,address _add) onlyInternal
    {
        user_AB_Votes[_add].push(id);
    }
    /// @dev Maps the given vote Id against the given Member's address.Maintains the record of all the votes a Member has given till date.
    function addInUserMemberVotes(uint id ,address _add) onlyInternal
    {
        user_Member_Votes[_add].push(id);
    }
    /// @dev Adds the given voter Id against the given Proposal's Id.Maintains the record of all the votes that have been given by the Advisory board members to a Proposal.
    function addInProposalABVotes(uint pid,uint vid) onlyInternal
    {
        proposalABVotes[pid].push(vid);
    }
    ///@dev Get votes cast by advisory board member.
    function getProposalABVotes(uint pid)constant returns(uint[] vid)
    {
        return proposalABVotes[pid];
    }
    /// @dev Maps the given vote Id against the given Proposal's Id.Maintains the record of all the votes that have been cast against a Proposal.    
    function addInProposalMemberVotes(uint pid , uint vid) onlyInternal
    {
        proposalMemberVotes[pid].push(vid);
    }
    ///@dev Get votes cast by member.
    function getProposalMemberVotes(uint pid) constant returns(uint[] vid)
    {
        return proposalMemberVotes[pid];
    }
    /// @dev Records a members vote on a given proposal id as an AB member.
    /// @param pid Proposal id.
    /// @param verdict Voting's decision 1 if accepted,-1 if declined.
    /// @param _of address of AB.
    function updateUserProposalABVote(uint pid,int8 verdict ,address _of) onlyInternal
    {
        userProposalABVote[_of][pid]=verdict;
    }
    /// @dev Records a members vote on a given proposal id.
    /// @param pid Proposal id.
    /// @param verdict Voting's decision 1 if accepted,-1 if declined.
    /// @param _of address of Member.
    function updateUserProposalMemberVote(uint pid ,int8 verdict , address _of) onlyInternal
    {
        userProposalMemberVote[_of][pid]=verdict;
    }
    /// @dev Increases the proposal's accept vote count, called when proposal is accepted by an Advisory board member.
    /// @param id Proposal id.
    function incPVCABAccept(uint id) onlyInternal
    {
        proposalVoteCount[id].acceptAB=SafeMaths.add32(proposalVoteCount[id].acceptAB,1);
    }
    /// @dev Increases the proposal's deny vote count, called when proposal is denied by an Advisory board member.
    /// @param id Proposal id.  
    function incPVCABDeny(uint id) onlyInternal
    {
        proposalVoteCount[id].denyAB =SafeMaths.add32(proposalVoteCount[id].denyAB,1);
    }
    /// @dev Increases the proposal's accept vote count, called when proposal is accepted by a member.
    /// @param id Proposal id.
    function incPVCMemberAccept(uint id) onlyInternal
    {
        proposalVoteCount[id].acceptMember =SafeMaths.add32(proposalVoteCount[id].acceptMember,1);
    }
    /// @dev Increases the proposal's deny vote count, called when proposal is denied by a member.
    /// @param id Proposal id.    
    function incPVCMemberDeny(uint id) onlyInternal
    {
        proposalVoteCount[id].denyMember =SafeMaths.add32(proposalVoteCount[id].denyMember,1);
    }
    /// @dev Gets the number of votes received against a given proposal.
    /// @param id Proposal id.
    /// @return ABAccept Number of votes given by AB Members in favour.
    /// @return ABDeny Number of votes given by AB Members against the proposal.
    /// @return MemberAccept Number of votes given by Members in favour.
    /// @return MemberDeny Number of votes given by Members against the proposal.
    function getProposalAllVotesCount(uint id) constant returns(uint32 ABAccept,uint32 ABDeny,uint32 MemberAccept,uint32 MemberDeny)
    {
        return(proposalVoteCount[id].acceptAB,proposalVoteCount[id].denyAB,proposalVoteCount[id].acceptMember,proposalVoteCount[id].denyMember);
    }
    /// @dev Updates  status of an existing proposal.
    /// @param id Exisiting Proposal Id.
    /// @param stat New Proposal's status.
    function updateProposalStatus(uint id,uint16 stat) onlyInternal
    {
        allPro[id].status = stat;
    }
    /// @dev Gets version details of a given proposal id.
    function getproposalIdVersions(uint proposalid,uint ind) constant returns( uint64 version,string shortDesc,string longDesc,uint date_add)
    {
       return  (proposalIdVersions[proposalid][ind].version,proposalIdVersions[proposalid][ind].shortDesc,proposalIdVersions[proposalid][ind].longDesc,proposalIdVersions[proposalid][ind].date_add);
    }
    /// @dev Provides Vote details of a given vote id. 
    function getVoteDetail(uint voteid) constant returns( address voter,uint proposalId,int8 verdict,uint date_submit)
    {
        return(allVotes[voteid].voter,allVotes[voteid].proposalId,allVotes[voteid].verdict,allVotes[voteid].date_submit);
    }
    /// @dev Gets value of a given proposal.
    function getProposalValue(uint id,uint indx)constant returns(uint val)
    {
        val = allPro[id].value[indx];
    }
    /// @dev Gets Effective address of a given proposal. 
    function getProposalAddress_Effect(uint id,uint indx)constant returns(address _add)
    {
        _add = allPro[id].address_effect[indx];
    }
    /// Test-ARJUNSB
    function getProposalOptions (uint id,uint indx) constant returns(bytes16 opt) {
        opt=allPro[id].options[indx];
    }
    /// @dev Adds a given address as an advisory board member.
    function joinAB(address memAdd) onlyInternal
    {
        AB[memAdd] = true;
    }
    /// @dev Removes a given address from the advisory board.
    function removeAB(address memRem) onlyInternal
    {
        AB[memRem] = false;
    }
    /// @dev Stores the AB joining date against a AB member's address.
    function addMemberStatusUpdate(address _add ,uint16 status , uint time) onlyInternal
    {
        member_status[_add].push(Status(status,time));
    }
    /// @dev Gets the Details of a given Proposal.
    /// @param id proposaL ID.
    /// @return categorizedBy address of the Advisory Board member who has done categorization of proposal.
    /// @return address_effect Address of user that will be effected with proposal's decision.
    /// @return value Amount, i.e. number of tokens to be burned or amount to be transferred in case of external services 
    function getProposalById3(uint id,uint indx) constant returns(address categorizedBy,address address_effect,uint value,bytes16 options)
    {
        return(allPro[id].categorizedBy,allPro[id].address_effect[indx],allPro[id].value[indx],allPro[id].options[indx]);
    } 
}
