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
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../external/uniswap/IUniswapV2Router02.sol";
import "../oracles/TwapOracle.sol";

library SwapAgent {
  using SafeMath for uint;

  struct AssetData {
    uint112 minAmount;
    uint112 maxAmount;
    uint32 lastSwapTime;
    // 18 decimals of precision. 0.01% -> 0.0001 -> 1e14
    uint maxSlippageRatio;
  }

  IUniswapV2Router02 constant public router = IUniswapV2Router02(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
  uint constant public MAX_LIQUIDITY_RATIO = 3 * 1e15;

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

  function swapETHForAsset(
    address _oracle,
    AssetData storage assetData,
    address toTokenAddress,
    uint amountIn,
    uint amountOutMin,
    uint minLeftETH
  ) external returns (uint) {

    uint balanceBefore = IERC20(toTokenAddress).balanceOf(address(this));
    address WETH = router.WETH();

    {
      // scope for swap frequency check
      uint timeSinceLastTrade = block.timestamp.sub(uint(assetData.lastSwapTime));
      require(timeSinceLastTrade > TwapOracle(_oracle).periodSize(), "SwapAgent: too fast");
    }

    {
      // scope for liquidity check
      address pairAddress = TwapOracle(_oracle).pairFor(WETH, toTokenAddress);
      IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
      (uint112 reserve0, uint112 reserve1, /* time */) = pair.getReserves();

      uint ethReserve = WETH < toTokenAddress ? reserve0 : reserve1;
      uint maxTradable = ethReserve.mul(MAX_LIQUIDITY_RATIO).div(1e18);

      require(amountIn <= maxTradable, "SwapAgent: exceeds max tradable amount");
    }

    {
      // scope for ether checks
      uint ethBalanceBefore = address(this).balance;
      uint ethBalanceAfter = ethBalanceBefore.sub(amountIn);
      require(ethBalanceAfter >= minLeftETH, "SwapAgent: insufficient ether left");
    }

    {
      // scope for token checks
      uint avgAmountOut = TwapOracle(_oracle).consult(WETH, amountIn, toTokenAddress);
      uint maxSlippageAmount = avgAmountOut.mul(assetData.maxSlippageRatio).div(1e18);
      uint minOutOnMaxSlippage = avgAmountOut.sub(maxSlippageAmount);

      // gas optimisation: reads both values using a single SLOAD
      (uint minAssetAmount, uint maxAssetAmount) = (assetData.minAmount, assetData.maxAmount);

      require(amountOutMin >= minOutOnMaxSlippage, "SwapAgent: amountOutMin < minOutOnMaxSlippage");
      require(balanceBefore < minAssetAmount, "SwapAgent: balanceBefore >= min");
      require(balanceBefore.add(amountOutMin) <= maxAssetAmount, "SwapAgent: balanceAfter > max");
    }

    address[] memory path = new address[](2);
    path[0] = WETH;
    path[1] = toTokenAddress;
    router.swapExactETHForTokens.value(amountIn)(amountOutMin, path, address(this), block.timestamp);

    assetData.lastSwapTime = uint32(block.timestamp);

    uint balanceAfter = IERC20(toTokenAddress).balanceOf(address(this));
    uint amountOut = balanceAfter.sub(balanceBefore);

    return amountOut;
  }

  function swapAssetForETH(
    address _oracle,
    AssetData storage assetData,
    address fromTokenAddress,
    uint amountIn,
    uint amountOutMin
  ) external returns (uint) {

    uint tokenBalanceBefore = IERC20(fromTokenAddress).balanceOf(address(this));
    uint balanceBefore = address(this).balance;
    address WETH = router.WETH();

    {
      // scope for swap frequency check
      uint timeSinceLastTrade = block.timestamp.sub(uint(assetData.lastSwapTime));
      require(timeSinceLastTrade > TwapOracle(_oracle).periodSize(), "SwapAgent: too fast");
    }

    {
      // scope for liquidity check
      address pairAddress = TwapOracle(_oracle).pairFor(fromTokenAddress, WETH);
      IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
      (uint112 reserve0, uint112 reserve1, /* time */) = pair.getReserves();

      uint tokenReserve = fromTokenAddress < WETH ? reserve0 : reserve1;
      uint maxTradable = tokenReserve.mul(MAX_LIQUIDITY_RATIO).div(1e18);

      require(amountIn <= maxTradable, "SwapAgent: exceeds max tradable amount");
    }

    {
      // scope for token checks
      uint avgAmountOut = TwapOracle(_oracle).consult(fromTokenAddress, amountIn, WETH);
      uint maxSlippageAmount = avgAmountOut.mul(assetData.maxSlippageRatio).div(1e18);
      uint minOutOnMaxSlippage = avgAmountOut.sub(maxSlippageAmount);

      // gas optimisation: reads both values using a single SLOAD
      (uint minAssetAmount, uint maxAssetAmount) = (assetData.minAmount, assetData.maxAmount);

      require(amountOutMin >= minOutOnMaxSlippage, "SwapAgent: amountOutMin < minOutOnMaxSlippage");
      require(tokenBalanceBefore > maxAssetAmount, "SwapAgent: tokenBalanceBefore <= max");
      require(tokenBalanceBefore.sub(amountIn) >= minAssetAmount, "SwapAgent: tokenBalanceAfter < min");
    }

    address[] memory path = new address[](2);
    path[0] = fromTokenAddress;
    path[1] = router.WETH();
    IERC20(fromTokenAddress).approve(address(router), amountIn);
    router.swapExactTokensForETH(amountIn, amountOutMin, path, address(this), block.timestamp);

    assetData.lastSwapTime = uint32(block.timestamp);

    uint balanceAfter = address(this).balance;
    uint amountOut = balanceAfter.sub(balanceBefore);

    return amountOut;
  }

}
