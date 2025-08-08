// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IEnzymeV4Comptroller {

  function getDenominationAsset() external view returns (address denominationAsset_);

  function redeemSharesForSpecificAssets(
      address _recipient,
      uint256 _sharesQuantity,
      address[] calldata _payoutAssets,
      uint256[] calldata _payoutAssetPercentages
  ) external returns (uint256[] memory payoutAmounts_);

  function buyShares(uint _investmentAmount, uint _minSharesQuantity) external;
}
