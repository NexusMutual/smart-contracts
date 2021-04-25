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
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../oracles/PriceFeedOracle.sol";
import "./Pool.sol";
import "hardhat/console.sol";


contract SwapOperator is ReentrancyGuard {

    using SafeERC20 for IERC20;
    using SafeMath for uint;

    TwapOracle public twapOracle;
    address public swapController;
    Pool public pool;

    /* events */
    event Swapped(address indexed fromAsset, address indexed toAsset, uint amountIn, uint amountOut);

    /* logic */
    modifier onlySwapController {
        require(msg.sender == swapController, "SwapOperator: not swapController");
        _;
    }

    modifier whenNotPaused {
        require(!pool.master().isPause(), "System is paused");
        _;
    }

    /* constants */
    address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address constant public STETH = 0x20dC62D5904633cC6a5E34bEc87A048E80C92e97;
    IUniswapV2Router02 constant public router = IUniswapV2Router02(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
    uint constant public MAX_LIQUIDITY_RATIO = 3 * 1e15;

    struct AssetData {
        uint112 minAmount;
        uint112 maxAmount;
        uint32 lastSwapTime;
        // 18 decimals of precision. 0.01% -> 0.0001 -> 1e14
        uint maxSlippageRatio;
    }

    constructor(address payable _pool, address _twapOracle, address _swapController) public {
        pool = Pool(_pool);
        twapOracle = TwapOracle(_twapOracle);
        swapController = _swapController;
    }

    function swapETHForAsset(
        address toTokenAddress,
        uint amountIn,
        uint amountOutMin
    ) external whenNotPaused onlySwapController nonReentrant {

        (
        /* uint balance */,
        uint112 min,
        uint112 max,
        uint32 lastAssetSwapTime,
        uint maxSlippageRatio
        ) = pool.getAssetDetails(toTokenAddress);

        AssetData memory assetDetails = AssetData(min, max, lastAssetSwapTime, maxSlippageRatio);

        pool.transferAssetTo(ETH, address(this), amountIn);
        pool.setAssetDataLatestLastSwapTime(toTokenAddress, uint32(block.timestamp));
        uint amountOut = swapETHForAsset(
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
    ) external whenNotPaused onlySwapController nonReentrant {

        (
        /* uint balance */,
        uint112 min,
        uint112 max,
        uint32 lastAssetSwapTime,
        uint maxSlippageRatio
        ) = pool.getAssetDetails(fromTokenAddress);

        AssetData memory assetDetails = AssetData(min, max, lastAssetSwapTime, maxSlippageRatio);

        pool.transferAssetTo(fromTokenAddress, address(this), amountIn);
        pool.setAssetDataLatestLastSwapTime(fromTokenAddress, uint32(block.timestamp));
        uint amountOut = swapAssetForETH(
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

    function swapETHForAsset(
        AssetData memory assetData,
        address toTokenAddress,
        uint amountIn,
        uint amountOutMin,
        uint minLeftETH
    ) internal returns (uint) {

        uint balanceBefore = IERC20(toTokenAddress).balanceOf(address(pool));
        address WETH = router.WETH();

        {
            // scope for swap frequency check
            uint timeSinceLastTrade = block.timestamp.sub(uint(assetData.lastSwapTime));
            require(timeSinceLastTrade > twapOracle.periodSize(), "SwapAgent: too fast");
        }

        {
            // scope for liquidity check
            address pairAddress = twapOracle.pairFor(WETH, toTokenAddress);
            IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
            (uint112 reserve0, uint112 reserve1, /* time */) = pair.getReserves();

            uint ethReserve = WETH < toTokenAddress ? reserve0 : reserve1;
            uint maxTradable = ethReserve.mul(MAX_LIQUIDITY_RATIO).div(1e18);

            require(amountIn <= maxTradable, "SwapAgent: exceeds max tradable amount");
        }

        {
            // scope for ether checks
            uint ethBalanceBefore = address(pool).balance.add(amountIn);
            uint ethBalanceAfter = address(pool).balance;

            require(ethBalanceAfter >= minLeftETH, "SwapAgent: insufficient ether left");
        }

        {
            // scope for token checks
            uint avgAmountOut = twapOracle.consult(WETH, amountIn, toTokenAddress);
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

        uint amountOut = IERC20(toTokenAddress).balanceOf(address(this));

        return amountOut;
    }

    function swapAssetForETH(
        AssetData memory assetData,
        address fromTokenAddress,
        uint amountIn,
        uint amountOutMin
    ) internal returns (uint) {

        uint tokenBalanceBefore = IERC20(fromTokenAddress).balanceOf(address(pool)).add(amountIn);
        uint balanceBefore = address(pool).balance;
        address WETH = router.WETH();

        {
            // scope for swap frequency check
            uint timeSinceLastTrade = block.timestamp.sub(uint(assetData.lastSwapTime));
            require(timeSinceLastTrade > twapOracle.periodSize(), "SwapAgent: too fast");
        }

        {
            // scope for liquidity check
            address pairAddress = twapOracle.pairFor(fromTokenAddress, WETH);
            IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
            (uint112 reserve0, uint112 reserve1, /* time */) = pair.getReserves();

            uint tokenReserve = fromTokenAddress < WETH ? reserve0 : reserve1;
            uint maxTradable = tokenReserve.mul(MAX_LIQUIDITY_RATIO).div(1e18);

            require(amountIn <= maxTradable, "SwapAgent: exceeds max tradable amount");
        }

        {
            // scope for token checks
            uint avgAmountOut = twapOracle.consult(fromTokenAddress, amountIn, WETH);
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

        uint amountOut = address(this).balance;

        return amountOut;
    }

    function transferAssetTo (address asset, address to, uint amount) internal {

        if (asset == ETH) {
            (bool ok, /* data */) = to.call.value(amount)("");
            require(ok, "SwapOperator: Eth transfer failed");
            return;
        }

        IERC20 token = IERC20(asset);
        token.safeTransfer(to, amount);
    }

    function swapETHforStETH(uint amountIn, uint amountOutMin) external whenNotPaused onlySwapController nonReentrant {

        address toTokenAddress = STETH;
        (
        /* uint balance */,
        uint112 minAmount,
        uint112 maxAmount,
        /* uint32 lastAssetSwapTime */,
        /* uint maxSlippageRatio */
        ) = pool.getAssetDetails(toTokenAddress);

        uint balanceBefore = IERC20(toTokenAddress).balanceOf(address(this));

        (bool ok, /* data */) = toTokenAddress.call.value(amountIn)("");
        require(ok, "SwapOperator: stEth transfer failed");

        pool.setAssetDataLatestLastSwapTime(toTokenAddress, uint32(block.timestamp));

        uint balanceAfter = IERC20(toTokenAddress).balanceOf(address(this));
        uint amountOut = balanceAfter.sub(balanceBefore);

        require(amountOut >= amountOutMin, "SwapOperator: amountOut < amountOutMin");

        // gas optimisation: reads both values using a single SLOAD
        (uint minAssetAmount, uint maxAssetAmount) = (minAmount, maxAmount);

        require(balanceBefore < minAssetAmount, "SwapOperator: balanceBefore >= min");
        require(balanceBefore.add(amountOutMin) <= maxAssetAmount, "SwapOperator: balanceAfter > max");
    }

    // fallback function
    function() external payable {}
}
