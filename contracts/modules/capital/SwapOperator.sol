// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts-v4/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "../../external/enzyme/IEnzymeV4Comptroller.sol";
import "../../external/enzyme/IEnzymeV4DepositWrapper.sol";
import "../../external/enzyme/IEnzymeV4Vault.sol";
import "../../external/enzyme/IWETH.sol";
import "../../external/uniswap/IUniswapV2Pair.sol";
import "../../external/uniswap/IUniswapV2Router02.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ITwapOracle.sol";
import "../../interfaces/IERC20Detailed.sol";

import "../../external/enzyme/IEnzymeFundValueCalculatorRouter.sol";

contract SwapOperator is ReentrancyGuard {
  using SafeERC20 for IERC20;

  struct AssetData {
    uint112 minAmount;
    uint112 maxAmount;
    uint32 lastSwapTime;
    // 18 decimals of precision. 0.01% -> 0.0001 -> 1e14
    uint maxSlippageRatio;
  }

  /* storage */
  bool public communityFundTransferExecuted;

  /* immutables */
  ITwapOracle immutable public twapOracle;
  address immutable public swapController;
  INXMMaster immutable master;
  address immutable public stETH;
  IWETH immutable public weth;

  /* constants */
  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  IUniswapV2Router02 constant public router = IUniswapV2Router02(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
  uint constant public MAX_LIQUIDITY_RATIO = 0.015 ether;
  uint constant public MIN_TIME_BETWEEN_SWAPS = 10 minutes;

  address public immutable enzymeV4VaultProxyAddress;
  IEnzymeFundValueCalculatorRouter public immutable enzymeFundValueCalculatorRouter;

  /* events */
  event Swapped(address indexed fromAsset, address indexed toAsset, uint amountIn, uint amountOut);

  /* logic */
  modifier onlySwapController {
    require(msg.sender == swapController, "SwapOperator: not swapController");
    _;
  }

  constructor(
    address payable _master,
    address _twapOracle,
    address _swapController,
    address _stETH,
    address _enzymeV4VaultProxyAddress,
    IEnzymeFundValueCalculatorRouter _enzymeFundValueCalculatorRouter,
    address _weth
  ) {
    master = INXMMaster(_master);
    twapOracle = ITwapOracle(_twapOracle);
    swapController = _swapController;
    stETH = _stETH;
    enzymeV4VaultProxyAddress = _enzymeV4VaultProxyAddress;
    enzymeFundValueCalculatorRouter = _enzymeFundValueCalculatorRouter;
    weth = IWETH(_weth);
  }

  function swapETHForAsset(
    address toTokenAddress,
    uint amountIn,
    uint amountOutMin
  ) external onlySwapController {

    IPool pool = _pool();
    (
    uint112 min,
    uint112 max,
    uint32 lastAssetSwapTime,
    uint maxSlippageRatio
    ) = pool.getAssetDetails(toTokenAddress);

    AssetData memory assetDetails = AssetData(min, max, lastAssetSwapTime, maxSlippageRatio);
    require(assetIsEnabled(assetDetails), "SwapOperator: asset is not enabled");

    pool.transferAssetToSwapOperator(ETH, amountIn);
    pool.setAssetDataLastSwapTime(toTokenAddress, uint32(block.timestamp));
    uint amountOut = _swapETHForAsset(
      assetDetails,
      toTokenAddress,
      amountIn,
      amountOutMin,
      pool.minPoolEth()
    );
    transferAssetTo(toTokenAddress, address(pool), amountOut);

    emit Swapped(ETH, toTokenAddress, amountIn, amountOut);
  }

  function swapAssetForETH(
    address fromTokenAddress,
    uint amountIn,
    uint amountOutMin
  ) external onlySwapController {

    IPool pool = _pool();
    (
    uint112 min,
    uint112 max,
    uint32 lastAssetSwapTime,
    uint maxSlippageRatio
    ) = pool.getAssetDetails(fromTokenAddress);

    AssetData memory assetDetails = AssetData(min, max, lastAssetSwapTime, maxSlippageRatio);
    require(assetIsEnabled(assetDetails), "SwapOperator: asset is not enabled");

    pool.transferAssetToSwapOperator(fromTokenAddress, amountIn);
    pool.setAssetDataLastSwapTime(fromTokenAddress, uint32(block.timestamp));
    uint amountOut = _swapAssetForETH(
      assetDetails,
      fromTokenAddress,
      amountIn,
      amountOutMin
    );
    transferAssetTo(ETH, address(pool), amountOut);
    emit Swapped(fromTokenAddress, ETH, amountIn, amountOut);
  }

  function getSwapQuote(
    uint tokenAmountIn,
    IERC20 fromToken,
    IERC20 toToken
  ) public view returns (uint tokenAmountOut) {

    address[] memory path = new address[](2);
    path[0] = address(fromToken);
    path[1] = address(toToken);
    uint[] memory amountsOut = router.getAmountsOut(tokenAmountIn, path);

    return amountsOut[1];
  }

  function _swapETHForAsset(
    AssetData memory assetData,
    address toTokenAddress,
    uint amountIn,
    uint amountOutMin,
    uint minLeftETH
  ) internal returns (uint) {

    IPool pool = _pool();
    uint balanceBefore = IERC20(toTokenAddress).balanceOf(address(pool));
    address WETH = address(weth);

    {
      // scope for swap frequency check
      uint timeSinceLastTrade = block.timestamp - uint(assetData.lastSwapTime);
      require(timeSinceLastTrade > MIN_TIME_BETWEEN_SWAPS, "SwapOperator: too fast");
    }

    {
      // scope for liquidity check
      address pairAddress = twapOracle.pairFor(WETH, toTokenAddress);
      IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
      (uint112 reserve0, uint112 reserve1, /* time */) = pair.getReserves();

      uint ethReserve = WETH < toTokenAddress ? reserve0 : reserve1;
      uint maxTradable = ethReserve * MAX_LIQUIDITY_RATIO / 1e18;

      require(amountIn <= maxTradable, "SwapOperator: exceeds max tradable amount");
    }

    {
      // scope for ether checks
      uint ethBalanceAfter = address(pool).balance;
      require(ethBalanceAfter >= minLeftETH, "SwapOperator: insufficient ether left");
    }

    {
      // scope for token checks
      uint avgAmountOut = twapOracle.consult(WETH, amountIn, toTokenAddress);
      uint maxSlippageAmount = avgAmountOut * assetData.maxSlippageRatio / 1e18;
      uint minOutOnMaxSlippage = avgAmountOut - maxSlippageAmount;

      // gas optimisation: reads both values using a single SLOAD
      (uint minAssetAmount, uint maxAssetAmount) = (assetData.minAmount, assetData.maxAmount);

      require(amountOutMin >= minOutOnMaxSlippage, "SwapOperator: amountOutMin < minOutOnMaxSlippage");
      require(balanceBefore < minAssetAmount, "SwapOperator: balanceBefore >= min");
      require(balanceBefore + amountOutMin <= maxAssetAmount, "SwapOperator: balanceAfter > max");
    }

    address[] memory path = new address[](2);
    path[0] = WETH;
    path[1] = toTokenAddress;
    router.swapExactETHForTokens{ value: amountIn }(amountOutMin, path, address(this), block.timestamp);

    uint amountOut = IERC20(toTokenAddress).balanceOf(address(this));

    return amountOut;
  }

  function _swapAssetForETH(
    AssetData memory assetData,
    address fromTokenAddress,
    uint amountIn,
    uint amountOutMin
  ) internal returns (uint) {

    IPool pool = _pool();
    uint tokenBalanceBefore = IERC20(fromTokenAddress).balanceOf(address(pool)) + amountIn;
    address WETH = address(weth);

    {
      // scope for swap frequency check
      uint timeSinceLastTrade = block.timestamp - uint(assetData.lastSwapTime);
      require(timeSinceLastTrade > MIN_TIME_BETWEEN_SWAPS, "SwapOperator: too fast");
    }

    {
      // scope for liquidity check
      address pairAddress = twapOracle.pairFor(fromTokenAddress, WETH);
      IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
      (uint112 reserve0, uint112 reserve1, /* time */) = pair.getReserves();

      uint tokenReserve = fromTokenAddress < WETH ? reserve0 : reserve1;
      uint maxTradable = tokenReserve * MAX_LIQUIDITY_RATIO / 1e18;

      require(amountIn <= maxTradable, "SwapOperator: exceeds max tradable amount");
    }

    {
      // scope for token checks
      uint avgAmountOut = twapOracle.consult(fromTokenAddress, amountIn, WETH);
      uint maxSlippageAmount = avgAmountOut * assetData.maxSlippageRatio / 1e18;
      uint minOutOnMaxSlippage = avgAmountOut - maxSlippageAmount;

      // gas optimisation: reads both values using a single SLOAD
      (uint minAssetAmount, uint maxAssetAmount) = (assetData.minAmount, assetData.maxAmount);

      require(amountOutMin >= minOutOnMaxSlippage, "SwapOperator: amountOutMin < minOutOnMaxSlippage");
      require(tokenBalanceBefore > maxAssetAmount, "SwapOperator: tokenBalanceBefore <= max");
      require(tokenBalanceBefore - amountIn >= minAssetAmount, "SwapOperator: tokenBalanceAfter < min");
    }

    address[] memory path = new address[](2);
    path[0] = fromTokenAddress;
    path[1] = address(weth);
    IERC20(fromTokenAddress).approve(address(router), amountIn);
    router.swapExactTokensForETH(amountIn, amountOutMin, path, address(this), block.timestamp);

    uint amountOut = address(this).balance;

    return amountOut;
  }

  function transferAssetTo (address asset, address to, uint amount) internal {

    if (asset == ETH) {
      (bool ok, /* data */) = to.call{ value: amount }("");
      require(ok, "SwapOperator: Eth transfer failed");
      return;
    }

    IERC20 token = IERC20(asset);
    token.safeTransfer(to, amount);
  }

  function swapETHForStETH(uint amountIn) external onlySwapController {
    IPool pool = _pool();
    address toTokenAddress = stETH;
    (
    uint112 minAmount,
    uint112 maxAmount,
    /* uint32 lastAssetSwapTime */,
    /* uint maxSlippageRatio */
    ) = pool.getAssetDetails(toTokenAddress);

    require(!(minAmount == 0 && maxAmount == 0), "SwapOperator: asset is not enabled");

    uint amountOutMin;
    if (amountIn > 10000) {
      amountOutMin = amountIn - 10000; // allow for precision error
    }

    uint balanceBefore = IERC20(toTokenAddress).balanceOf(address(pool));

    pool.transferAssetToSwapOperator(ETH, amountIn);

    (bool ok, /* data */) = toTokenAddress.call{ value: amountIn }("");
    require(ok, "SwapOperator: stEth transfer failed");

    pool.setAssetDataLastSwapTime(toTokenAddress, uint32(block.timestamp));

    uint amountOut = IERC20(toTokenAddress).balanceOf(address(this));

    require(amountOut >= amountOutMin, "SwapOperator: amountOut < amountOutMin");

    require(balanceBefore < minAmount, "SwapOperator: balanceBefore >= min");
    require(balanceBefore + amountOutMin <= maxAmount, "SwapOperator: balanceAfter > max");
    {
      uint ethBalanceAfter = address(pool).balance;
      require(ethBalanceAfter >= pool.minPoolEth(), "SwapOperator: insufficient ether left");
    }

    transferAssetTo(stETH, address(pool), amountOut);

    emit Swapped(ETH, stETH, amountIn, amountOut);
  }

  function swapETHForEnzymeVaultShare(uint amountIn, uint amountOutMin) external onlySwapController {
    IPool pool = _pool();
    IEnzymeV4Comptroller comptrollerProxy = IEnzymeV4Comptroller(IEnzymeV4Vault(enzymeV4VaultProxyAddress).getAccessor());
    IERC20Detailed toToken = IERC20Detailed(enzymeV4VaultProxyAddress);

    (
    uint112 minAmount,
    uint112 maxAmount,
    uint32 lastAssetSwapTime,
    uint maxSlippageRatio
    ) = pool.getAssetDetails(address(toToken));

    require(!(minAmount == 0 && maxAmount == 0), "SwapOperator: asset is not enabled");

    {
      // scope for swap frequency check
      uint timeSinceLastTrade = block.timestamp - uint(lastAssetSwapTime);
      require(timeSinceLastTrade > MIN_TIME_BETWEEN_SWAPS, "SwapOperator: too fast");
    }

    {
      // check slippage
      (, uint netShareValue) = enzymeFundValueCalculatorRouter.calcNetShareValue(enzymeV4VaultProxyAddress);

      uint avgAmountOut = amountIn * 1e18 / netShareValue;
      uint maxSlippageAmount = avgAmountOut * maxSlippageRatio / 1e18;
      uint minOutOnMaxSlippage = avgAmountOut - maxSlippageAmount;

      require(amountOutMin >= minOutOnMaxSlippage, "SwapOperator: amountOutMin < minOutOnMaxSlippage");
    }

    uint balanceBefore = toToken.balanceOf(address(pool));
    pool.transferAssetToSwapOperator(ETH, amountIn);

    require(comptrollerProxy.getDenominationAsset() == address(weth), "SwapOperator: invalid denomination asset");

    weth.deposit{ value: amountIn }();
    weth.approve(address(comptrollerProxy), amountIn);
    comptrollerProxy.buyShares(amountIn, amountOutMin);

    pool.setAssetDataLastSwapTime(address(toToken), uint32(block.timestamp));

    uint amountOut = toToken.balanceOf(address(this));

    require(amountOut >= amountOutMin, "SwapOperator: amountOut < amountOutMin");
    require(balanceBefore < minAmount, "SwapOperator: balanceBefore >= min");
    require(balanceBefore + amountOutMin <= maxAmount, "SwapOperator: balanceAfter > max");

    {
      uint ethBalanceAfter = address(pool).balance;
      require(ethBalanceAfter >= pool.minPoolEth(), "SwapOperator: insufficient ether left");
    }

    transferAssetTo(enzymeV4VaultProxyAddress, address(pool), amountOut);

    emit Swapped(ETH, enzymeV4VaultProxyAddress, amountIn, amountOut);
  }

  function swapEnzymeVaultShareForETH(
    uint amountIn,
    uint amountOutMin
  ) external onlySwapController {

    IPool pool = _pool();
    IERC20Detailed fromToken = IERC20Detailed(enzymeV4VaultProxyAddress);

    uint balanceBefore = fromToken.balanceOf(address(pool));
    {
      (
      uint112 minAmount,
      uint112 maxAmount,
      uint32 lastAssetSwapTime,
      uint maxSlippageRatio
      ) = pool.getAssetDetails(address(fromToken));

      require(!(minAmount == 0 && maxAmount == 0), "SwapOperator: asset is not enabled");

      // swap frequency check
      uint timeSinceLastTrade = block.timestamp - uint(lastAssetSwapTime);
      require(timeSinceLastTrade > MIN_TIME_BETWEEN_SWAPS, "SwapOperator: too fast");

      uint netShareValue;
      {
        address denominationAsset;
        (denominationAsset, netShareValue) =
        enzymeFundValueCalculatorRouter.calcNetShareValue(enzymeV4VaultProxyAddress);

        require(denominationAsset ==  address(weth), "SwapOperator: invalid denomination asset");
      }

      // avgAmountOut in ETH
      uint avgAmountOut = amountIn * netShareValue / (10 ** fromToken.decimals());
      uint maxSlippageAmount = avgAmountOut * maxSlippageRatio / 1e18;
      uint minOutOnMaxSlippage = avgAmountOut - maxSlippageAmount;

      // slippage check
      require(amountOutMin >= minOutOnMaxSlippage, "SwapOperator: amountOutMin < minOutOnMaxSlippage");
      require(balanceBefore > maxAmount, "SwapOperator: balanceBefore <= max");
      require(balanceBefore - amountIn >= minAmount, "SwapOperator: tokenBalanceAfter < min");
    }

    pool.transferAssetToSwapOperator(address(fromToken), amountIn);

    IEnzymeV4Comptroller comptrollerProxy = IEnzymeV4Comptroller(IEnzymeV4Vault(enzymeV4VaultProxyAddress).getAccessor());
    fromToken.approve(address(comptrollerProxy), amountIn);

    address[] memory payoutAssets = new address[](1);
    uint[] memory payoutAssetsPercentages = new uint[](1);

    payoutAssets[0] = address(weth);
    payoutAssetsPercentages[0] = 10000;

    comptrollerProxy.redeemSharesForSpecificAssets(address(this), amountIn, payoutAssets, payoutAssetsPercentages);

    uint amountOut = weth.balanceOf(address(this));
    weth.withdraw(amountOut);

    pool.setAssetDataLastSwapTime(address(fromToken), uint32(block.timestamp));

    require(amountOut >= amountOutMin, "SwapOperator: amountOut < amountOutMin");

    transferAssetTo(ETH, address(pool), amountOut);

    emit Swapped(enzymeV4VaultProxyAddress, ETH, amountIn, amountOut);
  }

  function transferToCommunityFund() external onlySwapController {

    // amount, destination, deadline
    uint amount = 8000 ether;
    address communityFund = 0x586b9b2F8010b284A0197f392156f1A7Eb5e86e9;
    uint deadline = 1638057600; // Sun Nov 28 2021 00:00:00 GMT+0000

    // perform checks and mark as paid
    require(block.timestamp < deadline, "SwapOperator: the deadline has passed");
    require(!communityFundTransferExecuted, "SwapOperator: already executed");
    communityFundTransferExecuted = true;

    // transfer
    _pool().transferAssetToSwapOperator(ETH, amount);
    (bool ok, /* data */) = communityFund.call{ value: amount }("");
    require(ok, "SwapOperator: transfer failed");
  }

  function assetIsEnabled(AssetData memory assetData) internal pure returns (bool) {
    return !(assetData.minAmount == 0 && assetData.maxAmount == 0);
  }

  function _pool() internal view returns (IPool) {
    return IPool(master.getLatestAddress('P1'));
  }


  function recover(address token) public onlySwapController {

  }

  receive() external payable {}
}
