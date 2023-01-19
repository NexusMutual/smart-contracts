// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../../modules/cover/Cover.sol";

contract DisposableCover is Cover {

  constructor(
    ICoverNFT _coverNFT,
    IStakingNFT _stakingNFT,
    IStakingPoolFactory _stakingPoolFactory,
    address _stakingPoolImplementation
  ) Cover(
    _coverNFT,
    _stakingNFT,
    _stakingPoolFactory,
    _stakingPoolImplementation
  ) {
    // noop
  }

  /// @param paramNames  An array of elements from UintParams enum
  /// @param values An array of the new values, each one corresponding to the parameter
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
    }
  }

  event ProductTypeUpserted(uint id, string ipfsMetadata);
  event ProductUpserted(uint id, string ipfsMetadata);
}