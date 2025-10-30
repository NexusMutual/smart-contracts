// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IEnzymeFundValueCalculatorRouter {

  function calcGrossShareValue(
    address _vaultProxy
  ) external returns (address denominationAsset_, uint256 grossShareValue_);

  function calcNetShareValue(
    address _vaultProxy
  ) external returns (address denominationAsset_, uint256 netShareValue_);

}
