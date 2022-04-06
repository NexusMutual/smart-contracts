// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";

import "../../utils/SafeUintCast.sol";
import "../../abstract/MasterAware.sol";
import "../../interfaces/IMCR.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IPriceFeedOracle.sol";
import "../../interfaces/IQuotation.sol";
import "../../interfaces/ITokenController.sol";

contract Pool is IPool, MasterAware, ReentrancyGuard {
  using SafeERC20 for IERC20;

  uint16 constant MAX_SLIPPAGE_DENOMINATOR = 10000;

  /* storage */
  Asset[] public override payoutAssets;
  Asset[] public override investmentAssets;
  mapping(address => SwapDetails) public swapDetails;

  // contracts
  IQuotation public quotation;
  INXMToken public nxmToken;
  ITokenController public tokenController;
  IMCR public mcr;

  // parameters
  address public swapController;
  uint public override minPoolEth;
  IPriceFeedOracle public override priceFeedOracle;
  address public swapOperator;

  // Binary map where each on bit, starting from the LSB, represents whether the payout asset found
  // at the same index as the bit's position should be ignored when calulating the value of the pool
  // in ETH.
  //
  // Examples:
  // 1 (10) = 00000000000000000000000000000001 (2)
  //                                         ^
  //                                         payoutAssets[0] is ignored
  //
  // 9 (10) = 00000000000000000000000000001001 (2)
  //                                      ^  ^
  //                                      payoutAssets[0] and payoutAssets[3] are both ignored
  //
  uint32 public ignoredPayoutAssetsBitmap;

  /* constants */
  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  address constant public DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
  address constant public stETH = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;

  uint public constant MCR_RATIO_DECIMALS = 4;
  uint public constant MAX_MCR_RATIO = 40000; // 400%
  uint public constant MAX_BUY_SELL_MCR_ETH_FRACTION = 500; // 5%. 4 decimal points

  uint internal constant CONSTANT_C = 5800000;
  uint internal constant CONSTANT_A = 1028 * 1e13;
  uint internal constant TOKEN_EXPONENT = 4;

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
    address _swapOperator
  ) {
    master = INXMMaster(_master);
    priceFeedOracle = IPriceFeedOracle(_priceOracle);
    swapOperator = _swapOperator;

    // The order of payoutAssets should never change between updates. Do not remove the following
    // lines!
    payoutAssets.push(Asset(ETH, 18));
    payoutAssets.push(Asset(DAI, 18));

    // Add investment assets
    investmentAssets.push(Asset(stETH, 18));

    // Set DAI swap details
    swapDetails[DAI] = SwapDetails(
      1000000 ether, // minAmount (1 mil)
      2000000 ether, // maxAmount (2 mil)
      0,             // lastSwapTime
      250            // maxSlippageRatio (0.25%)
    );

    // Set stETH swap details
    swapDetails[stETH] = SwapDetails(
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

    uint rate = priceFeedOracle.getAssetToEthRate(assetAddress);
    require(rate > 0, "Pool: Zero rate");

    uint assetBalance = token.balanceOf(address(this));
    return assetBalance * rate / (10 ** uint(assetDecimals)); // ETH
  }

  /**
   * @dev Calculates total value of all pool assets in ether
   */
  function getPoolValueInEth() public override view returns (uint) {

    uint total = address(this).balance;
    uint investmentAssetsCount = investmentAssets.length;
    uint payoutAssetsCount = payoutAssets.length;

    for (uint i = 0; i < investmentAssetsCount; i++) {
      Asset memory asset = investmentAssets[i];
      uint assetValue = getAssetValueInEth(asset.assetAddress, asset.decimals);
      total = total + assetValue;
    }

    uint ignoredPayoutAssets = ignoredPayoutAssetsBitmap;
    // Skip ETH (index 0)
    for (uint i = 1; i < payoutAssetsCount; i++) {
      // Skip ignored assets by looking at the bits that are on in ignoredPayoutAssetsBitmap
      if ((1 << i) & ignoredPayoutAssets != 0) {
        continue;
      }
      Asset memory asset = payoutAssets[i];
      uint assetValue = getAssetValueInEth(asset.assetAddress, asset.decimals);
      total = total + assetValue;
    }

    return total;
  }

  /* asset related functions */

  function getPayoutAssets() external override view returns (Asset[] memory assets) {
    uint count = payoutAssets.length;
    assets = new Asset[](count);

    for (uint i = 0; i < count; i++) {
      assets[i] = payoutAssets[i];
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

  function getAssetSwapDetails(address assetAddress) external override view returns (
    uint104 min,
    uint104 max,
    uint32 lastAssetSwapTime,
    uint16 maxSlippageRatio
  ) {

    SwapDetails memory details = swapDetails[assetAddress];

    return (details.minAmount, details.maxAmount, details.lastSwapTime, details.maxSlippageRatio);
  }

  function addAsset(
    address assetAddress,
    uint8 decimals,
    uint104 _min,
    uint104 _max,
    uint16 _maxSlippageRatio,
    bool isPayoutAsset
  ) external onlyGovernance {
    require(assetAddress != address(0), "Pool: Asset is zero address");
    require(_max >= _min, "Pool: max < min");
    require(_maxSlippageRatio <= MAX_SLIPPAGE_DENOMINATOR, "Pool: Max slippage ratio > 1");

    // Check whether the new asset already exists as a payout asset
    uint payoutAssetsCount = payoutAssets.length;
    for (uint i = 0; i < payoutAssetsCount; i++) {
      require(assetAddress != payoutAssets[i].assetAddress, "Pool: Asset exists");
    }

    // Check whether the new asset already exists as an investment asset
    uint investmentAssetsCount = investmentAssets.length;
    for (uint i = 0; i < investmentAssetsCount; i++) {
      require(assetAddress != investmentAssets[i].assetAddress, "Pool: Asset exists");
    }

    // Add the new asset to its corresponding array
    if (isPayoutAsset) {
      payoutAssets.push(Asset(assetAddress, decimals));
    } else {
      investmentAssets.push(Asset(assetAddress, decimals));
    }

    // Set the swap details
    swapDetails[assetAddress] = SwapDetails(_min, _max, 0, _maxSlippageRatio);
  }

  /// Removes an asset which is no longer used.
  ///
  /// @dev Investment assets will be removed from the investmentAssets array. Payout assets
  /// however cannot be removed entirely as they are referenced by their index in covers.
  /// Instead, they are ignored by setting the bit corresponding to the asset's index in
  /// ignoredPayoutAssets to 1. Ignored payout assets are skipped when calculating the pool value
  /// in ETH which saves a slot read for each asset removed. However this does not prevent cover
  /// sales in that particular payout asset and it is required to set coverAssetsFallback and
  /// coverAssets on each product beforehand (See: Cover.sol). When an asset is removed, the
  /// corresponding swapDetails are also removed and it is assumed that the balance is 0. To allow
  /// removing assets which might revert on balance calls (such as a malicious ), there are no
  /// balance checks in this function.
  ///
  /// @param assetId        The index of the asset that needs to be removed.
  /// @param isPayoutAsset  True if the asset is used for payouts or false if it's just an
  ///                       investment asset.
  ///
  function removeAsset(uint assetId, bool isPayoutAsset) external onlyGovernance {
    if (isPayoutAsset) {
      require(assetId < payoutAssets.length, "Pool: Payout asset does not exist");
      require(ignoredPayoutAssetsBitmap & (1 << assetId) != 0, "Pool: Payout asset is ignored");

      // Remove swap details
      address assetAddress = payoutAssets[assetId].assetAddress;
      delete swapDetails[assetAddress];

      // Ignore asset which makes getPoolValueInEth skip it when the function loops through
      // payments assets
      ignoredPayoutAssetsBitmap |= SafeUintCast.toUint32(1 << assetId);
    } else {
      require(assetId < investmentAssets.length, "Pool: Investment asset does not exist");

      // Remove swap details
      address assetAddress = investmentAssets[assetId].assetAddress;
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
    bool isPayoutAsset
  ) external onlyGovernance {

    require(_min <= _max, "Pool: min > max");
    require(_maxSlippageRatio <= MAX_SLIPPAGE_DENOMINATOR, "Pool: Max slippage ratio > 1");

    uint assetsCount = isPayoutAsset ? payoutAssets.length : investmentAssets.length;
    for (uint i = 0; i < assetsCount; i++) {
      Asset memory asset = isPayoutAsset ? payoutAssets[i] : investmentAssets[i];
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
   * @param assetId        Index of the payout asset
   * @param payoutAddress  Send funds to this address
   * @param amount         Amount to send
   */
  function sendPayout (
    uint assetId,
    address payable payoutAddress,
    uint amount
  ) external override onlyInternal nonReentrant {
    Asset memory asset = payoutAssets[assetId];

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

  function upgradeCapitalPool(address payable newPoolAddress) external override onlyMaster nonReentrant {
    // Transfer ETH
    uint ethBalance = address(this).balance;
    (bool ok, /* data */) = newPoolAddress.call{value: ethBalance}("");
    require(ok, "Pool: Transfer failed");

    // Transfer payout assets. Start from 1 (0 is ETH)
    uint payoutAssetsCount = payoutAssets.length;
    for (uint i = 1; i < payoutAssetsCount; i++) {
      IERC20 token = IERC20(payoutAssets[i].assetAddress);
      uint tokenBalance = token.balanceOf(address(this));
      token.safeTransfer(newPoolAddress, tokenBalance);
    }

    // Transfer investment assets. Start from 1 (0 is ETH)
    uint investmentAssetsCount = investmentAssets.length;
    for (uint i = 0; i < investmentAssetsCount; i++) {
      IERC20 token = IERC20(investmentAssets[i].assetAddress);
      uint tokenBalance = token.balanceOf(address(this));
      token.safeTransfer(newPoolAddress, tokenBalance);
    }
  }

  /**
   * @dev Update dependent contract address
   * @dev Implements MasterAware interface function
   */
  function changeDependentContractAddress() public {
    nxmToken = INXMToken(master.tokenAddress());
    tokenController = ITokenController(master.getLatestAddress("TC"));
    quotation = IQuotation(master.getLatestAddress("QT"));
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


  /// @dev DEPRECATED, use calculateNXMForEth function instead! Returns the amount of wei a seller
  /// will get for selling NXM
  ///
  /// @param amount     Amount of NXM to sell
  /// @return weiToPay  Amount of wei the seller will get
  /// [todo] Is it safe to remove this?
  function getWei(uint amount) external view returns (uint weiToPay) {
    return getEthForNXM(amount);
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
    uint finalPrice = averagePriceWithSpread < spotPrice1 ? averagePriceWithSpread : spotPrice1;
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

  /// Returns the NXM price in a given payout asset.
  ///
  /// @dev This function cannot be used to get the token price in investment assets.
  ///
  /// @param assetId  Index of the payout asset.
  ///
  function getTokenPrice(uint assetId) public override view returns (uint tokenPrice) {
    require(assetId < payoutAssets.length, "Pool: Unknown payout asset");
    address assetAddress = payoutAssets[assetId].assetAddress;
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

  function updateUintParameters(bytes8 code, uint value) external onlyGovernance {
    if (code == "MIN_ETH") {
      minPoolEth = value;
      return;
    }

    revert("Pool: Unknown parameter");
  }

  function updateAddressParameters(bytes8 code, address value) external onlyGovernance {
    if (code == "SWP_OP") {
      swapOperator = value;
      return;
    }

    if (code == "PRC_FEED") {
      priceFeedOracle = IPriceFeedOracle(value);
      return;
    }

    revert("Pool: Unknown parameter");
  }
}
