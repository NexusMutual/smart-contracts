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
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../../abstract/MasterAware.sol";
import "../../external/uniswap/IUniswapV2Router02.sol";
import "../oracles/UniswapOracle.sol";

contract Pool is MasterAware, ReentrancyGuard {
  using SafeMath for uint;
  using SafeERC20 for IERC20;

  /* storage */

  IUniswapV2Router02 public router;
  UniswapOracle public twapOracle;
  address public swapController;

  address[] public assets;
  mapping(address => uint) public minAmount;
  mapping(address => uint) public maxAmount;
  mapping(address => uint) public lastSwapTime;

  /* constants */

  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  // 18 decimals of precision. 1e14 = 0.0001 = 0.01%, 3 * 1e15 = 0.3%
  uint constant public MAX_SLIPPAGE = 1e14;
  uint constant public MAX_TRADABLE_PAIR_LIQUIDITY = 3 * 1e15;

  /* events */

  event Swapped(address indexed fromAsset, address indexed toAsset, uint amountIn, uint amountOut);

  /* logic */

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
    twapOracle = UniswapOracle(_oracle);
    swapController = _swapController;
  }

  // fallback function
  function() external payable {}

  // for Pool1 upgrade compatibility
  function sendEther() external payable {}

  /* swap functions */

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

  function swapETHForTokens(address toTokenAddress, uint amountIn, uint amountOutMin) external onlySwapController nonReentrant {

    IERC20 toToken = IERC20(toTokenAddress);
    uint balanceBefore = toToken.balanceOf(address(this));

    {
      // scope for liquidity check
      address pairAddress = twapOracle.pairFor(ETH, toTokenAddress);
      IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
      (uint112 reserve0, uint112 reserve1, /* time */) = pair.getReserves();

      uint ethReserve = ETH < toTokenAddress ? reserve0 : reserve1;
      uint maxTradable = ethReserve.mul(MAX_TRADABLE_PAIR_LIQUIDITY).div(1e18);

      require(amountIn <= maxTradable, 'exceeds max tradable amount');
    }

    {
      // scope for ether checks
      uint ethBalanceBefore = address(this).balance;
      uint ethBalanceAfter = ethBalanceBefore.sub(amountIn);
      uint minEth = minAmount[ETH];

      require(ethBalanceAfter >= minEth, 'inssufficient ether left');
    }

    {
      // scope for token checks
      uint min = minAmount[toTokenAddress];
      uint max = maxAmount[toTokenAddress];

      uint avgAmountOut = twapOracle.consult(ETH, amountIn, toTokenAddress);
      uint maxSlippageAmount = avgAmountOut.mul(MAX_SLIPPAGE).div(1e18);
      uint minOutOnMaxSlippage = avgAmountOut.sub(maxSlippageAmount);

      require(amountOutMin > minOutOnMaxSlippage, 'max slippage exceeded');
      require(balanceBefore < min, 'balanceBefore >= min');
      require(balanceBefore.add(amountOutMin) <= max, 'balanceAfter > max');
    }

    address[] memory path = new address[](2);
    path[0] = router.WETH();
    path[1] = toTokenAddress;
    router.swapExactETHForTokens.value(amountIn)(amountOutMin, path, address(this), block.timestamp);

    uint balanceAfter = toToken.balanceOf(address(this));
    uint amountOut = balanceAfter.sub(balanceBefore);
    require(balanceAfter.sub(balanceBefore) >= amountOutMin, 'amount out too small');

    emit Swapped(ETH, toTokenAddress, amountIn, amountOut);
  }

  function swapTokensForETH(address fromTokenAddress, uint amountIn, uint amountOutMin) external onlySwapController nonReentrant {

    IERC20 fromToken = IERC20(fromTokenAddress);
    uint balanceBefore = address(this).balance;

    {
      // scope for liquidity check
      address pairAddress = twapOracle.pairFor(fromTokenAddress, ETH);
      IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
      (uint112 reserve0, uint112 reserve1, /* time */) = pair.getReserves();

      uint tokenReserve = fromTokenAddress < ETH ? reserve0 : reserve1;
      uint maxTradable = tokenReserve.mul(MAX_TRADABLE_PAIR_LIQUIDITY).div(1e18);

      require(amountIn <= maxTradable, 'exceeds max tradable amount');
    }

    {
      // scope for token checks
      uint min = minAmount[fromTokenAddress];
      uint max = maxAmount[fromTokenAddress];

      uint avgAmountOut = twapOracle.consult(fromTokenAddress, amountIn, ETH);
      uint maxSlippageAmount = avgAmountOut.mul(MAX_SLIPPAGE).div(1e18);
      uint minOutOnMaxSlippage = avgAmountOut.sub(maxSlippageAmount);

      require(amountOutMin > minOutOnMaxSlippage, 'max slippage exceeded');
      require(balanceBefore < min, 'balanceBefore >= min');
      require(balanceBefore.add(amountOutMin) <= max, 'balanceAfter > max');
    }

    address[] memory path = new address[](2);
    path[0] = address(fromToken);
    path[1] = router.WETH();
    fromToken.safeApprove(address(router), amountIn);
    router.swapExactTokensForETH(amountIn, amountOutMin, path, address(this), block.timestamp);

    uint balanceAfter = address(this).balance;
    uint amountOut = balanceAfter.sub(balanceBefore);
    require(amountOut >= amountOutMin, 'amount out too small');

    emit Swapped(fromTokenAddress, ETH, amountIn, amountOut);
  }

  /* pool lifecycle functions */

  function transferAsset(address asset, uint amount, address payable destination) external onlyGovernance nonReentrant {

    require(maxAmount[asset] == 0, 'max not zero');
    require(destination != address(0), 'dest zero');

    IERC20 token = IERC20(asset);
    uint balance = token.balanceOf(address(this));
    uint transferable = amount > balance ? balance : amount;

    token.safeTransfer(destination, transferable);
  }

  function upgradePool(address payable newPoolAddress) external onlyGovernance nonReentrant {

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
