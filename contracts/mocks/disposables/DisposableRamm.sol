// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../modules/capital/Ramm.sol";

contract DisposableRamm is Ramm {

  constructor(address _registry, uint spotPriceB) Ramm(_registry, spotPriceB) {
    //
  }

  function initialize(
    State memory initialState,
    uint initialPriceA,
    uint initialPriceB
  ) external {

    require(slot1.updatedAt == 0, "DisposableRamm: Already initialized");

    super.storeState(initialState);

    Observation[3] memory _observations = getInitialObservations(
      initialPriceA,
      initialPriceB,
      initialState.timestamp
    );

    for (uint i = 0; i < _observations.length; i++) {
      observations[i] = _observations[i];
    }
  }
}
