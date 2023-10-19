// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IMCR.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IPriceFeedOracle.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";

contract RammMockPool is IPool {
  using SafeERC20 for IERC20;
  using SafeUintCast for uint;

  Asset[] public assets;

  uint public constant MCR_RATIO_DECIMALS = 4;
  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  INXMToken public immutable nxmToken;
  INXMMaster public master;
  IMCR public mcr;

  /* ========== CONSTRUCTOR ========== */

  constructor (
    address _master,
    address _mcr,
    address _nxmTokenAddress
  ) {
    master = INXMMaster(_master);
    mcr = IMCR(_mcr);
    nxmToken = INXMToken(_nxmTokenAddress);

    assets.push(
      Asset(
        ETH, // asset address
        true, // is cover asset
        false // is abandoned
      )
    );
  }

  fallback() external payable virtual {}

  receive() external payable virtual {}

  function getPoolValueInEth() public override view returns (uint) {
    return address(this).balance;
  }

  function sendPayout(
    uint,
    address payable payoutAddress,
    uint amount,
    uint ethDepositAmount
  ) external override {

    (bool transferSucceeded, /* data */) = payoutAddress.call{value: amount}("");
    require(transferSucceeded, "Pool: ETH transfer failed");

    if (ethDepositAmount > 0) {
      (bool ok, /* data */) = payoutAddress.call{value: ethDepositAmount}("");
      require(ok, "Pool: ETH transfer failed");
    }
  }

  function sendEth(
    address payoutAddress,
    uint amount
  ) external override {

    (bool transferSucceeded, /* data */) = payoutAddress.call{value : amount}("");
    require(transferSucceeded, "Pool: ETH transfer failed");
  }

  /* ====== NOT NEEDED FUNCTIONS ====== */

  function calculateMCRRatio(uint, uint) public override pure returns (uint) {
    revert("Unsupported");
  }

  function getAssetValueInEth(address) internal pure returns (uint) {
    revert("Unsupported");
  }

  function getAsset(uint) external override pure returns (Asset memory) {
    revert("Unsupported");
  }

  function getAssets() external override pure returns (Asset[] memory) {
    revert("Unsupported");
  }

  function getAssetSwapDetails(address) external pure returns (SwapDetails memory) {
    revert("Unsupported");
  }

  function addAsset(address, bool, uint, uint, uint) external pure {
    revert("Unsupported");
  }

  function setAssetDetails(uint, bool, bool) external pure {
    revert("Unsupported");
  }

  function setSwapDetails(address, uint, uint, uint) external pure {
    revert("Unsupported");
  }

  function transferAsset(address, address, uint) external pure {
    revert("Unsupported");
  }

  function transferAssetToSwapOperator(address, uint) public pure override {
    revert("Unsupported");
  }

  function setSwapDetailsLastSwapTime(address, uint32) public pure override {
    revert("Unsupported");
  }

  function setSwapValue(uint) external pure {
    revert("Unsupported");
  }

  function getInternalTokenPriceInAsset(uint) public override pure returns (uint) {
    revert("Unsupported");
  }

  function getTokenPrice() public override pure returns (uint) {
    revert("Unsupported");
  }

  function getMCRRatio() public override pure returns (uint) {
    revert("Unsupported");
  }

  function priceFeedOracle() external pure returns (IPriceFeedOracle) {
    revert("Unsupported");
  }

  function upgradeCapitalPool(address payable) external pure {
    revert("Unsupported");
  }

  function calculateTokenSpotPrice(uint, uint) external pure returns (uint) {
    revert("Unsupported");
  }
}
