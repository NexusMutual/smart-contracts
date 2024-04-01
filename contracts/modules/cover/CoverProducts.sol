// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../abstract/Multicall.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/ICoverProducts.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingProducts.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IStakingPoolBeacon.sol";
import "../../interfaces/IStakingPoolFactory.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";
import "../../libraries/StakingPoolLibrary.sol";

contract CoverProducts is ICoverProducts, MasterAwareV2, Multicall {

  /* ========== STATE VARIABLES ========== */

  Product[] internal _products;
  ProductType[] internal _productTypes;

  // productId => product name
  mapping(uint => string) public productNames;
  // productTypeId => productType name
  mapping(uint => string) internal productTypeNames;

  // product id => allowed pool ids
  mapping(uint => uint[]) internal allowedPools;

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

  function getProductWithType(uint productId)  external override view returns (
    Product memory product,
    ProductType memory productType
  ) {
    product = _products[productId];
    productType = _productTypes[product.productType];
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

      if (productId >= productCount) {
        revert ProductDoesntExist();
      }

      initialPrices[i] = _products[productId].initialPriceRatio;
    }
  }

  function getCapacityReductionRatios(
    uint[] calldata productIds
  ) external view returns (uint[] memory capacityReductionRatios) {

    uint productCount = _products.length;
    capacityReductionRatios = new uint[](productIds.length);

    for (uint i = 0; i < productIds.length; i++) {
      uint productId = productIds[i];

      if (productId >= productCount) {
        revert ProductDoesntExist();
      }

      capacityReductionRatios[i] = _products[productId].capacityReductionRatio;
    }
  }

  function getCapacityReductionRatiosInitialPrices(
    uint[] calldata productIds
  ) external view returns (
    uint[] memory initialPrices,
    uint[] memory capacityReductionRatios
  ) {

    uint productCount = _products.length;
    initialPrices = new uint[](productIds.length);
    capacityReductionRatios = new uint[](productIds.length);

    for (uint i = 0; i < productIds.length; i++) {
      uint productId = productIds[i];

      if (productId >= productCount) {
        revert ProductDoesntExist();
      }

      initialPrices[i] = _products[productId].initialPriceRatio;
      capacityReductionRatios[i] = _products[productId].capacityReductionRatio;
    }
  }

  /* ========== PRODUCT CONFIGURATION ========== */

  function setProducts(ProductParam[] calldata productParams) external override onlyAdvisoryBoard {

    uint unsupportedCoverAssetsBitmap = type(uint).max;
    uint globalMinPriceRatio = cover().getGlobalMinPriceRatio();

    Asset[] memory assets = pool().getAssets();
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

      if (product.productType >= _productTypes.length) {
        revert InvalidProductType();
      }

      if (unsupportedCoverAssetsBitmap & product.coverAssets != 0) {
        revert UnsupportedCoverAssets();
      }

      if (product.initialPriceRatio < globalMinPriceRatio) {
        revert InitialPriceRatioBelowGlobalMinPriceRatio();
      }

      if (product.initialPriceRatio > PRICE_DENOMINATOR) {
        revert InitialPriceRatioAbove100Percent();
      }

      if (product.capacityReductionRatio > CAPACITY_REDUCTION_DENOMINATOR) {
        revert CapacityReductionRatioAbove100Percent();
      }

      // TODO: https://github.com/NexusMutual/smart-contracts/issues/859
      if (product.useFixedPrice) {
        uint productId = param.productId == type(uint256).max ? _products.length : param.productId;
        allowedPools[productId] = param.allowedPools;
      }

      // New product has id == uint256.max
      if (param.productId == type(uint256).max) {
        emit ProductSet(_products.length, param.ipfsMetadata);
        productNames[_products.length] = param.productName;
        _products.push(product);
        continue;
      }

      // Existing product
      if (param.productId >= _products.length) {
        revert ProductDoesntExist();
      }

      Product storage newProductValue = _products[param.productId];
      newProductValue.isDeprecated = product.isDeprecated;
      newProductValue.coverAssets = product.coverAssets;
      newProductValue.initialPriceRatio = product.initialPriceRatio;
      newProductValue.capacityReductionRatio = product.capacityReductionRatio;

      if (bytes(param.productName).length > 0) {
        productNames[param.productId] = param.productName;
      }

      if (bytes(param.ipfsMetadata).length > 0) {
        emit ProductSet(param.productId, param.ipfsMetadata);
      }
    }
  }

  function setProductTypes(ProductTypeParam[] calldata productTypeParams) external onlyAdvisoryBoard {

    for (uint i = 0; i < productTypeParams.length; i++) {
      ProductTypeParam calldata param = productTypeParams[i];

      // New product has id == uint256.max
      if (param.productTypeId == type(uint256).max) {
        emit ProductTypeSet(_productTypes.length, param.ipfsMetadata);
        productTypeNames[_productTypes.length] = param.productTypeName;
        _productTypes.push(param.productType);
        continue;
      }

      if (param.productTypeId >= _productTypes.length) {
        revert ProductTypeNotFound();
      }
      _productTypes[param.productTypeId].gracePeriod = param.productType.gracePeriod;

      if (bytes(param.productTypeName).length > 0) {
        productTypeNames[param.productTypeId] = param.productTypeName;
      }

      if (bytes(param.ipfsMetadata).length > 0) {
        emit ProductTypeSet(param.productTypeId, param.ipfsMetadata);
      }
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
      if (!isPoolAllowed(productIds[i], poolId) ) {
        revert PoolNotAllowedForThisProduct(productIds[i]);
      }
    }
  }

  /* ========== DEPENDENCIES ========== */

  function pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  function cover() internal view returns (ICover) {
    return ICover(internalContracts[uint(ID.CO)]);
  }

  function changeDependentContractAddress() public {
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.SP)] = master.getLatestAddress("SP");
    internalContracts[uint(ID.CP)] = master.getLatestAddress("CP");
  }

}
