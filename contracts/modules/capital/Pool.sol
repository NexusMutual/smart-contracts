// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "@openzeppelin/contracts-v4/utils/Address.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";

import "../../abstract/MasterAware.sol";
import "../../interfaces/IMCR.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IPriceFeedOracle.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/IERC20Detailed.sol";
import "../../interfaces/ISwapOperator.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";

contract Pool is IPool, MasterAware, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using Address for address;

  /* storage */
  Asset[] public override coverAssets;
  Asset[] public override investmentAssets;
  mapping(address => SwapDetails) public swapDetails;

  // contracts
  INXMToken public nxmToken;
  ITokenController public tokenController;
  IMCR public mcr;

  // parameters
  IPriceFeedOracle public override priceFeedOracle;
  address public swapOperator;

  // Binary map where each on bit, starting from the LSB, represents whether the cover asset found
  // at the same index as the bit's position should be ignored when calculating the value of the pool
  // in ETH.
  //
  // Examples:
  // 1 (10) = 00000000000000000000000000000001 (2)
  //                                         ^
  //                                         coverAssets[0] is deprecated
  //
  // 9 (10) = 00000000000000000000000000001001 (2)
  //                                      ^  ^
  //                                      coverAssets[0] and coverAssets[3] are both deprecated
  //
  uint32 public deprecatedCoverAssetsBitmap;

  uint96 public swapValue;

  // When an asset transfer reverts it can be abandoned by flagging the address. This allows pool
  // upgrades if the upgrade reverts due to one or more failed transfers to the new address.
  mapping(address => bool) public abandonAssets;

  /* constants */
  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  uint public constant MCR_RATIO_DECIMALS = 4;
  uint public constant MAX_MCR_RATIO = 40000; // 400%
  uint public constant MAX_BUY_SELL_MCR_ETH_FRACTION = 500; // 5%. 4 decimal points

  uint internal constant CONSTANT_C = 5800000;
  uint internal constant CONSTANT_A = 1028 * 1e13;
  uint internal constant TOKEN_EXPONENT = 4;

  uint16 constant MAX_SLIPPAGE_DENOMINATOR = 10000;

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

  constructor (
    address _master,
    address _priceOracle,
    address _swapOperator,
    address DAIAddress,
    address stETHAddress
  ) {
    master = INXMMaster(_master);
    priceFeedOracle = IPriceFeedOracle(_priceOracle);
    swapOperator = _swapOperator;

    // [todo] After this contract is deployed it might be worth modifying upgradeCapitalPool to
    // copy the assets on future upgrades instead of having them hardcoded in the constructor.
    // issue: https://github.com/NexusMutual/smart-contracts/issues/473

    // The order of coverAssets should never change between updates. Do not remove the following
    // lines!
    coverAssets.push(Asset(ETH, 18));
    coverAssets.push(Asset(DAIAddress, 18));

    // Add investment assets
    investmentAssets.push(Asset(stETHAddress, 18));

    // Set DAI swap details
    swapDetails[DAIAddress] = SwapDetails(
      1000000 ether, // minAmount (1 mil)
      2000000 ether, // maxAmount (2 mil)
      0,             // lastSwapTime
      250            // maxSlippageRatio (0.25%)
    );

    // Set stETH swap details
    swapDetails[stETHAddress] = SwapDetails(
      24360 ether,   // minAmount (~24k)
      32500 ether,   // maxAmount (~32k)
      1633425218,    // lastSwapTime
      0              // maxSlippageRatio (0%)
    );
  }

  fallback() external payable {}

  receive() external payable {}

  function getAssetValueInEth(address assetAddress, uint8 assetDecimals) internal view returns (uint) {
    IERC20 token = IERC20(assetAddress);

    uint assetBalance;
    if (assetAddress.code.length != 0){
      try token.balanceOf(address(this)) returns (uint balance) {
        assetBalance = balance;
      } catch{
        // If balanceOf reverts consider it 0
      }
    }

    // If the assetBalance is 0 skip the oracle call to save gas
    if (assetBalance == 0) {
      return 0; // ETH
    }

    uint rate = priceFeedOracle.getAssetToEthRate(assetAddress);
    require(rate > 0, "Pool: Zero rate");

    return assetBalance * rate / (10 ** uint(assetDecimals)); // ETH
  }

  /**
   * @dev Calculates total value of all pool assets in ether
   */
  function getPoolValueInEth() public override view returns (uint) {

    uint total = address(this).balance + swapValue;
    uint investmentAssetsCount = investmentAssets.length;
    uint coverAssetsCount = coverAssets.length;

    for (uint i = 0; i < investmentAssetsCount; i++) {
      Asset memory asset = investmentAssets[i];
      uint assetValue = getAssetValueInEth(asset.assetAddress, asset.decimals);
      total = total + assetValue;
    }

    uint deprecatedCoverAssets = deprecatedCoverAssetsBitmap;
    // Skip ETH (index 0)
    for (uint i = 1; i < coverAssetsCount; i++) {
      // Skip deprecated assets by looking at the bits that are on in deprecatedCoverAssetsBitmap
      if ((1 << i) & deprecatedCoverAssets != 0) {
        continue;
      }
      Asset memory asset = coverAssets[i];
      uint assetValue = getAssetValueInEth(asset.assetAddress, asset.decimals);
      total = total + assetValue;
    }

    return total;
  }

  /* asset related functions */

  function getCoverAssets() external override view returns (Asset[] memory assets) {
    uint count = coverAssets.length;
    assets = new Asset[](count);

    for (uint i = 0; i < count; i++) {
      assets[i] = coverAssets[i];
    }

    return assets;
  }

  function getInvestmentAssets() external override view returns (Asset[] memory assets) {
    uint count = investmentAssets.length;
    assets = new Asset[](count);

    for (uint i = 0; i < count; i++) {
      assets[i] = investmentAssets[i];
    }

    return assets;
  }

  function getAssetSwapDetails(address assetAddress) external view returns (SwapDetails memory) {
    return swapDetails[assetAddress];
  }

  function addAsset(
    address assetAddress,
    uint8 decimals,
    uint104 _min,
    uint104 _max,
    uint16 _maxSlippageRatio,
    bool isCoverAsset
  ) external onlyGovernance {
    require(assetAddress != address(0), "Pool: Asset is zero address");
    require(_max >= _min, "Pool: max < min");
    require(_maxSlippageRatio <= MAX_SLIPPAGE_DENOMINATOR, "Pool: Max slippage ratio > 1");

    (address aggregator, ) = priceFeedOracle.assets(assetAddress);
    require(aggregator != address(0), "Pool: Asset lacks oracle");

    // Check whether the new asset already exists as a cover asset
    uint coverAssetsCount = coverAssets.length;
    for (uint i = 0; i < coverAssetsCount; i++) {
      require(assetAddress != coverAssets[i].assetAddress, "Pool: Asset exists");
    }

    // Check whether the new asset already exists as an investment asset
    uint investmentAssetsCount = investmentAssets.length;
    for (uint i = 0; i < investmentAssetsCount; i++) {
      require(assetAddress != investmentAssets[i].assetAddress, "Pool: Asset exists");
    }

    // Add the new asset to its corresponding array
    if (isCoverAsset) {
      coverAssets.push(Asset(assetAddress, decimals));
    } else {
      investmentAssets.push(Asset(assetAddress, decimals));
    }

    // Set the swap details
    swapDetails[assetAddress] = SwapDetails(_min, _max, 0, _maxSlippageRatio);
  }

  /// Removes an asset which is no longer used.
  ///
  /// @dev Investment assets will be removed from the investmentAssets array. Cover assets
  /// however cannot be removed entirely as they are referenced by their index in covers.
  /// Instead, they are deprecated by setting the bit corresponding to the asset's index in
  /// deprecatedCoverAssets to 1. Ignored cover assets are skipped when calculating the pool value
  /// in ETH which saves a slot read for each asset removed. However this does not prevent cover
  /// sales in that particular cover asset and it is required to set coverAssetsFallback and
  /// coverAssets on each product beforehand (See: Cover.sol). When an asset is removed, the
  /// corresponding swapDetails are also removed.
  ///
  /// @param assetId        The index of the asset that needs to be removed.
  /// @param isCoverAsset   True if the asset is used for payouts or false if it's just an
  ///                       investment asset.
  ///
  function removeAsset(uint assetId, bool isCoverAsset) external onlyGovernance {
    address assetAddress;
    if (isCoverAsset) {
      require(assetId < coverAssets.length, "Pool: Cover asset does not exist");
      assetAddress = coverAssets[assetId].assetAddress;
    } else {
      require(assetId < investmentAssets.length, "Pool: Investment asset does not exist");
      assetAddress = investmentAssets[assetId].assetAddress;
    }


    uint assetBalance;
    try IERC20(assetAddress).balanceOf(address(this)) returns (uint balance) {
      assetBalance = balance;
    } catch {
      // If balanceOf reverts consider it 0
    }

    require(assetBalance == 0, "Pool: Asset balance must be 0");

    if (isCoverAsset) {
      require(deprecatedCoverAssetsBitmap & (1 << assetId) == 0, "Pool: Cover asset is deprecated");

      // Remove swap details
      delete swapDetails[assetAddress];

      // Ignore asset which makes getPoolValueInEth skip it when the function loops through
      // payments assets
      deprecatedCoverAssetsBitmap |= SafeUintCast.toUint32(1 << assetId);
    } else {

      // Remove swap details
      delete swapDetails[assetAddress];

      // Remove investment asset from the array
      investmentAssets[assetId] = investmentAssets[investmentAssets.length - 1];
      investmentAssets.pop();
    }
  }

  function setSwapDetails(
    address assetAddress,
    uint104 _min,
    uint104 _max,
    uint16 _maxSlippageRatio,
    bool isCoverAsset
  ) external onlyGovernance {

    require(_min <= _max, "Pool: min > max");
    require(_maxSlippageRatio <= MAX_SLIPPAGE_DENOMINATOR, "Pool: Max slippage ratio > 1");

    uint assetsCount = isCoverAsset ? coverAssets.length : investmentAssets.length;
    for (uint i = 0; i < assetsCount; i++) {
      Asset memory asset = isCoverAsset ? coverAssets[i] : investmentAssets[i];
      if (assetAddress != asset.assetAddress) {
        continue;
      }

      swapDetails[assetAddress].minAmount = _min;
      swapDetails[assetAddress].maxAmount = _max;
      swapDetails[assetAddress].maxSlippageRatio = _maxSlippageRatio;

      return;
    }

    revert("Pool: Asset not found");
  }

  /* claim related functions */

  /**
   * @dev Executes a payout
   * @param assetId        Index of the cover asset
   * @param payoutAddress  Send funds to this address
   * @param amount         Amount to send
   */
  function sendPayout (
    uint assetId,
    address payable payoutAddress,
    uint amount
  ) external override onlyInternal nonReentrant {
    Asset memory asset = coverAssets[assetId];

    if (asset.assetAddress == ETH) {
      // solhint-disable-next-line avoid-low-level-calls
      (bool transferSucceeded, /* data */) = payoutAddress.call{value: amount}("");
      require(transferSucceeded, "Pool: ETH transfer failed");
    } else {
      IERC20(asset.assetAddress).safeTransfer(payoutAddress, amount);
    }

    emit Payout(payoutAddress, asset.assetAddress, amount);
    uint totalAssetValue = getPoolValueInEth();

    mcr.updateMCRInternal(totalAssetValue, true);
  }

  /* pool lifecycle functions */

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


  function _transferEntireAssetBalance(address assetAddress, address destination) internal {
    if (!abandonAssets[assetAddress]) {
      IERC20 asset = IERC20(assetAddress);
      uint balance = asset.balanceOf(address(this));
      asset.safeTransfer(destination, balance);
    }
  }

  // Revert if any of the asset functions revert while not being marked for getting abandoned.
  // Otherwise, continue without reverting while the marked asset will remain stuck in the
  // previous pool contract.
  function upgradeCapitalPool(address payable newPoolAddress) external override onlyMaster nonReentrant {
    // Transfer ETH
    uint ethBalance = address(this).balance;
    (bool ok, /* data */) = newPoolAddress.call{value: ethBalance}("");
    require(ok, "Pool: Transfer failed");

    // Transfer cover assets. Start from 1 (0 is ETH)
    uint coverAssetsCount = coverAssets.length;
    for (uint i = 1; i < coverAssetsCount; i++) {
      _transferEntireAssetBalance(coverAssets[i].assetAddress, newPoolAddress);
    }

    // Transfer investment assets.
    uint investmentAssetsCount = investmentAssets.length;
    for (uint i = 0; i < investmentAssetsCount; i++) {
      _transferEntireAssetBalance(investmentAssets[i].assetAddress, newPoolAddress);
    }
  }

  /**
   * @dev Update dependent contract address
   * @dev Implements MasterAware interface function
   */
  function changeDependentContractAddress() public {
    nxmToken = INXMToken(master.tokenAddress());
    tokenController = ITokenController(master.getLatestAddress("TC"));
    mcr = IMCR(master.getLatestAddress("MC"));
  }

  function transferAssetFrom (
    address assetAddress,
    address from,
    uint amount
  ) public override onlyInternal whenNotPaused {
    IERC20 token = IERC20(assetAddress);
    token.safeTransferFrom(from, address(this), amount);
  }

  function transferAssetToSwapOperator (
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

  /* token sale functions */

  /**
   * @dev (DEPRECATED, use sellTokens function instead) Allows selling of NXM for ether.
   * Seller first needs to give this contract allowance to
   * transfer/burn tokens in the NXMToken contract
   * @param amount   Amount of NXM to sell
   * @return success  Returns true on successfull sale
   */
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
    uint mcrEth = mcr.getMCR();
    uint mcrRatio = calculateMCRRatio(totalAssetValue, mcrEth);

    require(mcrRatio <= MAX_MCR_RATIO, "Pool: Cannot purchase if MCR% > 400%");
    uint tokensOut = calculateNXMForEth(ethIn, totalAssetValue, mcrEth);
    require(tokensOut >= minTokensOut, "Pool: tokensOut is less than minTokensOut");
    tokenController.mint(msg.sender, tokensOut);

    // evaluate the new MCR for the current asset value including the ETH paid in
    mcr.updateMCRInternal(totalAssetValue + ethIn, false);
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

    uint currentTotalAssetValue = getPoolValueInEth();
    uint mcrEth = mcr.getMCR();
    uint ethOut = calculateEthForNXM(tokenAmount, currentTotalAssetValue, mcrEth);
    require(currentTotalAssetValue - ethOut >= mcrEth, "Pool: MCR% cannot fall below 100%");
    require(ethOut >= minEthOut, "Pool: ethOut < minEthOut");

    tokenController.burnFrom(msg.sender, tokenAmount);
    (bool ok, /* data */) = msg.sender.call{value: ethOut}("");
    require(ok, "Pool: Sell transfer failed");

    // evaluate the new MCR for the current asset value excluding the paid out ETH
    mcr.updateMCRInternal(currentTotalAssetValue - ethOut, false);
    emit NXMSold(msg.sender, tokenAmount, ethOut);
  }

  /// Get value in tokens for an ethAmount purchase.
  ///
  /// @param ethAmount    Amount of ETH used for buying.
  /// @return tokenValue  Tokens obtained by buying worth of ethAmount
  ///
  function getNXMForEth(
    uint ethAmount
  ) public override view returns (uint) {
    uint totalAssetValue = getPoolValueInEth();
    uint mcrEth = mcr.getMCR();
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
    uint mcrEth = mcr.getMCR();
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

  /// Returns the NXM price in a given cover asset.
  ///
  /// @dev This function cannot be used to get the token price in investment assets.
  ///
  /// @param assetId  Index of the cover asset.
  function getTokenPrice(uint assetId) public override view returns (uint tokenPrice) {
    require(assetId < coverAssets.length, "Pool: Unknown cover asset");
    address assetAddress = coverAssets[assetId].assetAddress;
    uint totalAssetValue = getPoolValueInEth();
    uint mcrEth = mcr.getMCR();
    uint tokenSpotPriceEth = calculateTokenSpotPrice(totalAssetValue, mcrEth);

    return priceFeedOracle.getAssetForEth(assetAddress, tokenSpotPriceEth);
  }

  function getMCRRatio() public override view returns (uint) {
    uint totalAssetValue = getPoolValueInEth();
    uint mcrEth = mcr.getMCR();
    return calculateMCRRatio(totalAssetValue, mcrEth);
  }

  function updateUintParameters(bytes8 /* code */, uint /* value */) external onlyGovernance {
    revert("Pool: Unknown parameter");
  }

  /// Sets the given asset addresses as abandoned when shouldAbandon is true and back to their
  /// initial state when it's false.
  ///
  /// @param assetsToAbandon  Array of addresses that represnt tokens which need to be left behind.
  ///                         This can be desired when one or more tokens revert, which would
  ///                         prevent the pool to be upgraded.
  /// @param shouldAbandon    True when the tokens passed in the assetsToAbandon array should be
  ///                         marked as abandoned. If a token is accidentally marked it can be
  ///                         unmarked by passing false instead.
  function setAssetsToAbandon(
    address[] calldata assetsToAbandon,
    bool shouldAbandon
  ) external onlyGovernance {
    for (uint i = 0; i < assetsToAbandon.length; i++) {
      abandonAssets[assetsToAbandon[i]] = shouldAbandon;
    }
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

      uint coverAssetsCount = coverAssets.length;
      for (uint i = 0; i < coverAssetsCount; i++) {
        Asset memory asset = coverAssets[i];
        if (asset.assetAddress != ETH) {
          (address aggregator, ) = IPriceFeedOracle(value).assets(asset.assetAddress);

          require(aggregator != address(0), "Pool: Oracle lacks asset");
        }
      }

      uint investmentAssetsCount = investmentAssets.length;
      for (uint i = 0; i < investmentAssetsCount; i++) {
        Asset memory asset = investmentAssets[i];
        if (asset.assetAddress != ETH) {
          (address aggregator, ) = IPriceFeedOracle(value).assets(asset.assetAddress);
          require(aggregator != address(0), "Pool: Oracle lacks asset");
        }
      }

      priceFeedOracle = IPriceFeedOracle(value);
      return;
    }

    revert("Pool: Unknown parameter");
  }

  function setSwapValue(uint newValue) external onlySwapOperator whenNotPaused {
    swapValue = SafeUintCast.toUint96(newValue);
  }
}
