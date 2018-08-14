/* Copyright (C) 2017 GovBlocks.io

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

pragma solidity ^0.4.24;
import "./GovernanceData.sol";
import "./ProposalCategory.sol";
import "./MemberRoles.sol";
import "./Upgradeable.sol";
import "./Master.sol";
import "./SafeMath.sol";
import "./Math.sol";
import "./Pool.sol";
import "./GBTStandardToken.sol";
import "./VotingType.sol";
import "./EventCaller.sol";


contract Governance is Upgradeable {

    using SafeMath for uint;
    address internal poolAddress;
    address internal masterAddress;
    GBTStandardToken internal govBlocksToken;
    Master internal master;
    MemberRoles internal memberRole;
    ProposalCategory internal proposalCategory;
    GovernanceData internal governanceDat;
    Pool internal pool;
    VotingType internal votingType;
    EventCaller internal eventCaller;

    modifier onlyInternal {
        master = Master(masterAddress);
        require(master.isInternal(msg.sender));
        _;
    }

    modifier onlyProposalOwner(uint _proposalId) {
        require(msg.sender == governanceDat.getProposalOwner(_proposalId));
        _;
    }

    modifier checkProposalValidity(uint _proposalId) {
        require(governanceDat.getProposalStatus(_proposalId) < 2);
        _;
    }

    modifier validateStake(uint8 _categoryId, uint _proposalStake) {
        uint stake = _proposalStake / (10 ** govBlocksToken.decimals());
        uint category = proposalCategory.getCategoryIdBySubId(_categoryId);
        require(stake <= proposalCategory.getMaxStake(category) && stake >= proposalCategory.getMinStake(category));
        _;
    }

    /// @dev updates all dependency addresses to latest ones from Master
    function updateDependencyAddresses() public onlyInternal {
        master = Master(masterAddress);
        governanceDat = GovernanceData(master.getLatestAddress("GD"));
        memberRole = MemberRoles(master.getLatestAddress("MR"));
        proposalCategory = ProposalCategory(master.getLatestAddress("PC"));
        poolAddress = master.getLatestAddress("PL");
        votingType = VotingType(master.getLatestAddress("SV"));
        pool = Pool(poolAddress);
        govBlocksToken = GBTStandardToken(master.getLatestAddress("GS"));
        eventCaller = EventCaller(master.getEventCallerAddress());
    }

    /// @dev Changes GBT standard token address
    /// @param _gbtsAddress New GBT standard token address
    function changeGBTSAddress(address _gbtsAddress) public onlyInternal {
        govBlocksToken = GBTStandardToken(_gbtsAddress);
    }

    /// @dev Changes master address
    /// @param _masterAddress New master address
    function changeMasterAddress(address _masterAddress) public {
        if (masterAddress == address(0))
            masterAddress = _masterAddress;
        else {
            master = Master(masterAddress);
            require(master.isInternal(msg.sender));
            masterAddress = _masterAddress;
        }
    }

    /// @dev Creates a new proposal
    /// @param _proposalDescHash Proposal description hash through IPFS having Short and long description of proposal
    /// @param _votingTypeId Voting type id that depicts which voting procedure to follow for this proposal
    /// @param _categoryId This id tells under which the proposal is categorized i.e. Proposal's Objective
    /// @param _dateAdd Date the proposal was added
    function createProposal(
        string _proposalTitle, 
        string _proposalSD, 
        string _proposalDescHash, 
        uint _votingTypeId, 
        uint8 _categoryId, 
        uint _dateAdd
    ) 
        public 
    {
        address votingAddress = governanceDat.getVotingTypeAddress(_votingTypeId);
        uint8 category = proposalCategory.getCategoryIdBySubId(_categoryId);
        uint _proposalId = governanceDat.getProposalLength();
        governanceDat.setSolutionAdded(_proposalId, address(0), "address(0)");
        governanceDat.callProposalEvent(
            msg.sender, 
            _proposalId, 
            _dateAdd, 
            _proposalTitle, 
            _proposalSD, 
            _proposalDescHash
        );
        if (_categoryId > 0) {
            governanceDat.addNewProposal(_proposalId, msg.sender, _categoryId, votingAddress, _dateAdd);
            uint incentive=proposalCategory.getCatIncentive(category);
            governanceDat.setProposalIncentive(_proposalId, incentive);
        } else
            governanceDat.createProposal1(msg.sender, votingAddress, _dateAdd);
    }

    /// @dev Creates a new proposal
    /// @param _proposalDescHash Proposal description hash through IPFS having Short and long description of proposal
    /// @param _votingTypeId Voting type id that depicts which voting procedure to follow for this proposal
    /// @param _categoryId This id tells under which the proposal is categorized i.e. Proposal's Objective
    /// @param _proposalSolutionStake Proposal solution stake
    /// @param _solutionHash Solution hash contains  parameters, values and description needed according to proposal
    function createProposalwithSolution(
        string _proposalTitle, 
        string _proposalSD, 
        string _proposalDescHash, 
        uint _votingTypeId, 
        uint8 _categoryId, 
        uint _proposalSolutionStake, 
        string _solutionHash, 
        uint _validityUpto, 
        uint8 _v, 
        bytes32 _r, 
        bytes32 _s, 
        bytes32 _lockTokenTxHash,
        bytes _action
    ) 
        public
    {
        uint _proposalId = governanceDat.getProposalLength();
        createProposal(_proposalTitle, _proposalSD, _proposalDescHash, _votingTypeId, _categoryId, now);
        proposalSubmission(
            _proposalId, 
            _categoryId, 
            _proposalSolutionStake, 
            _solutionHash, 
            _validityUpto, 
            _v, 
            _r, 
            _s, 
            _lockTokenTxHash, 
            _action
        );
    }

    /// @dev Submit proposal with solution
    /// @param _proposalId Proposal id
    /// @param _proposalSolutionStake Stake in GBT at the time of proposal creation with solution
    /// @param _solutionHash Solution hash contains  parameters, values and description needed according to proposal
    function submitProposalWithSolution(
        uint _proposalId, 
        uint _proposalSolutionStake, 
        string _solutionHash, 
        uint _validityUpto,
        uint8 _v, 
        bytes32 _r, 
        bytes32 _s,
        bytes32 _lockTokenTxHash,
        bytes _action
    ) 
        public 
        onlyProposalOwner(_proposalId) 
    {
        proposalSubmission(
            _proposalId, 
            0, 
            _proposalSolutionStake, 
            _solutionHash, 
            _validityUpto, 
            _v, 
            _r, 
            _s, 
            _lockTokenTxHash, 
            _action
        );
    }

    /// @dev Categorizes proposal to proceed further. Categories shows the proposal objective.
    /// @param _dappIncentive It is the company's incentive to distribute to end members
    function categorizeProposal(
        uint _proposalId, 
        uint8 _categoryId, 
        uint _dappIncentive
    ) 
        public 
        checkProposalValidity(_proposalId) 
    {
        require(memberRole.checkRoleIdByAddress(msg.sender, memberRole.getAuthorizedMemberId()));
        require(_dappIncentive <= govBlocksToken.balanceOf(poolAddress));

        governanceDat.setProposalIncentive(_proposalId, _dappIncentive);
        governanceDat.setProposalCategory(_proposalId, _categoryId);
    }

    /// @dev Proposal is open for voting.
    /// @param  _proposalStake Stake in GBT to open it for voting 
    function openProposalForVoting(
        uint _proposalId, 
        uint8 _categoryId,
        uint _proposalStake, 
        uint _validityUpto, 
        uint8 _v, 
        bytes32 _r, 
        bytes32 _s, 
        bytes32 _lockTokenTxHash
    ) 
        public 
        validateStake(_categoryId, _proposalStake) 
        onlyProposalOwner(_proposalId) 
        checkProposalValidity(_proposalId) 
    {
        uint8 category = proposalCategory.getCategoryIdBySubId(_categoryId);
        require(category != 0);
        openProposalForVoting2(_proposalId, category, _proposalStake, _validityUpto, _v, _r, _s, _lockTokenTxHash);

    }

    /// @dev Checks If the proposal voting time is up and it's ready to close 
    ///      i.e. Closevalue is 1 in case of closing, 0 otherwise!
    /// @param _proposalId Proposal id to which closing value is being checked
    /// @param _roleId Voting will gets close for the role id provided here.
    function checkForClosing(uint _proposalId, uint32 _roleId) public view returns(uint8 closeValue) {
        uint dateUpdate;
        uint pStatus;
        uint _closingTime;
        uint _majorityVote;
        (, , dateUpdate, , pStatus) = governanceDat.getProposalDetailsById1(_proposalId);
        uint _categoryId = proposalCategory.getCategoryIdBySubId(governanceDat.getProposalCategory(_proposalId));
        (, _majorityVote, _closingTime) = proposalCategory.getCategoryData3(
            _categoryId, 
            governanceDat.getProposalCurrentVotingId(_proposalId)
        );

        if (pStatus == 2 && _roleId != 2) {
            if (SafeMath.add(dateUpdate, _closingTime) <= now || 
                governanceDat.getAllVoteIdsLengthByProposalRole(_proposalId, _roleId) 
                == memberRole.getAllMemberLength(_roleId)
            )
                closeValue = 1;
        } else if (pStatus == 2) {
            if (SafeMath.add(dateUpdate, _closingTime) <= now)
                closeValue = 1;
        } else if (pStatus > 2) {
            closeValue = 2;
        } else {
            closeValue = 0;
        }
    }

    /// @dev Changes pending proposal start variable
    function changePendingProposalStart() public onlyInternal {
        uint pendingPS = governanceDat.pendingProposalStart();
        for (uint j = pendingPS; j < governanceDat.getProposalLength(); j++) {
            if (governanceDat.getProposalStatus(j) > 3)
                pendingPS = SafeMath.add(pendingPS, 1);
            else
                break;
        }
        if (j != pendingPS) {
            governanceDat.changePendingProposalStart(j);
        }
    }

    /// @dev Updates proposal's major details (Called from close proposal vote)
    /// @param _proposalId Proposal id
    /// @param _currVotingStatus It is the index to fetch the role id from voting sequence array. 
    ///         i.e. Tells which role id members is going to vote
    /// @param _intermediateVerdict Intermediate verdict is set after every voting layer is passed.
    /// @param _finalVerdict Final verdict is set after final layer of voting
    function updateProposalDetails(
        uint _proposalId, 
        uint8 _currVotingStatus, 
        uint8 _intermediateVerdict, 
        uint8 _finalVerdict
    ) 
    public
    onlyInternal 
    {
        governanceDat.setProposalCurrentVotingId(_proposalId, _currVotingStatus);
        governanceDat.setProposalIntermediateVerdict(_proposalId, _intermediateVerdict);
        governanceDat.setProposalFinalVerdict(_proposalId, _finalVerdict);
        governanceDat.setProposalDateUpd(_proposalId);
    }

    /// @dev Updating proposal details after reward being distributed
    /// @param _proposalId Proposal id
    /// @param _totalRewardToDistribute Total reward to be distributed 
    /// @param _totalVoteValue Total vote value not favourable to the solution
    function setProposalDetails(
        uint _proposalId, 
        uint _totalRewardToDistribute, 
        uint _totalVoteValue
    ) 
    public 
    onlyInternal 
    {
        governanceDat.setProposalTotalReward(_proposalId, _totalRewardToDistribute);
        governanceDat.setProposalTotalVoteValue(_proposalId, _totalVoteValue);
    }

    /// @dev Calculates member reward to be claimed
    /// @param _memberAddress Member address
    /// @return rewardToClaim Rewards to be claimed
    function calculateMemberReward(address _memberAddress) public returns(uint tempFinalRewardToDistribute) {
        uint lastRewardProposalId;
        uint lastRewardSolutionProposalId;
        uint lastRewardVoteId;
        (lastRewardProposalId, lastRewardSolutionProposalId, lastRewardVoteId) = 
            governanceDat.getAllidsOfLastReward(_memberAddress);

        tempFinalRewardToDistribute = 
            calculateProposalReward(_memberAddress, lastRewardProposalId) 
            + calculateSolutionReward(_memberAddress, lastRewardSolutionProposalId) 
            + calculateVoteReward(_memberAddress, lastRewardVoteId);
    }

    /// @dev Gets member details
    /// @param _memberAddress Member address
    /// @return memberReputation Member reputation that has been updated till now
    /// @return totalProposal Total number of proposals created by member so far
    /// @return totalSolution Total solution proposed by member for different proposal till now.
    /// @return totalVotes Total number of votes casted by member
    function getMemberDetails(address _memberAddress) 
        public 
        view 
        returns(
            uint memberReputation, 
            uint totalProposal, 
            uint totalSolution, 
            uint totalVotes
        ) 
    {
        memberReputation = governanceDat.getMemberReputation(_memberAddress);
        totalProposal = governanceDat.getAllProposalIdsLengthByAddress(_memberAddress);
        totalSolution = governanceDat.getAllSolutionIdsLengthByAddress(_memberAddress);
        totalVotes = governanceDat.getTotalNumberOfVotesByAddress(_memberAddress);
    }

    /// @dev It fetchs the Index of solution provided by member against a proposal
    function getSolutionIdAgainstAddressProposal(
        address _memberAddress, 
        uint _proposalId
    ) 
        public 
        view 
        returns(
            uint proposalId, 
            uint solutionId, 
            uint proposalStatus, 
            uint finalVerdict, 
            uint totalReward, 
            uint category
        ) 
    {
        uint length = governanceDat.getTotalSolutions(_proposalId);
        for (uint i = 0; i < length; i++) {
            if (_memberAddress == governanceDat.getSolutionAddedByProposalId(_proposalId, i)) {
                solutionId = i;
                proposalId = _proposalId;
                proposalStatus = governanceDat.getProposalStatus(_proposalId);
                finalVerdict = governanceDat.getProposalFinalVerdict(_proposalId);
                totalReward = governanceDat.getProposalTotalReward(_proposalId);
                category = proposalCategory.getCategoryIdBySubId(governanceDat.getProposalCategory(_proposalId));
                break;
            }
        }
    }

    /// @dev Gets total votes against a proposal when given proposal id
    /// @param _proposalId Proposal id
    /// @return totalVotes total votes against a proposal
    function getAllVoteIdsLengthByProposal(uint _proposalId) public view returns(uint totalVotes) {
        // memberRole=MemberRoles(MRAddress);
        uint length = memberRole.getTotalMemberRoles();
        for (uint i = 0; i < length; i++) {
            totalVotes = totalVotes + governanceDat.getAllVoteIdsLengthByProposalRole(_proposalId, i);
        }
    }

    /// @dev Proposal is submitted for voting i.e. Voting is started from this step
    function openProposalForVoting2(
        uint _proposalId, 
        uint8 _categoryId, 
        uint _proposalStake, 
        uint validityUpto, 
        uint8 _v, 
        bytes32 _r, 
        bytes32 _s,
        bytes32 _lockTokenTxHash
    ) 
        internal 
    {
        uint depositPerc = governanceDat.depositPercProposal();
        uint _currVotingStatus = governanceDat.getProposalCurrentVotingId(_proposalId);
        uint proposalDepositPerc = governanceDat.depositPercProposal();
        uint depositAmount = SafeMath.div(SafeMath.mul(_proposalStake, proposalDepositPerc), 100);

        if (_proposalStake != 0) {
            require(validityUpto >= 
                proposalCategory.getRemainingClosingTime(_proposalId, _categoryId, _currVotingStatus)
            );
            if (depositPerc == 0) {
                uint _stake = SafeMath.sub(_proposalStake, depositAmount);
                govBlocksToken.lockToken(msg.sender, _stake, validityUpto, _v, _r, _s, _lockTokenTxHash);
            } else {
                govBlocksToken.depositAndLockToken(
                    msg.sender, 
                    _proposalStake, 
                    depositAmount, 
                    validityUpto, 
                    _v, 
                    _r, 
                    _s, 
                    _lockTokenTxHash, 
                    address(pool)
                );
                governanceDat.setDepositTokens(msg.sender, _proposalId, "P", depositAmount);
            }
        }

        governanceDat.changeProposalStatus(_proposalId, 2);
        callCloseEvent(_proposalId);
        governanceDat.callProposalStakeEvent(msg.sender, _proposalId, now, _proposalStake);
    }

    /// @dev Call event for closing proposal
    /// @param _proposalId Proposal id which voting needs to be closed
    function callCloseEvent(uint _proposalId) internal {
        uint8 subCategory = governanceDat.getProposalCategory(_proposalId);
        uint8 _categoryId = proposalCategory.getCategoryIdBySubId(subCategory);
        uint closingTime = proposalCategory.getClosingTimeAtIndex(_categoryId, 0) + now;
        eventCaller.callCloseProposalOnTimeAtAddress(_proposalId, address(votingType), closingTime);
    }

    /// @dev Edits the details of an existing proposal and creates new version
    /// @param _proposalId Proposal id that details needs to be updated
    /// @param _proposalDescHash Proposal description hash having long and short description of proposal.
    function updateProposalDetails1(
        uint _proposalId, 
        string _proposalTitle, 
        string _proposalSD, 
        string _proposalDescHash
    ) 
        internal 
    {
        governanceDat.storeProposalVersion(_proposalId, _proposalDescHash);
        governanceDat.setProposalDateUpd(_proposalId);
        governanceDat.changeProposalStatus(_proposalId, 1);
        governanceDat.callProposalEvent(
            governanceDat.getProposalOwner(_proposalId), 
            _proposalId, 
            now, 
            _proposalTitle, 
            _proposalSD, 
            _proposalDescHash
        );
    }

    /// @dev Calculate reward for proposal creation against member
    /// @param _memberAddress Address of member who claimed the reward
    /// @param _lastRewardProposalId Last id proposal till which the reward being distributed
    function calculateProposalReward(
        address _memberAddress, 
        uint _lastRewardProposalId
    ) 
        internal  
        returns(uint tempfinalRewardToDistribute)
    {
        uint allProposalLength = governanceDat.getProposalLength();
        uint lastIndex = 0;
        uint finalVredict;
        uint proposalStatus;
        uint calcReward;
        uint8 category;
        uint32 addProposalOwnerPoints;
        (addProposalOwnerPoints, , , , , ) = governanceDat.getMemberReputationPoints();

        for (uint i = _lastRewardProposalId; i < allProposalLength; i++) {
            if (_memberAddress == governanceDat.getProposalOwner(i)) {
                (, , category, proposalStatus, finalVredict) = governanceDat.getProposalDetailsById3(i);
                if (proposalStatus < 2)
                    lastIndex = i;
                else if (proposalStatus > 2 && 
                    finalVredict > 0 && 
                    governanceDat.getReturnedTokensFlag(_memberAddress, i, "P") == 0 &&
                    governanceDat.getProposalTotalReward(i) != 0
                ) {
                    category = proposalCategory.getCategoryIdBySubId(category);
                    calcReward = proposalCategory.getRewardPercProposal(category) 
                        * governanceDat.getProposalTotalReward(i)
                        / 100;

                    tempfinalRewardToDistribute = 
                        tempfinalRewardToDistribute 
                        + calcReward 
                        + governanceDat.getDepositedTokens(_memberAddress, i, "P");

                    calculateProposalReward1(_memberAddress, i, calcReward, addProposalOwnerPoints);
                }
            }
        }

        if (lastIndex == 0)
            lastIndex = i;
        governanceDat.setLastRewardIdOfCreatedProposals(_memberAddress, lastIndex);
    }

    /// @dev Saving reward and member reputation details 
    function calculateProposalReward1(
        address _memberAddress, 
        uint i, 
        uint calcReward, 
        uint32 addProposalOwnerPoints
    ) 
        internal
    {
        if (calcReward > 0) {
            governanceDat.callRewardEvent(
                _memberAddress, 
                i, 
                "GBT Reward-Proposal owner", 
                calcReward
            );
        }
        
        governanceDat.setMemberReputation(
            "Reputation credit-proposal owner", 
            i, 
            _memberAddress, 
            SafeMath.add32(governanceDat.getMemberReputation(_memberAddress), addProposalOwnerPoints), 
            addProposalOwnerPoints, 
            "C"
        );

        governanceDat.setReturnedTokensFlag(_memberAddress, i, "P", 1);
    }

    /// @dev Calculate reward for proposing solution against different proposals
    /// @param _memberAddress Address of member who claimed the reward
    /// @param _lastRewardSolutionProposalId Last id proposal(To which solutions being proposed) 
    ///         till which the reward being distributed
    function calculateSolutionReward(
        address _memberAddress, 
        uint _lastRewardSolutionProposalId
    ) 
        internal  
        returns(uint tempfinalRewardToDistribute) 
    {
        uint allProposalLength = governanceDat.getProposalLength();
        uint calcReward;
        uint lastIndex = 0;
        uint i;
        uint proposalStatus;
        uint finalVerdict;
        uint solutionId;
        uint proposalId;
        uint totalReward;
        uint category;
        uint addSolutionOwnerPoints;
        (addSolutionOwnerPoints, , , , , ) = governanceDat.getMemberReputationPoints();

        for (i = _lastRewardSolutionProposalId; i < allProposalLength; i++) {
            (proposalId, solutionId, proposalStatus, finalVerdict, totalReward, category) = 
                getSolutionIdAgainstAddressProposal(_memberAddress, i);

            if (proposalId == i) {
                if (proposalStatus < 2)
                    lastIndex = i;
                if (finalVerdict > 0 && finalVerdict == solutionId)
                    tempfinalRewardToDistribute = 
                        tempfinalRewardToDistribute 
                        + calculateSolutionReward1(
                            _memberAddress, 
                            i, 
                            calcReward, 
                            totalReward, 
                            category, 
                            proposalId
                        );
            }
        }

        if (lastIndex == 0)
            lastIndex = i;
        governanceDat.setLastRewardIdOfSolutionProposals(_memberAddress, lastIndex);
    }

    /// @dev Saving solution reward and member reputation details
    function calculateSolutionReward1(
        address _memberAddress, 
        uint i, 
        uint calcReward, 
        uint totalReward, 
        uint category, 
        uint proposalId
    ) 
        internal  
        returns(uint tempfinalRewardToDistribute) 
    {
        if (governanceDat.getReturnedTokensFlag(_memberAddress, proposalId, "S") == 0) {
            uint32 addSolutionOwnerPoints;
            (addSolutionOwnerPoints, , , , , ) = governanceDat.getMemberReputationPoints();
            calcReward = (proposalCategory.getRewardPercSolution(category) * totalReward) / 100;
            tempfinalRewardToDistribute = 
                calcReward 
                + governanceDat.getDepositedTokens(_memberAddress, i, "S");
            if (calcReward > 0) {
                governanceDat.callRewardEvent(
                    _memberAddress, 
                    i, 
                    "GBT Reward-Solution owner", 
                    calcReward
                );
            }
            
            governanceDat.setMemberReputation(
                "Reputation credit-solution owner", 
                i, 
                _memberAddress, 
                SafeMath.add32(governanceDat.getMemberReputation(_memberAddress), addSolutionOwnerPoints), 
                addSolutionOwnerPoints, 
                "C"
            );

            governanceDat.setReturnedTokensFlag(_memberAddress, i, "S", 1);
        }
    }
    
    /// @dev Calculate reward for casting vote against member
    /// @param _memberAddress Address of member who claimed the reward
    /// @param _lastRewardVoteId Last vote id till which the reward being distributed
    function calculateVoteReward(
        address _memberAddress, 
        uint _lastRewardVoteId
    ) 
        internal  
        returns(uint tempfinalRewardToDistribute) 
    {

        uint lastIndex = 0;
        uint i;
        uint totalVotes = governanceDat.getTotalNumberOfVotesByAddress(_memberAddress);
        uint tempfinalReward;
        uint voteId;
        uint proposalId;
        for (i = _lastRewardVoteId; i < totalVotes; i++) {
            voteId = governanceDat.getVoteIdOfNthVoteOfMember(_memberAddress, i);
            (, , , proposalId) = governanceDat.getVoteDetailById(voteId);
            (tempfinalReward, lastIndex) = calculateVoteReward1(_memberAddress, i, proposalId);
            tempfinalRewardToDistribute = tempfinalRewardToDistribute + tempfinalReward;
        }
        if (lastIndex == 0)
            lastIndex = i;
        governanceDat.setLastRewardIdOfVotes(_memberAddress, lastIndex);
    }

    function calculateVoteReward1(address _memberAddress, uint _voteNo, uint _proposalId) 
        internal
        returns (uint tempfinalRewardToDistribute, uint lastIndex) 
    {
        uint solutionChosen;
        uint proposalStatus;
        uint finalVredict;
        uint voteValue;
        uint totalReward;
        uint category;
        uint calcReward;

        uint returnedTokensFlag = governanceDat.getReturnedTokensFlag(_memberAddress, _proposalId, "V");
        (solutionChosen, proposalStatus, finalVredict, voteValue, totalReward, category, ) = 
            getVoteDetailsToCalculateReward(_memberAddress, _voteNo);

        if (proposalStatus < 2)
            lastIndex = _voteNo;
        if (finalVredict > 0 && solutionChosen == finalVredict && returnedTokensFlag == 0 && totalReward != 0) {
            calcReward = (proposalCategory.getRewardPercVote(category) * voteValue * totalReward) 
                / (100 * governanceDat.getProposalTotalVoteValue(_proposalId));

            tempfinalRewardToDistribute = tempfinalRewardToDistribute 
                + calcReward 
                + governanceDat.getDepositedTokens(_memberAddress, _proposalId, "V");

            if (calcReward > 0) {
                governanceDat.callRewardEvent(
                    _memberAddress, 
                    _proposalId, 
                    "GBT Reward-vote accepted", 
                    calcReward
                );
            }
            governanceDat.setReturnedTokensFlag(_memberAddress, _proposalId, "V", 1);
        } else if (!governanceDat.punishVoters() && finalVredict > 0 && returnedTokensFlag == 0 && totalReward != 0) {
            calcReward = (proposalCategory.getRewardPercVote(category) * voteValue * totalReward) 
                / (100 * governanceDat.getProposalTotalVoteValue(_proposalId));
            tempfinalRewardToDistribute = tempfinalRewardToDistribute + calcReward;
            if (calcReward > 0) {
                governanceDat.callRewardEvent(
                    _memberAddress, 
                    _proposalId, 
                    "GBT Reward-voting", 
                    calcReward
                );
            }
        }
    }

    /// @dev Gets vote id details when giving member address and proposal id
    function getVoteDetailsToCalculateReward(
        address _memberAddress, 
        uint _voteNo
    ) 
        public 
        view 
        returns(
            uint solutionChosen, 
            uint proposalStatus, 
            uint finalVerdict, 
            uint voteValue, 
            uint totalReward, 
            uint category, 
            uint totalVoteValueProposal
        ) 
    {
        uint proposalId;
        uint _voteId = governanceDat.getVoteIdOfNthVoteOfMember(_memberAddress, _voteNo);
        (, , voteValue, proposalId) = governanceDat.getVoteDetailById(_voteId);
        solutionChosen = governanceDat.getSolutionByVoteIdAndIndex(_voteId, 0);
        proposalStatus = governanceDat.getProposalStatus(proposalId);
        finalVerdict = governanceDat.getProposalFinalVerdict(proposalId);
        totalReward = governanceDat.getProposalTotalReward(proposalId);
        category = proposalCategory.getCategoryIdBySubId(governanceDat.getProposalCategory(proposalId));
        totalVoteValueProposal = governanceDat.getProposalTotalVoteValue(proposalId);
    }

    /// @dev When creating or submitting proposal with solution, This function open the proposal for voting
    function proposalSubmission( 
        uint _proposalId,  
        uint8 _categoryId, 
        uint _proposalSolutionStake, 
        string _solutionHash, 
        uint _validityUpto, 
        uint8 _v, 
        bytes32 _r, 
        bytes32 _s, 
        bytes32 _lockTokenTxHash,
        bytes _action
    ) 
        internal 
    {
        require(_categoryId > 0);
        openProposalForVoting(
            _proposalId, 
            _categoryId, 
            _proposalSolutionStake, 
            _validityUpto, 
            _v, 
            _r, 
            _s, 
            _lockTokenTxHash
        );

        proposalSubmission1(
            _proposalId, 
            _solutionHash, 
            _validityUpto, 
            _v, 
            _r, 
            _s, 
            _lockTokenTxHash, 
            _proposalSolutionStake, 
            _action
        );
    }

    /// @dev When creating proposal with solution, it adds solution details against proposal
    function proposalSubmission1(
        uint _proposalId, 
        string _solutionHash, 
        uint _validityUpto, 
        uint8 _v, 
        bytes32 _r, 
        bytes32 _s, 
        bytes32 _lockTokenTxHash, 
        uint _proposalSolutionStake,
        bytes _action
    ) 
        internal  
    {
        // VT = VotingType(0x68D2e5342Dae099C1894ce022B6101bb6d4BBF3C);
        votingType.addSolution(
            _proposalId, 
            msg.sender, 
            _proposalSolutionStake, 
            _solutionHash, 
            now, 
            _validityUpto, 
            _v, 
            _r, 
            _s, 
            _lockTokenTxHash, 
            _action
        );

        governanceDat.callProposalWithSolutionEvent(
            msg.sender, 
            _proposalId, 
            "", 
            _solutionHash, 
            now, 
            _proposalSolutionStake
        );
    }

}