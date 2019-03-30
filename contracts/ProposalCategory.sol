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
    mapping (uint => uint) public isSpecialResolution;

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

    /**
     * @dev to get the category acion details of a category id 
     * @param _categoryId is the category id in concern
     * @return the category id
     * @return the contract address
     * @return the contract name
     * @return the default incentive
     */
    function categoryAction(uint _categoryId) external view returns(uint, address, bytes2, uint) {
        return(
            _categoryId,
            categoryActionData[_categoryId].contractAddress,
            categoryActionData[_categoryId].contractName,
            categoryActionData[_categoryId].defaultIncentive
        );
    }

    /// @dev Initiates Default settings for Proposal Category contract (Adding default categories)
    function proposalCategoryInitiate() external { //solhint-disable-line
        require(!constructorCheck);
        _addInitialCategories("Uncategorized", "", "MR", 50, 25, 1, 0); //0
        _addInitialCategories("Add new member role", "QmQFnBep7AyMYU3LJDuHSpTYatnw65XjHzzirrghtZoR8U", 
        "MR", 50, 25, 1, 0);
        _addInitialCategories("Update member role", "QmXMzSViLBJ22P9oj51Zz7isKTRnXWPHZcQ5hzGvvWD3UV", 
        "MR", 50, 25, 1, 0);
        _addInitialCategories("Add new category", "QmUq9Rb6rWFHZXjVtyzh7AWGDeyVFtDHKiP5fJpgnuinQ7", "PC", 
        50, 25, 1, 0);
        _addInitialCategories("Edit category", "QmQmvfBiCLfe5jPdq69iRBRRdnSHSroJQ4SG8DhtkXcLfQ",  //4
        "PC", 50, 25, 1, 0);
        _addInitialCategories(
            "Upgrade a contract Implementation",
            "Qme4hGas6RuDYk9LKE2XkK9E46LNeCBUzY12DdT5uQstvh",
            "MS",
            50,
            25,
            1,
            0
        );
        
        //  --------------------------------------------------------------------------------------------- //
        _addInitialCategories("Implement Emergency Pause", "QmZSaEsvTCpy357ZSrPYKqby1iaksBwPdKCGWzW1HpgSpe",
        "MS", 0, 15, 1, 0);
        _addInitialCategories("Extend or Switch Off Emergency Pause", "Qmao6dD8amq4kxsAheWn5gQX22ABucFFGRvnRuY1VqtEKy",
        "MS", 50, 15, 2, 0);
        _addInitialCategories("Burn Claims Assessor Bond", "QmezNJUF2BM5Nv9EMnsEKUmuqjvdySzvQFvhEdvFJbau3k", //8
        "TF", 80, 15, 1, 0);
        _addInitialCategories("Pause Claim Assessor Voting for 3 days", "", "CD", 60, 15, 1, 0);
        _addInitialCategories("Changes to Capital Model", "", "EX", 50, 15, 2, 60);
        _addInitialCategories("Changes to Pricing Model", "", "EX", 50, 15, 2, 60);
        _addInitialCategories("Withdraw funds to Pay for Support Services", 
        "QmZQhJunZesYuCJkdGwejSATTR8eynUgV8372cHvnAPMaM", "P1", 50, 15, 2, 80);
        // _addInitialCategories("Change to Authorities", "", "EX", 80, 15, 2); //no func yet
        _addInitialCategories("Add Investment Asset", "Qmd66GdYtn1BYmZTB1op1Fbfkq6uywMpow5LRmG2Twbzjb", //13
        "PD", 50, 15, 2, 60);
        _addInitialCategories("Edit Investment Asset min and max holding percentages", 
        "QmXwyffmk7rYGHE7p4g3oroJkmyEYAn6EffhZu2MCNcJGA",
        "PD", 50, 15, 2, 60);
        _addInitialCategories("Update Investment Asset Status", "QmZkxcC82WFRvnBahLT3eQ95ZSGMxuAyCYqxvR3tSyhFmB",
        "PD", 50, 15, 2, 60);
        _addInitialCategories("Change AB Member", "QmUBjPDdSiG3pRMqkVzZA2WaqiksT7ixNd3gPQwngGmF9x", 
            "MR", 50, 15, 2, 0); 
        _addInitialCategories("Add Currency Asset", "QmYtpNuTdProressqZwEmN7cFtyyJvhFBrqr6xnxQGWrPm", //17
            "PD", 50, 15, 2, 0);
        _addInitialCategories("Any other Item", "", "EX", 50, 15, 2, 80);
        _addInitialCategories("Special Resolution", "", "EX", 75, 0, 2, 0);
        _addInitialCategories("Update Token Parameters", "QmbfJTXyLTDsq41U4dukHbagcXef8bRfyMdMqcqLd9aKNM", 
            "TD", 50, 15, 2, 60);
        _addInitialCategories("Update Risk Assessment Parameters", "QmUHvBShLpDwPWAsWcZvbUJfVGyXYscybi5ASmF6ectxSo",
        //21
            "TD", 50, 15, 2, 60);
        _addInitialCategories("Update Governance Parameters", "QmdFDVEaZnJxXncFczTW6EvrcgR3jBfuPWftR7PfkPfqqT", 
            "GV", 50, 15, 2, 60);
        _addInitialCategories("Update Quotation Parameters", "QmTtSbBp2Cxaz8HzB4TingUozr9AW91siCfMjjyzf8qqAb", 
            "QD", 50, 15, 2, 60);
        _addInitialCategories("Update Claims Assessment Parameters", "QmPo6HPydwXEeoVdwBpwGeZasFnmFwZoTsQ93Bg5pFtQg6", 
            "CD", 50, 15, 2, 60);
        _addInitialCategories("Update Investment Module Parameters", "QmYSUJBJD9hUevydfdF34rGFG7bBQhMrxh2ga9XfeAkdEM", 
        //25
            "PD", 50, 15, 2, 60);
        _addInitialCategories("Update Capital Model Parameters", "QmaQH6AdvBdgrW4xdzcMHa7gNyYSGa2fz7gBuuic2hLkZQ", 
            "PD", 50, 15, 2, 60);
        _addInitialCategories("Update Address Parameters", "QmPfXySkeDFbdMvZyD35y1hiB4g6ZXLSEHfS7JjS6e1VKL", 
            "MS", 50, 15, 2, 60);
        _addInitialCategories("Update Owner Parameters", "QmTEmDA1ECmGPfh5x3co1GmjXQCp3zisUP6rnLQjWmW8nu", //28
            "MS", 50, 15, 3, 0);
        _addInitialCategories("Release new smart contract code", "", "MS", 50, 15, 2, 80);
        _addInitialCategories("Edit Currency Asset Address", "QmZkxcC82WFRvnBahLT3eQ95ZSGMxuAyCYqxvR3tSyhFmB",
        "PD", 50, 15, 3, 60);
        _addInitialCategories("Edit Currency Asset baseMin", "QmZkxcC82WFRvnBahLT3eQ95ZSGMxuAyCYqxvR3tSyhFmB",
        "PD", 50, 15, 2, 60);
        _addInitialCategories("Edit Investment Asset Address and decimal", 
        "QmXwyffmk7rYGHE7p4g3oroJkmyEYAn6EffhZu2MCNcJGA",
        "PD", 50, 15, 3, 60);
        constructorCheck = true;
    }

    function changeDependentContractAddress() public {}

    /**
     * @dev to change the master address
     * @param _masterAddress is the new master address
     */
    function changeMasterAddress(address _masterAddress) public {
        if (masterAddress != address(0))
            require(masterAddress == msg.sender || ms.isInternal(msg.sender));
        masterAddress = _masterAddress;
        ms = INXMMaster(_masterAddress);
        nxMasterAddress = _masterAddress;
        
    }

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
        categoryABReq[categoryId] = _incentives[2];
        isSpecialResolution[categoryId] = _incentives[3];
        emit Category(categoryId, _name, _actionHash);
    }

    /**
     * @dev to add the initial categories 
     * @param _name is category name
     * @param _actionHash hash of category action
     * @param _contractName is the name of contract
     * @param _majorityVotePerc percentage of majority vote
     * @param _quorumPerc is the quorom percentage
     * @param _memberRoleToVote is the member role the category can vote on
     * @param _categoryABReq is majority percentage required by advisory board 
     */
    function _addInitialCategories(
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
        uint[] memory allowedToCreateProposal = new uint[](1);
        uint[] memory stakeIncentive = new uint[](4);
        if (_memberRoleToVote == 3) {
            allowedToCreateProposal[0] = 3;
        } else {
            allowedToCreateProposal[0] = 2;
        }
        stakeIncentive[0] = 0;
        stakeIncentive[1] = 0;
        stakeIncentive[2] = _categoryABReq;
        if (_quorumPerc == 0) {//For special resolutions
            stakeIncentive[3] = 1;
        } else {
            stakeIncentive[3] = 0;
        }
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