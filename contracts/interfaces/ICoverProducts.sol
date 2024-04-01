// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./ICover.sol";

/* ========== DATA STRUCTURES ========== */

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

interface ICoverProducts {

  /* ========== VIEWS ========== */

  function getProductType(uint productTypeId) external view returns (ProductType memory);

  function getProductTypeName(uint productTypeId) external view returns (string memory);

  function getProductTypeCount() external view returns (uint);

  function getProductTypes() external view returns (ProductType[] memory);

  function getProduct(uint productId) external view returns (Product memory);

  function getProductName(uint productTypeId) external view returns (string memory);

  function getProductCount() external view returns (uint);

  function getProducts() external view returns (Product[] memory);

  function getProductWithType(uint productId) external view returns (Product memory, ProductType memory);

  function getAllowedPools(uint productId) external view returns (uint[] memory _allowedPools);

  function getAllowedPoolsCount(uint productId) external view returns (uint);

  function isPoolAllowed(uint productId, uint poolId) external view returns (bool);

  function requirePoolIsAllowed(uint[] calldata productIds, uint poolId) external view;

  function getCapacityReductionRatios(uint[] calldata productIds) external view returns (uint[] memory);

  function getInitialPrices(uint[] calldata productIds) external view returns (uint[] memory);

  function getCapacityReductionRatiosInitialPrices(
    uint[] calldata productIds
  ) external view returns (
    uint[] memory initialPrices,
    uint[] memory capacityReductionRatios
  );

  // deprecated
  function productNames(uint) external view returns (string memory);

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
