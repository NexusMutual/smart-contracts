// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IMCR.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/ILegacyPool.sol";
import "../../interfaces/IPriceFeedOracle.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/ISwapOperator.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";

contract LegacyPool is ILegacyPool, MasterAwareV2, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using SafeUintCast for uint;

  /* storage */

  Asset[] public assets;
  mapping(address => SwapDetails) public swapDetails;

  // parameters
  IPriceFeedOracle public override priceFeedOracle;
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

    // [todo] After this contract is deployed it might be worth modifying upgradeCapitalPool to
    // copy the assets on future upgrades instead of having them hardcoded in the constructor.
    // issue: https://github.com/NexusMutual/smart-contracts/issues/473

    // Warning: the order of assets should never change between updates
    assets.push(
      Asset(
        ETH, // asset address
        true, // is cover asset
        false // is abandoned
      )
    );

    assets.push(
      Asset(
        DAIAddress, // asset address
        true, // is cover asset
        false // is abandoned
      )
    );

    assets.push(
      Asset(
        stETHAddress, // asset address
        false, // is cover asset
        false // is abandoned
      )
    );

    assets.push(
      Asset(
        enzymeVaultAddress, // asset address
        false, // is cover asset
        false // is abandoned
      )
    );

    // Set DAI swap details
    swapDetails[DAIAddress] = SwapDetails(
      10_000_000 ether, // minAmount (10 mil)
      15_000_000 ether, // maxAmount (15 mil)
      0,             // lastSwapTime
      2_50           // maxSlippageRatio (2.5%)
    );

    // Set stETH swap details
    swapDetails[stETHAddress] = SwapDetails(
      24_360 ether, // minAmount (~24k)
      32_500 ether, // maxAmount (~32k)
      1633425218,  // lastSwapTime
      0            // maxSlippageRatio (0%)
    );

    // Set enzyme vault swap details
    swapDetails[enzymeVaultAddress] = SwapDetails(
      15_000 ether, // minAmount
      16_000 ether, // maxAmount
      1660673114,  // lastSwapTime
      2_50         // maxSlippageRatio (2.5%)
    );
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

  /// [deprecated] Use sellNXM function instead
  ///
  /// @param amount   Amount of NXM to sell
  /// @return success  Returns true on successfull sale
  ///
  function sellNXMTokens(
    uint amount
  ) public override onlyMember whenNotPaused returns (bool success) {
    sellNXM(amount, 0);
    return true;
  }

  /// Buys NXM tokens with ETH.
  ///
  /// @param minTokensOut  Minimum amount of tokens to be bought. Revert if boughtTokens falls below
  /// this number.
  ///
  function buyNXM(uint minTokensOut) public override payable onlyMember whenNotPaused {
    uint ethIn = msg.value;
    require(ethIn > 0, "Pool: ethIn > 0");

    uint totalAssetValue = getPoolValueInEth() - ethIn;
    IMCR _mcr = mcr();
    uint mcrEth = _mcr.getMCR();
    uint mcrRatio = calculateMCRRatio(totalAssetValue, mcrEth);

    require(mcrRatio <= MAX_MCR_RATIO, "Pool: Cannot purchase if MCR% > 400%");
    uint tokensOut = calculateNXMForEth(ethIn, totalAssetValue, mcrEth);
    require(tokensOut >= minTokensOut, "Pool: tokensOut is less than minTokensOut");
    tokenController().mint(msg.sender, tokensOut);

    // evaluate the new MCR for the current asset value including the ETH paid in
    _mcr.updateMCRInternal(false);
    emit NXMBought(msg.sender, ethIn, tokensOut);
  }

  /// Sell NXM tokens and receive ETH.
  ///
  /// @param tokenAmount  Amount of tokens to sell.
  /// @param minEthOut    Minimum amount of ETH to be received. Revert if ethOut falls below this number.
  ///
  function sellNXM(
    uint tokenAmount,
    uint minEthOut
  ) public override onlyMember nonReentrant whenNotPaused {
    require(nxmToken.balanceOf(msg.sender) >= tokenAmount, "Pool: Not enough balance");
    require(nxmToken.isLockedForMV(msg.sender) <= block.timestamp, "Pool: NXM tokens are locked for voting");

    IMCR _mcr = mcr();
    uint currentTotalAssetValue = getPoolValueInEth();
    uint mcrEth = _mcr.getMCR();
    uint ethOut = calculateEthForNXM(tokenAmount, currentTotalAssetValue, mcrEth);
    require(currentTotalAssetValue - ethOut >= mcrEth, "Pool: MCR% cannot fall below 100%");
    require(ethOut >= minEthOut, "Pool: ethOut < minEthOut");

    tokenController().burnFrom(msg.sender, tokenAmount);
    (bool ok, /* data */) = msg.sender.call{value: ethOut}("");
    require(ok, "Pool: Sell transfer failed");

    // evaluate the new MCR for the current asset value excluding the paid out ETH
    _mcr.updateMCRInternal(false);
    emit NXMSold(msg.sender, tokenAmount, ethOut);
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
    uint totalAssetValue = getPoolValueInEth();
    uint mcrEth = mcr().getMCR();
    return calculateNXMForEth(ethAmount, totalAssetValue, mcrEth);
  }

  function calculateNXMForEth(
    uint ethAmount,
    uint currentTotalAssetValue,
    uint mcrEth
  ) public pure returns (uint) {

    require(
      ethAmount <= mcrEth * MAX_BUY_SELL_MCR_ETH_FRACTION / (10 ** MCR_RATIO_DECIMALS),
      "Pool: Purchases worth higher than 5% of MCReth are not allowed"
    );

    /*
      The price formula is:
      P(V) = A + MCReth / C *  MCR% ^ 4
      where MCR% = V / MCReth
      P(V) = A + 1 / (C * MCReth ^ 3) *  V ^ 4

      To compute the number of tokens issued we can integrate with respect to V the following:
        ΔT = ΔV / P(V)
        which assumes that for an infinitesimally small change in locked value V price is constant and we
        get an infinitesimally change in token supply ΔT.
      This is not computable on-chain, below we use an approximation that works well assuming
       * MCR% stays within [100%, 400%]
       * ethAmount <= 5% * MCReth

      Use a simplified formula excluding the constant A price offset to compute the amount of tokens to be minted.
      AdjustedP(V) = 1 / (C * MCReth ^ 3) *  V ^ 4
      AdjustedP(V) = 1 / (C * MCReth ^ 3) *  V ^ 4

      For a very small variation in tokens ΔT, we have,  ΔT = ΔV / P(V), to get total T we integrate with respect to V.
      adjustedTokenAmount = ∫ (dV / AdjustedP(V)) from V0 (currentTotalAssetValue) to V1 (nextTotalAssetValue)
      adjustedTokenAmount = ∫ ((C * MCReth ^ 3) / V ^ 4 * dV) from V0 to V1
      Evaluating the above using the antiderivative of the function we get:
      adjustedTokenAmount = - MCReth ^ 3 * C / (3 * V1 ^3) + MCReth * C /(3 * V0 ^ 3)
    */

    if (currentTotalAssetValue == 0 || mcrEth / currentTotalAssetValue > 1e12) {
      /*
       If the currentTotalAssetValue = 0, adjustedTokenPrice approaches 0. Therefore we can assume the price is A.
       If currentTotalAssetValue is far smaller than mcrEth, MCR% approaches 0, let the price be A (baseline price).
       This avoids overflow in the calculateIntegralAtPoint computation.
       This approximation is safe from arbitrage since at MCR% < 100% no sells are possible.
      */
      return ethAmount * 1e18 / CONSTANT_A;
    }

    // MCReth * C /(3 * V0 ^ 3)
    uint point0 = calculateIntegralAtPoint(currentTotalAssetValue, mcrEth);
    // MCReth * C / (3 * V1 ^3)
    uint nextTotalAssetValue = currentTotalAssetValue + ethAmount;
    uint point1 = calculateIntegralAtPoint(nextTotalAssetValue, mcrEth);
    uint adjustedTokenAmount = point0 - point1;
    /*
      Compute a preliminary adjustedTokenPrice for the minted tokens based on the adjustedTokenAmount above,
      and to that add the A constant (the price offset previously removed in the adjusted Price formula)
      to obtain the finalPrice and ultimately the tokenValue based on the finalPrice.

      adjustedPrice = ethAmount / adjustedTokenAmount
      finalPrice = adjustedPrice + A
      tokenValue = ethAmount  / finalPrice
    */
    // ethAmount is multiplied by 1e18 to cancel out the multiplication factor of 1e18 of the adjustedTokenAmount
    uint adjustedTokenPrice = ethAmount * 1e18 / adjustedTokenAmount;
    uint tokenPrice = adjustedTokenPrice + CONSTANT_A;

    return ethAmount * 1e18 / tokenPrice;
  }

  /**
   * @dev integral(V) =  MCReth ^ 3 * C / (3 * V ^ 3) * 1e18
   * computation result is multiplied by 1e18 to allow for a precision of 18 decimals.
   * NOTE: omits the minus sign of the correct integral to use a uint result type for simplicity
   * WARNING: this low-level function should be called from a contract which checks that
   * mcrEth / assetValue < 1e17 (no overflow) and assetValue != 0
   */
  function calculateIntegralAtPoint(
    uint assetValue,
    uint mcrEth
  ) internal pure returns (uint) {
    return CONSTANT_C * 1e18 / 3 * mcrEth / assetValue * mcrEth / assetValue * mcrEth / assetValue;
  }

  function getEthForNXM(uint nxmAmount) public override view returns (uint ethAmount) {
    uint currentTotalAssetValue = getPoolValueInEth();
    uint mcrEth = mcr().getMCR();
    return calculateEthForNXM(nxmAmount, currentTotalAssetValue, mcrEth);
  }

  /**
   * @dev Computes token sell value for a tokenAmount in ETH with a sell spread of 2.5%.
   * for values in ETH of the sale <= 1% * MCReth the sell spread is very close to the exact value of 2.5%.
   * for values higher than that sell spread may exceed 2.5%
   * (The higher amount being sold at any given time the higher the spread)
   */
  function calculateEthForNXM(
    uint nxmAmount,
    uint currentTotalAssetValue,
    uint mcrEth
  ) public override pure returns (uint) {

    // Step 1. Calculate spot price at current values and amount of ETH if tokens are sold at that price
    uint spotPrice0 = calculateTokenSpotPrice(currentTotalAssetValue, mcrEth);
    uint spotEthAmount = nxmAmount * spotPrice0 / 1e18;

    //  Step 2. Calculate spot price using V = currentTotalAssetValue - spotEthAmount from step 1
    uint totalValuePostSpotPriceSell = currentTotalAssetValue - spotEthAmount;
    uint spotPrice1 = calculateTokenSpotPrice(totalValuePostSpotPriceSell, mcrEth);

    // Step 3. Min [average[Price(0), Price(1)] x ( 1 - Sell Spread), Price(1) ]
    // Sell Spread = 2.5%
    uint averagePriceWithSpread = (spotPrice0 + spotPrice1) / 2 * 975 / 1000;
    uint finalPrice = Math.min(averagePriceWithSpread, spotPrice1);
    uint ethAmount = finalPrice * nxmAmount / 1e18;

    require(
      ethAmount <= mcrEth * MAX_BUY_SELL_MCR_ETH_FRACTION / (10 ** MCR_RATIO_DECIMALS),
      "Pool: Sales worth more than 5% of MCReth are not allowed"
    );

    return ethAmount;
  }

  function calculateMCRRatio(
    uint totalAssetValue,
    uint mcrEth
  ) public override pure returns (uint) {
    return totalAssetValue * (10 ** MCR_RATIO_DECIMALS) / mcrEth;
  }

  /// Calculates token price in ETH of 1 NXM token. TokenPrice = A + (MCReth / C) * MCR%^4
  ///
  function calculateTokenSpotPrice(
    uint totalAssetValue,
    uint mcrEth
  ) public override pure returns (uint tokenPrice) {

    uint mcrRatio = calculateMCRRatio(totalAssetValue, mcrEth);
    uint precisionDecimals = 10 ** (TOKEN_EXPONENT * MCR_RATIO_DECIMALS);

    return mcrEth * (mcrRatio ** TOKEN_EXPONENT) / CONSTANT_C / precisionDecimals + CONSTANT_A;
  }

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

    uint totalAssetValue = getPoolValueInEth();
    uint mcrEth = mcr().getMCR();
    uint tokenSpotPriceEth = calculateTokenSpotPrice(totalAssetValue, mcrEth);

    return priceFeedOracle.getAssetForEth(assetAddress, tokenSpotPriceEth);
  }

  /// [deprecated] Returns the NXM price in ETH.
  ///
  /// @dev The pool contract is not a proxy and its address will change as we upgrade it.
  /// @dev You may want TokenController.getTokenPrice() for a stable address since it's a proxy.
  ///
  function getTokenPrice() public override view returns (uint tokenPrice) {
    // ETH asset id = 0
    return getTokenPriceInAsset(0);
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

  /**
   * @dev Update dependent contract address
   * @dev Implements MasterAware interface function
   */
  function changeDependentContractAddress() public {
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MC)] = master.getLatestAddress("MC");
    // needed for onlyMember modifier
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
  }
}
