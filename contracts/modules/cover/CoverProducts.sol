// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../abstract/MasterAwareV2.sol";
import "../../abstract/Multicall.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverProducts.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IStakingProducts.sol";

contract CoverProducts is ICoverProducts, MasterAwareV2, Multicall {

  /* ========== STATE VARIABLES ========== */

  Product[] internal _products;
  ProductType[] internal _productTypes;

  // productId => product name
  mapping(uint => string) internal productNames;
  // productTypeId => productType name
  mapping(uint => string) internal productTypeNames;
  // product id => allowed pool ids
  mapping(uint => uint[]) internal allowedPools;

  mapping(uint => Metadata[]) internal productMetadata;
  mapping(uint => Metadata[]) internal productTypeMetadata;

  /* ========== CONSTANTS ========== */

  uint private constant PRICE_DENOMINATOR = 10000;
  uint private constant CAPACITY_REDUCTION_DENOMINATOR = 10000;

  /* ========== VIEWS ========== */

  function getProductType(uint productTypeId) external view returns (ProductType memory) {
    return _productTypes[productTypeId];
  }

  function getProductTypeName(uint productTypeId) external view returns (string memory) {
    return productTypeNames[productTypeId];
  }

  function getProductTypeCount() external view returns (uint) {
    return _productTypes.length;
  }

  function getProductTypes() external view returns (ProductType[] memory) {
    return _productTypes;
  }

  function getProduct(uint productId) external view returns (Product memory) {
    return _products[productId];
  }

  function getProductName(uint productId) external view returns (string memory) {
    return productNames[productId];
  }

  function getProductCount() public view returns (uint) {
    return _products.length;
  }

  function getProducts() external view returns (Product[] memory) {
    return _products;
  }

  function getProductWithType(uint productId) external override view returns (
    Product memory product,
    ProductType memory productType
  ) {
    product = _products[productId];
    productType = _productTypes[product.productType];
  }

  function getProductTypeOf(uint productId) external override view returns (ProductType memory) {
    Product memory product = _products[productId];
    return _productTypes[product.productType];
  }

  function getLatestProductMetadata(uint productId) external view returns (Metadata memory) {
    uint metadataLength = productMetadata[productId].length;
    return metadataLength > 0
      ? productMetadata[productId][metadataLength - 1]
      : Metadata("", 0);
  }

  function getLatestProductTypeMetadata(uint productTypeId) external view returns (Metadata memory) {
    uint metadataLength = productTypeMetadata[productTypeId].length;
    return metadataLength > 0
      ? productTypeMetadata[productTypeId][metadataLength - 1]
      : Metadata("", 0);
  }

  function getProductMetadata(uint productId) external view returns (Metadata[] memory) {
    return productMetadata[productId];
  }

  function getProductTypeMetadata(uint productTypeId) external view returns (Metadata[] memory) {
    return productTypeMetadata[productTypeId];
  }

  function getAllowedPools(uint productId) external view returns (uint[] memory _allowedPools) {

    uint allowedPoolCount = allowedPools[productId].length;
    _allowedPools = new uint[](allowedPoolCount);

    for (uint i = 0; i < allowedPoolCount; i++) {
      _allowedPools[i] = allowedPools[productId][i];
    }
  }

  function getAllowedPoolsCount(uint productId) external view returns (uint) {
    return allowedPools[productId].length;
  }

  function getInitialPrices(
    uint[] calldata productIds
  ) external view returns (uint[] memory initialPrices) {

    uint productCount = _products.length;
    initialPrices = new uint[](productIds.length);

    for (uint i = 0; i < productIds.length; i++) {
      uint productId = productIds[i];
      require(productId < productCount, ProductNotFound());

      initialPrices[i] = _products[productId].initialPriceRatio;
    }
  }

  function getMinPrices(
    uint[] calldata productIds
  ) external view returns (uint[] memory minPrices) {
    uint productCount = _products.length;
    minPrices = new uint[](productIds.length);
    uint defaultMinPrice = _cover().getDefaultMinPriceRatio();

    for (uint i = 0; i < productIds.length; i++) {
      uint productId = productIds[i];
      require(productId < productCount, ProductNotFound());

      if (_products[productId].minPrice == 0) {
        minPrices[i] = defaultMinPrice;
      } else {
        minPrices[i] = _products[productId].minPrice;
      }
    }
  }

  function getCapacityReductionRatios(
    uint[] calldata productIds
  ) external view returns (uint[] memory capacityReductionRatios) {

    uint productCount = _products.length;
    capacityReductionRatios = new uint[](productIds.length);

    for (uint i = 0; i < productIds.length; i++) {
      uint productId = productIds[i];
      require(productId < productCount, ProductNotFound());

      capacityReductionRatios[i] = _products[productId].capacityReductionRatio;
    }
  }

  function prepareStakingProductsParams(
    ProductInitializationParams[] calldata params
  ) external view returns (
    ProductInitializationParams[] memory validatedParams
  ) {

    uint productCount = _products.length;
    uint inputLength = params.length;
    validatedParams = new ProductInitializationParams[](inputLength);

    // override with initial price and check if pool is allowed
    for (uint i = 0; i < inputLength; i++) {

      uint productId = params[i].productId;
      require(productId < productCount, ProductNotFound());

      // if there is a list of allowed pools for this product - the new pool didn't exist yet
      // so the product can't be in it
      require(allowedPools[productId].length == 0, PoolNotAllowedForThisProduct(productId));

      Product memory product = _products[productId];
      require(!product.isDeprecated, ProductDeprecated());

      validatedParams[i] = params[i];
      validatedParams[i].initialPrice = product.initialPriceRatio;
    }
  }

  /* ========== PRODUCT CONFIGURATION ========== */

  function setProducts(ProductParam[] calldata productParams) external override onlyAdvisoryBoard {

    uint unsupportedCoverAssetsBitmap = type(uint).max;
    uint defaultMinPriceRatio = _cover().getDefaultMinPriceRatio();

    uint poolCount = _stakingProducts().getStakingPoolCount();
    Asset[] memory assets = _pool().getAssets();
    uint assetsLength = assets.length;

    for (uint i = 0; i < assetsLength; i++) {
      if (assets[i].isCoverAsset && !assets[i].isAbandoned) {
        // clear the bit at index i
        unsupportedCoverAssetsBitmap ^= 1 << i;
      }
    }

    for (uint i = 0; i < productParams.length; i++) {

      ProductParam calldata param = productParams[i];
      Product calldata product = param.product;

      require(product.productType < _productTypes.length, ProductTypeNotFound());
      require(unsupportedCoverAssetsBitmap & product.coverAssets == 0, UnsupportedCoverAssets());

      uint256 minPrice = product.minPrice == 0 ? defaultMinPriceRatio : product.minPrice;
      require(product.initialPriceRatio >= minPrice, InitialPriceRatioBelowMinPriceRatio());
      require(product.initialPriceRatio <= PRICE_DENOMINATOR, InitialPriceRatioAbove100Percent());
      require(product.capacityReductionRatio <= CAPACITY_REDUCTION_DENOMINATOR, CapacityReductionRatioAbove100Percent());

      if (param.allowedPools.length > 0) {
        for (uint j = 0; j < param.allowedPools.length; j++) {
          require(param.allowedPools[j] <= poolCount && param.allowedPools[j] != 0, StakingPoolDoesNotExist());
        }
      }

      // New product has id == uint256.max
      if (param.productId == type(uint256).max) {
        uint productId = _products.length;

        // the metadata is optional, do not push if empty
        if (bytes(param.ipfsMetadata).length > 0) {
          productMetadata[productId].push(Metadata(param.ipfsMetadata, block.timestamp));
        }

        productNames[productId] = param.productName;
        allowedPools[productId] = param.allowedPools;

        _products.push(product);
        emit ProductSet(productId);
        continue;
      }

      // Existing product
      require(param.productId < _products.length, ProductNotFound());

      Product storage newProductValue = _products[param.productId];
      newProductValue.isDeprecated = product.isDeprecated;
      newProductValue.coverAssets = product.coverAssets;
      newProductValue.initialPriceRatio = product.initialPriceRatio;
      newProductValue.capacityReductionRatio = product.capacityReductionRatio;
      newProductValue.minPrice = product.minPrice;

      allowedPools[param.productId] = param.allowedPools;

      if (bytes(param.productName).length > 0) {
        productNames[param.productId] = param.productName;
      }

      if (bytes(param.ipfsMetadata).length > 0) {
        productMetadata[param.productId].push(Metadata(param.ipfsMetadata, block.timestamp));
      }

      emit ProductSet(param.productId);
    }
  }

  function setProductTypes(ProductTypeParam[] calldata productTypeParams) external onlyAdvisoryBoard {

    for (uint i = 0; i < productTypeParams.length; i++) {
      ProductTypeParam calldata param = productTypeParams[i];

      // New product has id == uint256.max
      if (param.productTypeId == type(uint256).max) {
        uint productTypeId = _productTypes.length;

        // the product type metadata is mandatory
        require(bytes(param.ipfsMetadata).length > 0, MetadataRequired());

        productTypeMetadata[productTypeId].push(Metadata(param.ipfsMetadata, block.timestamp));
        productTypeNames[productTypeId] = param.productTypeName;
        _productTypes.push(param.productType);

        emit ProductTypeSet(productTypeId);
        continue;
      }

      require(param.productTypeId < _productTypes.length, ProductTypeNotFound());

      require(
        _productTypes[param.productTypeId].claimMethod == param.productType.claimMethod, 
        ClaimMethodMismatch()
      );

      _productTypes[param.productTypeId] = param.productType;

      if (bytes(param.productTypeName).length > 0) {
        productTypeNames[param.productTypeId] = param.productTypeName;
      }

      if (bytes(param.ipfsMetadata).length > 0) {
        productTypeMetadata[param.productTypeId].push(Metadata(param.ipfsMetadata, block.timestamp));
      }

      emit ProductTypeSet(param.productTypeId);
    }
  }

  function setProductsMetadata(
    uint[] calldata productIds,
    string[] calldata ipfsMetadata
  ) external onlyAdvisoryBoard {

    require(productIds.length == ipfsMetadata.length, MismatchedArrayLengths());

    uint productCount = _products.length;

    for (uint i = 0; i < productIds.length; i++) {
      uint productId = productIds[i];
      require(productId < productCount, ProductNotFound());

      productMetadata[productId].push(Metadata(ipfsMetadata[i], block.timestamp));
    }
  }

  function setProductTypesMetadata(
    uint[] calldata productTypeIds,
    string[] calldata ipfsMetadata
  ) external onlyAdvisoryBoard {

    require(productTypeIds.length == ipfsMetadata.length, MismatchedArrayLengths());

    uint productTypeCount = _productTypes.length;

    for (uint i = 0; i < productTypeIds.length; i++) {
      uint productTypeId = productTypeIds[i];
      require(productTypeId < productTypeCount, ProductTypeNotFound());
      require(bytes(ipfsMetadata[i]).length > 0, MetadataRequired());

      productTypeMetadata[productTypeId].push(Metadata(ipfsMetadata[i], block.timestamp));
    }
  }

  /* ========== COVER ASSETS HELPERS ========== */

  // Returns true if the product exists and the pool is authorized to have the product
  function isPoolAllowed(uint productId, uint poolId) public view returns (bool) {

    uint poolCount = allowedPools[productId].length;

    // If no pools are specified, every pool is allowed
    if (poolCount == 0) {
      return true;
    }

    for (uint i = 0; i < poolCount; i++) {
      if (allowedPools[productId][i] == poolId) {
        return true;
      }
    }

    // Product has allow list and pool is not in it
    return false;
  }

  function requirePoolIsAllowed(uint[] calldata productIds, uint poolId) external view {
    for (uint i = 0; i < productIds.length; i++) {
      require(isPoolAllowed(productIds[i], poolId), PoolNotAllowedForThisProduct(productIds[i]));
    }
  }

  /* ========== DEPENDENCIES ========== */

  function _pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  function _cover() internal view returns (ICover) {
    return ICover(internalContracts[uint(ID.CO)]);
  }

  function _stakingProducts() internal view returns (IStakingProducts) {
    return IStakingProducts(internalContracts[uint(ID.SP)]);
  }

  function changeDependentContractAddress() public {
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.SP)] = master.getLatestAddress("SP");
  }

}
