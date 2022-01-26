// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IProductsV1 {
  function getNewProductId(address legacyProductId) external returns (uint);
}
