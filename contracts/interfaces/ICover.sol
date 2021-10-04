// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "./ICoverNFT.sol";

interface ICover {

  /* ========== DATA STRUCTURES ========== */

  enum RedeemMethod {
    Claim,
    Incident
  }

  struct CoverChunkRequest {
    // TODO: switch to poolId and derive the address created with CREATE2 from the id
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
    address productAddress;
    /* supported payout assets bitmap TODO: explain */
    uint payoutAssets;
    // TODO: consider if to pack the initialPrice and activeCoverAmountInNXM here. issues appear with
    // to many variables currently + not all parameters are needed everywhere
  }

  struct ProductType {
    string descriptionIpfsHash;
    uint8 redeemMethod;
    uint16 gracePeriodInDays;
  }

  /* ========== VIEWS ========== */

  function covers(uint id) external view returns (uint24, uint8, uint96, uint32, uint32, uint96);

  function products(uint id) external view returns (uint16, address, uint);

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

  function performPayoutBurn(uint coverId, uint amount) external returns (address /*owner*/);

  function coverNFT() external returns (ICoverNFT);

  /* ========== EVENTS ========== */

}
