// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../external/enzyme/IEnzymeFundValueCalculatorRouter.sol";

contract SOMockEnzymeFundValueCalculatorRouter is IEnzymeFundValueCalculatorRouter {

  address weth;

  constructor (address _weth) {
    weth = _weth;
  }

  function calcGrossShareValue(
    address /* _vaultProxy */
  ) external view returns (address denominationAsset_, uint256 grossShareValue_) {
    return (weth, 1e18);
  }

  function calcNetShareValue(
    address /* _vaultProxy */
  ) external view returns (address denominationAsset_, uint256 netShareValue_) {
    return (weth, 1e18);
  }
}
