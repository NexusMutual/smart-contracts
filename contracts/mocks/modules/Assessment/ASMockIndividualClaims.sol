// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/INXMToken.sol";
import "../../../interfaces/IIndividualClaims.sol";
import "../../../interfaces/IAssessment.sol";
import "../../../abstract/MasterAwareV2.sol";
import "../../generic/IndividualClaimsGeneric.sol";

contract ASMockIndividualClaims is MasterAwareV2, IndividualClaimsGeneric {

  uint constant public MIN_ASSESSMENT_DEPOSIT_RATIO = 500; // bps
  uint constant public MIN_ASSESSMENT_DEPOSIT_DENOMINATOR = 10000;

  uint constant public REWARD_RATIO = 130; // bps
  uint constant public REWARD_DENOMINATOR = 10000;

  function assessment() internal view returns (IAssessment) {
    return IAssessment(getInternalContractAddress(ID.AS));
  }

  function getRewardRatio() external pure override returns (uint) {
    return REWARD_RATIO;
  }

  function submitClaim(
    uint32 coverId,
    uint96 requestedAmount,
    string calldata /*ipfsMetadata*/
  ) external payable override returns (Claim memory) {

    uint totalReward = requestedAmount * REWARD_RATIO / REWARD_DENOMINATOR;
    uint assessmentId = assessment().startAssessment(totalReward, 0);

    Claim memory claim = Claim(
      uint80(assessmentId),
      coverId,
      0, // ex segment id
      requestedAmount,
      0,
      false // payoutRedeemed
    );

    claims.push(claim);

    return claim;
  }

  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.AS)] = master.getLatestAddress("AS");
  }

}
