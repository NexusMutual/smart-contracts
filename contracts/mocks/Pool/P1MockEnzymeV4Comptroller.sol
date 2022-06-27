// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;

import "../../external/enzyme/IEnzymeV4Comptroller.sol";

contract P1MockEnzymeV4Comptroller is IEnzymeV4Comptroller {

  address weth;

  constructor(address _weth) public {
    weth = _weth;
  }

  function getDenominationAsset() external view returns (address denominationAsset_) {
    return weth;
  }
  function redeemSharesForSpecificAssets(
    address _recipient,
    uint256 _sharesQuantity,
    address[] calldata _payoutAssets,
    uint256[] calldata _payoutAssetPercentages
  ) external returns (uint256[] memory payoutAmounts_) {
    uint256[] memory payoutAmounts_ =  new uint256[](0);
  }
}
