// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721.sol";

interface ICover is IERC721 {

  /* ========== DATA STRUCTURES ========== */

  struct StakingPool {
    uint160 id;
    uint96 bookedAmount;
  }

  struct Cover {
    uint24 productId;
    uint96 amount;
    uint32 start;
    uint32 period;  // seconds
    uint8 payoutAsset;
    uint8 deniedClaims;
    uint80 nxmPrice; // 1 NXM in payoutAsset
  }

  struct Product {
    uint8 payoutAsset;
    address productAddress;
  }

  /* ========== VIEWS ========== */

  function covers(uint id) external view returns (
    uint24 productId,
    uint96 amount,
    uint32 start,
    uint32 period,
    uint8 payoutAsset,
    uint8 deniedClaims,
    uint80 nxmPrice
  );

  /* === MUTATIVE FUNCTIONS ==== */

  function buyCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint96 amount,
    uint32 period,
    uint maxPrice,
    StakingPool[] calldata stakingPools
  ) external returns (uint /*coverId*/);

  function createCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint8 deniedClaims,
    uint96 amount,
    uint32 period,
    StakingPool[] calldata stakingPools
  ) external returns (uint /*coverId*/);

  function incrementDeniedClaims(uint coverId) external;

  function performPayoutBurn(uint coverId, address owner, uint amount) external;

  /* ========== EVENTS ========== */

}
