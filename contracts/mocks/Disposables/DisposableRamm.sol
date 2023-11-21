// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../modules/capital/Ramm.sol";

contract DisposableRamm is Ramm {

  uint internal poolValue;
  uint internal supply;
  uint internal bondingCurveTokenPrice;

  constructor(uint spotPriceB) Ramm(spotPriceB) {
    //
  }

  function initialize(
    uint _poolValue,
    uint _totalSupply,
    uint _bondingCurveTokenPrice
  ) external {

    require(slot1.updatedAt == 0, "DisposableRamm: Already initialized");

    // initialize values
    poolValue = _poolValue;
    supply = _totalSupply;
    bondingCurveTokenPrice = _bondingCurveTokenPrice;

    // set dependencies to point to self
    internalContracts[uint(ID.P1)] = payable(address(this));
    internalContracts[uint(ID.TC)] = payable(address(this));
    internalContracts[uint(ID.MC)] = payable(address(this));

    super.initialize();

    slot1.swapPaused = false;
  }

  // fake pool functions
  function getPoolValueInEth() external view returns (uint) {
    return poolValue;
  }

  function totalSupply() external view returns (uint) {
    return supply;
  }

  function getTokenPrice() external view returns (uint) {
    return bondingCurveTokenPrice;
  }

}
