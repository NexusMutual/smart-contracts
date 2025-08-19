// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../interfaces/IPool.sol";
import "../generic/PoolGeneric.sol";

/**
 * @notice Pool mock base contract
 * @dev Use this base contract as is or override as needed
 * @dev For functions that are yet to be implemented (including setters), implement it here as needed
 */
contract PoolMock is PoolGeneric {
  using SafeERC20 for IERC20;

  Asset[] public assets;
  mapping (uint => uint) internal prices;

  uint public constant MCR_RATIO_DECIMALS = 4;
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  function getAsset(uint assetId) external override virtual view returns (Asset memory) {
    require(assetId < assets.length, "Pool: Invalid asset id");
    return assets[assetId];
  }

  function getAssets() external override virtual view returns (Asset[] memory) {
    return assets;
  }

  function getPoolValueInEth() public override virtual view returns (uint) {
    return address(this).balance;
  }

  function sendPayout(
    uint assetIndex,
    address payable payoutAddress,
    uint amount,
    uint ethDepositAmount
  ) external override virtual {
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

  function sendEth(address payable payoutAddress, uint amount) external override virtual {
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

  function getInternalTokenPriceInAsset(uint assetId) public override virtual view returns (uint) {
    return prices[assetId];
  }

  event TwapUpdateTriggered();

  function getInternalTokenPriceInAssetAndUpdateTwap(uint assetId) public override virtual returns (uint) {
    emit TwapUpdateTriggered();
    return prices[assetId];
  }

  function calculateMCRRatio(uint totalAssetValue, uint mcrEth) public override virtual pure returns (uint) {
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

  function getTokenPrice() public override virtual view returns (uint) {
    return prices[0];
  }

}
