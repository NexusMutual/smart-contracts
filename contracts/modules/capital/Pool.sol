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
import "../../abstract/MasterAware.sol";
import "../../external/uniswap/IUniswapV2Router02.sol";
import "./OracleAggregator.sol";

contract Pool is MasterAware, ReentrancyGuard {
  using SafeMath for uint;
  using SafeERC20 for IERC20;

  IUniswapV2Router02 public router;
  OracleAggregator public oracle;
  address public swapController;

  address[] public assets;
  mapping(address => uint) public minAmount;
  mapping(address => uint) public maxAmount;
  mapping(address => uint) public lastSwapTime;

  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  modifier onlySwapController {
    require(msg.sender == swapController, '!swapController');
    _;
  }

  constructor (
    address[] memory _assets,
    uint[] memory _minAmounts,
    uint[] memory _maxAmounts,
    address _router,
    address _oracle,
    address _swapController
  ) public {

    require(_assets.length == _minAmounts.length, '!length');
    require(_assets.length == _maxAmounts.length, '!length');

    // ETH is at assets[0]
    assets.push(ETH);

    for (uint i = 0; i < _assets.length; i++) {
      assets.push(_assets[i]);
      minAmount[_assets[i]] = _minAmounts[i];
      maxAmount[_assets[i]] = _maxAmounts[i];
    }

    router = IUniswapV2Router02(_router);
    oracle = OracleAggregator(_oracle);
    swapController = _swapController;
  }

  // fallback function
  function() external payable {}

  // for Pool1 upgrade compatibility
  function sendEther() external payable {}

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

  function swapETHForTokens(address toToken, uint amountIn, uint amountOutMin) external onlySwapController {
  }

  function swapTokensForETH(address fromToken, uint amountIn, uint amountOutMin) external onlySwapController {
  }

  function _swapETHForTokens(IERC20 toToken, uint amountIn, uint amountOutMin) internal {

    uint amountBefore = toToken.balanceOf(address(this));

    address[] memory path = new address[](2);
    path[0] = router.WETH();
    path[1] = address(toToken);

    router.swapExactETHForTokens.value(amountIn)(amountOutMin, path, address(this), block.timestamp);

    uint amountAfter = toToken.balanceOf(address(this));
    require(amountAfter.sub(amountBefore) >= amountOutMin, 'deficit');
  }

  function _swapTokensForETH(IERC20 fromToken, uint amountIn, uint amountOutMin) internal {

    uint amountBefore = address(this).balance;

    address[] memory path = new address[](2);
    path[0] = address(fromToken);
    path[1] = router.WETH();

    fromToken.safeApprove(address(router), amountIn);
    router.swapExactTokensForETH(amountIn, amountOutMin, path, address(this), block.timestamp);

    uint amountAfter = address(this).balance;
    require(amountAfter.sub(amountBefore) >= amountOutMin, 'deficit');
  }

  function transferAsset(address asset, uint amount, address payable destination) external onlyGovernance {

    require(maxAmount[asset] == 0, 'max not zero');

    IERC20 token = IERC20(asset);
    uint balance = token.balanceOf(address(this));
    uint transferable = amount > balance ? balance : amount;

    token.safeTransfer(destination, transferable);
  }

  function upgradePool(address payable newPoolAddress) external onlyGovernance {

    for (uint i = 0; i < assets.length; i++) {

      if (assets[i] == ETH) {
        uint amount = address(this).balance;
        (bool ok, /* data */) = newPoolAddress.call.value(amount)("");
        require(ok, 'transfer failed');
        continue;
      }

      IERC20 token = IERC20(assets[i]);
      uint amount = token.balanceOf(address(this));
      token.safeTransfer(newPoolAddress, amount);
    }

  }

}
