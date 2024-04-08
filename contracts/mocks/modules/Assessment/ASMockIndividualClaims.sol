// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/INXMToken.sol";
import "../../../interfaces/IIndividualClaims.sol";
import "../../../interfaces/IAssessment.sol";

import "../../../abstract/MasterAwareV2.sol";
import "../../generic/IndividualClaimsGeneric.sol";

contract ASMockIndividualClaims is MasterAwareV2, IndividualClaimsGeneric {

  INXMToken public token;

  constructor(address tokenAddress) {
    token = INXMToken(tokenAddress);
  }

  function assessment() internal view returns (IAssessment) {
    return IAssessment(getInternalContractAddress(ID.AS));
  }

  function submitClaim(
    uint32 coverId,
    uint16 segmentId,
    uint96 requestedAmount,
    string calldata /*ipfsMetadata*/
  ) external payable override returns (Claim memory) {
    Claim memory claim = Claim(
      0,
      coverId,
      segmentId,
      requestedAmount,
      0,
      false // payoutRedeemed
    );

    uint assessmentId = assessment().startAssessment(config.rewardRatio * requestedAmount / 10000, 0);
    claim.assessmentId = uint80(assessmentId);
    claims.push(claim);

    return claim;
  }

  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.AS)] = master.getLatestAddress("AS");

    // The minimum cover premium per year is 2.6%. 20% of the cover premium is: 2.6% * 20% = 0.52%
    config.rewardRatio = 130; // 0.52%
    config.minAssessmentDepositRatio = 500; // 5% i.e. 0.05 ETH submission flat fee
  }

}
