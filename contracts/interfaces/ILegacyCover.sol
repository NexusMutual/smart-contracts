// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./ICover.sol";

interface ILegacyCover {

  function getProducts() external view returns (Product[] memory);

  function productTypesCount() external view returns (uint);

  function productNames(uint productId) external view returns (string memory);

  function allowedPools(uint productId) external view returns (uint[] memory);

  function productTypes(uint id) external view returns (ProductType memory);

  function productTypeNames(uint id) external view returns (string memory);

}
