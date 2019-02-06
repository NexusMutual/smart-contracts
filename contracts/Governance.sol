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
import "./TokenData.sol";
import "./TokenFunctions.sol";
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
    mapping(uint => bool) public proposalPaused;
    mapping(uint => mapping(address => bool)) public rewardClaimed; //voteid->member->reward claimed
    mapping (address => mapping(uint => uint)) public memberProposalVote;
    mapping (address => uint) public followerDelegation;
    mapping (address => uint[]) internal leaderDelegation;
    mapping (uint => VoteTally) public proposalVoteTally;

    bool internal constructorCheck;
    uint internal minVoteWeight;
    uint public tokenHoldingTime;
    uint internal roleIdAllowedToCatgorize;
    uint internal maxVoteWeigthPer;

    IMemberRoles internal memberRole;
    ProposalCategory internal proposalCategory;
    TokenController internal tokenInstance;
    EventCaller internal eventCaller;
    TokenFunctions internal tokenFunction;
    NXMToken internal nxmToken;
    TokenData internal tokenData;

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
 
    function removeDelegation(address _add) external onlyInternal {
        uint delegationId = followerDelegation[_add];
        if (delegationId > 0) {
            require(!tokenFunction.isLockedForMemberVote(
                allDelegation[delegationId].leader), "leader voted");
            allDelegation[delegationId].leader = address(0);
            allDelegation[delegationId].lastUpd = now;
        }
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
        require(
            allProposalSolutions[_proposalId].length < 2,
            "Solutions had already been submitted"
        );

        _categorizeProposal(_proposalId, _categoryId, _incentive);
    }

    /// @dev Initiates add solution
    /// @param _solutionHash Solution hash having required data against adding solution
    function addSolution(
        uint _proposalId, 
        string _solutionHash, 
        bytes _action
    ) 
        external
    {
        require(
            allProposalData[_proposalId].propStatus == uint(Governance.ProposalStatus.AwaitingSolution),
            "Not in solutioning phase"
        );

        _addSolution(_proposalId, _action, _solutionHash);
    }

    /// @dev Opens proposal for voting
    function openProposalForVoting(uint _proposalId)
        external onlyProposalOwner(_proposalId) voteNotStarted(_proposalId)
    {
        require(
            allProposalSolutions[_proposalId].length > 1,
            "Add more solutions"
        );
        _openProposalForVoting(_proposalId);
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

    /// @dev Creates a new proposal with solution and votes for the solution
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
            closeABVote(_proposalId, category, _memberRole);
        } else {
            closeMemberVote(_proposalId, category, _memberRole);
        }
        
    }

    function claimReward(address _memberAddress, uint[] _proposals) 
        external onlyInternal returns(uint pendingDAppReward) 
    {
        
        uint voteId;
        address leader;
        uint lastUpd;
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
                "Reward already claimed"
            );
            rewardClaimed[voteId][_memberAddress] = true;

            // finalVerdict = allProposalData[_proposals[i]].finalVerdict;
            require(
                allProposalData[_proposals[i]].propStatus > uint(ProposalStatus.VotingStarted),
                "Reward can be claimed only after the proposal is closed"
            );
            if ((allVotes[voteId].dateAdd > (lastUpd + tokenHoldingTime) || leader == _memberAddress) && 
                allVotes[voteId].voter == leader) {

                pendingDAppReward += allProposalData[_proposals[i]].commonIncentive / 
                proposalVoteTally[_proposals[i]].voters;
                
            }
        }

        if (pendingDAppReward > 0) {
            require(nxmToken.transfer(msg.sender, pendingDAppReward));
            emit RewardClaimed(
                _memberAddress,
                _proposals,
                pendingDAppReward
            );
        }

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

    function delegateVote(address _add) public isMemberAndcheckPause {

        require(getPendingReward(msg.sender) == 0);

        if (memberRole.checkRole(msg.sender, uint(MemberRoles.Role.AdvisoryBoard)))
            require(memberRole.checkRole(_add, uint(MemberRoles.Role.AdvisoryBoard)));
        
        require(!alreadyDelegated(msg.sender), "already delegated by someone");
        
        _delegateVote(_add);
        
    }

    function unDelegate() public isMemberAndcheckPause {

        require(getPendingReward(msg.sender) == 0);
        _delegateVote(address(0));
        
    }

    /// @dev updates all dependency addresses to latest ones from Master
    function changeDependentContractAddress() public {
        if (!constructorCheck) {
            initiateGovernance();
        }
        tokenInstance = TokenController(ms.getLatestAddress("TC"));
        memberRole = IMemberRoles(ms.getLatestAddress("MR"));
        proposalCategory = ProposalCategory(ms.getLatestAddress("PC"));        
        eventCaller = EventCaller(ms.getEventCallerAddress());
        tokenFunction = TokenFunctions(ms.getLatestAddress("TF"));
        nxmToken = NXMToken(ms.tokenAddress());
        tokenData = TokenData(ms.getLatestAddress("TD"));
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

        delegated = false;
        for (uint i=0; i < leaderDelegation[_add].length; i++) {
            if (allDelegation[leaderDelegation[_add][i]].leader == _add) {
                return true;
            }
        }

    }

    /// @dev pause a proposal
    function pauseProposal(uint _proposalId) public onlyInternal {
        proposalPaused[_proposalId] = true;
        allProposal[_proposalId].dateUpd = now;
    }

    /// @dev resume a proposal
    function resumeProposal(uint _proposalId) public onlyInternal {
        require(proposalPaused[_proposalId]);
        proposalPaused[_proposalId] = false;
        allProposal[_proposalId].dateUpd = now;
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
                    pendingDAppReward += ((proposalVoteTally[proposalId].memberVoteValue[0] + 
                        proposalVoteTally[proposalId].memberVoteValue[1]) / proposalVoteTally[proposalId].voters);
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
        require(!proposalPaused[_proposalId]);
        pStatus = allProposalData[_proposalId].propStatus;
        dateUpdate = allProposal[_proposalId].dateUpd;
        // (, _category, , dateUpdate, , pStatus) = governanceDat.getProposalDetailsById(_proposalId);
        (, _roleId, , , , _closingTime, ) = proposalCategory.category(allProposalData[_proposalId].category);
        if (
            pStatus == uint(ProposalStatus.VotingStarted) &&
            // _roleId != uint(MemberRoles.Role.TokenHolder) &&
            _roleId != uint(MemberRoles.Role.UnAssigned)
        ) {
            if (_roleId == uint(MemberRoles.Role.AdvisoryBoard)) {
                uint abMaj;
                (, , abMaj, , , , ) = proposalCategory.category(allProposalData[_proposalId].category);
                uint abMem = memberRole.numberOfMembers(_roleId);
                uint totalABVoted = proposalVoteTally[_proposalId].abVoteValue[1] + 
                proposalVoteTally[_proposalId].abVoteValue[0];
                if (proposalVoteTally[_proposalId].abVoteValue[1].mul(100).div(abMem) >= abMaj  
                || totalABVoted == abMem || dateUpdate.add(_closingTime) <= now) {

                    closeValue = 1;
                }
            } else {
                if (memberRole.numberOfMembers(_roleId) == proposalVoteTally[_proposalId].voters 
                || dateUpdate.add(_closingTime) <= now)
                    closeValue = 1;
            }
                // closeValue = 1;
        } else if (pStatus == uint(ProposalStatus.VotingStarted)) {
            if (SafeMath.add(dateUpdate, _closingTime) <= now) //solhint-disable-line
                closeValue = 1;
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

        require(memberProposalVote[msg.sender][_proposalId] == 0);        
        require((delegationId == 0) || (delegationId > 0 && allDelegation[delegationId].leader == address(0) && 
        checkLastUpd(allDelegation[delegationId].lastUpd)));
        
        uint mrSequence;
        (, mrSequence, , , , , ) = proposalCategory.category(allProposalData[_proposalId].category);
        require(memberRole.checkRole(msg.sender, mrSequence));


        uint totalVotes = allVotes.length;
        
        allVotesByMember[msg.sender].push(totalVotes);
        memberProposalVote[msg.sender][_proposalId] = totalVotes;

        // addressProposalVote[msg.sender][_proposalId] = totalVotes;
        allVotes.push(ProposalVote(msg.sender, _proposalId, now));

        setVoteTally(_proposalId, _solution, mrSequence);
        emit Vote(msg.sender, _proposalId, totalVotes - 1, now, _solution);

        if (mrSequence == uint(MemberRoles.Role.AdvisoryBoard)) {
            uint abMaj;
            (, , abMaj, , , , ) = proposalCategory.category(allProposalData[_proposalId].category);
            uint abMem = memberRole.numberOfMembers(mrSequence);
            uint totalABVoted = proposalVoteTally[_proposalId].abVoteValue[1] + 
            proposalVoteTally[_proposalId].abVoteValue[0];
            if (proposalVoteTally[_proposalId].abVoteValue[1].mul(100).div(abMem) >= abMaj || totalABVoted == abMem) {
                eventCaller.callVoteCast(_proposalId);
            }
        } else {
            if (memberRole.numberOfMembers(mrSequence) == proposalVoteTally[_proposalId].voters)
                eventCaller.callVoteCast(_proposalId);
        }

    }

    function setVoteTally(uint _proposalId, uint _solution, uint mrSequence) internal
    {
        uint category = allProposalData[_proposalId].category;
        uint voteWeight;
        uint voteWeightAB;
        uint voters = 1;
        voteWeight = minOf(maxOf(tokenInstance.totalBalanceOf(msg.sender), 1), 
        maxVoteWeigthPer.mul(nxmToken.totalSupply()).div(100));      
        if (memberRole.checkRole(msg.sender, 1) && (proposalCategory.categoryABReq(category) > 0) || 
            mrSequence == uint(MemberRoles.Role.AdvisoryBoard))
            voteWeightAB = 1;
        uint delegationId;
        tokenInstance.lockForMemberVote(msg.sender, tokenHoldingTime);
        for (uint i = 0; i < leaderDelegation[msg.sender].length; i++) {
            delegationId = leaderDelegation[msg.sender][i];
            if (allDelegation[delegationId].leader == msg.sender && 
            checkLastUpd(allDelegation[delegationId].lastUpd)) {
                tokenInstance.lockForMemberVote(allDelegation[delegationId].follower, tokenHoldingTime);
                voteWeight += minOf(maxOf(tokenInstance.totalBalanceOf(allDelegation[delegationId].follower), 1),
                maxVoteWeigthPer.mul(nxmToken.totalSupply()).div(100));
                voters++;
                if (proposalCategory.categoryABReq(category) > 0 && 
                memberRole.checkRole(allDelegation[delegationId].follower, 1)) {
                    voteWeightAB += 1;
                }
            }
            

        }
        proposalVoteTally[_proposalId].memberVoteValue[_solution] += voteWeight;
        proposalVoteTally[_proposalId].voters += voters;
        proposalVoteTally[_proposalId].abVoteValue[_solution] += voteWeightAB;
    }

    function maxOf(uint a, uint b) internal pure returns(uint res) {
        res = a;
        if (res < b)
            res = b;
    }

    function minOf(uint a, uint b) internal pure returns(uint res) {
        res = a;
        if (res > b)
            res = b;
    }
    
    function checkLastUpd(uint _lastUpd) internal view returns(bool) {
        return (now - _lastUpd) > tokenHoldingTime;
    }

    /// @dev Checks if the vote count against any solution passes the threshold value or not.
    function checkForThreshold(uint _proposalId, uint _category) internal view returns(bool check) {
        uint categoryQuorumPerc;
        uint roleId;
        check = false;
        (, roleId, , categoryQuorumPerc, , , ) = proposalCategory.category(_category);
        uint totalTokenVoted = proposalVoteTally[_proposalId].memberVoteValue[0]
        +proposalVoteTally[_proposalId].memberVoteValue[1];
        check = totalTokenVoted.mul(100).div(nxmToken.totalSupply()) > categoryQuorumPerc;
    }

    /// @dev This does the remaining functionality of closing proposal vote
    function closeProposalVoteThReached(
        uint maxVoteValue,
        uint totalVoteValue,
        uint category,
        uint _proposalId,
        uint max
    )
        internal
    {
        uint _majorityVote;
        
        allProposalData[_proposalId].finalVerdict = max;
        (, , _majorityVote, , , , ) = proposalCategory.category(category);
        
        if (SafeMath.div(SafeMath.mul(maxVoteValue, 100), totalVoteValue) >= _majorityVote) {
            if (max > 0) {
                callIfMajReach(_proposalId, uint(ProposalStatus.Accepted), category, max);
            } else {
                _updateProposalStatus(_proposalId, uint(ProposalStatus.Rejected));
            }
        } else {
            if (max > 0)
                _updateProposalStatus(_proposalId, uint(ProposalStatus.Majority_Not_Reached_But_Accepted));
            else
                _updateProposalStatus(_proposalId, uint(ProposalStatus.Majority_Not_Reached_But_Rejected));
        }
    }

    function callIfMajReach(uint _proposalId, uint _status, uint category, uint max) internal {
        bytes2 contractName;
        address actionAddress;
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

    function _getLockedBalance(address _of, uint _time)
        internal view returns(uint lockedTokens)
    {
        _time += now; //solhint-disable-line
        lockedTokens = tokenInstance.tokensLockedAtTime(_of, "GOV", _time);
    }

    function _updateProposalStatus(uint _proposalId, uint _status) internal {
        allProposal[_proposalId].dateUpd = now;
        allProposalData[_proposalId].propStatus = _status;
    }

    function _delegateVote(address _add)internal {
        require(ms.isMember(_add) || _add == address(0));
        if (followerDelegation[msg.sender] == 0) {
            // require(!tokenFunction.isLockedForMemberVote(msg.sender), "Member voted");
            allDelegation.push(DelegateVote(msg.sender, _add, now));
            followerDelegation[msg.sender] = allDelegation.length - 1;
            leaderDelegation[_add].push(allDelegation.length - 1);
        } else {
            uint followerId = followerDelegation[msg.sender];
            // require(!tokenFunction.isLockedForMemberVote(allDelegation[followerId].leader), "leader voted");
            allDelegation[followerId].leader = _add;
            allDelegation[followerId].lastUpd = now;

        }

    }

    function closeMemberVote(uint _proposalId, uint category, uint _roleId) internal {
        uint max;
        uint totalVoteValue;
        uint maxVote;
        if (checkForThreshold(_proposalId, category)) {
           
            maxVote = proposalVoteTally[_proposalId].memberVoteValue[0];
            max = 0;
            totalVoteValue = proposalVoteTally[_proposalId].memberVoteValue[0] + 
            proposalVoteTally[_proposalId].abVoteValue[1];
            if (maxVote < proposalVoteTally[_proposalId].memberVoteValue[1]) {
                maxVote = proposalVoteTally[_proposalId].memberVoteValue[1];
                max = 1;
            }
             
            closeProposalVoteThReached(maxVote, totalVoteValue, category, _proposalId, max);
        } else {
            uint abMaj = proposalCategory.categoryABReq(category);
            uint abMem = memberRole.numberOfMembers(_roleId);
            if (abMaj > 0) {
                
                if (proposalVoteTally[_proposalId].abVoteValue[1] >= abMaj.mul(100).div(abMem)) {
                    
                    callIfMajReach(_proposalId, uint(ProposalStatus.Accepted), category, 1);
                } else {
                    allProposalData[_proposalId].finalVerdict = 0;
                    _updateProposalStatus(_proposalId, uint(ProposalStatus.Denied));
                }
            } else {

                allProposalData[_proposalId].finalVerdict = 0;
                _updateProposalStatus(_proposalId, uint(ProposalStatus.Denied));
            }
        }
        tokenInstance.mint(ms.getLatestAddress("CR"), totalVoteValue);
    }

    function closeABVote(uint _proposalId, uint category, uint _roleId) internal {
        uint _majorityVote;
        uint abMem = memberRole.numberOfMembers(_roleId);
        (, , _majorityVote, , , , ) = proposalCategory.category(category);
        if (proposalVoteTally[_proposalId].abVoteValue[1].mul(100).div(abMem) > _majorityVote) {
            
            callIfMajReach(_proposalId, uint(ProposalStatus.Accepted), category, 1);
        } else {
            allProposalData[_proposalId].finalVerdict = 0;
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
    }

}