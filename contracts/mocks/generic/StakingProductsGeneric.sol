// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IStakingProducts.sol";

contract StakingProductsGeneric is IStakingProducts {

  /* ============= PRODUCT FUNCTIONS ============= */

  function setProducts(uint, StakedProductParam[] memory) external virtual {
    revert("Unsupported");
  }

  function getProductTargetWeight(uint, uint) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getTotalTargetWeight(uint) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getTotalEffectiveWeight(uint) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getProduct(uint, uint) external virtual view returns (uint, uint, uint, uint, uint) {
    revert("Unsupported");
  }

  function getPremium(uint, uint, uint, uint, uint, uint, uint, bool, uint, uint) public virtual returns (uint) {
    revert("Unsupported");
  }

  function calculateFixedPricePremium(uint, uint, uint, uint, uint) public virtual pure returns (uint) {
    revert("Unsupported");
  }


  function calculatePremium(StakedProduct memory, uint, uint, uint, uint, uint, uint, uint, uint, uint) public virtual pure returns (uint, StakedProduct memory) {
    revert("Unsupported");
  }

  function calculatePremiumPerYear(uint, uint, uint, uint, uint, uint, uint) public virtual pure returns (uint) {
    revert("Unsupported");
  }

  function calculateSurgePremium(uint, uint, uint) public virtual pure returns (uint) {
    revert("Unsupported");
  }

  function stakingPool(uint) external virtual view returns (IStakingPool) {
    revert("Unsupported");
  }

  function createStakingPool(bool, uint, uint, ProductInitializationParams[] calldata, string calldata)
  external virtual returns (uint, address) {
    revert("Unsupported");
  }
}
