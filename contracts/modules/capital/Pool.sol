/* Copyright (C) 2020 NexusMutual.io

  This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../../abstract/MasterAware.sol";
import "../cover/Quotation.sol";
import "../oracles/PriceFeedOracle.sol";
import "../token/NXMToken.sol";
import "../token/TokenController.sol";
import "./MCR.sol";
import "./SwapAgent.sol";

contract Pool is MasterAware, ReentrancyGuard {
  using Address for address;
  using SafeMath for uint;
  using SafeERC20 for IERC20;

  /* storage */
  address[] public assets;
  mapping(address => SwapAgent.AssetData) public assetData;

  // contracts
  Quotation public quotation;
  NXMToken public nxmToken;
  TokenController public tokenController;
  MCR public mcr;

  // parameters
  address public twapOracle;
  address public swapController;
  uint public minPoolEth;
  PriceFeedOracle public priceFeedOracle;

  /* constants */
  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  uint public constant MCR_RATIO_DECIMALS = 4;
  uint public constant MAX_MCR_RATIO = 40000; // 400%
  uint public constant MAX_BUY_SELL_MCR_ETH_FRACTION = 500; // 5%. 4 decimal points

  uint internal constant CONSTANT_C = 5800000;
  uint internal constant CONSTANT_A = 1028 * 1e13;
  uint internal constant TOKEN_EXPONENT = 4;

  /* events */
  event Payout(address indexed to, address indexed asset, uint amount);
  event NXMSold (address indexed member, uint nxmIn, uint ethOut);
  event NXMBought (address indexed member, uint ethIn, uint nxmOut);
  event Swapped(address indexed fromAsset, address indexed toAsset, uint amountIn, uint amountOut);

  /* logic */
  modifier onlySwapController {
    require(msg.sender == swapController, "Pool: not swapController");
    _;
  }

  constructor (
    address[] memory _assets,
    uint112[] memory _minAmounts,
    uint112[] memory _maxAmounts,
    uint[] memory _maxSlippageRatios,
    address _master,
    address _priceOracle,
    address _twapOracle,
    address _swapController
  ) public {

    require(_assets.length == _minAmounts.length, "Pool: length mismatch");
    require(_assets.length == _maxAmounts.length, "Pool: length mismatch");
    require(_assets.length == _maxSlippageRatios.length, "Pool: length mismatch");

    for (uint i = 0; i < _assets.length; i++) {

      address asset = _assets[i];
      require(asset != address(0), "Pool: asset is zero address");
      require(_maxAmounts[i] >= _minAmounts[i], "Pool: max < min");
      require(_maxSlippageRatios[i] <= 1 ether, "Pool: max < min");

      assets.push(asset);
      assetData[asset].minAmount = _minAmounts[i];
      assetData[asset].maxAmount = _maxAmounts[i];
      assetData[asset].maxSlippageRatio = _maxSlippageRatios[i];
    }

    master = INXMMaster(_master);
    priceFeedOracle = PriceFeedOracle(_priceOracle);
    twapOracle = _twapOracle;
    swapController = _swapController;
  }

  // fallback function
  function() external payable {}

  // for legacy Pool1 upgrade compatibility
  function sendEther() external payable {}

  /**
   * @dev Calculates total value of all pool assets in ether
   */
  function getPoolValueInEth() public view returns (uint) {

    uint total = address(this).balance;

    for (uint i = 0; i < assets.length; i++) {

      address assetAddress = assets[i];
      IERC20 token = IERC20(assetAddress);

      uint rate = priceFeedOracle.getAssetToEthRate(assetAddress);
      require(rate > 0, "Pool: zero rate");

      uint assetBalance = token.balanceOf(address(this));
      uint assetValue = assetBalance.mul(rate).div(1e18);

      total = total.add(assetValue);
    }

    return total;
  }

  /* asset related functions */

  function getAssets() external view returns (address[] memory) {
    return assets;
  }

  function getAssetDetails(address _asset) external view returns (
    uint balance,
    uint112 min,
    uint112 max,
    uint32 lastAssetSwapTime,
    uint maxSlippageRatio
  ) {

    IERC20 token = IERC20(_asset);
    balance = token.balanceOf(address(this));
    SwapAgent.AssetData memory data = assetData[_asset];

    return (balance, data.minAmount, data.maxAmount, data.lastSwapTime, data.maxSlippageRatio);
  }

  function addAsset(
    address _asset,
    uint112 _min,
    uint112 _max,
    uint _maxSlippageRatio
  ) external onlyGovernance {

    require(_asset != address(0), "Pool: asset is zero address");
    require(_max >= _min, "Pool: max < min");
    require(_maxSlippageRatio <= 1 ether, "Pool: max slippage ratio > 1");

    for (uint i = 0; i < assets.length; i++) {
      require(_asset != assets[i], "Pool: asset exists");
    }

    assets.push(_asset);
    assetData[_asset] = SwapAgent.AssetData(_min, _max, 0, _maxSlippageRatio);
  }

  function removeAsset(address _asset) external onlyGovernance {

    for (uint i = 0; i < assets.length; i++) {

      if (_asset != assets[i]) {
        continue;
      }

      delete assetData[_asset];
      assets[i] = assets[assets.length - 1];
      assets.pop();

      return;
    }

    revert("Pool: asset not found");
  }

  function setAssetDetails(
    address _asset,
    uint112 _min,
    uint112 _max,
    uint _maxSlippageRatio
  ) external onlyGovernance {

    require(_min <= _max, "Pool: min > max");
    require(_maxSlippageRatio <= 1 ether, "Pool: max slippage ratio > 1");

    for (uint i = 0; i < assets.length; i++) {

      if (_asset != assets[i]) {
        continue;
      }

      assetData[_asset].minAmount = _min;
      assetData[_asset].maxAmount = _max;
      assetData[_asset].maxSlippageRatio = _maxSlippageRatio;

      return;
    }

    revert("Pool: asset not found");
  }

  /* swap functions */

  function getSwapQuote(
    uint tokenAmountIn,
    IERC20 fromToken,
    IERC20 toToken
  ) public view returns (uint tokenAmountOut) {

    return SwapAgent.getSwapQuote(
      tokenAmountIn,
      fromToken,
      toToken
    );
  }

  function swapETHForAsset(
    address toTokenAddress,
    uint amountIn,
    uint amountOutMin
  ) external whenNotPaused onlySwapController nonReentrant {

    SwapAgent.AssetData storage assetDetails = assetData[toTokenAddress];

    uint amountOut = SwapAgent.swapETHForAsset(
      twapOracle,
      assetDetails,
      toTokenAddress,
      amountIn,
      amountOutMin,
      minPoolEth
    );

    emit Swapped(ETH, toTokenAddress, amountIn, amountOut);
  }

  function swapAssetForETH(
    address fromTokenAddress,
    uint amountIn,
    uint amountOutMin
  ) external whenNotPaused onlySwapController nonReentrant {

    uint amountOut = SwapAgent.swapAssetForETH(
      twapOracle,
      assetData[fromTokenAddress],
      fromTokenAddress,
      amountIn,
      amountOutMin
    );

    emit Swapped(fromTokenAddress, ETH, amountIn, amountOut);
  }

  /* claim related functions */

  /**
   * @dev Execute the payout in case a claim is accepted
   * @param asset token address or 0xEee...EEeE for ether
   * @param payoutAddress send funds to this address
   * @param amount amount to send
   */
  function sendClaimPayout (
    address asset,
    address payable payoutAddress,
    uint amount
  ) external onlyInternal nonReentrant returns (bool success) {

    bool ok;

    if (asset == ETH) {
      // solhint-disable-next-line avoid-low-level-calls
      (ok, /* data */) = payoutAddress.call.value(amount)("");
    } else {
      ok =  _safeTokenTransfer(asset, payoutAddress, amount);
    }

    if (ok) {
      emit Payout(payoutAddress, asset, amount);
    }

    return ok;
  }

  /**
   * @dev safeTransfer implementation that does not revert
   * @param tokenAddress ERC20 address
   * @param to destination
   * @param value amount to send
   * @return success true if the transfer was successfull
   */
  function _safeTokenTransfer (
    address tokenAddress,
    address to,
    uint256 value
  ) internal returns (bool) {

    // token address is not a contract
    if (!tokenAddress.isContract()) {
      return false;
    }

    IERC20 token = IERC20(tokenAddress);
    bytes memory data = abi.encodeWithSelector(token.transfer.selector, to, value);
    // solhint-disable-next-line avoid-low-level-calls
    (bool success, bytes memory returndata) = tokenAddress.call(data);

    // low-level call failed/reverted
    if (!success) {
      return false;
    }

    // tokens that don't have return data
    if (returndata.length == 0) {
      return true;
    }

    // tokens that have return data will return a bool
    return abi.decode(returndata, (bool));
  }

  /* pool lifecycle functions */

  function transferAsset(
    address asset,
    address payable destination,
    uint amount
  ) external onlyGovernance nonReentrant {

    require(assetData[asset].maxAmount == 0, "Pool: max not zero");
    require(destination != address(0), "Pool: dest zero");

    IERC20 token = IERC20(asset);
    uint balance = token.balanceOf(address(this));
    uint transferableAmount = amount > balance ? balance : amount;

    token.safeTransfer(destination, transferableAmount);
  }

  function upgradeCapitalPool(address payable newPoolAddress) external onlyMaster nonReentrant {

    // transfer ether
    uint ethBalance = address(this).balance;
    (bool ok, /* data */) = newPoolAddress.call.value(ethBalance)("");
    require(ok, "Pool: transfer failed");

    // transfer assets
    for (uint i = 0; i < assets.length; i++) {
      IERC20 token = IERC20(assets[i]);
      uint tokenBalance = token.balanceOf(address(this));
      token.safeTransfer(newPoolAddress, tokenBalance);
    }

  }

  /**
   * @dev Update dependent contract address
   * @dev Implements MasterAware interface function
   */
  function changeDependentContractAddress() public {
    nxmToken = NXMToken(master.tokenAddress());
    tokenController = TokenController(master.getLatestAddress("TC"));
    quotation = Quotation(master.getLatestAddress("QT"));
    mcr = MCR(master.getLatestAddress("MC"));
  }

  /* cover purchase functions */

  /// @dev Enables user to purchase cover with funding in ETH.
  /// @param smartCAdd Smart Contract Address
  function makeCoverBegin(
    address smartCAdd,
    bytes4 coverCurr,
    uint[] memory coverDetails,
    uint16 coverPeriod,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) public payable onlyMember whenNotPaused {

    require(coverCurr == "ETH", "Pool: Unexpected asset type");
    require(msg.value == coverDetails[1], "Pool: ETH amount does not match premium");

    quotation.verifyCoverDetails(msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
  }

  /**
   * @dev Enables user to purchase cover via currency asset eg DAI
   */
  function makeCoverUsingCA(
    address smartCAdd,
    bytes4 coverCurr,
    uint[] memory coverDetails,
    uint16 coverPeriod,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) public onlyMember whenNotPaused {
    require(coverCurr != "ETH", "Pool: Unexpected asset type");
    quotation.verifyCoverDetails(msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
  }

  function transferAssetFrom (address asset, address from, uint amount) public onlyInternal whenNotPaused {
    IERC20 token = IERC20(asset);
    token.safeTransferFrom(from, address(this), amount);
  }

  /* token sale functions */

  /**
   * @dev (DEPRECATED, use sellTokens function instead) Allows selling of NXM for ether.
   * Seller first needs to give this contract allowance to
   * transfer/burn tokens in the NXMToken contract
   * @param  _amount Amount of NXM to sell
   * @return success returns true on successfull sale
   */
  function sellNXMTokens(uint _amount) public onlyMember whenNotPaused returns (bool success) {
    sellNXM(_amount, 0);
    return true;
  }

  /**
   * @dev (DEPRECATED, use calculateNXMForEth function instead) Returns the amount of wei a seller will get for selling NXM
   * @param amount Amount of NXM to sell
   * @return weiToPay Amount of wei the seller will get
   */
  function getWei(uint amount) external view returns (uint weiToPay) {
    return getEthForNXM(amount);
  }

  /**
   * @dev Buys NXM tokens with ETH.
   * @param  minTokensOut Minimum amount of tokens to be bought. Revert if boughtTokens falls below this number.
   * @return boughtTokens number of bought tokens.
   */
  function buyNXM(uint minTokensOut) public payable onlyMember whenNotPaused {

    uint ethIn = msg.value;
    require(ethIn > 0, "Pool: ethIn > 0");

    uint totalAssetValue = getPoolValueInEth().sub(ethIn);
    uint mcrEth = mcr.getLastMCREther();
    uint mcrRatio = calculateMCRRatio(totalAssetValue, mcrEth);
    require(mcrRatio <= MAX_MCR_RATIO, "Pool: Cannot purchase if MCR% > 400%");
    uint tokensOut = calculateNXMForEth(ethIn, totalAssetValue, mcrEth);
    require(tokensOut >= minTokensOut, "Pool: tokensOut is less than minTokensOut");
    tokenController.mint(msg.sender, tokensOut);

    emit NXMBought(msg.sender, ethIn, tokensOut);
  }

  /**
   * @dev Sell NXM tokens and receive ETH.
   * @param tokenAmount Amount of tokens to sell.
   * @param  minEthOut Minimum amount of ETH to be received. Revert if ethOut falls below this number.
   * @return ethOut amount of ETH received in exchange for the tokens.
   */
  function sellNXM(uint tokenAmount, uint minEthOut) public onlyMember nonReentrant whenNotPaused {

    require(nxmToken.balanceOf(msg.sender) >= tokenAmount, "Pool: Not enough balance");
    require(nxmToken.isLockedForMV(msg.sender) <= now, "Pool: NXM tokens are locked for voting");

    uint currentTotalAssetValue = getPoolValueInEth();
    uint mcrEth = mcr.getLastMCREther();
    uint ethOut = calculateEthForNXM(tokenAmount, currentTotalAssetValue, mcrEth);
    require(currentTotalAssetValue.sub(ethOut) >= mcrEth, "Pool: MCR% cannot fall below 100%");
    require(ethOut >= minEthOut, "Pool: ethOut < minEthOut");

    tokenController.burnFrom(msg.sender, tokenAmount);
    (bool ok, /* data */) = msg.sender.call.value(ethOut)("");
    require(ok, "Pool: Sell transfer failed");

    emit NXMSold(msg.sender, tokenAmount, ethOut);
  }

  /**
   * @dev Get value in tokens for an ethAmount purchase.
   * @param ethAmount amount of ETH used for buying.
   * @return tokenValue tokens obtained by buying worth of ethAmount
   */
  function getNXMForEth(
    uint ethAmount
  ) public view returns (uint) {
    uint totalAssetValue = getPoolValueInEth();
    uint mcrEth = mcr.getLastMCREther();
    return calculateNXMForEth(ethAmount, totalAssetValue, mcrEth);
  }

  function calculateNXMForEth(
    uint ethAmount,
    uint currentTotalAssetValue,
    uint mcrEth
  ) public pure returns (uint) {

    require(
      ethAmount <= mcrEth.mul(MAX_BUY_SELL_MCR_ETH_FRACTION).div(10 ** MCR_RATIO_DECIMALS),
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

    if (currentTotalAssetValue == 0 || mcrEth.div(currentTotalAssetValue) > 1e12) {
      /*
       If the currentTotalAssetValue = 0, adjustedTokenPrice approaches 0. Therefore we can assume the price is A.
       If currentTotalAssetValue is far smaller than mcrEth, MCR% approaches 0, let the price be A (baseline price).
       This avoids overflow in the calculateIntegralAtPoint computation.
       This approximation is safe from arbitrage since at MCR% < 100% no sells are possible.
      */
      uint tokenPrice = CONSTANT_A;
      return ethAmount.mul(1e18).div(tokenPrice);
    }

    // MCReth * C /(3 * V0 ^ 3)
    uint point0 = calculateIntegralAtPoint(currentTotalAssetValue, mcrEth);
    // MCReth * C / (3 * V1 ^3)
    uint nextTotalAssetValue = currentTotalAssetValue.add(ethAmount);
    uint point1 = calculateIntegralAtPoint(nextTotalAssetValue, mcrEth);
    uint adjustedTokenAmount = point0.sub(point1);
    /*
      Compute a preliminary adjustedTokenPrice for the minted tokens based on the adjustedTokenAmount above,
      and to that add the A constant (the price offset previously removed in the adjusted Price formula)
      to obtain the finalPrice and ultimately the tokenValue based on the finalPrice.

      adjustedPrice = ethAmount / adjustedTokenAmount
      finalPrice = adjustedPrice + A
      tokenValue = ethAmount  / finalPrice
    */
    // ethAmount is multiplied by 1e18 to cancel out the multiplication factor of 1e18 of the adjustedTokenAmount
    uint adjustedTokenPrice = ethAmount.mul(1e18).div(adjustedTokenAmount);
    uint tokenPrice = adjustedTokenPrice.add(CONSTANT_A);

    return ethAmount.mul(1e18).div(tokenPrice);
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

    return CONSTANT_C
      .mul(1e18)
      .div(3)
      .mul(mcrEth).div(assetValue)
      .mul(mcrEth).div(assetValue)
      .mul(mcrEth).div(assetValue);
  }

  function getEthForNXM(uint nxmAmount) public view returns (uint ethAmount) {
    uint currentTotalAssetValue = getPoolValueInEth();
    uint mcrEth = mcr.getLastMCREther();
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
  ) public pure returns (uint) {

    // Step 1. Calculate spot price at current values and amount of ETH if tokens are sold at that price
    uint spotPrice0 = calculateTokenSpotPrice(currentTotalAssetValue, mcrEth);
    uint spotEthAmount = nxmAmount.mul(spotPrice0).div(1e18);

    //  Step 2. Calculate spot price using V = currentTotalAssetValue - spotEthAmount from step 1
    uint totalValuePostSpotPriceSell = currentTotalAssetValue.sub(spotEthAmount);
    uint spotPrice1 = calculateTokenSpotPrice(totalValuePostSpotPriceSell, mcrEth);

    // Step 3. Min [average[Price(0), Price(1)] x ( 1 - Sell Spread), Price(1) ]
    // Sell Spread = 2.5%
    uint averagePriceWithSpread = spotPrice0.add(spotPrice1).div(2).mul(975).div(1000);
    uint finalPrice = averagePriceWithSpread < spotPrice1 ? averagePriceWithSpread : spotPrice1;
    uint ethAmount = finalPrice.mul(nxmAmount).div(1e18);

    require(
      ethAmount <= mcrEth.mul(MAX_BUY_SELL_MCR_ETH_FRACTION).div(10 ** MCR_RATIO_DECIMALS),
      "Pool: Sales worth more than 5% of MCReth are not allowed"
    );

    return ethAmount;
  }

  function calculateMCRRatio(uint totalAssetValue, uint mcrEth) public pure returns (uint) {
    return totalAssetValue.mul(10 ** MCR_RATIO_DECIMALS).div(mcrEth);
  }

  /**
  * @dev Calculates token price in ETH 1 NXM token. TokenPrice = A + (MCReth / C) * MCR%^4
  */
  function calculateTokenSpotPrice(uint totalAssetValue, uint mcrEth) public pure returns (uint tokenPrice) {

    uint mcrRatio = calculateMCRRatio(totalAssetValue, mcrEth);
    uint precisionDecimals = 10 ** TOKEN_EXPONENT.mul(MCR_RATIO_DECIMALS);

    return mcrEth
      .mul(mcrRatio ** TOKEN_EXPONENT)
      .div(CONSTANT_C)
      .div(precisionDecimals)
      .add(CONSTANT_A);
  }

  /**
   * @dev Returns the NXM price in a given asset
   * @param asset Asset name.
   */
  function getTokenPrice(address asset) public view returns (uint tokenPrice) {

    uint totalAssetValue = getPoolValueInEth();
    uint mcrEth = mcr.getLastMCREther();
    uint tokenSpotPriceEth = calculateTokenSpotPrice(totalAssetValue, mcrEth);

    return priceFeedOracle.getAssetForEth(asset, tokenSpotPriceEth);
  }

  function getMCRRatio() public view returns (uint) {
    uint totalAssetValue = getPoolValueInEth();
    uint mcrEth = mcr.getLastMCREther();
    return calculateMCRRatio(totalAssetValue, mcrEth);
  }

  function updateUintParameters(bytes8 code, uint value) external onlyGovernance {

    if (code == "MIN_ETH") {
      minPoolEth = value;
      return;
    }

    revert("Pool: unknown parameter");
  }

  function updateAddressParameters(bytes8 code, address value) external onlyGovernance {

    if (code == "TWAP") {
      twapOracle = value;
      return;
    }

    if (code == "SWAP") {
      swapController = value;
      return;
    }

    if (code == "PRC_FEED") {
      priceFeedOracle = PriceFeedOracle(value);
      return;
    }

    revert("Pool: unknown parameter");
  }
}
