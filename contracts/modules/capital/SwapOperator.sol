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
import "../../abstract/MasterAware.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./SwapAgent.sol";
import "../oracles/PriceFeedOracle.sol";
import "./Pool.sol";


contract SwapOperator is MasterAware, ReentrancyGuard {

    using SafeERC20 for IERC20;
    using SafeMath for uint;

    mapping(address => SwapAgent.AssetData) public assetData;
    // parameters
    address public twapOracle;
    address public swapController;
    uint public minPoolEth;
    PriceFeedOracle public priceFeedOracle;
    Pool public pool;

    /* events */
    event Swapped(address indexed fromAsset, address indexed toAsset, uint amountIn, uint amountOut);

    /* logic */
    modifier onlySwapController {
        require(msg.sender == swapController, "Pool: not swapController");
        _;
    }

    /* constants */
    address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    IUniswapV2Router02 constant public router = IUniswapV2Router02(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
    uint constant public MAX_LIQUIDITY_RATIO = 3 * 1e15;

    function swapETHForAsset(
        address toTokenAddress,
        uint amountIn,
        uint amountOutMin
    ) external whenNotPaused onlySwapController nonReentrant {

        SwapAgent.AssetData storage assetDetails = assetData[toTokenAddress];

        pool.transferAssetTo(ETH, address(this), amountIn);
        uint amountOut = SwapAgent.swapETHForAsset(
            twapOracle,
            assetDetails,
            toTokenAddress,
            amountIn,
            amountOutMin,
            minPoolEth
        );
        transferAssetTo(toTokenAddress, address(pool), amountOut);

        emit Swapped(ETH, toTokenAddress, amountIn, amountOut);
    }

    function swapAssetForETH(
        address fromTokenAddress,
        uint amountIn,
        uint amountOutMin
    ) external whenNotPaused onlySwapController nonReentrant {

        pool.transferAssetTo(fromTokenAddress, address(this), amountIn);
        uint amountOut = SwapAgent.swapAssetForETH(
            twapOracle,
            assetData[fromTokenAddress],
            fromTokenAddress,
            amountIn,
            amountOutMin
        );
        transferAssetTo(ETH, address(pool), amountOut);
        emit Swapped(fromTokenAddress, ETH, amountIn, amountOut);
    }


    function transferAssetTo (address asset, address to, uint amount) internal {

        if (asset == ETH) {
            (bool ok, /* data */) = to.call.value(amount)("");
            require(ok, "Pool: Eth transfer failed");
            return;
        }

        IERC20 token = IERC20(asset);
        token.safeTransfer(to, amount);
    }

}
