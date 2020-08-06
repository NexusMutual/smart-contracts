pragma solidity ^0.5.7;

import "../modules/governance/ProposalCategory.sol";
import "../modules/governance/MemberRoles.sol";

contract DisposableProposalCategory is ProposalCategory {

  function initialize(
    address _memberRolesAddress
  ) external {

    require(!constructorCheck);
    constructorCheck = true;
    categoryActionHashUpdated = true;

    mr = MemberRoles(_memberRolesAddress);

    addInitialCategory("Uncategorized", "MR", 60, 15, 1, 0);
    addInitialCategory("Add new member role", "MR", 60, 15, 1, 0);
    addInitialCategory("Update member role", "MR", 60, 15, 1, 0);
    addInitialCategory("Add new category", "PC", 60, 15, 1, 0);
    addInitialCategory("Edit category", "PC", 60, 15, 1, 0);
    addInitialCategory("Upgrade a contract Implementation", "MS", 50, 15, 2, 80);
    addInitialCategory("Implement Emergency Pause", "MS", 0, 15, 1, 0);
    addInitialCategory("Extend or Switch Off Emergency Pause", "MS", 50, 15, 2, 0);
    addInitialCategory("Burn Claims Assessor Bond", "TF", 80, 15, 1, 0);
    addInitialCategory("Pause Claim Assessor Voting for 3 days", "CD", 60, 15, 1, 0);
    addInitialCategory("Changes to Capital Model", "EX", 50, 15, 2, 60);
    addInitialCategory("Changes to Pricing Model", "EX", 50, 15, 2, 60);
    addInitialCategory("Withdraw funds to Pay for Support Services", "P1", 50, 15, 2, 80);
    addInitialCategory("Add Investment Asset", "PD", 50, 15, 2, 60);
    addInitialCategory("Edit Investment Asset min and max holding percentages", "PD", 50, 15, 2, 60);
    addInitialCategory("Update Investment Asset Status", "PD", 50, 15, 2, 60);
    addInitialCategory("Change AB Member", "MR", 50, 15, 2, 0);
    addInitialCategory("Add Currency Asset", "PD", 50, 15, 2, 0);
    addInitialCategory("Any other Item", "EX", 50, 15, 2, 80);
    addInitialCategory("Special Resolution", "EX", 75, 0, 2, 0);
    addInitialCategory("Update Token Parameters", "TD", 50, 15, 2, 60);
    addInitialCategory("Update Risk Assessment Parameters", "TD", 50, 15, 2, 60);
    addInitialCategory("Update Governance Parameters", "GV", 50, 15, 2, 60);
    addInitialCategory("Update Quotation Parameters", "QD", 50, 15, 2, 60);
    addInitialCategory("Update Claims Assessment Parameters", "CD", 50, 15, 2, 60);
    addInitialCategory("Update Investment Module Parameters", "PD", 50, 15, 2, 60);
    addInitialCategory("Update Capital Model Parameters", "PD", 50, 15, 2, 60);
    addInitialCategory("Update Address Parameters", "MS", 50, 15, 2, 60);
    addInitialCategory("Update Owner Parameters", "MS", 50, 15, 2, 0);
    addInitialCategory("Release new smart contract code", "MS", 50, 15, 2, 80);
    addInitialCategory("Edit Currency Asset Address", "PD", 50, 15, 1, 60);
    addInitialCategory("Edit Currency Asset baseMin", "PD", 50, 15, 2, 60);
    addInitialCategory("Edit Investment Asset Address and decimal", "PD", 50, 15, 2, 60);
    addInitialCategory("Trading Trigger Check", "PD", 40, 15, 2, 60);
    addInitialCategory("Add new contract", "MS", 60, 15, 2, 60);
    addInitialCategory("Token Controller Parameters", "TC", 60, 15, 2, 60);

    // 0: Uncategorized
    categoryActionHashes[1] = abi.encodeWithSignature("addRole(bytes32,string,address)");
    categoryActionHashes[2] = abi.encodeWithSignature("updateRole(address,uint256,bool)");
    categoryActionHashes[3] = abi.encodeWithSignature("newCategory(string,uint256,uint256,uint256,uint256[],uint256,string,address,bytes2,uint256[],string)");
    categoryActionHashes[4] = abi.encodeWithSignature("editCategory(uint256,string,uint256,uint256,uint256,uint256[],uint256,string,address,bytes2,uint256[],string)");
    categoryActionHashes[5] = abi.encodeWithSignature("upgradeContractImplementation(bytes2,address)");
    categoryActionHashes[6] = abi.encodeWithSignature("startEmergencyPause()");
    categoryActionHashes[7] = abi.encodeWithSignature("addEmergencyPause(bool,bytes4)");
    categoryActionHashes[8] = abi.encodeWithSignature("burnCAToken(uint256,uint256,address)");
    categoryActionHashes[9] = abi.encodeWithSignature("setUserClaimVotePausedOn(address)");
    // 10: Changes to Capital Model
    // 11: Changes to Pricing Model
    categoryActionHashes[12] = abi.encodeWithSignature("transferEther(uint256,address)");
    categoryActionHashes[13] = abi.encodeWithSignature("addInvestmentAssetCurrency(bytes4,address,bool,uint64,uint64,uint8)");
    categoryActionHashes[14] = abi.encodeWithSignature("changeInvestmentAssetHoldingPerc(bytes4,uint64,uint64)");
    categoryActionHashes[15] = abi.encodeWithSignature("changeInvestmentAssetStatus(bytes4,bool)");
    categoryActionHashes[16] = abi.encodeWithSignature("swapABMember(address,address)");
    categoryActionHashes[17] = abi.encodeWithSignature("addCurrencyAssetCurrency(bytes4,address,uint256)");
    // 18: Any other Item
    // 19: Special Resolution
    categoryActionHashes[20] = abi.encodeWithSignature("updateUintParameters(bytes8,uint256)");
    categoryActionHashes[21] = abi.encodeWithSignature("updateUintParameters(bytes8,uint256)");
    categoryActionHashes[22] = abi.encodeWithSignature("updateUintParameters(bytes8,uint256)");
    categoryActionHashes[23] = abi.encodeWithSignature("updateUintParameters(bytes8,uint256)");
    categoryActionHashes[24] = abi.encodeWithSignature("updateUintParameters(bytes8,uint256)");
    categoryActionHashes[25] = abi.encodeWithSignature("updateUintParameters(bytes8,uint256)");
    categoryActionHashes[26] = abi.encodeWithSignature("updateUintParameters(bytes8,uint256)");
    categoryActionHashes[27] = abi.encodeWithSignature("updateAddressParameters(bytes8,address)");
    categoryActionHashes[28] = abi.encodeWithSignature("updateOwnerParameters(bytes8,address)");
    categoryActionHashes[29] = abi.encodeWithSignature("upgradeContract(bytes2,address)");
    categoryActionHashes[30] = abi.encodeWithSignature("changeCurrencyAssetAddress(bytes4,address)");
    categoryActionHashes[31] = abi.encodeWithSignature("changeCurrencyAssetBaseMin(bytes4,uint256)");
    categoryActionHashes[32] = abi.encodeWithSignature("changeInvestmentAssetAddressAndDecimal(bytes4,address,uint8)");
    categoryActionHashes[33] = abi.encodeWithSignature("externalLiquidityTrade()");
    categoryActionHashes[34] = abi.encodeWithSignature("addNewInternalContract(bytes2,address,uint256)");
    categoryActionHashes[35] = abi.encodeWithSignature("updateUintParameters(bytes8,uint256)");

  }

  function addInitialCategory(
    string memory _name,
    bytes2 _contractName,
    uint _majorityVotePerc,
    uint _quorumPerc,
    uint _memberRoleToVote,
    uint _categoryABReq
  ) internal {

    // heads up: ^ action hash was removed from function params as it isn't stored anywhere

    uint[] memory allowedToCreateProposal = new uint[](1);
    uint[] memory stakeIncentive = new uint[](4);

    allowedToCreateProposal[0] = 2; // board members

    stakeIncentive[0] = 0; // min stake
    stakeIncentive[1] = 0; // default incentive
    stakeIncentive[2] = _categoryABReq; // ab voting required
    stakeIncentive[3] = _quorumPerc == 0 ? 1 : 0; // isSpecialResolution

    _addCategory(
      _name, _memberRoleToVote, _majorityVotePerc, _quorumPerc, allowedToCreateProposal,
      604800, "", address(0), _contractName, stakeIncentive
    );
  }
}
