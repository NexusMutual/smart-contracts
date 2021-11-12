// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.4;

import "../../interfaces/INXMToken.sol";
import "../../interfaces/IClaims.sol";
import "../../interfaces/IAssessment.sol";

import "../../abstract/MasterAwareV2.sol";

contract ASMockClaims is MasterAwareV2 {

  INXMToken public token;
  IClaims.Configuration public config;
  IClaims.Claim[] public claims;

  constructor(address tokenAddres) public {
    token = INXMToken(tokenAddres);
  }

  function initialize(address masterAddress) external {
    // The minimum cover premium per year is 2.6%. 20% of the cover premium is: 2.6% * 20% = 0.52%
    config.rewardRatio = 130; // 0.52%
    config.minAssessmentDepositRatio = 500; // 5% i.e. 0.05 ETH submission flat fee
    master = INXMMaster(masterAddress);
  }

  function assessment() internal view returns (IAssessment) {
    return IAssessment(getInternalContractAddress(ID.AS));
  }

  function submitClaim(
    uint24 coverId,
    uint96 requestedAmount,
    bool hasProof,
    string calldata ipfsProofHash
  ) external payable {
    IClaims.Claim memory claim = IClaims.Claim(
      0,
      coverId,
      requestedAmount,
      0,
      false // payoutRedeemed
    );

    uint assessmentId = assessment().startAssessment(config.rewardRatio * requestedAmount / 10000, 0);
    claim.assessmentId = uint80(assessmentId);
    claims.push(claim);
  }

  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.AS)] = master.getLatestAddress("AS");
  }

}
