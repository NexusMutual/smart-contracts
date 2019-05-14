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

pragma solidity 0.5.7;

import "./ProposalCategory.sol";
import "./MemberRoles.sol";
import "./external/govblocks-protocol/interfaces/IGovernance.sol";


contract Governance is IGovernance, Iupgradable {

    using SafeMath for uint;

    enum ProposalStatus { 
        Draft,
        AwaitingSolution,
        VotingStarted,
        Accepted,
        Rejected,
        Majority_Not_Reached_But_Accepted,
        Denied
    }

    struct ProposalData {
        uint propStatus;
        uint finalVerdict;
        uint category;
        // uint totalVoteValue;
        // uint majVoteValue;
        uint commonIncentive;
        uint dateUpd;
        address owner;
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

    // ProposalStruct[] internal allProposal;
    ProposalVote[] internal allVotes;
    DelegateVote[] public allDelegation;

    mapping(uint => ProposalData) internal allProposalData;
    mapping(uint => bytes[]) internal allProposalSolutions;
    mapping(address => uint[]) internal allVotesByMember;
    mapping(uint => mapping(address => bool)) public rewardClaimed; //voteid->member->reward claimed
    mapping (address => mapping(uint => uint)) public memberProposalVote;
    mapping (address => uint) public followerDelegation;
    mapping (address => uint) internal followerCount;
    mapping (address => uint[]) internal leaderDelegation;
    mapping (uint => VoteTally) public proposalVoteTally;
    mapping (address => bool) public isOpenForDelegation;
    mapping (address => uint) public lastRewardClaimed;
    

    bool internal constructorCheck;
    uint public tokenHoldingTime;
    uint internal roleIdAllowedToCatgorize;
    uint internal maxVoteWeigthPer;
    uint internal specialResolutionMajPerc;
    uint internal maxFollowers;
    uint internal totalProposals;
    uint internal maxDraftTime;

    MemberRoles internal memberRole;
    ProposalCategory internal proposalCategory;
    TokenController internal tokenInstance;
    MemberRoles internal mr;

    modifier onlyProposalOwner(uint _proposalId) {
        require(msg.sender == allProposalData[_proposalId].owner, "Not authorized");
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

    modifier checkPendingRewards {
        require(getPendingReward(msg.sender) == 0, "Claim pending rewards");
        _;
    }

    event ProposalCategorized(
        uint indexed proposalId,
        address indexed categorizedBy,
        uint categoryId
    );
    
    /**
     * @dev to remove delegation of an address.
     * @param _add address to undelegate.
     */
    function removeDelegation(address _add) external onlyInternal {
        _unDelegate(_add);
    }

    /// @dev Creates a new proposal
    /// @param _proposalDescHash Proposal description hash through IPFS having Short and long description of proposal
    /// @param _categoryId This id tells under which the proposal is categorized i.e. Proposal's Objective
    function createProposal(
        string calldata _proposalTitle, 
        string calldata _proposalSD, 
        string calldata _proposalDescHash, 
        uint _categoryId
    ) 
        external isAllowed(_categoryId)
    {
        require(ms.isMember(msg.sender), "Not Member");

        _createProposal(_proposalTitle, _proposalSD, _proposalDescHash, _categoryId);
    }

    /// @dev Edits the details of an existing proposal
    /// @param _proposalId Proposal id that details needs to be updated
    /// @param _proposalDescHash Proposal description hash having long and short description of proposal.
    function updateProposal(
        uint _proposalId, 
        string calldata _proposalTitle, 
        string calldata _proposalSD, 
        string calldata _proposalDescHash
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
            allProposalData[_proposalId].owner,
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
    function addSolution(uint, string calldata, bytes calldata) external {
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
        string calldata _solutionHash, 
        bytes calldata _action
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
        string calldata _proposalTitle, 
        string calldata _proposalSD, 
        string calldata _proposalDescHash,
        uint _categoryId, 
        string calldata _solutionHash, 
        bytes calldata _action
    ) 
        external isAllowed(_categoryId)
    {

        uint proposalId = totalProposals;

        _createProposal(_proposalTitle, _proposalSD, _proposalDescHash, _categoryId);

        _proposalSubmission(
            proposalId,
            _solutionHash,
            _action
        );
    }

    /**
     * @dev used to submit vote on a proposal.
     * @param _proposalId to vote upon.
     * @param _solutionChosen is the chosen vote.
     */
    function submitVote(uint _proposalId, uint _solutionChosen) external {
        // require(addressProposalVote[msg.sender][_proposalId] == 0, "Already voted");

        require(allProposalData[_proposalId].propStatus == 
        uint(Governance.ProposalStatus.VotingStarted), "Not allowed");

        require(_solutionChosen <= allProposalSolutions[_proposalId].length, "Solution doesn't exist");


        _submitVote(_proposalId, _solutionChosen);
    }

    /**
     * @dev used to close a proposal.
     * @param _proposalId of proposal to be closed.
     */
    function closeProposal(uint _proposalId) external {
        uint category = allProposalData[_proposalId].category;
        
        
        uint _memberRole;
        if (allProposalData[_proposalId].dateUpd.add(maxDraftTime) <= now && 
            allProposalData[_proposalId].propStatus < uint(ProposalStatus.VotingStarted)) {
            _updateProposalStatus(_proposalId, uint(ProposalStatus.Denied));
        } else {
            require(canCloseProposal(_proposalId) == 1, "Cannot close");
            (, _memberRole, , , , , ) = proposalCategory.category(allProposalData[_proposalId].category);
            if (_memberRole == uint(MemberRoles.Role.AdvisoryBoard)) {
                _closeABVote(_proposalId, category, _memberRole);
            } else {
                _closeMemberVote(_proposalId, category);
            }
        }
        
    }

    /**
     * @dev to claim reward on a list of proposal.
     * @param _memberAddress to claim reward of.
     * @param _maxRecords maximum number of records to claim reward for.
     _proposals list of proposals of which reward will be claimed.
     * @return amount of pending reward.
     */
    function claimReward(address _memberAddress, uint _maxRecords) 
        external returns(uint pendingDAppReward) 
    {
        
        uint voteId;
        address leader;
        uint lastUpd;

        require(msg.sender == ms.getLatestAddress("CR"));

        uint delegationId = followerDelegation[_memberAddress];
        if (delegationId > 0 && allDelegation[delegationId].leader != address(0)) {
            leader = allDelegation[delegationId].leader;
            lastUpd = allDelegation[delegationId].lastUpd;
        } else
            leader = _memberAddress;

        uint proposalId;
        uint totalVotes = allVotesByMember[leader].length;
        uint lastClaimed = totalVotes;
        uint j;
        uint[] memory proposals = new uint[](20);
        for (uint i = lastRewardClaimed[_memberAddress];i < totalVotes && j < _maxRecords; i++) {
            voteId = allVotesByMember[leader][i];
            proposalId = allVotes[voteId].proposalId;
            if (proposalVoteTally[proposalId].voters > 0 && (allVotes[voteId].dateAdd > (
                lastUpd + tokenHoldingTime) || leader == _memberAddress)) {
                if (allProposalData[proposalId].propStatus > uint(ProposalStatus.VotingStarted)) {
                    if (!rewardClaimed[voteId][_memberAddress]) {
                        pendingDAppReward += allProposalData[proposalId].commonIncentive / 
                        proposalVoteTally[proposalId].voters;
                        rewardClaimed[voteId][_memberAddress] = true;
                        proposals[j] = proposalId;
                        j++;
                    }
                } else {
                    if(lastClaimed == totalVotes) {
                        lastClaimed = i;
                    }
                }
            }
        }
        lastRewardClaimed[_memberAddress] = lastClaimed;
        uint[] memory _proposals = new uint[](j);
        for (uint i = 0; i < j; i++) {
            _proposals[i] = proposals[i];
        }
        if (j > 0) {
            emit RewardClaimed(
                _memberAddress,
                _proposals,
                pendingDAppReward
            );
        }
    }

    /**
     * @dev Used to set delegation acceptance status of individual user
     * @param _status delegation acceptance status
     */
    function setDelegationStatus(bool _status) external isMemberAndcheckPause checkPendingRewards {
        isOpenForDelegation[msg.sender] = _status;
    }

    /**
     * @dev to delegate vote to an address.
     * @param _add is the address to delegate vote to.
     */
    function delegateVote(address _add) external isMemberAndcheckPause checkPendingRewards {
        //Ensure that NXMaster has initialized.
        require(ms.masterInitialized());

        //Check if given address is not a follower
        require(allDelegation[followerDelegation[_add]].leader == address(0));

        if (followerDelegation[msg.sender] > 0) {
            require(SafeMath.add(allDelegation[followerDelegation[msg.sender]].lastUpd, tokenHoldingTime) < now);
        }

        require(!alreadyDelegated(msg.sender), "Already a leader");
        require(!memberRole.checkRole(msg.sender, uint(MemberRoles.Role.Owner)));
        require(!memberRole.checkRole(msg.sender, uint(MemberRoles.Role.AdvisoryBoard)));


        require(followerCount[_add] < maxFollowers);
        
        if (allVotesByMember[msg.sender].length > 0) {
            uint memberLastVoteId = SafeMath.sub(allVotesByMember[msg.sender].length, 1);
            require(SafeMath.add(allVotes[allVotesByMember[msg.sender][memberLastVoteId]].dateAdd, tokenHoldingTime)
            < now);
        }

        // require(getPendingReward(msg.sender) == 0);

        require(ms.isMember(_add));

        require(isOpenForDelegation[_add]);

        allDelegation.push(DelegateVote(msg.sender, _add, now));
        followerDelegation[msg.sender] = allDelegation.length - 1;
        leaderDelegation[_add].push(allDelegation.length - 1);
        followerCount[_add]++;
        lastRewardClaimed[msg.sender] = allVotesByMember[_add].length;
    }

    /**
     * @dev Undelegates the sender
     */
    function unDelegate() external isMemberAndcheckPause checkPendingRewards {
        _unDelegate(msg.sender);
    }

    /**
     * @dev Gets Uint Parameters of a code
     * @param code whose details we want
     * @return string value of the code
     * @return associated amount (time or perc or value) to the code
     */
    function getUintParameters(bytes8 code) external view returns(bytes8 codeVal, uint val) {

        codeVal = code;

        if (code == "GOVHOLD") {

            val = tokenHoldingTime / (1 days);

        } else if (code == "MAXFOL") {

            val = maxFollowers;

        } else if (code == "MAXDRFT") {

            val = maxDraftTime / (1 days);

        } else if (code == "MAXAB") {

            val = mr.maxABCount();

        } else if (code == "EPTIME") {
            val = ms.pauseTime() / (1 days);

        }

    }

    /**
     * @dev Gets all details of a propsal
     * @param _proposalId whose details we want
     * @return proposalId
     * @return category
     * @return status
     * @return finalVerdict
     * @return totalReward
     */
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

    /**
     * @dev Gets some details of a propsal
     * @param _proposalId whose details we want
     * @return proposalId
     * @return number of all proposal solutions
     * @return amount of votes 
     */
    function proposalDetails(uint _proposalId) external view returns(uint, uint, uint) {
        return(
            _proposalId,
            allProposalSolutions[_proposalId].length,
            proposalVoteTally[_proposalId].voters
        );
    }

    /**
     * @dev Gets solution action on a proposal
     * @param _proposalId whose details we want
     * @param _solution whose details we want
     * @return action of a solution on a proposal
     */
    function getSolutionAction(uint _proposalId, uint _solution) external view returns(uint, bytes memory) {
        return (
            _solution,
            allProposalSolutions[_proposalId][_solution]
        );
    }
   
    /**
     * @dev get length of propsal
     * @return length of propsal
     */
    function getProposalLength() external view returns(uint) {
        return totalProposals;
    }

    /**
     * @dev get followers of an address
     * @return get followers of an address
     */
    function getFollowers(address _add) external view returns(uint[] memory) {
        return leaderDelegation[_add];
    }

    /**
     * @dev get pending reward of a member
     * @param _memberAddress in concern
     * @return amount of pending reward
     */
    function getPendingReward(address _memberAddress)
        public view returns(uint pendingDAppReward)
    {
        uint delegationId = followerDelegation[_memberAddress];
        address leader;
        uint lastUpd;
        if (delegationId > 0 && allDelegation[delegationId].leader != address(0)) {
            leader = allDelegation[delegationId].leader;
            lastUpd = allDelegation[delegationId].lastUpd;
        } else
            leader = _memberAddress;

        uint proposalId;
        for (uint i = lastRewardClaimed[_memberAddress];i < allVotesByMember[leader].length; i++) {
            if (allVotes[allVotesByMember[leader][i]].dateAdd > (
                lastUpd + tokenHoldingTime) || leader == _memberAddress) {
                if (!rewardClaimed[allVotesByMember[leader][i]][_memberAddress]) {
                    proposalId = allVotes[allVotesByMember[leader][i]].proposalId;
                    if (proposalVoteTally[proposalId].voters > 0 && allProposalData[proposalId].propStatus
                    > uint(ProposalStatus.VotingStarted)) {
                        pendingDAppReward += allProposalData[proposalId].commonIncentive / 
                        proposalVoteTally[proposalId].voters;
                    }
                }
            }
        }
    }

    /**
     * @dev Updates Uint Parameters of a code
     * @param code whose details we want to update
     * @param val value to set
     */
    function updateUintParameters(bytes8 code, uint val) public {

        require(ms.checkIsAuthToGoverned(msg.sender));
        if (code == "GOVHOLD") {

            tokenHoldingTime = val * 1 days;

        } else if (code == "MAXFOL") {

            maxFollowers = val;

        } else if (code == "MAXDRFT") {

            maxDraftTime = val * 1 days;

        } else if (code == "MAXAB") {

            mr.changeMaxABCount(val);

        } else if (code == "EPTIME") {
            ms.updatePauseTime(val * 1 days);

        } else {
            revert("Invalid code");
        }
    }

    /// @dev updates all dependency addresses to latest ones from Master
    function changeDependentContractAddress() public {
        if (!constructorCheck) {
            _initiateGovernance();
        }
        tokenInstance = TokenController(ms.dAppLocker());
        memberRole = MemberRoles(ms.getLatestAddress("MR"));
        proposalCategory = ProposalCategory(ms.getLatestAddress("PC"));
        mr = MemberRoles(ms.getLatestAddress("MR"));
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

    /**
     * @dev to know if an address is already delegated
     * @param _add in concern
     * @return bool value if the address is delegated or not
     */
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

    /// @dev Checks If the proposal voting time is up and it's ready to close 
    ///      i.e. Closevalue is 1 if proposal is ready to be closed, 2 if already closed, 0 otherwise!
    /// @param _proposalId Proposal id to which closing value is being checked
    function canCloseProposal(uint _proposalId) 
        public 
        view 
        returns(uint)
    {
        uint dateUpdate;
        uint pStatus;
        uint _closingTime;
        uint _roleId;
        uint majority;
        pStatus = allProposalData[_proposalId].propStatus;
        dateUpdate = allProposalData[_proposalId].dateUpd;
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

                    return 1;
                }
            } else {
                if (numberOfMembers == proposalVoteTally[_proposalId].voters 
                || dateUpdate.add(_closingTime) <= now)
                    return  1;
            }
        } else if (pStatus > uint(ProposalStatus.VotingStarted)) {
            return  2;
        } else {
            return  0;
        }
    }

    /**
     * @dev get roleId of member allowed to categorize the proposal
     * @return roleId
     */
    function allowedToCatgorize() public view returns(uint roleId) {
        return roleIdAllowedToCatgorize;
    }

    /**
     * @dev get vote tally data
     * @param _proposalId in concern
     * @param _solution of a proposal id
     * @return member vote value
     * @return advisory board vote value
     * @return amount of votes
     */
    function voteTallyData(uint _proposalId, uint _solution) public view returns(uint, uint, uint) {
        return (proposalVoteTally[_proposalId].memberVoteValue[_solution],
            proposalVoteTally[_proposalId].abVoteValue[_solution], proposalVoteTally[_proposalId].voters);
    }

    /**
     * @dev to create a proposal
     * @param _proposalTitle of proposal
     * @param _proposalSD is short description of proposal
     * @param _proposalDescHash IPFS hash value of propsal
     * @param _categoryId of proposal
     */
    function _createProposal(
        string memory _proposalTitle,
        string memory _proposalSD,
        string memory _proposalDescHash,
        uint _categoryId
    )
        internal
    {
        require(proposalCategory.categoryABReq(_categoryId) == 0 || _categoryId == 0);
        uint _proposalId = totalProposals;
        allProposalData[_proposalId].owner = msg.sender;
        allProposalData[_proposalId].dateUpd = now;
        allProposalSolutions[_proposalId].push("");
        totalProposals++;
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
        // emit ProposalCreated(_proposalId, _categoryId, address(ms), _proposalDescHash);
    }

    /**
     * @dev to categorize a proposal
     * @param _proposalId of proposal
     * @param _categoryId of proposal
     * @param _incentive is commonIncentive
     */
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

    /**
     * @dev add solution to a proposalId
     * @param _proposalId in concern
     * @param _action on that solution
     * @param _solutionHash string value
     */
    function _addSolution(uint _proposalId, bytes memory _action, string memory _solutionHash)
        internal
    {
        allProposalSolutions[_proposalId].push(_action);
        emit Solution(_proposalId, msg.sender, allProposalSolutions[_proposalId].length - 1, _solutionHash, now);
    }

    /// @dev When creating or submitting proposal with solution, This function open the proposal for voting
    function _proposalSubmission(
        uint _proposalId,
        string memory _solutionHash,
        bytes memory _action
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

    /**
     * @dev for submitting vote on a proposal
     * @param _proposalId of proposal in concern
     * @param _solution for that proposal
     */
    function _submitVote(uint _proposalId, uint _solution) internal {

        uint delegationId = followerDelegation[msg.sender];
        uint mrSequence;
        uint majority;
        uint closingTime;
        (, mrSequence, majority, , , closingTime, ) = proposalCategory.category(allProposalData[_proposalId].category);

        require(allProposalData[_proposalId].dateUpd.add(closingTime) > now, "Closed");

        require(memberProposalVote[msg.sender][_proposalId] == 0, "Voted");
        require((delegationId == 0) || (delegationId > 0 && allDelegation[delegationId].leader == address(0) && 
        _checkLastUpd(allDelegation[delegationId].lastUpd)));

        require(memberRole.checkRole(msg.sender, mrSequence), "Not Authorized");
        uint totalVotes = allVotes.length;

        allVotesByMember[msg.sender].push(totalVotes);
        memberProposalVote[msg.sender][_proposalId] = totalVotes;

        // addressProposalVote[msg.sender][_proposalId] = totalVotes;
        allVotes.push(ProposalVote(msg.sender, _proposalId, now));

        emit Vote(msg.sender, _proposalId, totalVotes, now, _solution);
        if (mrSequence == uint(MemberRoles.Role.Owner)) {
            if (_solution == 1)
                _callIfMajReach(_proposalId, uint(ProposalStatus.Accepted), allProposalData[_proposalId].category, 1);
            else
                _updateProposalStatus(_proposalId, uint(ProposalStatus.Rejected));
        
        } else {
            uint numberOfMembers = memberRole.numberOfMembers(mrSequence);
            _setVoteTally(_proposalId, _solution, mrSequence);

            if (mrSequence == uint(MemberRoles.Role.AdvisoryBoard)) {
                uint totalABVoted = proposalVoteTally[_proposalId].abVoteValue[1] + 
            proposalVoteTally[_proposalId].abVoteValue[0];
                if (proposalVoteTally[_proposalId].abVoteValue[1].mul(100).div(numberOfMembers) 
                >= majority || totalABVoted == numberOfMembers) {
                    emit VoteCast(_proposalId);
                }
            } else {
                if (numberOfMembers == proposalVoteTally[_proposalId].voters)
                    emit VoteCast(_proposalId);
            }
        }

    }

    /**
     * @dev to set vote tally of a proposal
     * @param _proposalId of proposal in concern
     * @param _solution of proposal in concern
     * @param mrSequence number of members for a role
     */
    function _setVoteTally(uint _proposalId, uint _solution, uint mrSequence) internal
    {
        uint category = allProposalData[_proposalId].category;
        uint voteWeight;
        uint voteWeightAB;
        uint voters = 1;
        uint isSpecialResolution = proposalCategory.isSpecialResolution(category);
        uint tokenBalance = tokenInstance.totalBalanceOf(msg.sender);
        uint totalSupply = tokenInstance.totalSupply();
        if (isSpecialResolution == 1) {
            voteWeight = tokenBalance + 10**18;
        } else {
            voteWeight = (_minOf(tokenBalance, maxVoteWeigthPer.mul(totalSupply).div(100))) + 10**18;
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
                if (memberRole.checkRole(allDelegation[delegationId].follower, mrSequence)) {
                    tokenBalance = tokenInstance.totalBalanceOf(allDelegation[delegationId].follower);
                    tokenInstance.lockForMemberVote(allDelegation[delegationId].follower, tokenHoldingTime);
                    voters++;
                    if (isSpecialResolution == 1) {
                        voteWeight += tokenBalance + 10**18;
                    } else {
                        voteWeight += (_minOf(tokenBalance, maxVoteWeigthPer.mul(totalSupply).div(100))) + 10**18;
                    }
                }
            }
        }
        if (mrSequence == uint(MemberRoles.Role.Member) || mrSequence == uint(MemberRoles.Role.Owner)) {
            proposalVoteTally[_proposalId].memberVoteValue[_solution] += voteWeight;
            proposalVoteTally[_proposalId].voters += voters;
        }
        proposalVoteTally[_proposalId].abVoteValue[_solution] += voteWeightAB;
    }

    /**
     * @dev get minimum of two numbers
     * @param a one of the two numbers
     * @param b one of the two numbers
     * @return minimum number out of the two
     */
    function _minOf(uint a, uint b) internal pure returns(uint res) {
        res = a;
        if (res > b)
            res = b;
    }
    
    /**
     * @dev check the time since last update has exceeded token holding time or not
     * @param _lastUpd is last update time
     * @return the bool which tells if the time since last update has exceeded token holding time or not
     */
    function _checkLastUpd(uint _lastUpd) internal view returns(bool) {
        return (now - _lastUpd) > tokenHoldingTime;
    }

    /// @dev Checks if the vote count against any solution passes the threshold value or not.
    function _checkForThreshold(uint _proposalId, uint _category) internal view returns(bool check) {
        uint categoryQuorumPerc;
        (, , , categoryQuorumPerc, , , ) = proposalCategory.category(_category);
        uint totalTokenVoted = proposalVoteTally[_proposalId].memberVoteValue[0]
        +proposalVoteTally[_proposalId].memberVoteValue[1];
        check = totalTokenVoted.mul(100).div(tokenInstance.totalSupply() + 
        memberRole.numberOfMembers(uint(MemberRoles.Role.Member))) >= categoryQuorumPerc;
    }
    
    /**
     * @dev this function is called when vote majority is reached
     * @param _proposalId of proposal in concern
     * @param _status of proposal in concern
     * @param category of proposal in concern
     * @param max vote value of proposal in concern
     */
    function _callIfMajReach (uint _proposalId, uint _status, uint category, uint max) internal {
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
        (bool actionStatus, ) = actionAddress.call(allProposalSolutions[_proposalId][max]);//solhint-disable-line
        if (actionStatus) { //solhint-disable-line
            emit ActionSuccess(_proposalId);
        }
        emit ProposalAccepted(_proposalId);
    }

    /**
     * @dev to update proposal status
     * @param _proposalId of proposal in concern
     * @param _status of proposal to set
     */
    function _updateProposalStatus(uint _proposalId, uint _status) internal {
        allProposalData[_proposalId].dateUpd = now;
        allProposalData[_proposalId].propStatus = _status;
    }

    /**
     * @dev to undelegate a follower
     * @param _follower is address of follower to undelegate
     */
    function _unDelegate(address _follower) internal {
        uint followerId = followerDelegation[_follower];
        if (followerId > 0) {

            followerCount[allDelegation[followerId].leader]--;
            allDelegation[followerId].leader = address(0);
            allDelegation[followerId].lastUpd = now;

            lastRewardClaimed[msg.sender] = allVotesByMember[msg.sender].length;
        }
    }

    /**
     * @dev to close member voting
     * @param _proposalId of proposal in concern
     * @param category of proposal in concern
     */
    function _closeMemberVote(uint _proposalId, uint category) internal {
        uint totalVoteValue;
        uint majorityVote;
        if (proposalCategory.isSpecialResolution(category) == 1) {
            uint acceptedVotePerc = proposalVoteTally[_proposalId].memberVoteValue[1].mul(100)
            .div(tokenInstance.totalSupply()
            + (memberRole.numberOfMembers(uint(MemberRoles.Role.Member))) * 10**18);
            if (acceptedVotePerc >= specialResolutionMajPerc) {
                _callIfMajReach(_proposalId, uint(ProposalStatus.Accepted), category, 1);
            } else {
                _updateProposalStatus(_proposalId, uint(ProposalStatus.Denied));
            }
        } else {
            if (_checkForThreshold(_proposalId, category)) {
                totalVoteValue = proposalVoteTally[_proposalId].memberVoteValue[0] + 
                proposalVoteTally[_proposalId].memberVoteValue[1];
                (, , majorityVote, , , , ) = proposalCategory.category(category);
                if (SafeMath.div(SafeMath.mul(proposalVoteTally[_proposalId].memberVoteValue[1], 100), totalVoteValue) 
                >= majorityVote) {
                    _callIfMajReach(_proposalId, uint(ProposalStatus.Accepted), category, 1);
                } else {
                    _updateProposalStatus(_proposalId, uint(ProposalStatus.Rejected));
                }
            } else {
                uint abMaj = proposalCategory.categoryABReq(category);
                // uint abMem = memberRole.numberOfMembers(uint(MemberRoles.Role.AdvisoryBoard));
                if (abMaj > 0 && proposalVoteTally[_proposalId].abVoteValue[1].mul(100)
                .div(memberRole.numberOfMembers(uint(MemberRoles.Role.AdvisoryBoard))) >= abMaj) {
                    _callIfMajReach(_proposalId, uint(ProposalStatus.Accepted), category, 1);
                } else {
                    _updateProposalStatus(_proposalId, uint(ProposalStatus.Denied));
                }
            }
        }

        if (proposalVoteTally[_proposalId].voters > 0) {
            tokenInstance.mint(ms.getLatestAddress("CR"), allProposalData[_proposalId].commonIncentive);
        }
    }

    /**
     * @dev to close advisory board voting
     * @param _proposalId of proposal in concern
     * @param category of proposal in concern
     * @param _roleId of group of members involved in voting
     */
    function _closeABVote(uint _proposalId, uint category, uint _roleId) internal {
        uint _majorityVote;
        // uint abMem = memberRole.numberOfMembers(_roleId);
        (, , _majorityVote, , , , ) = proposalCategory.category(category);
        if (proposalVoteTally[_proposalId].abVoteValue[1].mul(100)
        .div(memberRole.numberOfMembers(_roleId)) >= _majorityVote) {
            _callIfMajReach(_proposalId, uint(ProposalStatus.Accepted), category, 1);
        } else {
            _updateProposalStatus(_proposalId, uint(ProposalStatus.Denied));
        }

    }

    /**
     * @dev to open proposal for voting
     * @param _proposalId of proposal in concern
     */
    function _openProposalForVoting(uint _proposalId) internal {

        require(allProposalData[_proposalId].category != 0, "Proposal not categorized");        
        _updateProposalStatus(_proposalId, uint(ProposalStatus.VotingStarted));
        uint closingTime;
        (, , , , , closingTime, ) = proposalCategory.category(allProposalData[_proposalId].category);
        emit CloseProposalOnTime(_proposalId, SafeMath.add(closingTime, now));
    }

    /**
     * @dev to initiate the governance process
     */
    function _initiateGovernance() internal {
        allVotes.push(ProposalVote(address(0), 0, 0));
        totalProposals = 1;
        // allProposal.push(ProposalStruct(address(0), now));
        allDelegation.push(DelegateVote(address(0), address(0), now));
        tokenHoldingTime = 1 * 7 days;
        maxDraftTime = 2 * 7 days;
        maxVoteWeigthPer = 5;
        maxFollowers = 40;
        constructorCheck = true;
        roleIdAllowedToCatgorize = uint(MemberRoles.Role.AdvisoryBoard);
        specialResolutionMajPerc = 75;
    }

}