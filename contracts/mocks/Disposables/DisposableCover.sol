// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/IProductsV1.sol";
import "../../modules/cover/MinimalBeaconProxy.sol";

import "../../modules/cover/Cover.sol";

contract DisposableCover is Cover {

  constructor(
    IQuotationData _quotationData,
    IProductsV1 _productsV1,
    address _coverNFT,
    address _stakingPoolImplementation,
    address coverProxyAddress
  ) Cover(_quotationData, _productsV1, _coverNFT, _stakingPoolImplementation, coverProxyAddress) {
  }

  function setCoverAssetsFallback(uint32 _coverAssetsFallback) external {
    coverAssetsFallback = _coverAssetsFallback;
  }
}
