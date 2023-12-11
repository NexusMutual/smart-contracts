// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./ICover.sol";

interface ILegacyCover {

  function getProducts() external view returns (Product[] memory);

  function getProductTypes() external view returns (ProductType[] memory);

  function GLOBAL_MIN_PRICE_RATIO() external view returns (uint);

  function productNames(uint id) external view returns (string memory);

  function productTypeNames(uint id) external view returns (string memory);

  function allowedPools(uint productId) external view returns (uint[] memory);
}
