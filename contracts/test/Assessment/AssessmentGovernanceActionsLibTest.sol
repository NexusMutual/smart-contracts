// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/utils/cryptography/MerkleProof.sol";
import "../../interfaces/IAssessment.sol";
import "../../libraries/Assessment/AssessmentGovernanceActionsLib.sol";

contract AssessmentGovernanceActionsLibTest {

  function getUpdatedUintParameters (
    IAssessment.Configuration calldata CONFIG,
    IAssessment.UintParams[] calldata paramNames,
    uint[] calldata values
  ) external pure returns (IAssessment.Configuration memory) {
    return AssessmentGovernanceActionsLib.getUpdatedUintParameters(CONFIG, paramNames, values);
  }
}
