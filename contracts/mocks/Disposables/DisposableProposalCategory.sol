pragma solidity ^0.5.0;

import "../../modules/governance/ProposalCategory.sol";
import "../../modules/governance/MemberRoles.sol";

contract DisposableProposalCategory is ProposalCategory {

  function initialize(address _memberRolesAddress) external {

    require(!constructorCheck);
    constructorCheck = true;
    categoryActionHashUpdated = true;

    mr = MemberRoles(_memberRolesAddress);
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

}
