// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IMCR.sol";
import "../../interfaces/IRamm.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IPriceFeedOracle.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/ISwapOperator.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";

contract Pool is IPool, MasterAwareV2, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using SafeUintCast for uint;

  /* storage */

  Asset[] public assets;
  mapping(address => SwapDetails) public swapDetails;

  // parameters
  IPriceFeedOracle public override priceFeedOracle;
  IPool public previousPool;
  address public swapOperator;

  uint96 public swapValue;

  /* constants */

  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  uint public constant MCR_RATIO_DECIMALS = 4;
  uint public constant MAX_MCR_RATIO = 40000; // 400%
  uint public constant MAX_BUY_SELL_MCR_ETH_FRACTION = 500; // 5%. 4 decimal points

  uint internal constant CONSTANT_C = 5800000;
  uint internal constant CONSTANT_A = 1028 * 1e13;
  uint internal constant TOKEN_EXPONENT = 4;

  uint16 constant MAX_SLIPPAGE_DENOMINATOR = 10000;

  INXMToken public immutable nxmToken;

  /* events */
  event Payout(address indexed to, address indexed assetAddress, uint amount);
  event NXMSold (address indexed member, uint nxmIn, uint ethOut);
  event NXMBought (address indexed member, uint ethIn, uint nxmOut);
  event Swapped(address indexed fromAsset, address indexed toAsset, uint amountIn, uint amountOut);

  /* logic */
  modifier onlySwapOperator {
    require(msg.sender == swapOperator, "Pool: Not swapOperator");
    _;
  }

  modifier onlyRamm {
    require(msg.sender == internalContracts[uint(ID.RA)], "Pool: Not Ramm");
    _;
  }

  /* ========== CONSTRUCTOR ========== */

  constructor (
    address _master,
    address _priceOracle,
    address _swapOperator,
    address DAIAddress,
    address stETHAddress,
    address enzymeVaultAddress, // Enzyme
    address _nxmTokenAddress
  ) {
    master = INXMMaster(_master);
    priceFeedOracle = IPriceFeedOracle(_priceOracle);
    swapOperator = _swapOperator;
    nxmToken = INXMToken(_nxmTokenAddress);

    if (_master != address(0)) {
      previousPool = IPool(master.getLatestAddress("P1"));
    }
  }

  fallback() external payable {}

  receive() external payable {}

  /* ========== ASSET RELATED VIEW FUNCTIONS ========== */

  function getAssetValueInEth(address assetAddress) internal view returns (uint) {

    uint assetBalance;

    if (assetAddress.code.length != 0) {
      try IERC20(assetAddress).balanceOf(address(this)) returns (uint balance) {
        assetBalance = balance;
      } catch {
        // If balanceOf reverts consider it 0
      }
    }

    // If the assetBalance is 0 skip the oracle call to save gas
    if (assetBalance == 0) {
      return 0;
    }

    return priceFeedOracle.getEthForAsset(assetAddress, assetBalance);
  }

  ///
  /// @dev Calculates total value of all pool assets in ether
  ///
  function getPoolValueInEth() public override view returns (uint) {

    uint total = address(this).balance + swapValue;
    uint assetCount = assets.length;

    // Skip ETH (index 0)
    for (uint i = 1; i < assetCount; i++) {

      if (assets[i].isAbandoned) {
        continue;
      }

      total += getAssetValueInEth(assets[i].assetAddress);
    }

    return total;
  }

  function getAsset(uint assetId) external override view returns (Asset memory) {
    require(assetId < assets.length, "Pool: Invalid asset id");
    return assets[assetId];
  }

  function getAssets() external override view returns (Asset[] memory) {
    return assets;
  }

  function getAssetSwapDetails(address assetAddress) external view returns (SwapDetails memory) {
    return swapDetails[assetAddress];
  }

  /* ========== ASSET RELATED MUTATIVE FUNCTIONS ========== */

  function addAsset(
    address assetAddress,
    bool isCoverAsset,
    uint _min,
    uint _max,
    uint _maxSlippageRatio
  ) external onlyGovernance {

    require(assetAddress != address(0), "Pool: Asset is zero address");
    require(_max >= _min, "Pool: max < min");
    require(_maxSlippageRatio <= MAX_SLIPPAGE_DENOMINATOR, "Pool: Max slippage ratio > 1");

    (Aggregator aggregator,) = priceFeedOracle.assets(assetAddress);
    require(address(aggregator) != address(0), "Pool: Asset lacks oracle");

    // Check whether the new asset already exists as a cover asset
    uint assetCount = assets.length;

    for (uint i = 0; i < assetCount; i++) {
      require(assetAddress != assets[i].assetAddress, "Pool: Asset exists");
    }

    assets.push(
      Asset(
        assetAddress,
        isCoverAsset,
        false  // is abandoned
      )
    );

    // Set the swap details
    swapDetails[assetAddress] = SwapDetails(
      _min.toUint104(),
      _max.toUint104(),
      0, // last swap time
      _maxSlippageRatio.toUint16()
    );
  }

  function setAssetDetails(
    uint assetId,
    bool isCoverAsset,
    bool isAbandoned
  ) external onlyGovernance {
    require(assets.length > assetId, "Pool: Asset does not exist");
    assets[assetId].isCoverAsset = isCoverAsset;
    assets[assetId].isAbandoned = isAbandoned;
  }

  function setSwapDetails(
    address assetAddress,
    uint _min,
    uint _max,
    uint _maxSlippageRatio
  ) external onlyGovernance {

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

  function transferAsset(
    address assetAddress,
    address payable destination,
    uint amount
  ) external onlyGovernance nonReentrant {

    require(swapDetails[assetAddress].maxAmount == 0, "Pool: Max not zero");
    require(destination != address(0), "Pool: Dest zero");

    IERC20 token = IERC20(assetAddress);
    uint balance = token.balanceOf(address(this));
    uint transferableAmount = amount > balance ? balance : amount;

    token.safeTransfer(destination, transferableAmount);
  }

  /* ========== SWAPOPERATOR RELATED MUTATIVE FUNCTIONS ========== */

  function transferAssetToSwapOperator(
    address assetAddress,
    uint amount
  ) public override onlySwapOperator nonReentrant whenNotPaused {

    if (assetAddress == ETH) {
      (bool ok, /* data */) = swapOperator.call{value: amount}("");
      require(ok, "Pool: ETH transfer failed");
      return;
    }

    IERC20 token = IERC20(assetAddress);
    token.safeTransfer(swapOperator, amount);
  }

  function setSwapDetailsLastSwapTime(
    address assetAddress,
    uint32 lastSwapTime
  ) public override onlySwapOperator whenNotPaused {
    swapDetails[assetAddress].lastSwapTime = lastSwapTime;
  }

  function setSwapValue(uint newValue) external onlySwapOperator whenNotPaused {
    swapValue = SafeUintCast.toUint96(newValue);
  }

  /* ========== CLAIMS RELATED MUTATIVE FUNCTIONS ========== */

  /// @dev Executes a payout
  /// @param assetId        Index of the cover asset
  /// @param payoutAddress  Send funds to this address
  /// @param amount         Amount to send
  ///
  function sendPayout(
    uint assetId,
    address payable payoutAddress,
    uint amount
  ) external override onlyInternal nonReentrant {

    Asset memory asset = assets[assetId];

    if (asset.assetAddress == ETH) {
      // solhint-disable-next-line avoid-low-level-calls
      (bool transferSucceeded, /* data */) = payoutAddress.call{value : amount}("");
      require(transferSucceeded, "Pool: ETH transfer failed");
    } else {
      IERC20(asset.assetAddress).safeTransfer(payoutAddress, amount);
    }

    emit Payout(payoutAddress, asset.assetAddress, amount);

    mcr().updateMCRInternal(true);
  }

  /* ========== TOKEN RELATED MUTATIVE FUNCTIONS ========== */

  // @dev Sends ETH to a member in exchange for NXM tokens.
  // @param member  Member address
  // @param amount  Amount of ETH to send
  //
  function sendEth(address member, uint amount) external onlyRamm {
    (bool transferSucceeded, /* data */) = member.call{value : amount}("");
    require(transferSucceeded, "Pool: ETH transfer failed");
  }

  /// [deprecated] Use `swap` function in Ramm contract
  ///
  /// @param amount   Amount of NXM to sell
  /// @return success  Returns true on successfull sale
  ///
  function sellNXMTokens(
    uint amount
  ) public override onlyMember whenNotPaused returns (bool success) {
    ramm().swap(amount);
    return true;
  }

  // [deprecated] use swap function in Ramm
  /// Buys NXM tokens with ETH.
  ///
  /// @param minTokensOut  Minimum amount of tokens to be bought. Revert if boughtTokens falls below
  /// this number.
  ///
  function buyNXM(uint minTokensOut) public override payable onlyMember whenNotPaused {
    ramm().swap{value: msg.value}(0);
    return;
  }

  // [deprecated] use `swap` function in Ramm
  /// Sell NXM tokens and receive ETH.
  ///
  /// @param tokenAmount  Amount of tokens to sell.
  /// @param minEthOut    Minimum amount of ETH to be received. Revert if ethOut falls below this number.
  ///
  function sellNXM(
    uint tokenAmount,
    uint minEthOut
  ) public override onlyMember nonReentrant whenNotPaused {
    ramm().swap(tokenAmount);
    // TODO: remove after minEthOut is implemented in Ramm left for reference
//    require(ethOut >= minEthOut, "Pool: ETH out < minEthOut");
  }

  /* ========== TOKEN RELATED VIEW FUNCTIONS ========== */

  /// Get value in tokens for an ethAmount purchase.
  ///
  /// @param ethAmount    Amount of ETH used for buying.
  /// @return tokenValue  Tokens obtained by buying worth of ethAmount
  ///
  function getNXMForEth(
    uint ethAmount
  ) public override view returns (uint) {
    (, uint spotPriceB) = ramm().getSpotPrices();
    return ethAmount * 1e18 / spotPriceB;
  }

  // [deprecated] use sportPrices function in Ramm
  // left for reference
  function calculateNXMForEth(
    uint ethAmount,
    uint currentTotalAssetValue,
    uint mcrEth
  ) public pure returns (uint) {
    (, uint tokenPrice) = ramm().getSpotPrices();
    return ethAmount * 1e18 / tokenPrice;
  }

  function getEthForNXM(uint nxmAmount) public override view returns (uint ethAmount) {
    (uint sportPriceA, ) = ramm().getSpotPrices();
    return nxmAmount * sportPriceA / 1e18;
  }

  function calculateMCRRatio(
    uint totalAssetValue,
    uint mcrEth
  ) public override pure returns (uint) {
    return totalAssetValue * (10 ** MCR_RATIO_DECIMALS) / mcrEth;
  }

  // [deprecated] use `getSpotPrices` function in Ramm
  /// Calculates token price in ETH of 1 NXM token. TokenPrice = A + (MCReth / C) * MCR%^4
  ///
  function calculateTokenSpotPrice(
    uint totalAssetValue,
    uint mcrEth
  ) public override pure returns (uint tokenPrice) {

    (, tokenPrice) = ramm().getSpotPrices();
    return tokenPrice;
  }

  /// Uses internal price for calculating the token price in ETH, it's being used in Cover and IndividualClaims
  /// Returns the NXM price in a given asset.
  ///
  /// @dev The pool contract is not a proxy and its address will change as we upgrade it.
  /// @dev You may want TokenController.getTokenPrice() for a stable address since it's a proxy.
  ///
  /// @param assetId  Index of the cover asset.
  ///
  function getTokenPriceInAsset(uint assetId) public override view returns (uint tokenPrice) {

    require(assetId < assets.length, "Pool: Unknown cover asset");
    address assetAddress = assets[assetId].assetAddress;

    // just fetch internal price, updates are happening in Token Controller contract
    uint tokenInternalPrice = ramm().getInternalPriceAndUpdateTwap();

    return priceFeedOracle.getAssetForEth(assetAddress, tokenInternalPrice);
  }

  /// [deprecated] Returns the NXM price in ETH from ramm contract.
  ///
  /// @dev The pool contract is not a proxy and its address will change as we upgrade it.
  /// @dev You may want TokenController.getTokenPrice() for a stable address since it's a proxy.
  ///
  function getTokenPrice() public override view returns (uint tokenPrice) {
    (, tokenPrice) = ramm().getSpotPrices();
    return tokenPrice;
  }

  function getMCRRatio() public override view returns (uint) {
    uint totalAssetValue = getPoolValueInEth();
    uint mcrEth = mcr().getMCR();
    return calculateMCRRatio(totalAssetValue, mcrEth);
  }

  /* ========== POOL UPGRADE RELATED MUTATIVE FUNCTIONS ========== */

  // Revert if any of the asset functions revert while not being marked for getting abandoned.
  // Otherwise, continue without reverting while the marked asset will remain stuck in the
  // previous pool contract.
  function upgradeCapitalPool(address payable newPoolAddress) external override onlyMaster nonReentrant {

    // transfer ETH
    (bool ok, /* data */) = newPoolAddress.call{value: address(this).balance}("");
    require(ok, "Pool: Transfer failed");

    uint assetCount = assets.length;

    // start from 1 (0 is ETH)
    for (uint i = 1; i < assetCount; i++) {

      if (assets[i].isAbandoned) {
        continue;
      }

      IERC20 asset = IERC20(assets[i].assetAddress);
      uint balance = asset.balanceOf(address(this));
      asset.safeTransfer(newPoolAddress, balance);
    }
  }

  function updateUintParameters(bytes8 /* code */, uint /* value */) external view onlyGovernance {
    revert("Pool: Unknown parameter");
  }

  function updateAddressParameters(bytes8 code, address value) external onlyGovernance {

    if (code == "SWP_OP") {
      if (swapOperator != address(0)) {
        require(!ISwapOperator(swapOperator).orderInProgress(), 'Pool: Cancel all swaps before changing swapOperator');
      }
      swapOperator = value;
      return;
    }

    if (code == "PRC_FEED") {

      uint assetCount = assets.length;

      // start from 1 (0 is ETH and doesn't need an oracle)
      for (uint i = 1; i < assetCount; i++) {
        (Aggregator aggregator,) = IPriceFeedOracle(value).assets(assets[i].assetAddress);
        require(address(aggregator) != address(0), "Pool: Oracle lacks asset");
      }

      priceFeedOracle = IPriceFeedOracle(value);
      return;
    }

    revert("Pool: Unknown parameter");
  }

  /* ========== DEPENDENCIES ========== */

  function tokenController() internal view returns (ITokenController) {
    return ITokenController(internalContracts[uint(ID.TC)]);
  }

  function mcr() internal view returns (IMCR) {
    return IMCR(internalContracts[uint(ID.MC)]);
  }

  function ramm() internal view returns (IRamm) {
    return IRamm(internalContracts[uint(ID.RA)]);
  }

  /**
   * @dev Update dependent contract address
   * @dev Implements MasterAware interface function
   */
  function changeDependentContractAddress() public {
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MC)] = master.getLatestAddress("MC");
    internalContracts[uint(ID.RA)] = master.getLatestAddress("RA");
    // needed for onlyMember modifier
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");

    initialize();
  }

  function initialize() internal {

    address currentPool = master.getLatestAddress("P1");

    if (address(previousPool) == address(0) || currentPool != address(this)) {
      // already initialized or not ready for initialization
      return;
    }

    // copy over values
    swapValue = uint96(previousPool.swapValue());

    // copy over assets and swap details
    Asset[] memory oldAssets = previousPool.getAssets();

    for (uint i = 1; i < oldAssets.length; i++) {
      address assetAddress = oldAssets[i].assetAddress;
      if (assetAddress != ETH) {
        swapDetails[assetAddress] = previousPool.getAssetSwapDetails(assetAddress);
      }
      assets.push(oldAssets[i]);
    }

    previousPool = IPool(address(0));
  }
}
