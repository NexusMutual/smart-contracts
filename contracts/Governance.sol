// /* Copyright (C) 2017 GovBlocks.io

//   This program is free software: you can redistribute it and/or modify
//     it under the terms of the GNU General Public License as published by
//     the Free Software Foundation, either version 3 of the License, or
//     (at your option) any later version.

//   This program is distributed in the hope that it will be useful,
//     but WITHOUT ANY WARRANTY; without even the implied warranty of
//     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//     GNU General Public License for more details.

//   You should have received a copy of the GNU General Public License
//     along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity 0.4.24;

import "./Iupgradable.sol";
import "./EventCaller.sol";
import "./ProposalCategory.sol";
import "./MemberRoles.sol";
import "./NXMToken.sol";
import "./TokenController.sol";
import "./imports/openzeppelin-solidity/math/SafeMath.sol";
import "./imports/govblocks-protocol/interfaces/IGovernance.sol";


contract Governance is IGovernance, Iupgradable {

    using SafeMath for uint;

    enum ProposalStatus { 
        Draft,
        AwaitingSolution,
        VotingStarted,
        Accepted,
        Rejected,
        Majority_Not_Reached_But_Accepted,
        Denied,
        Majority_Not_Reached_But_Rejected
    }

    struct ProposalStruct {
        address owner;
        uint dateUpd;
    }

    struct ProposalData {
        uint propStatus;
        uint finalVerdict;
        uint category;
        // uint totalVoteValue;
        // uint majVoteValue;
        uint commonIncentive;
    }

    struct ProposalVote {
        address voter;
        // uint64 solutionChosen;
        uint proposalId;
        uint dateAdd;
        // uint voteValue;
    }

    struct VoteTally {
        mapping(uint=>uint) memberVoteValue;
        mapping(uint=>uint) abVoteValue;
        uint voters;
    }

    struct DelegateVote {
        address follower;
        address leader;
        uint lastUpd;
    }

    ProposalStruct[] internal allProposal;
    ProposalVote[] internal allVotes;
    DelegateVote[] public allDelegation;

    mapping(uint => ProposalData) internal allProposalData;
    mapping(uint => bytes[]) internal allProposalSolutions;
    mapping(address => uint[]) internal allVotesByMember;
    mapping(uint => mapping(address => bool)) public rewardClaimed; //voteid->member->reward claimed
    mapping (address => mapping(uint => uint)) public memberProposalVote;
    mapping (address => uint) public followerDelegation;
    mapping (address => uint[]) internal leaderDelegation;
    mapping (uint => VoteTally) public proposalVoteTally;

    bool internal constructorCheck;
    uint public tokenHoldingTime;
    uint internal roleIdAllowedToCatgorize;
    uint internal maxVoteWeigthPer;
    uint internal specialResolutionMajPerc;

    MemberRoles internal memberRole;
    ProposalCategory internal proposalCategory;
    TokenController internal tokenInstance;
    EventCaller internal eventCaller;
    NXMToken internal nxmToken;

    modifier onlyProposalOwner(uint _proposalId) {
        require(msg.sender == allProposal[_proposalId].owner, "Not authorized");
        _;
    }

    modifier voteNotStarted(uint _proposalId) {
        require(allProposalData[_proposalId].propStatus < uint(ProposalStatus.VotingStarted));
        _;
    }

    modifier isAllowed(uint _categoryId) {
        require(allowedToCreateProposal(_categoryId), "Not authorized");
        _;
    }

    modifier isAllowedToCategorize() {
        require(memberRole.checkRole(msg.sender, roleIdAllowedToCatgorize), "Not authorized");
        _;
    }

    modifier isMemberAndcheckPause {
        require(ms.isPause() == false && ms.isMember(msg.sender) == true);
        _;
    }

    modifier checkPendingRewards {
        require(getPendingReward(msg.sender) == 0, "Claim pending rewards");
        _;
    }

    modifier onlyOwner() {
        require (ms.isOwner(msg.sender));
        _;
    }


    event ProposalCategorized(
        uint indexed proposalId,
        address indexed categorizedBy,
        uint categoryId
    );

    function changeTokenHoldingTime(uint time) external onlyOwner {
        tokenHoldingTime = time;
    }
 
    function removeDelegation(address _add) external onlyInternal {
        _unDelegate(_add);
    }

    /// @dev Creates a new proposal
    /// @param _proposalDescHash Proposal description hash through IPFS having Short and long description of proposal
    /// @param _categoryId This id tells under which the proposal is categorized i.e. Proposal's Objective
    function createProposal(
        string _proposalTitle, 
        string _proposalSD, 
        string _proposalDescHash, 
        uint _categoryId
    ) 
        external isAllowed(_categoryId)
    {
        require (ms.isMember(msg.sender), "Not Member");

        _createProposal(_proposalTitle, _proposalSD, _proposalDescHash, _categoryId);
    }

    /// @dev Edits the details of an existing proposal
    /// @param _proposalId Proposal id that details needs to be updated
    /// @param _proposalDescHash Proposal description hash having long and short description of proposal.
    function updateProposal(
        uint _proposalId, 
        string _proposalTitle, 
        string _proposalSD, 
        string _proposalDescHash
    ) 
        external onlyProposalOwner(_proposalId)
    {
        require(
            allProposalSolutions[_proposalId].length < 2,
            "Solution submitted"
        );
        allProposalData[_proposalId].propStatus = uint(ProposalStatus.Draft);
        allProposalData[_proposalId].category = 0;
        allProposalData[_proposalId].commonIncentive = 0;
        emit Proposal(
            allProposal[_proposalId].owner,
            _proposalId,
            now,
            _proposalTitle, 
            _proposalSD, 
            _proposalDescHash
        );
    }

    /// @dev Categorizes proposal to proceed further. Categories shows the proposal objective.
    function categorizeProposal(
        uint _proposalId,
        uint _categoryId,
        uint _incentive
    )
        external
        voteNotStarted(_proposalId) isAllowedToCategorize
    {
        _categorizeProposal(_proposalId, _categoryId, _incentive);
    }

    /// @dev Initiates add solution
    //To implement the governance interface
    function addSolution(uint, string, bytes) external {
    }

    /// @dev Opens proposal for voting
    //To implement the governance interface
    function openProposalForVoting(uint) external {
    }

    /// @dev Submit proposal with solution
    /// @param _proposalId Proposal id
    /// @param _solutionHash Solution hash contains  parameters, values and description needed according to proposal
    function submitProposalWithSolution(
        uint _proposalId, 
        string _solutionHash, 
        bytes _action
    ) 
        external
        onlyProposalOwner(_proposalId)
    {
        _proposalSubmission(_proposalId, _solutionHash, _action);
    }

    /// @dev Creates a new proposal with solution
    /// @param _proposalDescHash Proposal description hash through IPFS having Short and long description of proposal
    /// @param _categoryId This id tells under which the proposal is categorized i.e. Proposal's Objective
    /// @param _solutionHash Solution hash contains  parameters, values and description needed according to proposal
    function createProposalwithSolution(
        string _proposalTitle, 
        string _proposalSD, 
        string _proposalDescHash,
        uint _categoryId, 
        string _solutionHash, 
        bytes _action
    ) 
        external isAllowed(_categoryId)
    {

        uint proposalId = allProposal.length;

        _createProposal(_proposalTitle, _proposalSD, _proposalDescHash, _categoryId);

        _proposalSubmission(
            proposalId,
            _solutionHash,
            _action
        );
    }

    /// @dev Creates a new proposal with solution and votes for the solution
    /// @param _proposalDescHash Proposal description hash through IPFS having Short and long description of proposal
    /// @param _categoryId This id tells under which the proposal is categorized i.e. Proposal's Objective
    /// @param _solutionHash Solution hash contains  parameters, values and description needed according to proposal
    function createProposalwithVote(
        string _proposalTitle, 
        string _proposalSD, 
        string _proposalDescHash,
        uint _categoryId, 
        string _solutionHash,
        bytes _action
    ) 
        external isAllowed(_categoryId)
    {

        uint proposalId = allProposal.length;

        _createProposal(_proposalTitle, _proposalSD, _proposalDescHash, _categoryId);

        _proposalSubmission(
            proposalId,
            _solutionHash,
            _action
        );

        _submitVote(proposalId, 1);
    }

    function submitVote(uint _proposalId, uint _solutionChosen) external {
        // require(addressProposalVote[msg.sender][_proposalId] == 0, "Already voted");

        require(allProposalData[_proposalId].propStatus == 
        uint(Governance.ProposalStatus.VotingStarted), "Not allowed");

        require(_solutionChosen <= allProposalSolutions[_proposalId].length, "Solution doesn't exist");

        _submitVote(_proposalId, _solutionChosen);
    }

    function closeProposal(uint _proposalId) external {
        uint category = allProposalData[_proposalId].category;
        
        
        uint _memberRole;
        
        require(canCloseProposal(_proposalId) == 1, "Cannot close");
        (, _memberRole, , , , , ) = proposalCategory.category(allProposalData[_proposalId].category);
        // max = 0;
        // //Change majority condition based on category and member role, create getABVerdict
        // if(proposalVoteTally[_proposalId].memberVoteValue[0] < proposalVoteTally[_proposalId].memberVoteValue[1])
        //     max = 1;

        // uint maxVote = proposalVoteTally[_proposalId].memberVoteValue[0];
        // if(maxVote < proposalVoteTally[_proposalId].memberVoteValue[1])
        //     maxVote = proposalVoteTally[_proposalId].memberVoteValue[1];
        if (_memberRole == uint(MemberRoles.Role.AdvisoryBoard)) {
            _closeABVote(_proposalId, category, _memberRole);
        } else {
            _closeMemberVote(_proposalId, category);
        }
        
    }

    function claimReward(address _memberAddress, uint[] _proposals) 
        external onlyInternal returns(uint pendingDAppReward) 
    {
        
        uint voteId;
        address leader;
        uint lastUpd;

        require (msg.sender == ms.getLatestAddress('CR'));

        uint delegationId = followerDelegation[_memberAddress];
        if (delegationId > 0 && allDelegation[delegationId].leader != address(0)) {
            leader = allDelegation[delegationId].leader;
            lastUpd = allDelegation[delegationId].lastUpd;
        } else
            leader = _memberAddress;
        
        for (uint i = 0; i < _proposals.length; i++) {

            voteId = memberProposalVote[leader][_proposals[i]];
            require(
                !rewardClaimed[voteId][_memberAddress],
                "Already claimed"
            );
            rewardClaimed[voteId][_memberAddress] = true;

            // finalVerdict = allProposalData[_proposals[i]].finalVerdict;
            require(
                allProposalData[_proposals[i]].propStatus > uint(ProposalStatus.VotingStarted),
                "Reward can be claimed only after the proposal is closed"
            );
            if ((allVotes[voteId].dateAdd > (lastUpd + tokenHoldingTime) || leader == _memberAddress) && 
                allVotes[voteId].voter == leader && proposalVoteTally[_proposals[i]].voters > 0) {

                pendingDAppReward += allProposalData[_proposals[i]].commonIncentive / 
                proposalVoteTally[_proposals[i]].voters;

            }
        }


    }

    function callRewardClaimedEvent(address _memberAddress, uint[] _proposals, uint pendingDAppReward) 
    external onlyInternal {
        emit RewardClaimed(
                _memberAddress,
                _proposals,
                pendingDAppReward
            );
    }

    function proposal(uint _proposalId)
        external
        view
        returns(
            uint proposalId,
            uint category,
            uint status,
            uint finalVerdict,
            uint totalRewar
        )
    {
        return(
            _proposalId,
            allProposalData[_proposalId].category,
            allProposalData[_proposalId].propStatus,
            allProposalData[_proposalId].finalVerdict,
            allProposalData[_proposalId].commonIncentive
        );
    }

    function proposalDetails(uint _proposalId) external view returns(uint, uint, uint) {
        return(
            _proposalId,
            allProposalSolutions[_proposalId].length,
            proposalVoteTally[_proposalId].voters
        );
    }

    function getSolutionAction(uint _proposalId, uint _solution) external view returns(uint, bytes) {
        return (
            _solution,
            allProposalSolutions[_proposalId][_solution]
        );
    }

    /// @dev Gets statuses of proposals
    /// @param _proposalLength Total proposals created till now.
    /// @param _draftProposals Proposal that are currently in draft or still getting updated.
    /// @param _pendingProposals Those proposals still open for voting
    /// @param _acceptedProposals Proposal those are submitted or accepted by majority voting
    /// @param _rejectedProposals Proposal those are rejected by majority voting.
    function getStatusOfProposals() 
        external 
        view 
        returns(
            uint _proposalLength, 
            uint _draftProposals,
            uint _awaitingSolution, 
            uint _pendingProposals, 
            uint _acceptedProposals, 
            uint _rejectedProposals
        ) 
    {
        uint proposalStatus;
        _proposalLength = allProposal.length;

        for (uint i = 0; i < _proposalLength; i++) {
            proposalStatus = allProposalData[i].propStatus;
            if (proposalStatus == uint(ProposalStatus.Draft)) {
                _draftProposals = SafeMath.add(_draftProposals, 1);
            } else if (proposalStatus == uint(ProposalStatus.AwaitingSolution)) {
                _awaitingSolution = SafeMath.add(_awaitingSolution, 1);
            } else if (proposalStatus == uint(ProposalStatus.VotingStarted)) {
                _pendingProposals = SafeMath.add(_pendingProposals, 1);
            } else if (proposalStatus == uint(ProposalStatus.Accepted) || proposalStatus == uint(ProposalStatus.Majority_Not_Reached_But_Accepted)) { //solhint-disable-line
                _acceptedProposals = SafeMath.add(_acceptedProposals, 1);
            } else {
                _rejectedProposals = SafeMath.add(_rejectedProposals, 1);
            }
        }
    }

    function getProposalLength() external view returns(uint) {
        return (allProposal.length);
    }

    function getFollowers(address _add) external view returns(uint[]) {
        return leaderDelegation[_add];
    }

    function delegateVote(address _add) external isMemberAndcheckPause checkPendingRewards {

        //Check if given address is not a follower
        require(allDelegation[followerDelegation[_add]].leader == address(0));

        if(followerDelegation[msg.sender] > 0){
            require(SafeMath.add(allDelegation[followerDelegation[msg.sender]].lastUpd, tokenHoldingTime) < now);
        }

        require(!alreadyDelegated(msg.sender), "already delegated by someone");

        if (allVotesByMember[msg.sender].length>0) {
            uint memberLastVoteId = SafeMath.sub(allVotesByMember[msg.sender].length, 1);
            require(SafeMath.add(allVotes[allVotesByMember[msg.sender][memberLastVoteId]].dateAdd, tokenHoldingTime) < now);
        }

        if (memberRole.checkRole(msg.sender, uint(MemberRoles.Role.AdvisoryBoard)))
            require(memberRole.checkRole(_add, uint(MemberRoles.Role.AdvisoryBoard)));

        // require(getPendingReward(msg.sender) == 0);

        require(ms.isMember(_add));

        allDelegation.push(DelegateVote(msg.sender, _add, now));
        followerDelegation[msg.sender] = allDelegation.length - 1;
        leaderDelegation[_add].push(allDelegation.length - 1);

    }

    function unDelegate() external isMemberAndcheckPause checkPendingRewards {
        _unDelegate(msg.sender);
    }

    /// @dev updates all dependency addresses to latest ones from Master
    function changeDependentContractAddress() public {
        if (!constructorCheck) {
            initiateGovernance();
        }
        tokenInstance = TokenController(ms.getLatestAddress("TC"));
        memberRole = MemberRoles(ms.getLatestAddress("MR"));
        proposalCategory = ProposalCategory(ms.getLatestAddress("PC"));        
        eventCaller = EventCaller(ms.getEventCallerAddress());
        nxmToken = NXMToken(ms.tokenAddress());
    }

    /// @dev checks if the msg.sender is allowed to create a proposal under certain category
    function allowedToCreateProposal(uint category) public view returns(bool check) {
        if (category == 0)
            return true;
        uint[] memory mrAllowed;
        (, , , , mrAllowed, , ) = proposalCategory.category(category);
        for (uint i = 0; i < mrAllowed.length; i++) {
            if (mrAllowed[i] == 0 || memberRole.checkRole(msg.sender, mrAllowed[i]))
                return true;
        }
    }

    function alreadyDelegated(address _add) public view returns(bool delegated) {
        for (uint i=0; i < leaderDelegation[_add].length; i++) {
            if (allDelegation[leaderDelegation[_add][i]].leader == _add) {
                return true;
            }
        }
    }

    /// @dev pause a proposal
    //To implement govblocks interface
    function pauseProposal(uint) public {
    }

    /// @dev resume a proposal
    //To implement govblocks interface
    function resumeProposal(uint) public {
    }

    function getPendingReward(address _memberAddress)
        public view returns(uint pendingDAppReward)
    {
        pendingDAppReward = 0;
        uint delegationId = followerDelegation[_memberAddress];
        address leader;
        uint lastUpd;
        if (delegationId > 0 && allDelegation[delegationId].leader != address(0)) {
            leader = allDelegation[delegationId].leader;
            lastUpd = allDelegation[delegationId].lastUpd;
        } else
            leader = _memberAddress;

        uint proposalId;
        for (uint i = 0; i < allVotesByMember[leader].length; i++) {  
            if (allVotes[allVotesByMember[leader][i]].dateAdd > (
                lastUpd + tokenHoldingTime) || leader == _memberAddress) {
                if (!rewardClaimed[allVotesByMember[leader][i]][_memberAddress]) {
                    proposalId = allVotes[allVotesByMember[leader][i]].proposalId;
                    if (proposalVoteTally[proposalId].voters > 0 && allProposalData[proposalId].propStatus > uint(ProposalStatus.VotingStarted))
                        pendingDAppReward += allProposalData[proposalId].commonIncentive / 
                        proposalVoteTally[proposalId].voters;
                }
            }
        }
    }

    /// @dev Checks If the proposal voting time is up and it's ready to close 
    ///      i.e. Closevalue is 1 if proposal is ready to be closed, 2 if already closed, 0 otherwise!
    /// @param _proposalId Proposal id to which closing value is being checked
    function canCloseProposal(uint _proposalId) 
        public 
        view 
        returns(uint closeValue)
    {
        uint dateUpdate;
        uint pStatus;
        uint _closingTime;
        uint _roleId;
        uint majority;
        pStatus = allProposalData[_proposalId].propStatus;
        dateUpdate = allProposal[_proposalId].dateUpd;
        (, _roleId, majority, , , _closingTime, ) = proposalCategory.category(allProposalData[_proposalId].category);
        if (
            pStatus == uint(ProposalStatus.VotingStarted)
        ) {
            uint numberOfMembers = memberRole.numberOfMembers(_roleId);
            if (_roleId == uint(MemberRoles.Role.AdvisoryBoard)) {
                uint totalABVoted = proposalVoteTally[_proposalId].abVoteValue[1] + 
                proposalVoteTally[_proposalId].abVoteValue[0];
                if (proposalVoteTally[_proposalId].abVoteValue[1].mul(100).div(numberOfMembers) >= majority  
                || totalABVoted == numberOfMembers || dateUpdate.add(_closingTime) <= now) {

                    closeValue = 1;
                }
            } else {
                if (numberOfMembers == proposalVoteTally[_proposalId].voters 
                || dateUpdate.add(_closingTime) <= now)
                    closeValue = 1;
            }
        } else if (pStatus > uint(ProposalStatus.VotingStarted)) {
            closeValue = 2;
        } else {
            closeValue = 0;
        }
    }

    function allowedToCatgorize() public view returns(uint roleId) {
        return roleIdAllowedToCatgorize;
    }

    function voteTallyData(uint _proposalId, uint _solution) public constant returns(uint, uint, uint) {
        return (proposalVoteTally[_proposalId].memberVoteValue[_solution],
            proposalVoteTally[_proposalId].abVoteValue[_solution], proposalVoteTally[_proposalId].voters);
    }

    function _createProposal(
        string _proposalTitle,
        string _proposalSD,
        string _proposalDescHash,
        uint _categoryId
    )
        internal
    {
        require(proposalCategory.categoryABReq(_categoryId) == 0 || _categoryId == 0);
        uint _proposalId = allProposal.length;
        allProposal.push(ProposalStruct(msg.sender, now));
        allProposalSolutions[_proposalId].push("");

        if (_categoryId > 0)
            _categorizeProposal(_proposalId, _categoryId, 0);        

        emit Proposal(
            msg.sender,
            _proposalId,
            now,
            _proposalTitle,
            _proposalSD,
            _proposalDescHash
        );
        eventCaller.callProposalCreated(
            _proposalId,
            _categoryId,
            address(ms),
            _proposalDescHash
        );
    }

    function _categorizeProposal(
        uint _proposalId,
        uint _categoryId,
        uint _incentive
    )
        internal
    {
        require(
            _categoryId > 0 && _categoryId < proposalCategory.totalCategories(),
            "Invalid category"
        );
        allProposalData[_proposalId].category = _categoryId;
        allProposalData[_proposalId].commonIncentive = _incentive;
        allProposalData[_proposalId].propStatus = uint(ProposalStatus.AwaitingSolution);

        emit ProposalCategorized(_proposalId, msg.sender, _categoryId);
    }

    function _addSolution(uint _proposalId, bytes _action, string _solutionHash)
        internal
    {
        allProposalSolutions[_proposalId].push(_action);
        emit Solution(_proposalId, msg.sender, allProposalSolutions[_proposalId].length - 1, _solutionHash, now);
    }

    /// @dev When creating or submitting proposal with solution, This function open the proposal for voting
    function _proposalSubmission(
        uint _proposalId,
        string _solutionHash,
        bytes _action
    )
        internal
    {

        _addSolution(
            _proposalId,
            _action,
            _solutionHash
        );

        _openProposalForVoting(
            _proposalId
        );
    }

    function _submitVote(uint _proposalId, uint _solution) internal {

        uint delegationId = followerDelegation[msg.sender];
        uint mrSequence;
        uint majority;
        uint closingTime;
        (, mrSequence, majority, , , closingTime, ) = proposalCategory.category(allProposalData[_proposalId].category);

        require (allProposal[_proposalId].dateUpd.add(closingTime) > now, "Closed");

        require(memberProposalVote[msg.sender][_proposalId] == 0);
        require((delegationId == 0) || (delegationId > 0 && allDelegation[delegationId].leader == address(0) && 
        _checkLastUpd(allDelegation[delegationId].lastUpd)));

        require(memberRole.checkRole(msg.sender, mrSequence));


        uint totalVotes = allVotes.length;

        allVotesByMember[msg.sender].push(totalVotes);
        memberProposalVote[msg.sender][_proposalId] = totalVotes;

        // addressProposalVote[msg.sender][_proposalId] = totalVotes;
        allVotes.push(ProposalVote(msg.sender, _proposalId, now));

        _setVoteTally(_proposalId, _solution, mrSequence);
        emit Vote(msg.sender, _proposalId, totalVotes - 1, now, _solution);

        uint numberOfMembers = memberRole.numberOfMembers(mrSequence);

        if (mrSequence == uint(MemberRoles.Role.AdvisoryBoard)) {
            uint totalABVoted = proposalVoteTally[_proposalId].abVoteValue[1] + 
            proposalVoteTally[_proposalId].abVoteValue[0];
            if (proposalVoteTally[_proposalId].abVoteValue[1].mul(100).div(numberOfMembers) >= majority || totalABVoted == numberOfMembers) {
                eventCaller.callVoteCast(_proposalId);
            }
        } else {
            if (numberOfMembers == proposalVoteTally[_proposalId].voters)
                eventCaller.callVoteCast(_proposalId);
        }

    }

    function _setVoteTally(uint _proposalId, uint _solution, uint mrSequence) internal
    {
        uint category = allProposalData[_proposalId].category;
        uint voteWeight;
        uint voteWeightAB;
        uint voters = 1;
        uint isSpecialResolution = proposalCategory.isSpecialResolution(category);
        uint tokenBalance = tokenInstance.totalBalanceOf(msg.sender);
        uint totalSupply = nxmToken.totalSupply();
        if(isSpecialResolution == 1){
            voteWeight = tokenBalance + 10**18;
        }
        else {
            voteWeight = (minOf(tokenBalance, maxVoteWeigthPer.mul(totalSupply).div(100))) + 10**18;
        }
        if (memberRole.checkRole(msg.sender, 1) && (proposalCategory.categoryABReq(category) > 0) || 
            mrSequence == uint(MemberRoles.Role.AdvisoryBoard))
            voteWeightAB = 1;
        uint delegationId;
        tokenInstance.lockForMemberVote(msg.sender, tokenHoldingTime);
        for (uint i = 0; i < leaderDelegation[msg.sender].length; i++) {
            delegationId = leaderDelegation[msg.sender][i];
            if (allDelegation[delegationId].leader == msg.sender && 
            _checkLastUpd(allDelegation[delegationId].lastUpd)) {
                tokenBalance = tokenInstance.totalBalanceOf(allDelegation[delegationId].follower);
                if(memberRole.checkRole(allDelegation[delegationId].follower, mrSequence)) {
                    tokenInstance.lockForMemberVote(allDelegation[delegationId].follower, tokenHoldingTime);
                }
                if(isSpecialResolution == 1) {
                    voteWeight += tokenBalance + 10**18;
                }
                else{
                    voteWeight += (minOf(tokenBalance, maxVoteWeigthPer.mul(totalSupply).div(100))) + 10**18;
                }
                voters++;
                if ((proposalCategory.categoryABReq(category) > 0 || mrSequence==uint(MemberRoles.Role.AdvisoryBoard)) && 
                memberRole.checkRole(allDelegation[delegationId].follower, 1)) {
                    voteWeightAB += 1;
                }
            }
            

        }
        if (mrSequence == uint(MemberRoles.Role.Member)) {
            proposalVoteTally[_proposalId].memberVoteValue[_solution] += voteWeight;
            proposalVoteTally[_proposalId].voters += voters;
        }
        proposalVoteTally[_proposalId].abVoteValue[_solution] += voteWeightAB;
    }

    function minOf(uint a, uint b) internal pure returns(uint res) {
        res = a;
        if (res > b)
            res = b;
    }
    
    function _checkLastUpd(uint _lastUpd) internal view returns(bool) {
        return (now - _lastUpd) > tokenHoldingTime;
    }

    /// @dev Checks if the vote count against any solution passes the threshold value or not.
    function _checkForThreshold(uint _proposalId, uint _category) internal view returns(bool check) {
        uint categoryQuorumPerc;
        uint roleId;
        check = false;
        (, roleId, , categoryQuorumPerc, , , ) = proposalCategory.category(_category);
        uint totalTokenVoted = proposalVoteTally[_proposalId].memberVoteValue[0]
        +proposalVoteTally[_proposalId].memberVoteValue[1];
        check = totalTokenVoted.mul(100).div(nxmToken.totalSupply() + memberRole.numberOfMembers(uint(MemberRoles.Role.Member))) > categoryQuorumPerc;
    }

    // /// @dev This does the remaining functionality of closing proposal vote
    // function closeProposalVoteThReached(
    //     uint maxVoteValue,
    //     uint totalVoteValue,
    //     uint category,
    //     uint _proposalId,
    //     uint max
    // )
    //     internal
    // {

    //     uint _majorityVote;

    //     allProposalData[_proposalId].finalVerdict = max;
    //     (, , _majorityVote, , , , ) = proposalCategory.category(category);

    //     if (SafeMath.div(SafeMath.mul(maxVoteValue, 100), totalVoteValue) >= _majorityVote) {
    //         if (max > 0) {
    //             _callIfMajReach(_proposalId, uint(ProposalStatus.Accepted), category, max);
    //         } else {
    //             _updateProposalStatus(_proposalId, uint(ProposalStatus.Rejected));
    //         }
    //     } else {
    //         if (max > 0)
    //             _updateProposalStatus(_proposalId, uint(ProposalStatus.Majority_Not_Reached_But_Accepted));
    //         else
    //             _updateProposalStatus(_proposalId, uint(ProposalStatus.Majority_Not_Reached_But_Rejected));
    //     }
    // }

    function _callIfMajReach(uint _proposalId, uint _status, uint category, uint max) internal {
        bytes2 contractName;
        address actionAddress;

        allProposalData[_proposalId].finalVerdict = max;

        (, actionAddress, contractName, ) = proposalCategory.categoryAction(category);
        _updateProposalStatus(_proposalId, _status);
        if (contractName == "MS") {
            actionAddress = address(ms);
        } else if (contractName != "EX") {
            actionAddress = ms.getLatestAddress(contractName);
        }

        if (actionAddress.call(allProposalSolutions[_proposalId][max])) { //solhint-disable-line
            eventCaller.callActionSuccess(_proposalId);
        }

        eventCaller.callProposalAccepted(_proposalId);
    }

    function _updateProposalStatus(uint _proposalId, uint _status) internal {
        allProposal[_proposalId].dateUpd = now;
        allProposalData[_proposalId].propStatus = _status;
    }

    function _unDelegate(address _follower) internal {
        uint followerId = followerDelegation[_follower];
        if(followerId > 0) {
            allDelegation[followerId].leader = address(0);
            allDelegation[followerId].lastUpd = now;
        }
    }

    function _closeMemberVote(uint _proposalId, uint category) internal {
        uint totalVoteValue;
        uint majorityVote;
        if (proposalCategory.isSpecialResolution(category) == 1) {
            uint acceptedVotePerc = proposalVoteTally[_proposalId].memberVoteValue[1].mul(100).div(nxmToken.totalSupply() + (memberRole.numberOfMembers(uint(MemberRoles.Role.Member))) * 10**18);
            if (acceptedVotePerc >= specialResolutionMajPerc) {
                _callIfMajReach(_proposalId, uint(ProposalStatus.Accepted), category, 1);
            }
            else {
                _updateProposalStatus(_proposalId, uint(ProposalStatus.Denied));
            }
        }
        else{
            if (_checkForThreshold(_proposalId, category)) {
                totalVoteValue = proposalVoteTally[_proposalId].memberVoteValue[0] + 
                proposalVoteTally[_proposalId].memberVoteValue[1];
                (, , majorityVote, , , , ) = proposalCategory.category(category);
                if (SafeMath.div(SafeMath.mul(proposalVoteTally[_proposalId].memberVoteValue[1], 100), totalVoteValue) >= majorityVote) {
                    _callIfMajReach(_proposalId, uint(ProposalStatus.Accepted), category, 1);
                }
                else {
                    _updateProposalStatus(_proposalId, uint(ProposalStatus.Rejected));
                }
            } else {
                uint abMaj = proposalCategory.categoryABReq(category);
                uint abMem = memberRole.numberOfMembers(uint(MemberRoles.Role.AdvisoryBoard));
                if (abMaj > 0 && proposalVoteTally[_proposalId].abVoteValue[1].mul(100).div(abMem) >= abMaj) {
                    _callIfMajReach(_proposalId, uint(ProposalStatus.Accepted), category, 1);
                } else {
                    _updateProposalStatus(_proposalId, uint(ProposalStatus.Denied));
                }
            }
        }

        if(proposalVoteTally[_proposalId].voters > 0) {
            tokenInstance.mint(ms.getLatestAddress("CR"), allProposalData[_proposalId].commonIncentive);
        }
    }

    function _closeABVote(uint _proposalId, uint category, uint _roleId) internal {
        uint _majorityVote;
        uint abMem = memberRole.numberOfMembers(_roleId);
        (, , _majorityVote, , , , ) = proposalCategory.category(category);
        if (proposalVoteTally[_proposalId].abVoteValue[1].mul(100).div(abMem) >= _majorityVote) {
            
            _callIfMajReach(_proposalId, uint(ProposalStatus.Accepted), category, 1);
        } else {
            _updateProposalStatus(_proposalId, uint(ProposalStatus.Denied));
        }

    }

    function _openProposalForVoting(uint _proposalId) internal {

        require(allProposalData[_proposalId].category != 0, "Categorize the proposal");        
        _updateProposalStatus(_proposalId, uint(ProposalStatus.VotingStarted));
        uint closingTime;
        (, , , , , closingTime, ) = proposalCategory.category(allProposalData[_proposalId].category);
        eventCaller.callCloseProposalOnTimeAtAddress(_proposalId, address(this), SafeMath.add(closingTime, now));
    }

    function initiateGovernance() internal {
        allVotes.push(ProposalVote(address(0), 0, 0));
        allProposal.push(ProposalStruct(address(0), now));
        allDelegation.push(DelegateVote(address(0), address(0), now));
        tokenHoldingTime = 1 * 7 days;
        maxVoteWeigthPer = 5;
        constructorCheck = true;
        roleIdAllowedToCatgorize = uint(MemberRoles.Role.AdvisoryBoard);
        specialResolutionMajPerc = 75;
    }

}