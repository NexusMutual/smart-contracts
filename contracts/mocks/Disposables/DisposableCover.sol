// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

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


   /**
   * @param paramNames  An array of elements from UintParams enum
     * @param values An array of the new values, each one corresponding to the parameter
   */
  function updateUintParametersDisposable(
    CoverUintParams[] calldata paramNames,
    uint[] calldata values
  ) external {

    for (uint i = 0; i < paramNames.length; i++) {
      if (paramNames[i] == CoverUintParams.globalCapacityRatio) {
        globalCapacityRatio = uint24(values[i]);
        continue;
      }
      if (paramNames[i] == CoverUintParams.globalRewardsRatio) {
        globalRewardsRatio = uint24(values[i]);
        continue;
      }
      if (paramNames[i] == CoverUintParams.coverAssetsFallback) {
        coverAssetsFallback = uint32(values[i]);
        continue;
      }
    }
  }

  // function changeDependentContractAddress() external override {}

  event ProductTypeUpserted(uint id, string ipfsMetadata);
  event ProductUpserted(uint id, string ipfsMetadata);
}
