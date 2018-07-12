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

import "./Master.sol";
//import "./StandardVotingType.sol";
import "./GovernanceData.sol";
import "./Governance.sol";
import "./MemberRoles.sol";
import "./Upgradeable.sol";
import "./GBTStandardToken.sol";
import "./ProposalCategory.sol";
import "./GovBlocksMaster.sol";
import "./BasicToken.sol";
import "./Pool.sol";
import "./Math.sol";
import "./VotingType.sol";


contract SimpleVoting is VotingType, Upgradeable {
    using SafeMath for uint;
    GBTStandardToken internal gbt;
    GovernanceData internal governanceDat;
    MemberRoles internal memberRole;
    Governance internal governance;
    ProposalCategory internal proposalCategory;
    Master internal master;
    address internal govAddress;
    bool public constructorCheck;
    address public masterAddress;
    GovBlocksMaster internal govBlocksMaster;
    BasicToken internal basicToken;
    Pool internal pool;

    modifier onlyInternal {
        master = Master(masterAddress);
        require(master.isInternal(msg.sender));
        _;
    }

    modifier onlyMaster {
        require(msg.sender == masterAddress);
        _;
    }

    modifier validateStake(uint _proposalId, uint _stake) {    
        uint stake = _stake / (10 ** gbt.decimals());
        uint _category = proposalCategory.getCategoryIdBySubId(governanceDat.getProposalCategory(_proposalId));
        require(stake <= proposalCategory.getMaxStake(_category) && stake >= proposalCategory.getMinStake(_category));
        _;
    }

    /// @dev Initiates simple voting contract
    function simpleVotingInitiate() public {
        require(!constructorCheck);
        votingTypeName = "Simple Voting";
        constructorCheck = true;
    }

    /// @dev Changes master address
    /// @param _masterContractAddress New master contract address
    function changeMasterAddress(address _masterContractAddress) public {
        if (masterAddress == address(0))
            masterAddress = _masterContractAddress;
        else {
            master = Master(masterAddress);
            require(master.isInternal(msg.sender));
            masterAddress = _masterContractAddress;
        }
    }
    /*
    /// @dev Changes Global objects of the contracts || Uses latest version
    /// @param contractName Contract name 
    /// @param contractAddress Contract addresses
    function changeAddress(bytes4 contractName, address contractAddress) onlyInternal
    {
        if(contractName == 'GD'){
            GD = GovernanceData(contractAddress);
        } else if(contractName == 'MR'){
            MR = MemberRoles(contractAddress);
        } else if(contractName == 'PC'){
            PC = ProposalCategory(contractAddress);
        } else if(contractName == 'VT'){
            SVT = StandardVotingType(contractAddress);
        } else if(contractName == 'GV'){
            GOV = Governance(contractAddress);
            govAddress = contractAddress;
        }
    }*/

    /// @dev updates dependancies
    function updateDependencyAddresses() public onlyInternal {
        if (!constructorCheck)
            simpleVotingInitiate();
        master = Master(masterAddress);
        governanceDat = GovernanceData(master.getLatestAddress("GD"));
        memberRole = MemberRoles(master.getLatestAddress("MR"));
        proposalCategory = ProposalCategory(master.getLatestAddress("PC"));
        govAddress = master.getLatestAddress("GV");
        governance = Governance(govAddress);
        pool = Pool(master.getLatestAddress("PL"));
        gbt = GBTStandardToken(master.getLatestAddress("GS"));
    }

    /// @dev Changes GBT Standard Token address
    /// @param _gbtAddress New GBT standard token address
    function changeGBTSAddress(address _gbtAddress) public onlyMaster {
        gbt = GBTStandardToken(_gbtAddress);
    }

    /// @dev Initiates add solution (Stake in ether)
    /// @param _solutionHash It contains parameters, values and description needed according to proposal
    function addSolutionInEther(
        uint _proposalId, 
        string _solutionHash, 
        uint _validityUpto, 
        uint8 _v, 
        bytes32 _r, 
        bytes32 _s, 
        bytes32 _lockTokenTxHash, 
        bytes _action
    ) 
        public
        payable 
    {
        uint tokenAmount = gbt.buyToken.value(msg.value)();
        initiateAddSolution(
            _proposalId, 
            tokenAmount, 
            _solutionHash,
            _validityUpto, 
            _v, 
            _r,
            _s, 
            _lockTokenTxHash, 
            _action
        );
    }

    /// @dev Initiates add solution 
    /// @param _memberAddress Address of member who is adding the solution
    /// @param _solutionStake Stake in GBT against adding solution
    /// @param _solutionHash Solution hash having required data against adding solution
    /// @param _dateAdd Date when the solution was added
    function addSolution(
        uint _proposalId,
        address _memberAddress, 
        uint _solutionStake, 
        string _solutionHash, 
        uint _dateAdd, 
        uint _validityUpto, 
        uint8 _v, 
        bytes32 _r, 
        bytes32 _s, 
        bytes32 _lockTokenTxHash, 
        bytes _action
    ) 
        public 
        validateStake(_proposalId, _solutionStake) 
    {
        master = Master(masterAddress);
        require(master.isInternal(msg.sender) || msg.sender == _memberAddress);
        require(!alreadyAdded(_proposalId, _memberAddress));
        // if(msg.sender == _memberAddress) 
        //     receiveStake('S',_proposalId,_solutionStake,_validityUpto,_v,_r,_s,_lockTokenTxHash);
        addSolution1(
            _proposalId, 
            _memberAddress, 
            _solutionStake, 
            _solutionHash, 
            _dateAdd, 
            _validityUpto, 
            _v, 
            _r,
            _s, 
            _lockTokenTxHash, 
            _action
        );

    }

    /// @dev Adds solution
    /// @param _proposalId Proposal id
    /// @param _solutionStake Stake put by the member when providing a solution
    /// @param _solutionHash Solution hash
    function initiateAddSolution(
        uint _proposalId, 
        uint _solutionStake, 
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
        addSolution(
            _proposalId, 
            msg.sender, 
            _solutionStake, 
            _solutionHash, 
            now, 
            _validityUpto, 
            _v, 
            _r, 
            _s, 
            _lockTokenTxHash, 
            _action
        );
    }

    /// @dev Creates proposal for voting (Stake in ether)
    /// @param _proposalId Proposal id
    /// @param _solutionChosen solution id chosen while voting as a proposal might have different solution
    function proposalVotingInEther(
        uint64 _proposalId, 
        uint64[] _solutionChosen, 
        uint _validityUpto, 
        uint8 _v, 
        bytes32 _r, 
        bytes32 _s, 
        bytes32 _lockTokenTxHash
    ) 
        public
        payable 
    {
        uint tokenAmount = gbt.buyToken.value(msg.value)();
        proposalVoting(_proposalId, _solutionChosen, tokenAmount, _validityUpto, _v, _r, _s, _lockTokenTxHash);
    }

    /// @dev Creates proposal for voting
    /// @param _proposalId Proposal id
    /// @param _solutionChosen solution chosen while voting
    /// @param _voteStake Amount payable in GBT tokens
    function proposalVoting(
        uint64 _proposalId, 
        uint64[] _solutionChosen, 
        uint _voteStake, 
        uint _validityUpto, 
        uint8 _v, 
        bytes32 _r, 
        bytes32 _s, 
        bytes32 _lockTokenTxHash
    ) 
        public 
        validateStake(_proposalId, _voteStake) 
    {
        require(validateMember(_proposalId, _solutionChosen));
        require(governanceDat.getProposalStatus(_proposalId) == 2);

        // uint32 _mrSequence;
        // uint category=GD.getProposalCategory(_proposalId);
        // uint currVotingId=GD.getProposalCurrentVotingId(_proposalId);
        // (_mrSequence,,) = PC.getCategoryData3(category,currVotingId);
        receiveStake("V", _proposalId, _voteStake, _validityUpto, _v, _r, _s, _lockTokenTxHash);
        castVote(_proposalId, _solutionChosen, msg.sender, _voteStake);
    }

    /// @dev Checks if the solution is already added by a member against specific proposal
    /// @param _proposalId Proposal id
    /// @param _memberAddress Member address
    function alreadyAdded(uint _proposalId, address _memberAddress) public view returns(bool) {
        for (uint i = 0; i < governanceDat.getTotalSolutions(_proposalId); i++) {
            if (governanceDat.getSolutionAddedByProposalId(_proposalId, i) == _memberAddress)
                return true;
        }
    }

    /// @dev Returns true if the member passes all the checks to vote. i.e. If he is authorize to vote
    function validateMember(uint _proposalId, uint64[] _solutionChosen) public view returns(bool) {
        uint8 _mrSequence;
        uint8 category;
        uint currentVotingId;
        uint intermediateVerdict;
        (, category, currentVotingId, intermediateVerdict, , , ) = governanceDat.getProposalDetailsById2(_proposalId);
        uint _categoryId = proposalCategory.getCategoryIdBySubId(category);
        (_mrSequence, , ) = proposalCategory.getCategoryData3(_categoryId, currentVotingId);

        require(memberRole.checkRoleIdByAddress(msg.sender, _mrSequence) 
                && _solutionChosen.length == 1
                && !governanceDat.checkVoteIdAgainstMember(msg.sender, _proposalId));
        if (currentVotingId == 0)
            require(_solutionChosen[0] <= governanceDat.getTotalSolutions(_proposalId));
        else
            require(_solutionChosen[0] == intermediateVerdict || _solutionChosen[0] == 0);

        return true;
    }

    /// @dev Sets vote value given by member
    function getVoteValueGivenByMember(address _memberAddress, uint _memberStake)  
        public
        view 
        returns(uint128 finalVoteValue) 
    {
        uint tokensHeld = 
            SafeMath.div(
                SafeMath.mul(
                    SafeMath.mul(gbt.balanceOf(_memberAddress), 100), 
                    100
                ), 
                gbt.totalSupply()
            );
        uint value = 
            SafeMath.mul(
                Math.max256(_memberStake, governanceDat.scalingWeight()), 
                Math.max256(tokensHeld, governanceDat.membershipScalingFactor())
            );
        finalVoteValue = SafeMath.mul128(governanceDat.getMemberReputation(_memberAddress), uint128(value));
    }

    /// @dev Closes Proposal Voting after All voting layers done with voting or Time out happens.
    function closeProposalVote(uint _proposalId) public {
        uint256 totalVoteValue = 0;
        uint8 category = proposalCategory.getCategoryIdBySubId(governanceDat.getProposalCategory(_proposalId));
        uint8 currentVotingId = governanceDat.getProposalCurrentVotingId(_proposalId);
        uint8 i;
        uint8 max = 0;

        //used to throw if proposal closing called enough times already
        //as the currentVotingId becomes greater than length of role sequence array
        uint32 _mrSequenceId = proposalCategory.getRoleSequencAtIndex(category, currentVotingId);

        require(governance.checkForClosing(_proposalId, _mrSequenceId) == 1);
        uint[] memory finalVoteValue = new uint[](governanceDat.getTotalSolutions(_proposalId));
        for (i = 0; i < governanceDat.getAllVoteIdsLengthByProposalRole(_proposalId, _mrSequenceId); i++) {
            uint voteId = governanceDat.getVoteIdAgainstProposalRole(_proposalId, _mrSequenceId, i);
            uint solutionChosen = governanceDat.getSolutionByVoteIdAndIndex(voteId, 0);
            uint voteValue = governanceDat.getVoteValue(voteId);
            totalVoteValue = totalVoteValue + voteValue;
            finalVoteValue[solutionChosen] = finalVoteValue[solutionChosen] + voteValue;
        }

        
        for (i = 0; i < finalVoteValue.length; i++) {
            if (finalVoteValue[max] < finalVoteValue[i]) {
                max = i;
            }
        }

        if (checkForThreshold(_proposalId, _mrSequenceId)) {
            closeProposalVote1(finalVoteValue[max], totalVoteValue, category, _proposalId, max);
        } else {
            uint8 interVerdict = governanceDat.getProposalIntermediateVerdict(_proposalId);

            governance.updateProposalDetails(_proposalId, currentVotingId, max, interVerdict);
            if (governanceDat.getProposalCurrentVotingId(_proposalId) + 1 
                < proposalCategory.getRoleSequencLength(category)
            )
                governanceDat.changeProposalStatus(_proposalId, 7);
            else
                governanceDat.changeProposalStatus(_proposalId, 6);
            governance.changePendingProposalStart();
        }
    }

    /// @dev Gives rewards to respective members after final decision
    function giveRewardAfterFinalDecision(uint _proposalId) public {
        uint   totalReward;
        address  ownerAddress;
        uint  depositedTokens;
        uint finalVerdict = governanceDat.getProposalFinalVerdict(_proposalId);
        if (finalVerdict == 0) {
            ownerAddress = governanceDat.getProposalOwner(_proposalId);
            depositedTokens = governanceDat.getDepositedTokens(ownerAddress, _proposalId, "P");
            totalReward = SafeMath.add(totalReward, depositedTokens);
        }    

        for (uint i = 0; i < governanceDat.getTotalSolutions(_proposalId); i++) {
            if (i != finalVerdict) {
                ownerAddress = governanceDat.getSolutionAddedByProposalId(_proposalId, i);
                depositedTokens = governanceDat.getDepositedTokens(ownerAddress, _proposalId, "S");
                totalReward = SafeMath.add(totalReward, depositedTokens);
            }    
        }
        
        giveRewardAfterFinalDecision1(finalVerdict, _proposalId, ownerAddress, depositedTokens, totalReward);
    }

    /// @dev This does the remaining functionality of closing proposal vote
    function closeProposalVote1(uint maxVoteValue, uint totalVoteValue, uint8 category, uint _proposalId, uint8 max) 
        internal 
    {
        uint _closingTime;
        uint _majorityVote;
        uint8 currentVotingId = governanceDat.getProposalCurrentVotingId(_proposalId);
        (, _majorityVote, _closingTime) = proposalCategory.getCategoryData3(category, currentVotingId);
        if (SafeMath.div(SafeMath.mul(maxVoteValue, 100), totalVoteValue) >= _majorityVote) {
            if (max > 0) {
                currentVotingId = currentVotingId + 1;
                if (currentVotingId < proposalCategory.getRoleSequencLength(category)) {
                    governance.updateProposalDetails(
                        _proposalId, 
                        proposalCategory.getRoleSequencAtIndex(category, currentVotingId), 
                        max, 
                        0
                    );
                    pool.closeProposalOraclise(_proposalId, _closingTime);
                    governanceDat.callOraclizeCallEvent(
                        _proposalId, 
                        governanceDat.getProposalDateUpd(_proposalId), 
                        proposalCategory.getClosingTimeAtIndex(category, currentVotingId)
                    );
                } else {
                    governance.updateProposalDetails(_proposalId, currentVotingId - 1, max, max);
                    governanceDat.changeProposalStatus(_proposalId, 3);
                    SimpleVoting x = SimpleVoting(
                        proposalCategory.getContractAddress(governanceDat.getProposalCategory(_proposalId))
                    );
                    x.call(governanceDat.getSolutionActionByProposalId(_proposalId, max));
                    giveRewardAfterFinalDecision(_proposalId);
                }
            } else {
                governance.updateProposalDetails(_proposalId, currentVotingId, max, max);
                governanceDat.changeProposalStatus(_proposalId, 4);
                giveRewardAfterFinalDecision(_proposalId);
                governance.changePendingProposalStart();
            }
        } else {
            governance.updateProposalDetails(
                _proposalId, 
                currentVotingId, 
                max, 
                governanceDat.getProposalIntermediateVerdict(_proposalId)
            );
            governanceDat.changeProposalStatus(_proposalId, 5);
            governance.changePendingProposalStart();
        }

    }

    /// @dev Checks if the vote count against any solution passes the threshold value or not.
    function checkForThreshold(uint _proposalId, uint32 _mrSequenceId) internal view returns(bool) {
        uint thresHoldValue;
        if (_mrSequenceId == 2) {
            address dAppTokenAddress = govBlocksMaster.getDappTokenAddress(master.dAppName());
            basicToken = BasicToken(dAppTokenAddress);
            uint totalTokens;

            for (uint8 i = 0; i < governanceDat.getAllVoteIdsLengthByProposalRole(_proposalId, _mrSequenceId); i++) {
                uint voteId = governanceDat.getVoteIdAgainstProposalRole(_proposalId, _mrSequenceId, i);
                address voterAddress = governanceDat.getVoterAddress(voteId);
                totalTokens = totalTokens + basicToken.balanceOf(voterAddress);
            }

            thresHoldValue = totalTokens * 100 / basicToken.totalSupply();
            if (thresHoldValue > governanceDat.quorumPercentage())
                return true;
        } else {
            thresHoldValue = (governanceDat.getAllVoteIdsLengthByProposalRole(_proposalId, _mrSequenceId) * 100)
                / memberRole.getAllMemberLength(_mrSequenceId);
            if (thresHoldValue > governanceDat.quorumPercentage())
                return true;
        }
    }
    
    /// @dev Distributing reward after final decision
    function giveRewardAfterFinalDecision1(
        uint finalVerdict,
        uint _proposalId,
        address _ownerAddress,
        uint depositedTokens,
        uint totalReward
    ) 
        internal
    {
        uint8 subCategory = governanceDat.getProposalCategory(_proposalId); 
        uint totalVoteValue;
        uint category = proposalCategory.getCategoryIdBySubId(subCategory);
        // uint mrLength = PC.getRoleSequencLength(category);
        for (uint i = 0; i < proposalCategory.getRoleSequencLength(category); i++) {
            uint roleId = proposalCategory.getRoleSequencAtIndex(category, i);
            uint mrVoteLength = governanceDat.getAllVoteIdsLengthByProposalRole(_proposalId, roleId);
            for (uint j = 0; j < mrVoteLength; j++) {
                uint voteId = governanceDat.getVoteIdAgainstProposalRole(_proposalId, roleId, j);
                _ownerAddress = governanceDat.getVoterAddress(voteId);
                depositedTokens = governanceDat.getDepositedTokens(_ownerAddress, _proposalId, "V");
                totalReward = SafeMath.add(totalReward, depositedTokens);
                uint voteValue=governanceDat.getVoteValue(voteId);
                totalVoteValue = SafeMath.add(totalVoteValue, voteValue);
            }
        }

        totalReward = totalReward + governanceDat.getProposalIncentive(_proposalId);
        governance.setProposalDetails(_proposalId, totalReward, totalVoteValue);
    }

    /// @dev Adding member address against solution index and event call to save details of solution
    function addSolution1(
        uint _proposalId, 
        address _memberAddress, 
        uint _solutionStake, 
        string _solutionHash, 
        uint _dateAdd, 
        uint _validityUpto, 
        uint8 _v, 
        bytes32 _r, 
        bytes32 _s, 
        bytes32 _lockTokenTxHash, 
        bytes _action
    ) 
        internal 
    {
        require(governanceDat.getProposalCategory(_proposalId) > 0);
        if (msg.sender == _memberAddress)
            receiveStake("S", _proposalId, _solutionStake, _validityUpto, _v, _r, _s, _lockTokenTxHash);
        addSolution2(_proposalId, _memberAddress, _action, _solutionHash, _dateAdd, _solutionStake);
    }
    
    function addSolution2(
        uint _proposalId, 
        address _memberAddress, 
        bytes _action, 
        string _solutionHash, 
        uint _dateAdd, 
        uint _solutionStake
    ) 
        internal 
    {
        governanceDat.setSolutionAdded(_proposalId, _memberAddress, _action);
        uint solutionId = governanceDat.getTotalSolutions(_proposalId);
        governanceDat.callSolutionEvent(_proposalId, msg.sender, solutionId, _solutionHash, _dateAdd, _solutionStake);
    }

    /// @dev Castes vote
    /// @param _proposalId Proposal id
    /// @param _solutionChosen solution chosen while casting vote against proposal.
    /// @param _memberAddress Voter address who is casting a vote.
    /// @param _voteStake Vote stake in GBT while casting a vote
    function castVote(uint64 _proposalId, uint64[] _solutionChosen, address _memberAddress, uint _voteStake) internal {
        //uint voteId = governanceDat.allVotesTotal();
        uint128 finalVoteValue = getVoteValueGivenByMember(_memberAddress, _voteStake);
        uint32 _roleId;
        uint category = proposalCategory.getCategoryIdBySubId(governanceDat.getProposalCategory(_proposalId));

        // uint category=GD.getProposalCategory(_proposalId);
        uint currVotingId = governanceDat.getProposalCurrentVotingId(_proposalId);
        (_roleId, , ) = proposalCategory.getCategoryData3(category, currVotingId);
        governanceDat.addVote(msg.sender, _solutionChosen, _voteStake, finalVoteValue, _proposalId, _roleId);
        //governanceDat.setVoteIdAgainstMember(_memberAddress, _proposalId);
        //governanceDat.setVoteIdAgainstProposalRole(_proposalId, _roleId, voteId);
        // GD.setVoteValue(voteId, finalVoteValue);
        // GD.setSolutionChosen(voteId, _solutionChosen[0]);
        //governanceDat.setProposalTotalVoteValue(
        //    _proposalId, 
        //    finalVoteValue + governanceDat.getProposalTotalVoteValue(_proposalId)
        //);
        //governanceDat.callVoteEvent(_memberAddress, _proposalId, now, _voteStake, voteId);
        governance.checkRoleVoteClosing(_proposalId, _roleId);
    }

    /// @dev Receives solution stake against solution in simple voting i.e. Deposit and lock the tokens
    function receiveStake(
        bytes2 _type, 
        uint _proposalId, 
        uint _stake, 
        uint _validityUpto, 
        uint8 _v, 
        bytes32 _r,
        bytes32 _s, 
        bytes32 _lockTokenTxHash
    ) 
        internal 
    {
        uint8 currVotingId = governanceDat.getProposalCurrentVotingId(_proposalId);
        uint depositPerc = governanceDat.depositPercVote();
        uint deposit = SafeMath.div(SafeMath.mul(_stake, depositPerc), 100);
        uint category = proposalCategory.getCatIdByPropId(_proposalId);

        if (_stake != 0) {
            require(_validityUpto >= proposalCategory.getRemainingClosingTime(_proposalId, category, currVotingId));
            if (depositPerc == 0) {
                gbt.lockToken(msg.sender, _stake, _validityUpto, _v, _r, _s, _lockTokenTxHash);
            } else {
                gbt.depositAndLockToken(
                    msg.sender, 
                    _stake, 
                    deposit, 
                    _validityUpto, 
                    _v, 
                    _r, 
                    _s, 
                    _lockTokenTxHash, 
                    address(pool)
                );
                uint depositedTokens;
                uint depositAmount;
                if (_type == "S") {
                    depositedTokens = governanceDat.getDepositedTokens(msg.sender, _proposalId, "S");
                    depositAmount = deposit + depositedTokens;
                    governanceDat.setDepositTokens(msg.sender, _proposalId, "S", depositAmount);
                }else {
                    depositedTokens = governanceDat.getDepositedTokens(msg.sender, _proposalId, "V");
                    depositAmount = deposit + depositedTokens;
                    governanceDat.setDepositTokens(msg.sender, _proposalId, "V", depositAmount);
                } 
            }
        }
    }

    // function changeMemberVote(
    //    uint _proposalId,
    //    uint[] _solutionChosen,
    //    address _memberAddress,
    //    uint _GBTPayableTokenAmount
    //) 
        //internal
    // {
    //     MR=MemberRoles(MRAddress);
    //     GOV=Governance(G1Address);
    //     GD=GovernanceData(GDAddress);
    //     SVT=StandardVotingType(SVTAddress);

    //     uint roleId = MR.getMemberRoleIdByAddress(_memberAddress);
    //     uint voteId = GD.getVoteIdAgainstMember(_memberAddress,_proposalId);
    //     uint voteVal = GD.getVoteValue(voteId);

    //     GD.editProposalVoteCount(_proposalId,roleId,GD.getOptionById(voteId,0),voteVal);
    //     GD.setProposalVoteCount(_proposalId,roleId,_optionChosen[0],voteVal);
    //     GD.setOptionChosen(voteId,_optionChosen[0]);

    // }

}
