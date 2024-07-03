// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./ICoverProducts.sol";

interface ILegacyCover {

  function stakingPoolFactory() external view returns (address);

  function getProducts() external view returns (Product[] memory);

  function productTypesCount() external view returns (uint);

  function productNames(uint productId) external view returns (string memory);

  function allowedPools(uint productId, uint index) external view returns (uint);

  function productTypes(uint id) external view returns (ProductType memory);

  function productTypeNames(uint id) external view returns (string memory);

}
