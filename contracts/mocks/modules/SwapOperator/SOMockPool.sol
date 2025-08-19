// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../../libraries/SafeUintCast.sol";
import "../../generic/PoolGeneric.sol";

contract SOMockPool is PoolGeneric {
  using SafeERC20 for IERC20;
  using SafeUintCast for uint;

  Asset[] public assets;
  AssetInSwapOperator public assetInSwapOperator;
  address public swapOperator;

  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  // struct AssetRate {
  //   int rate; // rate of asset in ETH
  //   uint8 decimals; // decimals of the asset
  // }
  // mapping(address assetAddress => AssetRate) public rates;

  constructor(Asset[] memory _assets) {
    for (uint i = 0; i < _assets.length; i++) {
      assets.push(_assets[i]);
    }
  }

  function setSwapOperator(address _swapOperator) external {
    swapOperator = _swapOperator;
  }

  function getAssets() external view override returns (Asset[] memory) {
    return assets;
  }

  function abandonAsset(address asset) external {
    for (uint i = 0; i < assets.length; i++) {
      if (assets[i].assetAddress == asset) {
        assets[i].isAbandoned = true;
        break;
      }
    }
  }

  // the commented code below was not used for swap operator but may be used for other unit tests
  // leaving it here for now

  // constructor(Asset[] memory _assets, AssetRate[] memory _rates) {
  //   require(_assets.length == _rates.length, "Invalid input");
  //   for (uint i = 0; i < _assets.length; i++) {
  //     assets.push(_assets[i]);
  //     rates[_assets[i].assetAddress] = _rates[i];
  //   }
  // }

  // // 1e18 ETH = 4000 * 1e8 USDC
  // // rate     = 0.00025 * 1e18
  // // decimals = 8
  // // amount   = 0.1 * 1e18
  // // result   = 0.1 * 1e18 * (10 ** 8) / (0.00025 * 1e18) = 400'00000000

  // function getAssetForEth(address asset, uint amount) public view override returns (uint) {
  //   uint decimals = rates[asset].decimals;
  //   uint rate = uint(rates[asset].rate);
  //   return amount * 10 ** decimals / rate;
  // }

  // // 1e18 ETH = 4000 * 1e8 USDC
  // // rate     = 0.00025 * 1e18
  // // decimals = 8
  // // amount   = 400'00000000
  // // result   = 40000000000 * 0.00025 * 1e18 / (10 ** 8) = 1e+17

  // function getEthForAsset(address asset, uint amount) public view override returns (uint) {
  //   uint decimals = rates[asset].decimals;
  //   uint rate = uint(rates[asset].rate);
  //   return amount * rate / 10 ** decimals;
  // }

  event TransferAssetToSwapOperatorCalled(address asset, uint amount);
  event ClearSwapAssetAmountCalled(address asset);

  function transferAssetToSwapOperator(address asset, uint amount) external override {

    require(assetInSwapOperator.assetAddress == address(0), "Asset already in swap operator");

    // save
    assetInSwapOperator.assetAddress = asset;
    assetInSwapOperator.amount = amount.toUint96();

    // transfer
    if (asset == ETH) {
      (bool success, ) = swapOperator.call{ value: amount }("");
      require(success, "ETH transfer failed");
    } else {
      IERC20(asset).safeTransfer(swapOperator, amount);
    }

    emit TransferAssetToSwapOperatorCalled(asset, amount);
  }

  function clearSwapAssetAmount(address asset) external override {
    require(assetInSwapOperator.amount != 0, "No asset to clear");
    require(assetInSwapOperator.assetAddress == asset, "Wrong asset to clear");
    delete assetInSwapOperator;
    emit ClearSwapAssetAmountCalled(asset);
  }

}
