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
        uint commonIncentive;
        uint dateUpd;
        address owner;
    }

    struct ProposalVote {
        address voter;
        uint proposalId;
        uint dateAdd;
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

    ProposalVote[] internal allVotes;
    DelegateVote[] public allDelegation;

    mapping(uint => ProposalData) internal allProposalData;
    mapping(uint => bytes[]) internal allProposalSolutions;
    mapping(address => uint[]) internal allVotesByMember;
    mapping(uint => mapping(address => bool)) public rewardClaimed;
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

    mapping(uint => uint) public proposalActionStatus;
    mapping(uint => uint) internal proposalExecutionTime;
    mapping(uint => mapping(address => bool)) public proposalRejectedByAB;
    mapping(uint => uint) internal actionRejectedCount;

    bool internal actionParamsInitialised;
    uint internal actionWaitingTime;
    uint constant internal AB_MAJ_TO_REJECT_ACTION = 3;

    enum ActionStatus {
        Pending,
        Accepted,
        Rejected,
        Executed,
        NoAction
    }

    /**
    * @dev Called whenever an action execution is failed.
    */
    event ActionFailed (
        uint256 proposalId
    );

    /**
    * @dev Called whenever an AB member rejects the action execution.
    */
    event ActionRejected (
        uint256 indexed proposalId,
        address rejectedBy
    );

    /**
    * @dev Checks if msg.sender is proposal owner
    */
    modifier onlyProposalOwner(uint _proposalId) {
        require(msg.sender == allProposalData[_proposalId].owner, "Not allowed");
        _;
    }

    /**
    * @dev Checks if proposal is opened for voting
    */
    modifier voteNotStarted(uint _proposalId) {
        require(allProposalData[_proposalId].propStatus < uint(ProposalStatus.VotingStarted));
        _;
    }

    /**
    * @dev Checks if msg.sender is allowed to create proposal under given category
    */
    modifier isAllowed(uint _categoryId) {
        require(allowedToCreateProposal(_categoryId), "Not allowed");
        _;
    }

    /**
    * @dev Checks if msg.sender is allowed categorize proposal under given category
    */
    modifier isAllowedToCategorize() {
        require(memberRole.checkRole(msg.sender, roleIdAllowedToCatgorize), "Not allowed");
        _;
    }

    /**
    * @dev Checks if msg.sender had any pending rewards to be claimed
    */
    modifier checkPendingRewards {
        require(getPendingReward(msg.sender) == 0, "Claim reward");
        _;
    }

    /**
    * @dev Event emitted whenever a proposal is categorized
    */
    event ProposalCategorized(
        uint indexed proposalId,
        address indexed categorizedBy,
        uint categoryId
    );
    
    /**
     * @dev Removes delegation of an address.
     * @param _add address to undelegate.
     */
    function removeDelegation(address _add) external onlyInternal {
        _unDelegate(_add);
    }

    /**
    * @dev Creates a new proposal
    * @param _proposalDescHash Proposal description hash through IPFS having Short and long description of proposal
    * @param _categoryId This id tells under which the proposal is categorized i.e. Proposal's Objective
    */
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

    /**
    * @dev Edits the details of an existing proposal
    * @param _proposalId Proposal id that details needs to be updated
    * @param _proposalDescHash Proposal description hash having long and short description of proposal.
    */
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
            "Not allowed"
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

    /**
    * @dev Categorizes proposal to proceed further. Categories shows the proposal objective.
    */
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

    /**
    * @dev Initiates add solution
    * To implement the governance interface
    */
    function addSolution(uint, string calldata, bytes calldata) external {
    }

    /**
    * @dev Opens proposal for voting
    * To implement the governance interface
    */
    function openProposalForVoting(uint) external {
    }

    /**
    * @dev Submit proposal with solution
    * @param _proposalId Proposal id
    * @param _solutionHash Solution hash contains  parameters, values and description needed according to proposal
    */
    function submitProposalWithSolution(
        uint _proposalId, 
        string calldata _solutionHash, 
        bytes calldata _action
    ) 
        external
        onlyProposalOwner(_proposalId)
    {

        require(allProposalData[_proposalId].propStatus == uint(ProposalStatus.AwaitingSolution));
        
        _proposalSubmission(_proposalId, _solutionHash, _action);
    }

    /**
    * @dev Creates a new proposal with solution
    * @param _proposalDescHash Proposal description hash through IPFS having Short and long description of proposal
    * @param _categoryId This id tells under which the proposal is categorized i.e. Proposal's Objective
    * @param _solutionHash Solution hash contains  parameters, values and description needed according to proposal
    */
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
        
        require(_categoryId > 0);

        _proposalSubmission(
            proposalId,
            _solutionHash,
            _action
        );
    }

    /**
     * @dev Submit a vote on the proposal.
     * @param _proposalId to vote upon.
     * @param _solutionChosen is the chosen vote.
     */
    function submitVote(uint _proposalId, uint _solutionChosen) external {
        
        require(allProposalData[_proposalId].propStatus == 
        uint(Governance.ProposalStatus.VotingStarted), "Not allowed");

        require(_solutionChosen < allProposalSolutions[_proposalId].length);


        _submitVote(_proposalId, _solutionChosen);
    }

    /**
     * @dev Closes the proposal.
     * @param _proposalId of proposal to be closed.
     */
    function closeProposal(uint _proposalId) external {
        uint category = allProposalData[_proposalId].category;
        
        
        uint _memberRole;
        if (allProposalData[_proposalId].dateUpd.add(maxDraftTime) <= now && 
            allProposalData[_proposalId].propStatus < uint(ProposalStatus.VotingStarted)) {
            _updateProposalStatus(_proposalId, uint(ProposalStatus.Denied));
        } else {
            require(canCloseProposal(_proposalId) == 1);
            (, _memberRole, , , , , ) = proposalCategory.category(allProposalData[_proposalId].category);
            if (_memberRole == uint(MemberRoles.Role.AdvisoryBoard)) {
                _closeAdvisoryBoardVote(_proposalId, category);
            } else {
                _closeMemberVote(_proposalId, category);
            }
        }
        
    }

    /**
     * @dev Claims reward for member.
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
        DelegateVote memory delegationData = allDelegation[delegationId];
        if (delegationId > 0 && delegationData.leader != address(0)) {
            leader = delegationData.leader;
            lastUpd = delegationData.lastUpd;
        } else
            leader = _memberAddress;

        uint proposalId;
        uint totalVotes = allVotesByMember[leader].length;
        uint lastClaimed = totalVotes;
        uint j;
        uint i;
        for (i = lastRewardClaimed[_memberAddress]; i < totalVotes && j < _maxRecords; i++) {
            voteId = allVotesByMember[leader][i];
            proposalId = allVotes[voteId].proposalId;
            if (proposalVoteTally[proposalId].voters > 0 && (allVotes[voteId].dateAdd > (
                lastUpd.add(tokenHoldingTime)) || leader == _memberAddress)) {
                if (allProposalData[proposalId].propStatus > uint(ProposalStatus.VotingStarted)) {
                    if (!rewardClaimed[voteId][_memberAddress]) {
                        pendingDAppReward = pendingDAppReward.add(
                                allProposalData[proposalId].commonIncentive.div(
                                    proposalVoteTally[proposalId].voters
                                )
                            );
                        rewardClaimed[voteId][_memberAddress] = true;
                        j++;
                    }
                } else {
                    if (lastClaimed == totalVotes) {
                        lastClaimed = i;
                    }
                }
            }
        }

        if (lastClaimed == totalVotes) {
            lastRewardClaimed[_memberAddress] = i;
        } else {
            lastRewardClaimed[_memberAddress] = lastClaimed;
        }

        if (j > 0) {
            emit RewardClaimed(
                _memberAddress,
                pendingDAppReward
            );
        }
    }

    /**
     * @dev Sets delegation acceptance status of individual user
     * @param _status delegation acceptance status
     */
    function setDelegationStatus(bool _status) external isMemberAndcheckPause checkPendingRewards {
        isOpenForDelegation[msg.sender] = _status;
    }

    /**
     * @dev Delegates vote to an address.
     * @param _add is the address to delegate vote to.
     */
    function delegateVote(address _add) external isMemberAndcheckPause checkPendingRewards {

        require(ms.masterInitialized());

        require(allDelegation[followerDelegation[_add]].leader == address(0));

        if (followerDelegation[msg.sender] > 0) {
            require((allDelegation[followerDelegation[msg.sender]].lastUpd).add(tokenHoldingTime) < now);
        }

        require(!alreadyDelegated(msg.sender));
        require(!memberRole.checkRole(msg.sender, uint(MemberRoles.Role.Owner)));
        require(!memberRole.checkRole(msg.sender, uint(MemberRoles.Role.AdvisoryBoard)));


        require(followerCount[_add] < maxFollowers);
        
        if (allVotesByMember[msg.sender].length > 0) {
            require((allVotes[allVotesByMember[msg.sender][allVotesByMember[msg.sender].length - 1]].dateAdd).add(tokenHoldingTime)
            < now);
        }

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
     * @dev Triggers action of accepted proposal after waiting time is finished
     */
    function triggerAction(uint _proposalId) external {
        require(proposalActionStatus[_proposalId] == uint(ActionStatus.Accepted) && proposalExecutionTime[_proposalId] <= now, "Cannot trigger");
        _triggerAction(_proposalId, allProposalData[_proposalId].category);
    }

    /**
     * @dev Provides option to Advisory board member to reject proposal action execution within actionWaitingTime, if found suspicious
     */
    function rejectAction(uint _proposalId) external {
        require(memberRole.checkRole(msg.sender, uint(MemberRoles.Role.AdvisoryBoard)) && proposalExecutionTime[_proposalId] > now);

        require(proposalActionStatus[_proposalId] == uint(ActionStatus.Accepted));

        require(!proposalRejectedByAB[_proposalId][msg.sender]);

        require(
            keccak256(proposalCategory.categoryActionHashes(allProposalData[_proposalId].category))
            != keccak256(abi.encodeWithSignature("swapABMember(address,address)"))
        );

        proposalRejectedByAB[_proposalId][msg.sender] = true;
        actionRejectedCount[_proposalId]++;
        emit ActionRejected(_proposalId, msg.sender);
        if (actionRejectedCount[_proposalId] == AB_MAJ_TO_REJECT_ACTION) {
            proposalActionStatus[_proposalId] = uint(ActionStatus.Rejected);
        }
    }

    /**
     * @dev Sets intial actionWaitingTime value
     * To be called after governance implementation has been updated
     */
    function setInitialActionParameters() external onlyOwner {
        require(!actionParamsInitialised);
        actionParamsInitialised = true;
        actionWaitingTime = 24 * 1 hours;
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

        } else if (code == "EPTIME") {

            val = ms.pauseTime() / (1 days);

        } else if (code == "ACWT") {

            val = actionWaitingTime / (1 hours);

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
     * @dev Gets length of propsal
     * @return length of propsal
     */
    function getProposalLength() external view returns(uint) {
        return totalProposals;
    }

    /**
     * @dev Get followers of an address
     * @return get followers of an address
     */
    function getFollowers(address _add) external view returns(uint[] memory) {
        return leaderDelegation[_add];
    }

    /**
     * @dev Gets pending rewards of a member
     * @param _memberAddress in concern
     * @return amount of pending reward
     */
    function getPendingReward(address _memberAddress)
        public view returns(uint pendingDAppReward)
    {
        uint delegationId = followerDelegation[_memberAddress];
        address leader;
        uint lastUpd;
        DelegateVote memory delegationData = allDelegation[delegationId];

        if (delegationId > 0 && delegationData.leader != address(0)) {
            leader = delegationData.leader;
            lastUpd = delegationData.lastUpd;
        } else
            leader = _memberAddress;

        uint proposalId;
        for (uint i = lastRewardClaimed[_memberAddress]; i < allVotesByMember[leader].length; i++) {
            if (allVotes[allVotesByMember[leader][i]].dateAdd > (
                lastUpd.add(tokenHoldingTime)) || leader == _memberAddress) {
                if (!rewardClaimed[allVotesByMember[leader][i]][_memberAddress]) {
                    proposalId = allVotes[allVotesByMember[leader][i]].proposalId;
                    if (proposalVoteTally[proposalId].voters > 0 && allProposalData[proposalId].propStatus
                    > uint(ProposalStatus.VotingStarted)) {
                        pendingDAppReward = pendingDAppReward.add(
                            allProposalData[proposalId].commonIncentive.div(
                                proposalVoteTally[proposalId].voters
                            )
                        );
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

        } else if (code == "EPTIME") {

            ms.updatePauseTime(val * 1 days);

        } else if (code == "ACWT") {

            actionWaitingTime = val * 1 hours;

        } else {

            revert("Invalid code");

        }
    }

    /**
    * @dev Updates all dependency addresses to latest ones from Master
    */
    function changeDependentContractAddress() public {
        tokenInstance = TokenController(ms.dAppLocker());
        memberRole = MemberRoles(ms.getLatestAddress("MR"));
        proposalCategory = ProposalCategory(ms.getLatestAddress("PC"));
    }

    /**
    * @dev Checks if msg.sender is allowed to create a proposal under given category
    */
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
     * @dev Checks if an address is already delegated
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

    /**
    * @dev Pauses a proposal
    * To implement govblocks interface
    */
    function pauseProposal(uint) public {
    }

    /**
    * @dev Resumes a proposal
    * To implement govblocks interface
    */
    function resumeProposal(uint) public {
    }

    /**
    * @dev Checks If the proposal voting time is up and it's ready to close 
    *      i.e. Closevalue is 1 if proposal is ready to be closed, 2 if already closed, 0 otherwise!
    * @param _proposalId Proposal id to which closing value is being checked
    */
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
                if (proposalVoteTally[_proposalId].abVoteValue[1].mul(100).div(numberOfMembers) >= majority  
                || proposalVoteTally[_proposalId].abVoteValue[1].add(proposalVoteTally[_proposalId].abVoteValue[0]) == numberOfMembers
                || dateUpdate.add(_closingTime) <= now) {

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
     * @dev Gets Id of member role allowed to categorize the proposal
     * @return roleId allowed to categorize the proposal
     */
    function allowedToCatgorize() public view returns(uint roleId) {
        return roleIdAllowedToCatgorize;
    }

    /**
     * @dev Gets vote tally data
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
     * @dev Internal call to create proposal
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

        emit Proposal(
            msg.sender,
            _proposalId,
            now,
            _proposalTitle,
            _proposalSD,
            _proposalDescHash
        );

        if (_categoryId > 0)
            _categorizeProposal(_proposalId, _categoryId, 0);
    }

    /**
     * @dev Internal call to categorize a proposal
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
     * @dev Internal call to add solution to a proposal
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

    /**
    * @dev Internal call to add solution and open proposal for voting
    */
    function _proposalSubmission(
        uint _proposalId,
        string memory _solutionHash,
        bytes memory _action
    )
        internal
    {

        uint _categoryId = allProposalData[_proposalId].category;
        if (proposalCategory.categoryActionHashes(_categoryId).length == 0) {
            require(keccak256(_action) == keccak256(""));
            proposalActionStatus[_proposalId] = uint(ActionStatus.NoAction);
        }
        
        _addSolution(
            _proposalId,
            _action,
            _solutionHash
        );

        _updateProposalStatus(_proposalId, uint(ProposalStatus.VotingStarted));
        (, , , , , uint closingTime, ) = proposalCategory.category(_categoryId);
        emit CloseProposalOnTime(_proposalId, closingTime.add(now));

    }

    /**
     * @dev Internal call to submit vote
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

        require(memberProposalVote[msg.sender][_proposalId] == 0, "Not allowed");
        require((delegationId == 0) || (delegationId > 0 && allDelegation[delegationId].leader == address(0) && 
        _checkLastUpd(allDelegation[delegationId].lastUpd)));

        require(memberRole.checkRole(msg.sender, mrSequence), "Not Authorized");
        uint totalVotes = allVotes.length;

        allVotesByMember[msg.sender].push(totalVotes);
        memberProposalVote[msg.sender][_proposalId] = totalVotes;

        allVotes.push(ProposalVote(msg.sender, _proposalId, now));

        emit Vote(msg.sender, _proposalId, totalVotes, now, _solution);
        if (mrSequence == uint(MemberRoles.Role.Owner)) {
            if (_solution == 1)
                _callIfMajReached(_proposalId, uint(ProposalStatus.Accepted), allProposalData[_proposalId].category, 1, MemberRoles.Role.Owner);
            else
                _updateProposalStatus(_proposalId, uint(ProposalStatus.Rejected));
        
        } else {
            uint numberOfMembers = memberRole.numberOfMembers(mrSequence);
            _setVoteTally(_proposalId, _solution, mrSequence);

            if (mrSequence == uint(MemberRoles.Role.AdvisoryBoard)) {
                if (proposalVoteTally[_proposalId].abVoteValue[1].mul(100).div(numberOfMembers) 
                >= majority 
                || (proposalVoteTally[_proposalId].abVoteValue[1].add(proposalVoteTally[_proposalId].abVoteValue[0])) == numberOfMembers) {
                    emit VoteCast(_proposalId);
                }
            } else {
                if (numberOfMembers == proposalVoteTally[_proposalId].voters)
                    emit VoteCast(_proposalId);
            }
        }

    }

    /**
     * @dev Internal call to set vote tally of a proposal
     * @param _proposalId of proposal in concern
     * @param _solution of proposal in concern
     * @param mrSequence number of members for a role
     */
    function _setVoteTally(uint _proposalId, uint _solution, uint mrSequence) internal
    {
        uint categoryABReq;
        uint isSpecialResolution;
        (, categoryABReq, isSpecialResolution) = proposalCategory.categoryExtendedData(allProposalData[_proposalId].category);
        if (memberRole.checkRole(msg.sender, uint(MemberRoles.Role.AdvisoryBoard)) && (categoryABReq > 0) || 
            mrSequence == uint(MemberRoles.Role.AdvisoryBoard)) {
            proposalVoteTally[_proposalId].abVoteValue[_solution]++;
        }
        tokenInstance.lockForMemberVote(msg.sender, tokenHoldingTime);
        if (mrSequence != uint(MemberRoles.Role.AdvisoryBoard)) {
            uint voteWeight;
            uint voters = 1;
            uint tokenBalance = tokenInstance.totalBalanceOf(msg.sender);
            uint totalSupply = tokenInstance.totalSupply();
            if (isSpecialResolution == 1) {
                voteWeight = tokenBalance.add(10**18);
            } else {
                voteWeight = (_minOf(tokenBalance, maxVoteWeigthPer.mul(totalSupply).div(100))).add(10**18);
            }
            DelegateVote memory delegationData;
            for (uint i = 0; i < leaderDelegation[msg.sender].length; i++) {
                delegationData = allDelegation[leaderDelegation[msg.sender][i]];
                if (delegationData.leader == msg.sender && 
                _checkLastUpd(delegationData.lastUpd)) {
                    if (memberRole.checkRole(delegationData.follower, mrSequence)) {
                        tokenBalance = tokenInstance.totalBalanceOf(delegationData.follower);
                        tokenInstance.lockForMemberVote(delegationData.follower, tokenHoldingTime);
                        voters++;
                        if (isSpecialResolution == 1) {
                            voteWeight = voteWeight.add(tokenBalance.add(10**18));
                        } else {
                            voteWeight = voteWeight.add((_minOf(tokenBalance, maxVoteWeigthPer.mul(totalSupply).div(100))).add(10**18));
                        }
                    }
                }
            }
            proposalVoteTally[_proposalId].memberVoteValue[_solution] = proposalVoteTally[_proposalId].memberVoteValue[_solution].add(voteWeight);
            proposalVoteTally[_proposalId].voters = proposalVoteTally[_proposalId].voters + voters;
        }
    }

    /**
     * @dev Gets minimum of two numbers
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
     * @dev Check the time since last update has exceeded token holding time or not
     * @param _lastUpd is last update time
     * @return the bool which tells if the time since last update has exceeded token holding time or not
     */
    function _checkLastUpd(uint _lastUpd) internal view returns(bool) {
        return (now - _lastUpd) > tokenHoldingTime;
    }

    /**
    * @dev Checks if the vote count against any solution passes the threshold value or not.
    */
    function _checkForThreshold(uint _proposalId, uint _category) internal view returns(bool check) {
        uint categoryQuorumPerc;
        uint roleAuthorized;
        (, roleAuthorized, , categoryQuorumPerc, , , ) = proposalCategory.category(_category);
        check = ((proposalVoteTally[_proposalId].memberVoteValue[0]
                            .add(proposalVoteTally[_proposalId].memberVoteValue[1]))
                        .mul(100))
                .div(
                    tokenInstance.totalSupply().add(
                        memberRole.numberOfMembers(roleAuthorized).mul(10 ** 18)
                    )
                ) >= categoryQuorumPerc;
    }
    
    /**
     * @dev Called when vote majority is reached
     * @param _proposalId of proposal in concern
     * @param _status of proposal in concern
     * @param category of proposal in concern
     * @param max vote value of proposal in concern
     */
    function _callIfMajReached(uint _proposalId, uint _status, uint category, uint max, MemberRoles.Role role) internal {
        
        allProposalData[_proposalId].finalVerdict = max;
        _updateProposalStatus(_proposalId, _status);
        emit ProposalAccepted(_proposalId);
        if (proposalActionStatus[_proposalId] != uint(ActionStatus.NoAction)) {
            if (role == MemberRoles.Role.AdvisoryBoard) {
                _triggerAction(_proposalId, category);
            } else {
                proposalActionStatus[_proposalId] = uint(ActionStatus.Accepted);
                proposalExecutionTime[_proposalId] = actionWaitingTime.add(now);
            }
        }
    }

    /**
     * @dev Internal function to trigger action of accepted proposal
     */
    function _triggerAction(uint _proposalId, uint _categoryId) internal {
        proposalActionStatus[_proposalId] = uint(ActionStatus.Executed);
        bytes2 contractName;
        address actionAddress;
        bytes memory _functionHash;
        (, actionAddress, contractName, , _functionHash) = proposalCategory.categoryActionDetails(_categoryId);
        if (contractName == "MS") {
            actionAddress = address(ms);
        } else if (contractName != "EX") {
            actionAddress = ms.getLatestAddress(contractName);
        }
        (bool actionStatus, ) = actionAddress.call(abi.encodePacked(_functionHash, allProposalSolutions[_proposalId][1]));
        if (actionStatus) {
            emit ActionSuccess(_proposalId);
        } else {
            proposalActionStatus[_proposalId] = uint(ActionStatus.Accepted);
            emit ActionFailed(_proposalId);
        }
    }

    /**
     * @dev Internal call to update proposal status
     * @param _proposalId of proposal in concern
     * @param _status of proposal to set
     */
    function _updateProposalStatus(uint _proposalId, uint _status) internal {
        if (_status == uint(ProposalStatus.Rejected) || _status == uint(ProposalStatus.Denied)) {
            proposalActionStatus[_proposalId] = uint(ActionStatus.NoAction);   
        }
        allProposalData[_proposalId].dateUpd = now;
        allProposalData[_proposalId].propStatus = _status;
    }

    /**
     * @dev Internal call to undelegate a follower
     * @param _follower is address of follower to undelegate
     */
    function _unDelegate(address _follower) internal {
        uint followerId = followerDelegation[_follower];
        if (followerId > 0) {

            followerCount[allDelegation[followerId].leader] = followerCount[allDelegation[followerId].leader].sub(1);
            allDelegation[followerId].leader = address(0);
            allDelegation[followerId].lastUpd = now;

            lastRewardClaimed[_follower] = allVotesByMember[_follower].length;
        }
    }

    /**
     * @dev Internal call to close member voting
     * @param _proposalId of proposal in concern
     * @param category of proposal in concern
     */
    function _closeMemberVote(uint _proposalId, uint category) internal {
        uint isSpecialResolution;
        uint abMaj;
        (, abMaj, isSpecialResolution) = proposalCategory.categoryExtendedData(category);
        if (isSpecialResolution == 1) {
            uint acceptedVotePerc = proposalVoteTally[_proposalId].memberVoteValue[1].mul(100)
            .div(
                tokenInstance.totalSupply().add(
                        memberRole.numberOfMembers(uint(MemberRoles.Role.Member)).mul(10**18)
                    ));
            if (acceptedVotePerc >= specialResolutionMajPerc) {
                _callIfMajReached(_proposalId, uint(ProposalStatus.Accepted), category, 1, MemberRoles.Role.Member);
            } else {
                _updateProposalStatus(_proposalId, uint(ProposalStatus.Denied));
            }
        } else {
            if (_checkForThreshold(_proposalId, category)) {
                uint majorityVote;
                (, , majorityVote, , , , ) = proposalCategory.category(category);
                if (
                    ((proposalVoteTally[_proposalId].memberVoteValue[1].mul(100))
                                        .div(proposalVoteTally[_proposalId].memberVoteValue[0]
                                                .add(proposalVoteTally[_proposalId].memberVoteValue[1])
                                        ))
                    >= majorityVote
                    ) {
                        _callIfMajReached(_proposalId, uint(ProposalStatus.Accepted), category, 1, MemberRoles.Role.Member);
                    } else {
                        _updateProposalStatus(_proposalId, uint(ProposalStatus.Rejected));
                    }
            } else {
                if (abMaj > 0 && proposalVoteTally[_proposalId].abVoteValue[1].mul(100)
                .div(memberRole.numberOfMembers(uint(MemberRoles.Role.AdvisoryBoard))) >= abMaj) {
                    _callIfMajReached(_proposalId, uint(ProposalStatus.Accepted), category, 1, MemberRoles.Role.Member);
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
     * @dev Internal call to close advisory board voting
     * @param _proposalId of proposal in concern
     * @param category of proposal in concern
     */
    function _closeAdvisoryBoardVote(uint _proposalId, uint category) internal {
        uint _majorityVote;
        MemberRoles.Role _roleId = MemberRoles.Role.AdvisoryBoard;
        (, , _majorityVote, , , , ) = proposalCategory.category(category);
        if (proposalVoteTally[_proposalId].abVoteValue[1].mul(100)
        .div(memberRole.numberOfMembers(uint(_roleId))) >= _majorityVote) {
            _callIfMajReached(_proposalId, uint(ProposalStatus.Accepted), category, 1, _roleId);
        } else {
            _updateProposalStatus(_proposalId, uint(ProposalStatus.Denied));
        }

    }

}
