// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IProposalCategory.sol";
import "../../abstract/LegacyMasterAware.sol";
import "../../modules/governance/external/Governed.sol";

contract DisposableProposalCategory is Governed, LegacyMasterAware {
  bool public constructorCheck;
  IMemberRoles internal mr;

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
  mapping(uint => CategoryAction) internal categoryActionData;
  mapping(uint => uint) public categoryABReq;
  mapping(uint => uint) public isSpecialResolution;
  mapping(uint => bytes) public categoryActionHashes;

  bool public categoryActionHashUpdated;

  function initialize(address _memberRolesAddress) external {

    require(!constructorCheck);
    constructorCheck = true;
    categoryActionHashUpdated = true;

    mr = IMemberRoles(_memberRolesAddress);
  }

  function _verifyMemberRoles(uint _memberRoleToVote, uint[] memory _allowedToCreateProposal)
  internal view returns (uint) {
    uint totalRoles = mr.totalRoles();
    if (_memberRoleToVote >= totalRoles) {
      return 0;
    }
    for (uint i = 0; i < _allowedToCreateProposal.length; i++) {
      if (_allowedToCreateProposal[i] >= totalRoles) {
        return 0;
      }
    }
    return 1;
  }

  function _addCategory(
    string memory _name,
    uint _memberRoleToVote,
    uint _majorityVotePerc,
    uint _quorumPerc,
    uint[] memory _allowedToCreateProposal,
    uint _closingTime,
    string memory _actionHash,
    address _contractAddress,
    bytes2 _contractName,
    uint[] memory _incentives
  )
  internal
  {
    require(_verifyMemberRoles(_memberRoleToVote, _allowedToCreateProposal) == 1, "Invalid Role");
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

  function addInitialCategory (
    string memory name,
    uint memberRoleToVote,
    uint majorityVotePerc,
    uint quorumPerc,
    uint[] memory allowedToCreateProposal,
    uint closingTime,
    string memory actionIpfsHash,
    address contractAddress,
    bytes2 contractName,
    uint[] memory stakeIncentive,
    string memory functionHash
  ) public {

    _addCategory(
      name,
      memberRoleToVote,
      majorityVotePerc,
      quorumPerc,
      allowedToCreateProposal,
      closingTime,
      actionIpfsHash,
      contractAddress,
      contractName,
      stakeIncentive
    );

    if (bytes(functionHash).length > 0 && abi.encodeWithSignature(functionHash).length == 4) {
      categoryActionHashes[allCategory.length - 1] = abi.encodeWithSignature(functionHash);
    }
  }

  function changeMasterAddress(address _masterAddress) public {
    if (masterAddress != address(0))
      require(masterAddress == msg.sender);
    masterAddress = _masterAddress;
    ms = INXMMaster(_masterAddress);
    nxMasterAddress = _masterAddress;

  }

  /**
  * @dev Updates dependant contract addresses
  */
  function changeDependentContractAddress() public {
    mr = IMemberRoles(ms.getLatestAddress("MR"));
  }


  event Category(
    uint indexed categoryId,
    string categoryName,
    string actionHash
  );

}
