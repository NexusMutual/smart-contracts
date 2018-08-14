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
import "./SafeMath.sol";
import "./GBTStandardToken.sol";
import "./Upgradeable.sol";
import "./SimpleVoting.sol";
import "./Governance.sol";
import "./GovernanceData.sol";
import "./ProposalCategory.sol";


contract Pool is Upgradeable {
    using SafeMath for uint;

    address public masterAddress;
    Master internal master;
    SimpleVoting internal simpleVoting;
    GBTStandardToken internal gbt;
    Governance internal gov;
    GovernanceData internal governanceDat;
    ProposalCategory internal proposalCategory;

    function () public payable {}

    /// @dev Changes master address
    /// @param _add New master address
    function changeMasterAddress(address _add) public {
        if (masterAddress == address(0)) {
            masterAddress = _add;
        }
        else {
            master = Master(masterAddress);
            require(master.isInternal(msg.sender));
            masterAddress = _add;
        }

    }

    modifier onlyInternal {
        master = Master(masterAddress);
        require(master.isInternal(msg.sender));
        _;
    }

    modifier onlyOwner {
        master = Master(masterAddress);
        require(master.isOwner(msg.sender));
        _;
    }

    modifier onlyMaster {
        require(msg.sender == masterAddress);
        _;
    }

    modifier onlySV {
        master = Master(masterAddress);
        require(
            master.getLatestAddress("SV") == msg.sender 
            || master.isInternal(msg.sender) 
        );
        _;
    }

    /// @dev Changes GBT standard token address
    /// @param _gbtAddress New GBT standard token address
    function changeGBTSAddress(address _gbtAddress) public onlyMaster {
        gbt = GBTStandardToken(_gbtAddress);
    }

    /// @dev just to adhere to the interface
    function updateDependencyAddresses() public {
        master = Master(masterAddress);
        gbt = GBTStandardToken(master.getLatestAddress("GS"));
        simpleVoting = SimpleVoting(master.getLatestAddress("SV"));
        gov = Governance(master.getLatestAddress("GV"));
        governanceDat = GovernanceData(master.getLatestAddress("GD"));
        proposalCategory = ProposalCategory(master.getLatestAddress("PC"));
    }

    function transferAssets() public {
        address newPool = master.getLatestAddress("PL");
        if(address(this) != newPool) {
           gbt.transfer(master.getLatestAddress("PL"), gbt.balanceOf(address(this)) - gbt.getLockToken(address(this)));
           newPool.send(address(this).balance);
        }
    }

    /// @dev converts pool ETH to GBT
    /// @param _gbt number of GBT to buy multiplied 10^decimals
    function buyPoolGBT(uint _gbt) public onlySV {
        uint _wei = SafeMath.mul(_gbt, gbt.tokenPrice());
        _wei = SafeMath.div(_wei, 10 ** gbt.decimals());
        gbt.buyToken.value(_wei)();
    }

    /// @dev user can calim the tokens rewarded them till now
    function claimReward(address _claimer) public {
        uint rewardToClaim = gov.calculateMemberReward(_claimer);
        if (rewardToClaim != 0) {
            gbt.transferMessage(_claimer, rewardToClaim, "GBT Stake claimed");
        }
    }

    /// @dev checks and closes proposal if required
    function checkRoleVoteClosing(uint _proposalId, uint32 _roleId, address _memberAddress) public {
        uint gasLeft = gasleft();
        if (gov.checkForClosing(_proposalId, _roleId) == 1) {
            simpleVoting.closeProposalVote(_proposalId);
            _memberAddress.transfer((gasLeft - gasleft()) * 10 ** 9);
        }
    }

    function getPendingReward() public view returns (uint pendingReward) {
        uint lastRewardProposalId;
        uint lastRewardSolutionProposalId;
        uint lastRewardVoteId;
        (lastRewardProposalId, lastRewardSolutionProposalId, lastRewardVoteId) = 
            governanceDat.getAllidsOfLastReward(msg.sender);

        pendingReward = 
            getPendingProposalReward(msg.sender, lastRewardProposalId) 
            + getPendingSolutionReward(msg.sender, lastRewardSolutionProposalId) 
            + getPendingVoteReward(msg.sender, lastRewardVoteId);
    }

    function getPendingProposalReward(address _memberAddress, uint _lastRewardProposalId)
        public
        view
        returns (uint pendingProposalReward)
    {
        uint allProposalLength = governanceDat.getProposalLength();
        uint finalVredict;
        uint proposalStatus;
        uint calcReward;
        uint8 category;

        for (uint i = _lastRewardProposalId; i < allProposalLength; i++) {
            if (_memberAddress == governanceDat.getProposalOwner(i)) {
                (, , category, proposalStatus, finalVredict) = governanceDat.getProposalDetailsById3(i);
                if (
                    proposalStatus > 2 && 
                    finalVredict > 0 && 
                    governanceDat.getReturnedTokensFlag(_memberAddress, i, "P") == 0 &&
                    governanceDat.getProposalTotalReward(i) != 0
                ) 
                {
                    category = proposalCategory.getCategoryIdBySubId(category);
                    calcReward = 
                        proposalCategory.getRewardPercProposal(category) 
                        * governanceDat.getProposalTotalReward(i)
                        / 100;
                    pendingProposalReward = 
                        pendingProposalReward 
                        + calcReward 
                        + governanceDat.getDepositedTokens(_memberAddress, i, "P");

                }
            }
        }
    }

    function getPendingSolutionReward(address _memberAddress, uint _lastRewardSolutionProposalId)
        public
        view
        returns (uint pendingSolutionReward)
    {
        uint allProposalLength = governanceDat.getProposalLength();
        uint calcReward;
        uint i;
        uint finalVerdict;
        uint solutionId;
        uint proposalId;
        uint totalReward;
        uint category;

        for (i = _lastRewardSolutionProposalId; i < allProposalLength; i++) {
            (proposalId, solutionId, , finalVerdict, totalReward, category) = 
                gov.getSolutionIdAgainstAddressProposal(_memberAddress, i);
            if (finalVerdict > 0 && finalVerdict == solutionId && proposalId == i) {
                if (governanceDat.getReturnedTokensFlag(_memberAddress, proposalId, "S") == 0) {
                    calcReward = (proposalCategory.getRewardPercSolution(category) * totalReward) / 100;
                    pendingSolutionReward = 
                        pendingSolutionReward
                        + calcReward 
                        + governanceDat.getDepositedTokens(_memberAddress, i, "S");
                }
            }
        }
    }

    function getPendingVoteReward(address _memberAddress, uint _lastRewardVoteId)
        public
        view
        returns (uint pendingVoteReward)
    {
        uint i;
        uint totalVotes = governanceDat.getTotalNumberOfVotesByAddress(_memberAddress);
        uint voteId;
        uint proposalId;
        uint solutionChosen;
        uint finalVredict;
        uint voteValue;
        uint totalReward;
        uint category;
        uint calcReward;
        uint returnedTokensFlag;
        for (i = _lastRewardVoteId; i < totalVotes; i++) {
            voteId = governanceDat.getVoteIdOfNthVoteOfMember(_memberAddress, i);
            (, , , proposalId) = governanceDat.getVoteDetailById(voteId);
            returnedTokensFlag = governanceDat.getReturnedTokensFlag(_memberAddress, proposalId, "V");
            (solutionChosen, , finalVredict, voteValue, totalReward, category, ) = 
                gov.getVoteDetailsToCalculateReward(_memberAddress, i);

            if (finalVredict > 0 && solutionChosen == finalVredict && returnedTokensFlag == 0 && totalReward != 0) {
                calcReward = (proposalCategory.getRewardPercVote(category) * voteValue * totalReward) 
                    / (100 * governanceDat.getProposalTotalVoteValue(proposalId));

                pendingVoteReward = 
                    pendingVoteReward 
                    + calcReward 
                    + governanceDat.getDepositedTokens(_memberAddress, proposalId, "V");
            } else if (!governanceDat.punishVoters() && finalVredict > 0 && returnedTokensFlag == 0 && totalReward != 0) {
                calcReward = (proposalCategory.getRewardPercVote(category) * voteValue * totalReward) 
                    / (100 * governanceDat.getProposalTotalVoteValue(proposalId));
                pendingVoteReward = pendingVoteReward + calcReward;
            }
        }
    }

    /// @dev Transfer Ether to someone    
    /// @param _amount Amount to be transferred back
    /// @param _receiverAddress address where ether has to be sent
    function transferEther(address _receiverAddress, uint256 _amount) public onlySV {
        _receiverAddress.transfer(_amount);
    }

    /// @dev Transfer token to someone    
    /// @param _amount Amount to be transferred back
    /// @param _receiverAddress address where tokens have to be sent
    /// @param _token address of token to transfer
    function transferToken(address _token, address _receiverAddress, uint256 _amount) public onlySV {
        GBTStandardToken token = GBTStandardToken(_token);
        token.transfer(_receiverAddress, _amount);
    }

}