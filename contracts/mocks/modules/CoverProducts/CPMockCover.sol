// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/ICompleteStakingPoolFactory.sol";
import "../../../interfaces/ICoverProducts.sol";
import "../../../interfaces/IStakingProducts.sol";
import "../../../interfaces/IStakingPool.sol";
import "../../generic/CoverGeneric.sol";

contract CPMockCover is CoverGeneric {

  ICompleteStakingPoolFactory public immutable _stakingPoolFactory;

  Product[] internal _products;
  ProductType[] internal _productTypes;

  mapping(uint => string) public productNames;
  mapping(uint => string) public productTypeNames;
  mapping(uint => uint[]) public allowedPools;

  constructor (address stakingPoolFactoryAddress) {
    _stakingPoolFactory = ICompleteStakingPoolFactory(stakingPoolFactoryAddress);
  }

  // TODO: this is a one-time use function, the test is going to be removed after the upgrade
  //       see https://github.com/NexusMutual/smart-contracts/issues/1161
  function setProductsAndProductTypes(
    Product[] memory products,
    ProductType[] memory productTypeArray,
    string[] memory _productNames,
    string[] memory _productTypeNames,
    uint[][] memory _allowedPools
  ) external {

    for (uint i = 0; i < products.length; i++) {
      _products.push(products[i]);
      productNames[i] = _productNames[i];
      allowedPools[i] = _allowedPools[i];
    }

    for (uint i = 0; i < productTypeArray.length; i++) {
      _productTypes.push(productTypeArray[i]);
      productTypeNames[i] = _productTypeNames[i];
    }
  }

  function getDefaultMinPriceRatio() public override pure returns (uint) {
    return DEFAULT_MIN_PRICE_RATIO;
  }

  function getProducts() external view returns (Product[] memory) {
    return _products;
  }

  function productTypesCount() external view returns (uint) {
    return _productTypes.length;
  }

  function productTypes(uint id) external view returns (ProductType memory) {
    return _productTypes[id];
  }

  function stakingPoolFactory() external override view returns (address) {
    return address(_stakingPoolFactory);
  }
}
