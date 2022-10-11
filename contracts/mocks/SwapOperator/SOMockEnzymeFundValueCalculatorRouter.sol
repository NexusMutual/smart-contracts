// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;

import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../external/enzyme/IEnzymeV4Vault.sol";
import "../../external/enzyme/IEnzymeFundValueCalculatorRouter.sol";


contract SOMockEnzymeFundValueCalculatorRouter is IEnzymeFundValueCalculatorRouter {

  address weth;

  constructor (address _weth) public {
    weth = _weth;
  }

  function calcGrossShareValue(address /* _vaultProxy */)
  external
  returns (address denominationAsset_, uint256 grossShareValue_) {
    return (weth, 1e18);
  }

  function calcNetShareValue(address /* _vaultProxy */)
  external
  returns (address denominationAsset_, uint256 netShareValue_) {
    return (weth, 1e18);
  }
}
