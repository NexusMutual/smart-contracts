// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;

import "../../external/enzyme/IEnzymeV4Comptroller.sol";
import "./SOMockEnzymeV4Vault.sol";
import "../../external/enzyme/IWETH.sol";

contract SOMockEnzymeV4Comptroller is IEnzymeV4Comptroller {

  address weth;
  SOMockEnzymeV4Vault private vault;

  uint public ethToSharesRate = 10000;

  constructor(address _weth) public {
    weth = _weth;
  }

  function getDenominationAsset() external view returns (address denominationAsset_) {
    return weth;
  }
  function redeemSharesForSpecificAssets(
    address _recipient,
    uint256 _sharesQuantity,
    address[] calldata /* _payoutAssets */,
    uint256[] calldata /* _payoutAssetPercentages */
  ) external returns (uint256[] memory payoutAmounts_) {
    payoutAmounts_ =  new uint256[](0);

    vault.burn(_recipient, _sharesQuantity);
    IWETH(weth).transfer(_recipient, _sharesQuantity * 10000 / ethToSharesRate);
  }

  function vaultCallOnContract(
    address _contract,
    bytes4 _selector,
    bytes calldata _encodedArgs
  ) external {
    // no-op
  }

  function buyShares(uint _investmentAmount, uint /* _minSharesQuantity */) external {
    uint shares = _investmentAmount * ethToSharesRate / 10000;
    vault.mint(msg.sender, shares);
  }

  function setETHToVaultSharesRate(uint _ethToSharesRate) public {
    ethToSharesRate = _ethToSharesRate;
  }

  function setVault(SOMockEnzymeV4Vault _vault) public {
    vault = _vault;
  }
}
