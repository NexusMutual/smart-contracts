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
pragma solidity 0.4.24;

import "./imports/govblocks-protocol/interfaces/IProposalCategory.sol";
import "./imports/govblocks-protocol/Governed.sol";
import "./Iupgradable.sol";


contract ProposalCategory is  Governed, IProposalCategory, Iupgradable {

    bool internal constructorCheck;

    struct CategoryStruct {
        uint memberRoleToVote;
        uint majorityVotePerc;
        uint quorumPerc;
        uint[] allowedToCreateProposal;
        uint closingTime;
        uint minStake;
    }

    struct CategoryAction {
        uint defaultIncentive;
        address contractAddress;
        bytes2 contractName;
    }
    
    CategoryStruct[] internal allCategory;
    mapping (uint => CategoryAction) internal categoryActionData;
    mapping (uint => uint) public categoryABReq;

    /// @dev Adds new category
    /// @param _name Category name
    /// @param _memberRoleToVote Voting Layer sequence in which the voting has to be performed.
    /// @param _majorityVotePerc Majority Vote threshold for Each voting layer
    /// @param _quorumPerc minimum threshold percentage required in voting to calculate result
    /// @param _allowedToCreateProposal Member roles allowed to create the proposal
    /// @param _closingTime Vote closing time for Each voting layer
    /// @param _actionHash hash of details containing the action that has to be performed after proposal is accepted
    /// @param _contractAddress address of contract to call after proposal is accepted
    /// @param _contractName name of contract to be called after proposal is accepted
    /// @param _incentives rewards to distributed after proposal is accepted
    function addCategory(
        string _name, 
        uint _memberRoleToVote,
        uint _majorityVotePerc, 
        uint _quorumPerc,
        uint[] _allowedToCreateProposal,
        uint _closingTime,
        string _actionHash,
        address _contractAddress,
        bytes2 _contractName,
        uint[] _incentives
    ) 
        external
        onlyAuthorizedToGovern 
    {
        _addCategory(
            _name, 
            _memberRoleToVote,
            _majorityVotePerc, 
            _quorumPerc,
            _allowedToCreateProposal,
            _closingTime,
            _actionHash,
            _contractAddress,
            _contractName,
            _incentives
        );
    }

    /// @dev Gets Total number of categories added till now
    function totalCategories() external view returns(uint) {
        return allCategory.length;
    }

    /// @dev gets category details
    function category(uint _categoryId) external view returns(uint, uint, uint, uint, uint[], uint, uint) {
        return(
            _categoryId,
            allCategory[_categoryId].memberRoleToVote,
            allCategory[_categoryId].majorityVotePerc,
            allCategory[_categoryId].quorumPerc,
            allCategory[_categoryId].allowedToCreateProposal,
            allCategory[_categoryId].closingTime,
            allCategory[_categoryId].minStake
        );
    }

    function categoryAction(uint _categoryId) external view returns(uint, address, bytes2, uint) {
        return(
            _categoryId,
            categoryActionData[_categoryId].contractAddress,
            categoryActionData[_categoryId].contractName,
            categoryActionData[_categoryId].defaultIncentive
        );
    }

    /// @dev Initiates Default settings for Proposal Category contract (Adding default categories)
    function proposalCategoryInitiate(bytes32 _dAppName) external { //solhint-disable-line
        require(!constructorCheck);
        dappName = _dAppName;
        addInitialCategories("Uncategorized", "", "MR", 50, 25, 1, 0);
        addInitialCategories("Add new member role", "QmQFnBep7AyMYU3LJDuHSpTYatnw65XjHzzirrghtZoR8U", 
        "MR", 50, 25, 1, 0);
        addInitialCategories("Update member role", "QmNMQQHnnZQce43ys3E5vEenbVRkcJwFRCQ6oTcP2ZNntY", 
        "MR", 50, 25, 1, 0);
        addInitialCategories("Add new category", "QmUq9Rb6rWFHZXjVtyzh7AWGDeyVFtDHKiP5fJpgnuinQ7", "PC", 
        50, 25, 1, 0);
        addInitialCategories("Edit category", "QmQmvfBiCLfe5jPdq69iRBRRdnSHSroJQ4SG8DhtkXcLfQ", 
        "PC", 50, 25, 1, 0);
        addInitialCategories("Resume Proposal", "QmQPWVjmv2Gt2Dzt1rxmFkHCptFSdtX4VC5g7VVNUByLv1", "GV", 50, 25, 1, 0);
        addInitialCategories("Pause Proposal", "QmWWoiRZCmi61LQKpGyGuKjasFVpq8JzbLPvDhU8TBS9tk", "GV", 50, 25, 1, 0);
        addInitialCategories("Change dApp Token Proxy", "QmPR9K6BevCXRVBxWGjF9RV7Pmtxr7D4gE3qsZu5bzi8GK",
        "MS", 50, 25, 1, 0);
        addInitialCategories("Add new authorized address", "QmNTYRfNCYxdnGjYxzd8epUsLNbnkREffJpcwqugoQPDXN",
        "GV", 50, 25, 1, 0);
        addInitialCategories(
            "Upgrade a contract Implementation",
            "Qme4hGas6RuDYk9LKE2XkK9E46LNeCBUzY12DdT5uQstvh",
            "MS",
            50,
            25,
            1,
            0
        );
        addInitialCategories(
            "Upgrade a contract proxy",
            "QmUNGEn7E2csB3YxohDxBKNqvzwa1WfvrSH4TCCFD9DZsg",
            "MS",
            50, 
            25, 
            1,
            0
        );
        
        addInitialCategories("Buy GBT in Pool", "QmUc6apk3aRoHPaSwafo7RkV4XTJaaWS6Q7MogTMqLDyWs", "PL", 50, 25, 1, 0);
        //  --------------------------------------------------------------------------------------------- //
        addInitialCategories("Implement Emergency Pause", "QmZSaEsvTCpy357ZSrPYKqby1iaksBwPdKCGWzW1HpgSpe",
        "MS", 0, 15, 1, 0);
        addInitialCategories("Extend or Switch Off Emergency Pause", "QmS9mT25ewYCZ4qCgE4XHQUkid2NajvnXoJiwstR7tVge8",
        "MS", 50, 15, 2, 0);
        addInitialCategories("Burn Claims Assessor Bond", "Qmd3VmAZp6PbWPKHx3FFcZw1krwS4FXfDa7ZBFpJzjf4YU",
        "TF", 80, 15, 1, 0);
        // addInitialCategories("Pause Claim Assessor Voting for 3 days", "", "EX", 60, 15, 1); //no func yet
        addInitialCategories("Changes to Capital Model", "", "EX", 50, 15, 2, 60);
        addInitialCategories("Changes to Pricing Model", "", "EX", 50, 15, 2, 60);
        addInitialCategories("Withdraw funds to Pay for Support Services", 
        "QmYpeKJ89JDZQcLre28LrPW3BNcv1SLZ74SCXvJpZH1778", "P1", 50, 15, 2, 80);
        // addInitialCategories("Release new smart contract code", "", "EX", 80, 15, 2); //no func yet
        // addInitialCategories("Change to Authorities", "", "EX", 80, 15, 2); //no func yet
        addInitialCategories("Add Investment Asset", "QmUHmVK3dZKk6PJk6FsX7x68481NUCH57FhPEFaHg1T353",
        "PD", 50, 15, 2, 60);
        addInitialCategories("Edit Investment Asset", "QmaxEC2tuQQf1WijKFxbnRRTRQ6UyV2w1X2BuuuDNRiab3",
        "PD", 50, 15, 2, 60);
        addInitialCategories("Update Investment Asset Status", "QmcXWfRU4jn7qhuJLUQbqYmZAsHL8mdW9PzWMfSMBJQ8CC",
        "PD", 50, 15, 2, 60);
        // addInitialCategories("Change AB Member", "", "EX", 101, 15, 2); //no func yet
        addInitialCategories("Any other Item", "", "EX", 50, 15, 2, 80);
        addInitialCategories("Special Resolution", "", "EX", 75, 75, 2, 0);
        constructorCheck = true;
    }

    function changeDependentContractAddress() public onlyInternal {}

    /// @dev Updates category details
    /// @param _categoryId Category id that needs to be updated
    /// @param _name Category name
    /// @param _memberRoleToVote Voting Layer sequence in which the voting has to be performed.
    /// @param _allowedToCreateProposal Member roles allowed to create the proposal
    /// @param _majorityVotePerc Majority Vote threshold for Each voting layer
    /// @param _quorumPerc minimum threshold percentage required in voting to calculate result
    /// @param _closingTime Vote closing time for Each voting layer
    /// @param _actionHash hash of details containing the action that has to be performed after proposal is accepted
    /// @param _contractAddress address of contract to call after proposal is accepted
    /// @param _contractName name of contract to be called after proposal is accepted
    /// @param _incentives rewards to distributed after proposal is accepted
    function updateCategory(
        uint _categoryId, 
        string _name, 
        uint _memberRoleToVote, 
        uint _majorityVotePerc, 
        uint _quorumPerc,
        uint[] _allowedToCreateProposal,
        uint _closingTime,
        string _actionHash,
        address _contractAddress,
        bytes2 _contractName,
        uint[] _incentives
    )
        public
        onlyAuthorizedToGovern
    { 
        allCategory[_categoryId].memberRoleToVote = _memberRoleToVote;
        allCategory[_categoryId].majorityVotePerc = _majorityVotePerc;
        allCategory[_categoryId].closingTime = _closingTime;
        allCategory[_categoryId].allowedToCreateProposal = _allowedToCreateProposal;
        allCategory[_categoryId].minStake = _incentives[0];
        allCategory[_categoryId].quorumPerc = _quorumPerc;
        categoryActionData[_categoryId].defaultIncentive = _incentives[1];
        categoryActionData[_categoryId].contractName = _contractName;
        categoryActionData[_categoryId].contractAddress = _contractAddress;
        categoryABReq[_categoryId] = _incentives[2];
        emit Category(_categoryId, _name, _actionHash);
    }

    /// @dev Adds new category
    /// @param _name Category name
    /// @param _memberRoleToVote Voting Layer sequence in which the voting has to be performed.
    /// @param _majorityVotePerc Majority Vote threshold for Each voting layer
    /// @param _quorumPerc minimum threshold percentage required in voting to calculate result
    /// @param _allowedToCreateProposal Member roles allowed to create the proposal
    /// @param _closingTime Vote closing time for Each voting layer
    /// @param _actionHash hash of details containing the action that has to be performed after proposal is accepted
    /// @param _contractAddress address of contract to call after proposal is accepted
    /// @param _contractName name of contract to be called after proposal is accepted
    /// @param _incentives rewards to distributed after proposal is accepted
    function _addCategory(
        string _name, 
        uint _memberRoleToVote,
        uint _majorityVotePerc, 
        uint _quorumPerc,
        uint[] _allowedToCreateProposal,
        uint _closingTime,
        string _actionHash,
        address _contractAddress,
        bytes2 _contractName,
        uint[] _incentives
    ) 
        internal
    {
        categoryABReq[allCategory.length] = _incentives[2];
        allCategory.push(
            CategoryStruct(
                _memberRoleToVote,
                _majorityVotePerc,
                _quorumPerc,
                _allowedToCreateProposal,
                _closingTime,
                _incentives[0]
            )
        );
        uint categoryId = allCategory.length - 1;
        categoryActionData[categoryId] = CategoryAction(_incentives[1], _contractAddress, _contractName);
        emit Category(categoryId, _name, _actionHash);
    }

    function addInitialCategories(
        string _name,
        string _actionHash,
        bytes2 _contractName,
        uint _majorityVotePerc, 
        uint _quorumPerc,
        uint _memberRoleToVote,
        uint _categoryABReq
    ) 
        internal 
    {
        uint[] memory allowedToCreateProposal = new uint[](2);
        uint[] memory stakeIncentive = new uint[](3);        
        allowedToCreateProposal[0] = 2;
        stakeIncentive[0] = 0;
        stakeIncentive[1] = 0;
        stakeIncentive[2] = _categoryABReq;
        _addCategory(
                _name,
                _memberRoleToVote,
                _majorityVotePerc,
                _quorumPerc,
                allowedToCreateProposal,
                604800,
                _actionHash,
                address(0),
                _contractName,
                stakeIncentive
            );
    }


}