// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../../external/enzyme/IEnzymeV4Comptroller.sol";
import "./SOMockEnzymeV4Vault.sol";
import "./SOMockExtraSpender.sol";

contract SOMockEnzymeV4Comptroller is IEnzymeV4Comptroller {

  ERC20 internal denominationAsset;
  SOMockEnzymeV4Vault internal vault;

  // mock helpers
  uint internal sharesToMintOnDeposit;
  uint internal amountToPullOnDeposit;
  uint internal sharesToBurnOnRedeem;
  uint internal amountToPushOnRedeem;

  // bypasses the allowance and pulls an extra amount using another address
  SOMockExtraSpender public extraSpender;
  uint public extraExpenseAmount;

  constructor(address _denominationAsset, SOMockEnzymeV4Vault _vault) {
    denominationAsset = ERC20(_denominationAsset);
    vault = _vault;
    extraSpender = new SOMockExtraSpender();
  }

  function setDepositMockAmounts(uint _sharesToMintOnDeposit, uint _amountToPullOnDeposit) external {
    sharesToMintOnDeposit = _sharesToMintOnDeposit;
    amountToPullOnDeposit = _amountToPullOnDeposit;
  }

  function setExtraExpenseAmount(uint _extraExpenseAmount) external {
    extraExpenseAmount = _extraExpenseAmount;
  }

  function setRedeemMockAmounts(uint _sharesToBurnOnRedeem, uint _amountToPushOnRedeem) external {
    sharesToBurnOnRedeem = _sharesToBurnOnRedeem;
    amountToPushOnRedeem = _amountToPushOnRedeem;
  }

  function setDenominationAsset(address _denominationAsset) external {
    denominationAsset = ERC20(_denominationAsset);
  }

  function getDenominationAsset() external view returns (address) {
    return address(denominationAsset);
  }

  event BuyCalledWith(
    uint _investmentAmount,
    uint _minSharesQuantity
  );

  function buyShares(uint _investmentAmount, uint _minSharesQuantity) external {

    denominationAsset.transferFrom(msg.sender, address(vault), amountToPullOnDeposit);
    vault.mint(msg.sender, sharesToMintOnDeposit);

    if (extraExpenseAmount > 0) {
      extraSpender.spend(denominationAsset, msg.sender, extraExpenseAmount);
    }

    emit BuyCalledWith(_investmentAmount, _minSharesQuantity);
  }

  event RedeemCalledWith(
    address indexed _recipient,
    uint _sharesQuantity,
    address[] _payoutAssets,
    uint[] _payoutAssetPercentages
  );

  function redeemSharesForSpecificAssets(
    address _recipient,
    uint _sharesQuantity,
    address[] calldata _payoutAssets,
    uint[] calldata _payoutAssetPercentages
  ) external returns (uint[] memory payoutAmounts) {

    payoutAmounts = new uint[](0); // unchecked

    vault.burn(_recipient, sharesToBurnOnRedeem);
    vault.withdraw(denominationAsset, _recipient, amountToPushOnRedeem);

    emit RedeemCalledWith(_recipient, _sharesQuantity, _payoutAssets, _payoutAssetPercentages);
  }

  function vaultCallOnContract(
    address _contract,
    bytes4 _selector,
    bytes calldata _encodedArgs
  ) external {
    // no-op
  }
}
