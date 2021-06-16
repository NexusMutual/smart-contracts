// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IGateway {

  enum ClaimStatus { IN_PROGRESS, ACCEPTED, REJECTED }

  enum CoverType { SIGNED_QUOTE_CONTRACT_COVER }

  function buyCover (
    address contractAddress,
    address coverAsset,
    uint sumAssured,
    uint16 coverPeriod,
    CoverType coverType,
    bytes calldata data
  ) external payable returns (uint);

  function getCoverPrice (
    address contractAddress,
    address coverAsset,
    uint sumAssured,
    uint16 coverPeriod,
    CoverType coverType,
    bytes calldata data
  ) external view returns (uint coverPrice);

  function getCover(uint coverId)
  external
  view
  returns (
    uint8 status,
    uint sumAssured,
    uint16 coverPeriod,
    uint validUntil,
    address contractAddress,
    address coverAsset,
    uint premiumInNXM,
    address memberAddress
  );

  function submitClaim(uint coverId, bytes calldata data) external returns (uint);

  function claimTokens(
    uint coverId,
    uint incidentId,
    uint coveredTokenAmount,
    address coverAsset
  ) external returns (uint claimId, uint payoutAmount, address payoutToken);

  function getClaimCoverId(uint claimId) external view returns (uint);

  function getPayoutOutcome(uint claimId) external view returns (ClaimStatus status, uint paidAmount, address asset);

  function executeCoverAction(uint tokenId, uint8 action, bytes calldata data) external payable returns (bytes memory, uint);

  function switchMembership(address _newAddress) external;
}
