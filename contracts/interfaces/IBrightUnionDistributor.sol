// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IBrightUnionDistributor {

  function submitClaim(uint tokenId, bytes calldata) external;

  function ownerOf(uint tokenId) external view returns (address);
}
