// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./ICover.sol";

/* enums */

enum ClaimMethod {
  IndividualClaims,
  DeprecatedYieldTokenIncidents
}

/* io structs */

struct ProductInitializationParams {
  uint productId;
  uint8 weight;
  uint96 initialPrice;
  uint96 targetPrice;
}

/* storage structs */

struct Product {
  uint16 productType;
  uint16 minPrice;
  // leftover memory gap from the previously used address field yieldTokenAddress
  uint144 __gap;
  // cover assets bitmap. each bit represents whether the asset with
  // the index of that bit is enabled as a cover asset for this product
  uint32 coverAssets;
  uint16 initialPriceRatio;
  uint16 capacityReductionRatio;
  bool isDeprecated;
  bool useFixedPrice;
}

struct ProductType {
  ClaimMethod claimMethod;
  uint32 gracePeriod;
  uint32 assessmentCooldownPeriod;
  uint32 payoutRedemptionPeriod;
}

interface ICoverProducts {

  /* storage structs */

  struct Metadata {
    string ipfsHash;
    uint timestamp;
  }

  /* io structs */

  struct ProductParam {
    string productName;
    uint productId;
    string ipfsMetadata;
    Product product;
    uint[] allowedPools;
  }

  struct ProductTypeParam {
    string productTypeName;
    uint productTypeId;
    string ipfsMetadata;
    ProductType productType;
  }

  /* ========== VIEWS ========== */

  function getProductType(uint productTypeId) external view returns (ProductType memory);

  function getProductTypeName(uint productTypeId) external view returns (string memory);

  function getProductTypeCount() external view returns (uint);

  function getProductTypes() external view returns (ProductType[] memory);

  function getProduct(uint productId) external view returns (Product memory);

  function getProductName(uint productTypeId) external view returns (string memory);

  function getProductCount() external view returns (uint);

  function getProducts() external view returns (Product[] memory);

  // add grace period function?
  function getProductWithType(uint productId) external view returns (Product memory, ProductType memory);

  function getProductTypeOf(uint productId) external view returns (ProductType memory);

  function getLatestProductMetadata(uint productId) external view returns (Metadata memory);

  function getLatestProductTypeMetadata(uint productTypeId) external view returns (Metadata memory);

  function getProductMetadata(uint productId) external view returns (Metadata[] memory);

  function getProductTypeMetadata(uint productTypeId) external view returns (Metadata[] memory);

  function getAllowedPools(uint productId) external view returns (uint[] memory _allowedPools);

  function getAllowedPoolsCount(uint productId) external view returns (uint);

  function isPoolAllowed(uint productId, uint poolId) external view returns (bool);

  function requirePoolIsAllowed(uint[] calldata productIds, uint poolId) external view;

  function getCapacityReductionRatios(uint[] calldata productIds) external view returns (uint[] memory);

  function getInitialPrices(uint[] calldata productIds) external view returns (uint[] memory);

  function getMinPrices(uint[] calldata productIds) external view returns (uint[] memory);

  function prepareStakingProductsParams(
    ProductInitializationParams[] calldata params
  ) external returns (
    ProductInitializationParams[] memory validatedParams
  );

  /* === MUTATIVE FUNCTIONS ==== */

  function setProductTypes(ProductTypeParam[] calldata productTypes) external;

  function setProducts(ProductParam[] calldata params) external;

  /* ========== EVENTS ========== */

  event ProductSet(uint id);
  event ProductTypeSet(uint id);

  // Products and product types
  error ProductNotFound();
  error ProductTypeNotFound();
  error ProductDeprecated();
  error PoolNotAllowedForThisProduct(uint productId);
  error StakingPoolDoesNotExist();
  error MismatchedArrayLengths();
  error MetadataRequired();
  error ClaimMethodMismatch();

  // Misc
  error UnsupportedCoverAssets();
  error InitialPriceRatioBelowMinPriceRatio();
  error InitialPriceRatioAbove100Percent();
  error CapacityReductionRatioAbove100Percent();

}
