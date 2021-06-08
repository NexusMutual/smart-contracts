// SPDX-License-Identifier: GPL-3.0

/* Copyright (C) 2021 NexusMutual.io

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
