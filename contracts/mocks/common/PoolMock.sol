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

/**
 * @notice Pool mock base contract
 * @dev Use this base contract as is or override as needed
 * @dev For functions that are yet to be implemented (including setters), implement it here as needed
 */
contract PoolMock is IPool {
  using SafeERC20 for IERC20;
  using SafeUintCast for uint;

  Asset[] public assets;

  uint public constant MCR_RATIO_DECIMALS = 4;
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  mapping (uint => uint) internal prices;

  /* ========== CONSTRUCTOR ========== */

  constructor() {
    assets.push(
      Asset(
        ETH, // asset address
        true, // is cover asset
        false // is abandoned
      )
    );
  }
  function getAsset(uint assetId) external virtual view returns (Asset memory) {
    require(assetId < assets.length, "Pool: Invalid asset id");
    return assets[assetId];
  }
  function getAssets() external virtual view returns (Asset[] memory) {
    return assets;
  }
  function getPoolValueInEth() public virtual view returns (uint) {
    return address(this).balance;
  }

  function sendPayout(
    uint assetIndex,
    address payable payoutAddress,
    uint amount,
    uint ethDepositAmount
  ) external virtual {
    Asset memory asset = assets[assetIndex];

    if (asset.assetAddress == ETH) {
      // solhint-disable-next-line avoid-low-level-calls
      (bool transferSucceeded /* data */, ) = payoutAddress.call{value: amount}("");
      require(transferSucceeded, "Pool: ETH transfer failed");
    } else {
      IERC20(asset.assetAddress).safeTransfer(payoutAddress, amount);
    }

    if (ethDepositAmount > 0) {
      // solhint-disable-next-line avoid-low-level-calls
      (bool transferSucceeded /* data */, ) = payoutAddress.call{value: ethDepositAmount}("");
      require(transferSucceeded, "Pool: ETH transfer failed");
    }
  }

  function sendEth(address payoutAddress, uint amount) external virtual {
    (bool transferSucceeded, bytes memory returndata) = payoutAddress.call{value: amount}("");

    if (transferSucceeded) {
      return;
    }

    // pass revert reason (implemented for Reentrancy Guard validation)
    if (returndata.length > 0) {
      assembly {
        let returndata_size := mload(returndata)
        revert(add(32, returndata), returndata_size)
      }
    }

    revert("Pool: ETH transfer failed");
  }

  function getInternalTokenPriceInAsset(uint assetId) public virtual view returns (uint) {
    return prices[assetId];
  }

  event TwapUpdateTriggered();

  function getInternalTokenPriceInAssetAndUpdateTwap(uint assetId) public virtual returns (uint) {
    emit TwapUpdateTriggered();
    return prices[assetId];
  }

  function calculateMCRRatio(uint totalAssetValue, uint mcrEth) public virtual pure returns (uint) {
      return totalAssetValue * (10 ** MCR_RATIO_DECIMALS) / mcrEth;
  }

  function addAsset(Asset memory asset) external virtual {
    assets.push(asset);
  }

  /* ====== SETTERS ====== */

  function setTokenPrice(uint assetId, uint price) public {
     prices[assetId] = price;
  }

  function setAssets(Asset[] memory _assets) public {
    for (uint i = 0; i < _assets.length; i++) {
      assets.push(_assets[i]);
    }
  }

  function setIsCoverAsset(uint assetId, bool isCoverAsset) public {
    assets[assetId].isCoverAsset = isCoverAsset;
  }

  function setIsAbandoned(uint assetId, bool isAbandoned) public {
    assets[assetId].isAbandoned = isAbandoned;
  }

  function getTokenPrice() public virtual view returns (uint) {
    return prices[0];
  }

  /* ====== NOT YET IMPLEMENTED ====== */

  function getAssetValueInEth(address) internal virtual pure returns (uint) {
    revert("getAssetValueInEth not yet implemented");
  }

  function getAssetSwapDetails(address) external virtual pure returns (SwapDetails memory) {
    revert("getAssetSwapDetails not yet implemented");
  }

  function setAssetDetails(uint, bool, bool) external virtual pure {
    revert("setAssetDetails not yet implemented");
  }

  function setSwapDetails(address, uint, uint, uint) external virtual pure {
    revert("setSwapDetails not yet implemented");
  }

  function transferAsset(address, address, uint) external virtual pure {
    revert("transferAsset not yet implemented");
  }

  function transferAssetToSwapOperator(address, uint) public virtual pure {
    revert("transferAssetToSwapOperator not yet implemented");
  }

  function setSwapDetailsLastSwapTime(address, uint32) public virtual pure {
    revert("setSwapDetailsLastSwapTime not yet implemented");
  }

  function setSwapValue(uint) external virtual pure {
    revert("setSwapValue not yet implemented");
  }

  function getMCRRatio() public virtual pure returns (uint) {
    revert("getMCRRatio not yet implemented");
  }

  function priceFeedOracle() external virtual view returns (IPriceFeedOracle) {
    revert("priceFeedOracle not yet implemented");
  }

  function upgradeCapitalPool(address payable) external virtual pure {
    revert("upgradeCapitalPool not yet implemented");
  }

  function calculateTokenSpotPrice(uint, uint) external virtual pure returns (uint) {
    revert("calculateTokenSpotPrice not yet implemented");
  }

  receive() external payable virtual {}
}
