// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IMCR.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IPriceFeedOracle.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/ISwapOperator.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";

import "hardhat/console.sol";

/**
 * @notice Pool mock base contract
 * @dev Use this base contract as is or override as needed
 * @dev For functions that are yet to be implemented (including setters), implement it here as needed
 */
contract PoolMockCowSwap is IPool {
  using SafeERC20 for IERC20;
  using SafeUintCast for uint;

  Asset[] public assets;
  mapping(address => SwapDetails) public swapDetails;

  // parameters
  IPriceFeedOracle public override priceFeedOracle;
  address public swapOperator;
  uint96 public swapValue;

  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  uint public constant MCR_RATIO_DECIMALS = 4;
  uint internal constant MAX_SLIPPAGE_DENOMINATOR = 10000;

  mapping(uint => uint) internal prices;

  modifier onlySwapOperator() {
    require(msg.sender == swapOperator, "Pool: Not swapOperator");
    _;
  }

  /* ========== CONSTRUCTOR ========== */

  constructor(
    address _swapOperator, // our controlled addresss
    address _daiAddress,
    address _stEthAddress
    // address _enzymeVaultAddress
  ) {
    swapOperator = _swapOperator;

    assets.push(
      Asset(
        ETH, // asset address
        true, // is cover asset
        false // is abandoned
      )
    );
    assets.push(
      Asset(
        _daiAddress, // asset address
        true, // is cover asset
        false // is abandoned
      )
    );
    // assets.push(
    //   Asset(
    //     _wethAddress, // asset address
    //     false, // is cover asset
    //     false // is abandoned
    //   )
    // );
    assets.push(
      Asset(
        _stEthAddress, // asset address
        false, // is cover asset
        false // is abandoned
      )
    );

        // Set DAI swap details
    swapDetails[_daiAddress] = SwapDetails(
      10_000_000 ether, // minAmount (10 mil)
      15_000_000 ether, // maxAmount (15 mil)
      0,             // lastSwapTime
      2_50           // maxSlippageRatio (2.5%)
    );

    // Set stETH swap details
    swapDetails[_stEthAddress] = SwapDetails(
      24_360 ether, // minAmount (~24k)
      32_500 ether, // maxAmount (~32k)
      1633425218,  // lastSwapTime
      2_50           // maxSlippageRatio (0%)
    );

    // swapDetails[_enzymeVaultAddress] = SwapDetails(
    //   15_000 ether, // minAmount
    //   16_000 ether, // maxAmount
    //   1660673114,  // lastSwapTime
    //   2_50         // maxSlippageRatio (2.5%)
    // );
    // swapDetails[_wethAddress] = SwapDetails(
    //   15_000 ether, // minAmount
    //   16_000 ether, // maxAmount
    //   1660673114,  // lastSwapTime
    //   2_50         // maxSlippageRatio (2.5%)
    // );
  }

  function getAsset(uint assetId) external view virtual returns (Asset memory) {
    require(assetId < assets.length, "Pool: Invalid asset id");
    return assets[assetId];
  }

  function getAssets() external view virtual returns (Asset[] memory) {
    return assets;
  }

  function getPoolValueInEth() public view virtual returns (uint) {
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

  function getInternalTokenPriceInAsset(uint assetId) public view virtual returns (uint) {
    return prices[assetId];
  }

  event TwapUpdateTriggered();

  function getInternalTokenPriceInAssetAndUpdateTwap(uint assetId) public virtual returns (uint) {
    emit TwapUpdateTriggered();
    return prices[assetId];
  }

  function calculateMCRRatio(uint totalAssetValue, uint mcrEth) public pure virtual returns (uint) {
    return (totalAssetValue * (10 ** MCR_RATIO_DECIMALS)) / mcrEth;
  }

  function addAsset(
    address assetAddress,
    bool isCoverAsset
    // uint _min,
    // uint _max,
    // uint _maxSlippageRatio
  ) external virtual {
    // Check whether the new asset already exists as a cover asset
    uint assetCount = assets.length;

    for (uint i = 0; i < assetCount; i++) {
      require(assetAddress != assets[i].assetAddress, "Pool: Asset exists");
    }

    assets.push(
      Asset(
        assetAddress,
        isCoverAsset,
        false // is abandoned
      )
    );
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

  function getTokenPrice() public view virtual returns (uint) {
    return prices[0];
  }

  function getAssetSwapDetails(address assetAddress) external view returns (SwapDetails memory) {
    return swapDetails[assetAddress];
  }

  function setSwapDetailsLastSwapTime(address assetAddress, uint32 lastSwapTime) public override onlySwapOperator {
    swapDetails[assetAddress].lastSwapTime = lastSwapTime;
  }

  function setSwapValue(uint newValue) external onlySwapOperator {
    swapValue = newValue.toUint96();
  }

  function transferAssetToSwapOperator(address assetAddress, uint amount) public override onlySwapOperator {
    if (assetAddress == ETH) {
      (bool ok /* data */, ) = swapOperator.call{value: amount}("");
      require(ok, "Pool: ETH transfer failed");
      return;
    }

    IERC20 token = IERC20(assetAddress);
    token.safeTransfer(swapOperator, amount);
  }
  
  function _setPriceFeedOracle(IPriceFeedOracle _priceFeedOracle) internal {
    uint assetCount = assets.length;

    // start from 1 (0 is ETH and doesn't need an oracle)
    for (uint i = 1; i < assetCount; i++) {
      console.log('ASSEt address checking aggregator:', assets[i].assetAddress);
      (Aggregator aggregator,) = _priceFeedOracle.assets(assets[i].assetAddress);
      require(address(aggregator) != address(0), "Pool: PriceFeedOracle lacks aggregator for asset");
    }

    priceFeedOracle = _priceFeedOracle;
  }

  function updateAddressParameters(bytes8 code, address value) external {

    if (code == "SWP_OP") {
      // if (swapOperator != address(0)) {
      //   require(!ISwapOperator(swapOperator).orderInProgress(), 'Pool: Cancel all swaps before changing swapOperator');
      // }
      swapOperator = value;
      return;
    }

    if (code == "PRC_FEED") {
      _setPriceFeedOracle(IPriceFeedOracle(value));
      return;
    }

    revert("Pool: Unknown parameter");
  }


  function setSwapDetails(
    address assetAddress,
    uint _min,
    uint _max,
    uint _maxSlippageRatio
  ) external {

    require(_min <= _max, "Pool: min > max");
    require(_maxSlippageRatio <= MAX_SLIPPAGE_DENOMINATOR, "Pool: Max slippage ratio > 1");

    uint assetCount = assets.length;

    for (uint i = 0; i < assetCount; i++) {

      if (assetAddress != assets[i].assetAddress) {
        continue;
      }

      swapDetails[assetAddress].minAmount = _min.toUint104();
      swapDetails[assetAddress].maxAmount = _max.toUint104();
      swapDetails[assetAddress].maxSlippageRatio = _maxSlippageRatio.toUint16();

      return;
    }

    revert("Pool: Asset not found");
  }
  /* ====== NOT YET IMPLEMENTED ====== */

  function getAssetValueInEth(address) internal pure virtual returns (uint) {
    revert("getAssetValueInEth not yet implemented");
  }

  function setAssetDetails(uint, bool, bool) external pure virtual {
    revert("setAssetDetails not yet implemented");
  }

  function transferAsset(address, address, uint) external pure virtual {
    revert("transferAsset not yet implemented");
  }

  function getMCRRatio() public pure virtual returns (uint) {
    revert("getMCRRatio not yet implemented");
  }

  function upgradeCapitalPool(address payable) external pure virtual {
    revert("upgradeCapitalPool not yet implemented");
  }

  function calculateTokenSpotPrice(uint, uint) external pure virtual returns (uint) {
    revert("calculateTokenSpotPrice not yet implemented");
  }

  receive() external payable virtual {}
}
