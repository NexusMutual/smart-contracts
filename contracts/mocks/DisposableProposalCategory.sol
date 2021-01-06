pragma solidity ^0.5.0;

import "../modules/governance/ProposalCategory.sol";
import "../modules/governance/MemberRoles.sol";

contract DisposableProposalCategory is ProposalCategory {

	uint[] allowedToCreateProposal;

  function initialize(
    address _memberRolesAddress
  ) external {

    require(!constructorCheck);
    constructorCheck = true;
    categoryActionHashUpdated = true;

    mr = MemberRoles(_memberRolesAddress);
		allowedToCreateProposal = [2]; // board members

    // NAME, CONTRACT_NAME, MAJORITY_VOTE_PERC, QUORUM_PERC, MEMBER_ROLE_TO_VOTE, CATEGORY_AB_REQ, ACTION_HASH
		// FUNCTION
    addInitialCategory("Uncategorized", "MR", 60, 15, 1, 0, "");

    addInitialCategory("Add new member role", "MR", 60, 15, 1, 0, "QmQFnBep7AyMYU3LJDuHSpTYatnw65XjHzzirrghtZoR8U");
		categoryActionHashes[1] = abi.encodeWithSignature("addRole(bytes32,string,address)");
    addInitialCategory("Update member role", "MR", 60, 15, 1, 0, "QmXMzSViLBJ22P9oj51Zz7isKTRnXWPHZcQ5hzGvvWD3UV");
		categoryActionHashes[2] = abi.encodeWithSignature("updateRole(address,uint256,bool)");
    addInitialCategory("Add new category", "PC", 60, 15, 1, 0, "QmWMLx6tLNDZCm54mrLndjiTBGFJWZk6pdwsShv17ETSVz");
		categoryActionHashes[3] = abi.encodeWithSignature("newCategory(string,uint256,uint256,uint256,uint256[],uint256,string,address,bytes2,uint256[],string)");
    addInitialCategory("Edit category", "PC", 60, 15, 1, 0, "QmPShfp1ReVHf2cy4j8G6uLtzEVSFZXKCvcp5vSCPwTeDP");
		categoryActionHashes[4] = abi.encodeWithSignature("editCategory(uint256,string,uint256,uint256,uint256,uint256[],uint256,string,address,bytes2,uint256[],string)");
    addInitialCategory("Upgrade a contract Implementation", "MS", 50, 15, 2, 80, "QmYi2YUMZvJoJfYRFWvuhez9Kz8YMDBsHAvdh64188nNMz");
		categoryActionHashes[5] = abi.encodeWithSignature("upgradeMultipleImplementations(bytes2[],address[])");
    addInitialCategory("Implement Emergency Pause", "MS", 0, 15, 1, 0, "QmYMB8dTwJXJpkJcmeBY3LSd5314fKXdUC1KhnQeHnxkET");
		categoryActionHashes[6] = abi.encodeWithSignature("startEmergencyPause()");
    addInitialCategory("Extend or Switch Off Emergency Pause", "MS", 50, 15, 2, 0, "QmUcViL27xtoXK3tPvBNnDr26YWcNiT6qSEDNgBK4UiNo2");
		categoryActionHashes[7] = abi.encodeWithSignature("addEmergencyPause(bool,bytes4)");
    addInitialCategory("Burn Claims Assessor Bond", "TF", 80, 15, 1, 0, "QmezNJUF2BM5Nv9EMnsEKUmuqjvdySzvQFvhEdvFJbau3k");
		categoryActionHashes[8] = abi.encodeWithSignature("burnCAToken(uint256,uint256,address)");
    addInitialCategory("Pause Claim Assessor Voting for 3 days", "CD", 60, 15, 1, 0, "QmRBXh9NGoGV7U7tTurKPhL4bzvDc9n23QZYidELpBPVdg");
		categoryActionHashes[9] = abi.encodeWithSignature("setUserClaimVotePausedOn(address)");
    addInitialCategory("Changes to Capital Model", "EX", 50, 15, 2, 60, "");
    addInitialCategory("Changes to Pricing Model", "EX", 50, 15, 2, 60, "QmYwPEYDfHN1Rp799NFRSjbtwya2p2JQsCP9FqLTfAznaD");
    addInitialCategory("Withdraw funds to Pay for Support Services", "P1", 50, 15, 2, 80, "QmZQhJunZesYuCJkdGwejSATTR8eynUgV8372cHvnAPMaM");
		categoryActionHashes[12] = abi.encodeWithSignature("transferEther(uint256,address)");
    addInitialCategory("Add Investment Asset", "PD", 50, 15, 2, 60, "Qmd66GdYtn1BYmZTB1op1Fbfkq6uywMpow5LRmG2Twbzjb");
		categoryActionHashes[13] = abi.encodeWithSignature("addInvestmentAssetCurrency(bytes4,address,bool,uint64,uint64,uint8)");
    addInitialCategory("Edit Investment Asset min and max holding percentages", "PD", 50, 15, 2, 60, "QmXwyffmk7rYGHE7p4g3oroJkmyEYAn6EffhZu2MCNcJGA");
		categoryActionHashes[14] = abi.encodeWithSignature("changeInvestmentAssetHoldingPerc(bytes4,uint64,uint64)");
    addInitialCategory("Update Investment Asset Status", "PD", 50, 15, 2, 60, "QmZkxcC82WFRvnBahLT3eQ95ZSGMxuAyCYqxvR3tSyhFmB");
		categoryActionHashes[15] = abi.encodeWithSignature("changeInvestmentAssetStatus(bytes4,bool)");
    addInitialCategory("Change AB Member", "MR", 50, 15, 2, 0, "Qmay85jFW1f5n4Jdop9uGUq8T8hpqFkorY6nGjBE7nuYWF");
		categoryActionHashes[16] = abi.encodeWithSignature("swapABMember(address,address)");
    addInitialCategory("Add Currency Asset", "PD", 50, 15, 2, 0, "Qmesm1FRDGVFNpaiHzubxXhqYTikpzFVKqPUJp5zXVfqHh");
		categoryActionHashes[17] = abi.encodeWithSignature("addCurrencyAssetCurrency(bytes4,address,uint256)");
    addInitialCategory("Any other Item", "EX", 50, 15, 2, 80, "QmYBx7w7NqhPqXztmgXUtuZDaQYug13DX9BCMYzGgigPCH");
    addInitialCategory("Special Resolution", "EX", 75, 0, 2, 0, "");
    addInitialCategory("Update Token Parameters", "TD", 50, 15, 2, 60, "QmbfJTXyLTDsq41U4dukHbagcXef8bRfyMdMqcqLd9aKNM");
		categoryActionHashes[20] = abi.encodeWithSignature("updateUintParameters(bytes8,uint256)");
    addInitialCategory("Update Risk Assessment Parameters", "TD", 50, 15, 2, 60, "QmQNQxjPxCPu48UBXAuSugXECM7JbMFx41bsu5avyaodih");
		categoryActionHashes[21] = abi.encodeWithSignature("updateUintParameters(bytes8,uint256)");
    addInitialCategory("Update Governance Parameters", "GV", 50, 15, 2, 60, "QmdFDVEaZnJxXncFczTW6EvrcgR3jBfuPWftR7PfkPfqqT");
		categoryActionHashes[22] = abi.encodeWithSignature("updateUintParameters(bytes8,uint256)");
    addInitialCategory("Update Quotation Parameters", "QD", 50, 15, 2, 60, "QmTtSbBp2Cxaz8HzB4TingUozr9AW91siCfMjjyzf8qqAb");
		categoryActionHashes[23] = abi.encodeWithSignature("updateUintParameters(bytes8,uint256)");
    addInitialCategory("Update Claims Assessment Parameters", "CD", 50, 15, 2, 60, "QmVasvKpHpNbWAm39f6jvmKUCBSeBPp8N2rwtxkFoWUzcN");
		categoryActionHashes[24] = abi.encodeWithSignature("updateUintParameters(bytes8,uint256)");
    addInitialCategory("Update Investment Module Parameters", "PD", 50, 15, 2, 60, "QmYSUJBJD9hUevydfdF34rGFG7bBQhMrxh2ga9XfeAkdEM");
		categoryActionHashes[25] = abi.encodeWithSignature("updateUintParameters(bytes8,uint256)");
    addInitialCategory("Update Capital Model Parameters", "PD", 50, 15, 2, 60, "QmaQH6AdvBdgrW4xdzcMHa7gNyYSGa2fz7gBuuic2hLkZQ");
		categoryActionHashes[26] = abi.encodeWithSignature("updateUintParameters(bytes8,uint256)");
    addInitialCategory("Update Address Parameters", "MS", 50, 15, 2, 60, "Qmbv7PFdkXvJzUHi8dwAGFqthWeDD9Uq5RMtCztQUoaAcZ");
		categoryActionHashes[27] = abi.encodeWithSignature("updateAddressParameters(bytes8,address)");
    addInitialCategory("Update Owner Parameters", "MS", 50, 15, 2, 0, "QmbXSbVKCyJsFrbnEPvFX6a8Xvj2xEXa2T8ia2HaJWzBxo");
		categoryActionHashes[28] = abi.encodeWithSignature("updateOwnerParameters(bytes8,address)");
    addInitialCategory("Release new smart contract code", "MS", 50, 15, 2, 80, "QmXj1MoQ5q5e2jtdCBoBSJrx84bsHnwpty2FAcPdbRHXM8");
		categoryActionHashes[29] = abi.encodeWithSignature("upgradeMultipleContracts(bytes2[],address[])");
    addInitialCategory("Edit Currency Asset Address", "PD", 50, 15, 1, 60, "Qmdb7pFA72hicjfZFX3hKtCqRSuybytviET5N9LN2uEdyy");
		categoryActionHashes[30] = abi.encodeWithSignature("changeCurrencyAssetAddress(bytes4,address)");
    addInitialCategory("Edit Currency Asset baseMin", "PD", 50, 15, 2, 60, "QmeFSwZ21d7XabxVc7eiNKbtfEXUuD8qQXkeHZ5To1vo4t");
		categoryActionHashes[31] = abi.encodeWithSignature("changeCurrencyAssetBaseMin(bytes4,uint256)");
    addInitialCategory("Edit Investment Asset Address and decimal", "PD", 50, 15, 2, 60, "QmYKeU8cFxjSdPnnUELtMAbdwBAXqGNjCMLLH8N8azhdUf");
		categoryActionHashes[32] = abi.encodeWithSignature("changeInvestmentAssetAddressAndDecimal(bytes4,address,uint8)");
    addInitialCategory("Trading Trigger Check", "PD", 40, 15, 2, 60, "QmS4WTj57SBHUtcxhTm5P3cpNtH53LPMf6xFM5zKKjWuwx");
		categoryActionHashes[33] = abi.encodeWithSignature("externalLiquidityTrade()");
    addInitialCategory("Add new contract", "MS", 60, 15, 2, 60, "QmQibhfwQWksWRXuu4sDbWJ6vqYGcac2fARU3QoyELbjqb");
		categoryActionHashes[34] = abi.encodeWithSignature("addNewInternalContract(bytes2,address,uint256)");
    addInitialCategory("Token Controller Parameters", "TC", 60, 15, 2, 60, "QmQxQYq7X1QUJkx4GQZN6PdgrKXhTik2vqgmpAaKqaeXZL");
		categoryActionHashes[35] = abi.encodeWithSignature("updateUintParameters(bytes8,uint256)");
    addInitialCategory("Update MCR Parameters", "TC", 60, 15, 2, 60, "QmP1ef1FqFwevy5bczcsiLAjT4E6pTNfhcRMiyJkBygVPE");
		categoryActionHashes[36] = abi.encodeWithSignature("updateUintParameters(bytes8,uint256)");
    addInitialCategory("Upgrade Master", "MS", 60, 15, 2, 60, ""); // Not used?

  }

  function addInitialCategory(
    string memory _name,
    bytes2 _contractName,
    uint _majorityVotePerc,
    uint _quorumPerc,
    uint _memberRoleToVote,
    uint _categoryABReq,
    string memory _actionHash
  ) internal {

    uint[] memory stakeIncentive = new uint[](4);
    stakeIncentive[0] = 0; // min stake
    stakeIncentive[1] = 0; // default incentive
    stakeIncentive[2] = _categoryABReq; // ab voting required
    stakeIncentive[3] = _quorumPerc == 0 ? 1 : 0; // isSpecialResolution

    _addCategory(
      _name, _memberRoleToVote, _majorityVotePerc, _quorumPerc, allowedToCreateProposal,
      604800, _actionHash, address(0), _contractName, stakeIncentive
    );

  }
}
