// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./ICover.sol";

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
  address yieldTokenAddress;
  // cover assets bitmap. each bit represents whether the asset with
  // the index of that bit is enabled as a cover asset for this product
  uint32 coverAssets;
  uint16 initialPriceRatio;
  uint16 capacityReductionRatio;
  bool isDeprecated;
  bool useFixedPrice;
}

struct ProductType {
  uint8 claimMethod;
  uint32 gracePeriod;
}

interface ICoverProducts {

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

  function getAllowedPools(uint productId) external view returns (uint[] memory _allowedPools);

  function getAllowedPoolsCount(uint productId) external view returns (uint);

  function isPoolAllowed(uint productId, uint poolId) external view returns (bool);

  function requirePoolIsAllowed(uint[] calldata productIds, uint poolId) external view;

  function getCapacityReductionRatios(uint[] calldata productIds) external view returns (uint[] memory);

  function getInitialPrices(uint[] calldata productIds) external view returns (uint[] memory);

  function prepareStakingProductsParams(
    ProductInitializationParams[] calldata params
  ) external returns (
    ProductInitializationParams[] memory validatedParams
  );

  /* === MUTATIVE FUNCTIONS ==== */

  function setProductTypes(ProductTypeParam[] calldata productTypes) external;

  function setProducts(ProductParam[] calldata params) external;

  /* ========== EVENTS ========== */

  event ProductSet(uint id, string ipfsMetadata);
  event ProductTypeSet(uint id, string ipfsMetadata);

  // Products
  error ProductDoesntExist();
  error ProductTypeNotFound();
  error ProductDeprecated();
  error InvalidProductType();
  error UnexpectedProductId();
  error PoolNotAllowedForThisProduct(uint productId);
  error StakingPoolDoesNotExist();

  // Cover and payment assets
  error UnsupportedCoverAssets();
  error UnexpectedEthSent();

  // Price & Commission
  error PriceExceedsMaxPremiumInAsset();
  error TargetPriceBelowGlobalMinPriceRatio();
  error InitialPriceRatioBelowGlobalMinPriceRatio();
  error InitialPriceRatioAbove100Percent();
  error CommissionRateTooHigh();

  // Misc
  error CapacityReductionRatioAbove100Percent();

}
