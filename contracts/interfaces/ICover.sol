// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721.sol";

interface ICover is IERC721 {

  /* ========== DATA STRUCTURES ========== */

  enum RedeemMethod {
    Claim,
    Incident
  }

  struct CoverChunkRequest {
    address poolAddress;
    uint coverAmountInAsset;
  }

  struct CoverChunk {
    address poolAddress;
    uint96 coverAmountInNXM;
    uint96 premiumInNXM;
  }

  struct CoverData {
    uint24 productId;
    uint8 payoutAsset;
    uint96 amount;
    uint32 start;
    uint32 period;  // seconds
    uint96 premium;
  }

  struct Product {
    uint16 productType;
    uint24 productId;
    /* supported payout assets bitmap TODO: explain */
    uint payoutAssets;
  }

  struct ProductType {
    string descriptionIpfsHash;
    uint8 redeemMethod;
    uint16 gracePeriodInDays;
  }

  /* ========== VIEWS ========== */

  function covers(uint id) external view returns (uint24, uint8, uint96, uint32, uint32, uint96);

  function products(uint id) external view returns (uint16, uint24, uint);

  function productTypes(uint id) external view returns (string memory, uint8, uint16);

  function activeCoverAmountInNXM(uint id) external view returns (uint96);

  /* === MUTATIVE FUNCTIONS ==== */

  function buyCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint96 amount,
    uint32 period,
    uint maxPremiumInAsset,
    CoverChunkRequest[] calldata coverChunkRequests
  ) external payable returns (uint /*coverId*/);

  function performPayoutBurn(uint coverId, address owner, uint amount) external;

  /* ========== EVENTS ========== */

}
