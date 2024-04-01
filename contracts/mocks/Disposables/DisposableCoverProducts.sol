// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../abstract/Multicall.sol";
import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/ICoverProducts.sol";
import "../../interfaces/ILegacyCover.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IStakingPoolBeacon.sol";
import "../../interfaces/IStakingPoolFactory.sol";
import "../../interfaces/IStakingProducts.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";
import "../../libraries/StakingPoolLibrary.sol";
import "../../modules/cover/CoverProducts.sol";

contract DisposableCoverProducts is CoverProducts {

  /* ========== MIGRATION ========== */

  function migrateProductsAndProductTypes() external {
    require(_products.length == 0, "CoverProducts: _products already migrated");
    require(_productTypes.length == 0,  "CoverProducts: _productTypes already migrated");

    ILegacyCover _cover = ILegacyCover(address(cover()));
    Product[] memory _productsToMigrate = _cover.getProducts();
    uint _productTypeCount = _cover.productTypesCount();

    for (uint i = 0; i < _productsToMigrate.length; i++) {
      _products.push(_productsToMigrate[i]);
      productNames[i] = _cover.productNames(i);
      allowedPools[i] = _cover.allowedPools(i);
    }

    for (uint i = 0; i < _productTypeCount; i++) {
      ProductType memory _productTypeToMigrate = _cover.productTypes(i);
      _productTypes.push(_productTypeToMigrate);
      productTypeNames[i] = _cover.productTypeNames(i);
    }
  }

}
