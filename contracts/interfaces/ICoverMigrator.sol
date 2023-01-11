// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721Receiver.sol";

interface ICoverMigrator {
  function submitClaim(uint coverId) external;

  function migrateCoverFrom(
    uint coverId,
    address msgSender,
    address newOwner
  ) external returns (uint newCoverId);
}
