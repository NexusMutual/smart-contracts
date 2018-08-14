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
import "./GovernanceData.sol";
import "./MemberRoles.sol";
import "./Upgradeable.sol";


contract ProposalCategory is Upgradeable {
    bool public constructorCheck;
    uint constant INT_MAX = uint256(0) - uint256(1);
    
    struct Category {
        string name;
        uint8[] memberRoleSequence;
        uint8[] memberRoleMajorityVote;
        uint32[] closingTime;
        uint minStake;
        uint maxStake;
        uint defaultIncentive;
        uint8 rewardPercProposal;
        uint8 rewardPercSolution;
        uint8 rewardPercVote;
    }

    struct SubCategory {
        string categoryName;
        string actionHash;
        uint8 categoryId;
        address contractAddress;
        bytes2 contractName;
    }

    SubCategory[] public allSubCategory;
    Category[] public allCategory;
    mapping(uint => uint[]) internal allSubIdByCategory;

    Master internal master;
    MemberRoles internal memberRole;
    GovernanceData internal governanceDat;
    address internal masterAddress;

    modifier onlyInternal {
        require(master.isInternal(msg.sender));
        _;
    }

    modifier onlySV {   //Owner for debugging only, will be removed before launch 
        require(master.getLatestAddress("SV") == msg.sender  
            || master.isOwner(msg.sender)
        );
        _;
    }

    /// @dev Changes master's contract address
    /// @param _masterContractAddress New master contract address
    function changeMasterAddress(address _masterContractAddress) public {
        if (masterAddress == address(0)){
            masterAddress = _masterContractAddress;
            master = Master(masterAddress);
        } else {
            master = Master(masterAddress);
            require(master.isInternal(msg.sender));
            masterAddress = _masterContractAddress;
            master = Master(_masterContractAddress);
        }
    }

    /// @dev updates all dependency addresses to latest ones from Master
    function updateDependencyAddresses() public {
        governanceDat = GovernanceData(master.getLatestAddress("GD"));
        memberRole = MemberRoles(master.getLatestAddress("MR"));
    }

    /// @dev just to adhere to the interface
    function changeGBTSAddress(address) public {
    }

    /// @dev Initiates Default settings for Proposal Category contract (Adding default categories)
    function proposalCategoryInitiate() public {
        require(!constructorCheck);
        uint8[] memory rs = new uint8[](1);
        uint8[] memory mv = new uint8[](1);
        uint32[] memory ct = new uint32[](1);
        
        rs[0] = 1;
        mv[0] = 50;
        ct[0] = 1800;
        
        allCategory.push(Category("Uncategorized", rs, mv, ct, 0, 0, 0, 0, 0, 0));
        allCategory.push(Category("Member role", rs, mv, ct, 0, INT_MAX, 10**19, 40, 40, 20));
        allCategory.push(Category("Categories", rs, mv, ct, 0, INT_MAX, 0, 40, 40, 20));
        allCategory.push(Category("Parameters", rs, mv, ct, 0, INT_MAX, 0, 40, 40, 20));
        allCategory.push(Category("Transfer Assets", rs, mv, ct, 0, INT_MAX, 0, 40, 40, 20));
        allCategory.push(Category("New contracts", rs, mv, ct, 0, INT_MAX, 0, 40, 40, 20));
        allCategory.push(Category("Others", rs, mv, ct, 0, INT_MAX, 0, 40, 40, 20));

        addInitialSubCategories();

        constructorCheck = true;
    }

    /// @dev Adds new category
    /// @param _name Category name
    /// @param _memberRoleSequence Voting Layer sequence in which the voting has to be performed.
    /// @param _memberRoleMajorityVote Majority Vote threshhold for Each voting layer
    /// @param _closingTime Vote closing time for Each voting layer
    /// @param _stakeAndIncentive array of minstake maxstake and incentive required against each category
    /// @param _rewardPercentage array of reward percentages for Proposal, Solution and Voting.
    function addNewCategory(
        string _name, 
        uint8[] _memberRoleSequence, 
        uint8[] _memberRoleMajorityVote, 
        uint32[] _closingTime,
        uint[] _stakeAndIncentive, 
        uint8[] _rewardPercentage
    ) 
        public
        onlySV 
    {
        require(_memberRoleSequence.length == _memberRoleMajorityVote.length 
            && _memberRoleMajorityVote.length == _closingTime.length
        );
        allCategory.push(Category(
                _name, 
                _memberRoleSequence, 
                _memberRoleMajorityVote, 
                _closingTime, 
                _stakeAndIncentive[0], 
                _stakeAndIncentive[1], 
                _stakeAndIncentive[2], 
                _rewardPercentage[0], 
                _rewardPercentage[1], 
                _rewardPercentage[2]
            )
        );
    }

    /// @dev Updates category details
    /// @param _categoryId Category id that needs to be updated
    /// @param _roleName Updated Role sequence to vote i.e. Updated voting layer sequence
    /// @param _majorityVote Updated Majority threshhold value against each voting layer.
    /// @param _closingTime Updated Vote closing time against each voting layer
    /// @param _stakeAndIncentive array of minstake maxstake and incentive
    /// @param _rewardPercentage array of reward percentages for Proposal, Solution and Voting.
    function updateCategory(
        uint _categoryId, 
        string _name, 
        uint8[] _roleName, 
        uint8[] _majorityVote, 
        uint32[] _closingTime, 
        uint[] _stakeAndIncentive, 
        uint8[] _rewardPercentage
    )
        public 
        onlySV
    {
        require(_roleName.length == _majorityVote.length && _majorityVote.length == _closingTime.length);
        allCategory[_categoryId].name = _name;
        allCategory[_categoryId].minStake = _stakeAndIncentive[0];
        allCategory[_categoryId].maxStake = _stakeAndIncentive[1];
        allCategory[_categoryId].defaultIncentive = _stakeAndIncentive[2];
        allCategory[_categoryId].rewardPercProposal = _rewardPercentage[0];
        allCategory[_categoryId].rewardPercSolution = _rewardPercentage[1];
        allCategory[_categoryId].rewardPercVote = _rewardPercentage[2];
        allCategory[_categoryId].memberRoleSequence = new uint8[](_roleName.length);
        allCategory[_categoryId].memberRoleMajorityVote = new uint8[](_majorityVote.length);
        allCategory[_categoryId].closingTime = new uint32[](_closingTime.length);

        for (uint i = 0; i < _roleName.length; i++) {
            allCategory[_categoryId].memberRoleSequence[i] = _roleName[i];
            allCategory[_categoryId].memberRoleMajorityVote[i] = _majorityVote[i];
            allCategory[_categoryId].closingTime[i] = _closingTime[i];
        }
    }

    /// @dev Add new sub category against category.
    /// @param _categoryName Name of the sub category
    /// @param _actionHash Automated Action hash has Contract Address and function name 
    /// i.e. Functionality that needs to be performed after proposal acceptance.
    /// @param _mainCategoryId Id of main category
    function addNewSubCategory(
        string _categoryName, 
        string _actionHash, 
        uint8 _mainCategoryId, 
        address _contractAddress,
        bytes2 _contractName
    ) 
        public
        onlySV 
    {
        allSubIdByCategory[_mainCategoryId].push(allSubCategory.length);
        allSubCategory.push(SubCategory(_categoryName, _actionHash, _mainCategoryId, _contractAddress, _contractName));
    }

    /// @dev Update Sub category of a specific category.
    /// @param _subCategoryId Id of subcategory that needs to be updated
    /// @param _actionHash Updated Automated Action hash i.e. Either contract address or function name is changed.
    function updateSubCategory(
        string _categoryName, 
        string _actionHash, 
        uint _subCategoryId, 
        address _address, 
        bytes2 _contractName
    ) 
        public 
        onlySV 
    {
        allSubCategory[_subCategoryId].categoryName = _categoryName;
        allSubCategory[_subCategoryId].actionHash = _actionHash;
        allSubCategory[_subCategoryId].contractAddress = _address;
        allSubCategory[_subCategoryId].contractName = _contractName;
    }

    /// @dev Get Sub category details such as Category name, Automated action hash and Main category id
    function getSubCategoryDetails(uint _subCategoryId) 
        public 
        view 
        returns(string, string, uint, address, bytes2) 
    {
        address contractAddress;
        if(allSubCategory[_subCategoryId].contractName == "EX")
            contractAddress = allSubCategory[_subCategoryId].contractAddress;
        else
            contractAddress = master.getLatestAddress(allSubCategory[_subCategoryId].contractName);
        return (
            allSubCategory[_subCategoryId].categoryName, 
            allSubCategory[_subCategoryId].actionHash, 
            allSubCategory[_subCategoryId].categoryId, 
            contractAddress,
            allSubCategory[_subCategoryId].contractName
        );
    }

    /// @dev Get Sub category name 
    function getSubCategoryName(uint _subCategoryId) public view returns(uint, string) {
        return (_subCategoryId, allSubCategory[_subCategoryId].categoryName);
    }

    /// @dev Get contractAddress 
    function getContractAddress(uint _subCategoryId) public view returns(address _contractAddress) {
        if(allSubCategory[_subCategoryId].contractName == "EX")
            _contractAddress = allSubCategory[_subCategoryId].contractAddress;
        else
            _contractAddress = master.getLatestAddress(allSubCategory[_subCategoryId].contractName);
    }

    /// @dev Get Sub category id at specific index when giving main category id 
    /// @param _categoryId Id of main category
    /// @param _index Get subcategory id at particular index in all subcategory array
    function getSubCategoryIdAtIndex(uint8 _categoryId, uint _index) public view returns(uint _subCategoryId) {
        return allSubIdByCategory[_categoryId][_index];
    }

    /// @dev Get Sub categories array against main category
    function getAllSubIdsByCategory(uint8 _categoryId) public view returns(uint[]) {
        return allSubIdByCategory[_categoryId];
    }

    /// @dev Get Total number of sub categories against main category
    function getAllSubIdsLengthByCategory(uint8 _categoryId) public view returns(uint) {
        return allSubIdByCategory[_categoryId].length;
    }

    /// @dev Gets Main category when giving sub category id. 
    function getCategoryIdBySubId(uint8 _subCategoryId) public view returns(uint8) {
        return allSubCategory[_subCategoryId].categoryId;
    }

    /// @dev Gets remaining vote closing time against proposal 
    /// i.e. Calculated closing time from current voting index to the last layer.
    /// @param _proposalId Proposal Id
    /// @param _categoryId Category of proposal.
    /// @param _index Current voting status id works as index here in voting layer sequence. 
    /// @return totalTime Total time that left for proposal closing.
    function getRemainingClosingTime(uint _proposalId, uint _categoryId, uint _index) 
        public 
        view 
        returns(uint totalTime) 
    {
        uint pClosingTime;
        for (uint i = _index; i < getCloseTimeLength(_categoryId); i++) {
            pClosingTime = pClosingTime + getClosingTimeAtIndex(_categoryId, i);
        }

        totalTime = pClosingTime 
            + governanceDat.tokenHoldingTime() 
            + governanceDat.getProposalDateUpd(_proposalId)
            - now;
    }
    
    /// @dev Gets Total vote closing time against category i.e. 
    /// Calculated Closing time from first voting layer where current voting index is 0.
    /// @param _categoryId Main Category id
    /// @return totalTime Total time before the voting gets closed
    function getMaxCategoryTokenHoldTime(uint _categoryId) public view returns(uint totalTime) {
        uint pClosingTime;
        for (uint i = 0; i < getCloseTimeLength(_categoryId); i++) {
            pClosingTime = pClosingTime + getClosingTimeAtIndex(_categoryId, i);
        }

        totalTime = pClosingTime + governanceDat.tokenHoldingTime();
        return totalTime;
    }

    /// @dev Gets reward percentage for Proposal to distribute stake on proposal acceptance
    function getRewardPercProposal(uint _categoryId) public view returns(uint) {
        return allCategory[_categoryId].rewardPercProposal;
    }

    /// @dev Gets reward percentage for Solution to distribute stake on proposing favourable solution
    function getRewardPercSolution(uint _categoryId) public view returns(uint) {
        return allCategory[_categoryId].rewardPercSolution;
    }

    /// @dev Gets reward percentage for Voting to distribute stake on casting vote on winning solution  
    function getRewardPercVote(uint _categoryId) public view returns(uint) {
        return allCategory[_categoryId].rewardPercVote;
    }

    /// @dev Gets Category details - Voting layer sequence details with majority threshold and closing time 
    function getCategoryData2(uint _categoryId) 
        public
        view 
        returns(uint, bytes32[] roleName, uint8[] majorityVote, uint32[] closingTime) 
    {
        // MR=MemberRoles(MRAddress);
        uint roleLength = getRoleSequencLength(_categoryId);
        roleName = new bytes32[](roleLength);
        for (uint8 i = 0; i < roleLength; i++) {
            bytes32 name;
            (, name) = memberRole.getMemberRoleNameById(getRoleSequencAtIndex(_categoryId, i));
            roleName[i] = name;
        }

        majorityVote = allCategory[_categoryId].memberRoleMajorityVote;
        closingTime = allCategory[_categoryId].closingTime;
        return (_categoryId, roleName, majorityVote, closingTime);
    }

    /// @dev Gets Category details - Voting layer sequence details with Minimum and Maximum stake needed for category.
    function getCategoryDetails(uint _categoryId) 
        public 
        view 
        returns(
            uint cateId, 
            uint8[] memberRoleSequence, 
            uint8[] memberRoleMajorityVote, 
            uint32[] closingTime, 
            uint minStake, 
            uint maxStake, 
            uint incentive
        ) 
    {
        cateId = _categoryId;
        memberRoleSequence = allCategory[_categoryId].memberRoleSequence;
        memberRoleMajorityVote = allCategory[_categoryId].memberRoleMajorityVote;
        closingTime = allCategory[_categoryId].closingTime;
        minStake = allCategory[_categoryId].minStake;
        maxStake = allCategory[_categoryId].maxStake;
        incentive = allCategory[_categoryId].defaultIncentive;
    }

    /// @dev Gets minimum stake for category id
    function getMinStake(uint _categoryId) public view returns(uint) {
        return allCategory[_categoryId].minStake;
    }

    /// @dev Gets maximum stake for category id
    function getMaxStake(uint _categoryId) public view returns(uint) {
        return allCategory[_categoryId].maxStake;
    }

    /// @dev Gets Majority threshold array length when giving main category id
    function getRoleMajorityVotelength(uint _categoryId) public view returns(uint index, uint majorityVoteLength) {
        index = _categoryId;
        majorityVoteLength = allCategory[_categoryId].memberRoleMajorityVote.length;
    }

    /// @dev Gets Closing time array length when giving main category id
    function getClosingTimeLength(uint _categoryId) public view returns(uint index, uint closingTimeLength) {
        index = _categoryId;
        closingTimeLength = allCategory[_categoryId].closingTime.length;
    }

    /// @dev Gets role sequence length by category id
    function getRoleSequencLength(uint _categoryId) public view returns(uint roleLength) {
        roleLength = allCategory[_categoryId].memberRoleSequence.length;
    }

    /// @dev Gets Closing time array length when giving main category id
    function getCloseTimeLength(uint _categoryId) public view returns(uint) {
        return allCategory[_categoryId].closingTime.length;
    }

    /// @dev Gets Closing time at particular index from Closing time array
    /// @param _categoryId Id of main category
    /// @param _index Current voting status againt proposal act as an index here
    function getClosingTimeAtIndex(uint _categoryId, uint _index) public view returns(uint ct) {
        return allCategory[_categoryId].closingTime[_index];
    }

    /// @dev Gets Voting layer role sequence at particular index from Role sequence array
    /// @param _categoryId Id of main category
    /// @param _index Current voting status againt proposal act as an index here
    function getRoleSequencAtIndex(uint _categoryId, uint _index) public view returns(uint8 roleId) {
        return allCategory[_categoryId].memberRoleSequence[_index];
    }

    function getRoleSequencByProposal(uint _proposalId, uint _currVotingId) public view returns(uint32) {
        uint32 category = allSubCategory[governanceDat.getProposalCategory(_proposalId)].categoryId;
        return allCategory[category].memberRoleSequence[_currVotingId];
    }

    /// @dev Gets Majority threshold value at particular index from Majority Vote array
    /// @param _categoryId Id of main category
    /// @param _index Current voting status againt proposal act as an index here
    function getRoleMajorityVoteAtIndex(uint _categoryId, uint _index) public view returns(uint majorityVote) {
        return allCategory[_categoryId].memberRoleMajorityVote[_index];
    }

    /// @dev Gets Default incentive to be distributed against category.
    function getCatIncentive(uint _categoryId) public view returns(uint incentive) {
        incentive = allCategory[_categoryId].defaultIncentive;
    }

    /// @dev Gets Default incentive to be distributed against category.
    function getCategoryIncentive(uint _categoryId) public view returns(uint category, uint incentive) {
        category = _categoryId;
        incentive = allCategory[_categoryId].defaultIncentive;
    }

    /// @dev Gets Total number of categories added till now
    function getCategoryLength() public view returns(uint) {
        return allCategory.length;
    }

    /// @dev Gets Cateory description hash when giving category id
    function getCategoryName(uint _categoryId) public view returns(uint, string) {
        return (_categoryId, allCategory[_categoryId].name);
    }

    /// @dev Gets Category data depending upon current voting index in Voting sequence.
    /// @param _categoryId Category id
    /// @param _currVotingIndex Current voting Id in voting seqeunce.
    /// @return Next member role to vote with its closing time and majority vote.
    function getCategoryData3(uint _categoryId, uint _currVotingIndex) 
        public
        view 
        returns(uint8  rsuence, uint majorityVote, uint closingTime) 
    {
        return (
            allCategory[_categoryId].memberRoleSequence[_currVotingIndex], 
            allCategory[_categoryId].memberRoleMajorityVote[_currVotingIndex], 
            allCategory[_categoryId].closingTime[_currVotingIndex]
        );
    }

    function getMRSequenceBySubCat(uint _subCategoryId, uint _currVotingIndex) external view returns (uint8) {
        uint category = allSubCategory[_subCategoryId].categoryId;
        return allCategory[category].memberRoleSequence[_currVotingIndex];
    }

    function validateStake(uint _proposalId, uint _stake) public view returns (bool result) {
        uint64 subCat = governanceDat.getProposalCategory(_proposalId);
        uint64 category = allSubCategory[subCat].categoryId;
        if(_stake <= allCategory[category].maxStake && _stake >= allCategory[category].minStake)
            result = true;
    }

    /// @dev Gets Category and SubCategory name from Proposal ID.
    function getCatAndSubNameByPropId(uint _proposalId) 
        public 
        view 
        returns(string categoryName, string subCategoryName) 
    {
        categoryName = allCategory[getCategoryIdBySubId(governanceDat.getProposalCategory(_proposalId))].name;
        subCategoryName = allSubCategory[governanceDat.getProposalCategory(_proposalId)].categoryName;
    }

    /// @dev Gets Category ID from Proposal ID.
    function getCatIdByPropId(uint _proposalId) public view returns(uint8 catId) {
        catId = allSubCategory[governanceDat.getProposalCategory(_proposalId)].categoryId;
    }

    /// @dev adds second half of the inital categories
    function addInitialSubCategories() internal {
        allSubIdByCategory[0].push(0);
        allSubCategory.push(SubCategory("Uncategorized", "", 0, address(0), "EX"));
        allSubIdByCategory[1].push(1);
        allSubCategory.push(SubCategory(
                "Add new member role",
                "QmRnwMshX2L6hTv3SgB6J6uahK7tRgPNfkt91siznLqzQX",
                1,
                masterAddress,
                "MR"
            )
        );
        allSubIdByCategory[1].push(2);
        allSubCategory.push(SubCategory(
                "Update member role",
                "QmbsXSZ3rNPd8mDizVBV33GVg1ThveUD5YnM338wisEJyd",
                1,
                masterAddress,
                "MR"
            )
        );        
        allSubIdByCategory[2].push(3);
        allSubCategory.push(SubCategory(
                "Add new category",
                "QmNazQ3hQ5mssf8KAYkjxwVjwZvM9XjZgrJ1kf3QUmprCB",
                2,
                masterAddress,
                "PC"
            )
        );
        allSubIdByCategory[2].push(4);
        allSubCategory.push(SubCategory(
                "Edit category",
                "QmYWSuy3aZFK1Yavpq5Pm89rg6esyZ8rn5CNf6PdgJCpR6",
                2,
                masterAddress,
                "PC"
            )
        );
        allSubIdByCategory[2].push(5);
        allSubCategory.push(SubCategory(
                "Add new sub category",
                "QmeyPccQzMTNxSavJp4dL1J88zzb4xNESn5wLTPzqMFFJX",
                2,
                masterAddress,
                "PC"
            )
        );
        allSubIdByCategory[2].push(6);
        allSubCategory.push(SubCategory(
                "Edit sub category",
                "QmVeSBUghB71WHhnT8tXajSctnfz1fYx6fWXc9wXHJ8r2p",
                2,
                masterAddress,
                "PC"
            )
        );
        allSubIdByCategory[3].push(7);
        allSubCategory.push(SubCategory(
                "Configure parameters",
                "QmW9zZAfeaErTNPVcNhiDNEEo4xp4avqnVbS9zez9GV3Ar",
                3,
                masterAddress,
                "MS"
            )
        );
        allSubIdByCategory[4].push(8);
        allSubCategory.push(SubCategory(
                "Transfer Ether",
                "QmRUmxw4xmqTN6L2bSZEJfmRcU1yvVWoiMqehKtqCMAaTa",
                4,
                masterAddress,
                "PL"
            )
        );
        allSubIdByCategory[4].push(9);
        allSubCategory.push(SubCategory(
                "Transfer Token",
                "QmbvmcW3zcAnng3FWgP5bHL4ba9kMMwV9G8Y8SASqrvHHB",
                4,
                masterAddress,
                "PL"
            )
        );
        allSubIdByCategory[5].push(10);
        allSubCategory.push(SubCategory(
                "Add new version",
                "QmeMBNn9fs5xYVFVsN8HgupMTfgXdyz4vkLPXakWd2BY3w",
                5,
                masterAddress,
                "MS"
            )
        );
        allSubIdByCategory[5].push(11);
        allSubCategory.push(SubCategory(
                "Add new contract",
                "QmaPH84hSyoAz1pvzrbfAXdzVFaDyqmKKmCzcmk8LZHgjr",
                5,
                masterAddress,
                "MS"
            )
        );
        allSubIdByCategory[6].push(12);
        allSubCategory.push(SubCategory("Others, not specified", "", 4, address(0), "EX"));
    }
}