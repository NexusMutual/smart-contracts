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
  // TODO: make oracle and controller updatable parameters
  UniswapOracle public twapOracle;
  address public swapController;

  address[] public assets;
  mapping(address => uint) public minAmount;
  mapping(address => uint) public maxAmount;
  mapping(address => uint) public lastSwapTime;

  /* constants */

  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  // 18 decimals of precision. 0.01% -> 0.0001 -> 1e14
  uint constant public MAX_SLIPPAGE = 1e14;

  // 0.3% -> 0.003 -> 3 * 1e15
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
    address _master,
    address _router,
    address _twapOracle,
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

    master = INXMMaster(_master);
    router = IUniswapV2Router02(_router);
    twapOracle = UniswapOracle(_twapOracle);
    swapController = _swapController;
  }

  // fallback function
  function() external payable {}

  // for Pool1 upgrade compatibility
  function sendEther() external payable {}

  /* asset related functions */

  function getAssets() external view returns (address[] assets) {
    return assets;
  }

  function getAssetMinMax(address _asset) external view returns (uint min, uint max) {
    return (minAmount[_asset], maxAmount[_asset]);
  }

  function addAsset(address _asset, uint _min, uint _max) external onlyGovernance {

    for (uint i = 0; i < assets.length; i++) {
      require(_asset != assets[i], 'asset exists');
    }

    assets.push(_asset);
    minAmount[_asset] = _min;
    maxAmount[_asset] = _max;
  }

  function removeAsset(address _asset) external onlyGovernance {

    IERC20 token = IERC20(_asset);
    uint tokenBalance = token.balanceOf(address(this));

    require(tokenBalance == 0, 'balance must be 0');

    for (uint i = 0; i < assets.length; i++) {

      if (_asset != assets[i]) {
        continue;
      }

      uint lastAssetIndex = assets.length - 1;
      assets[i] = assets[lastAssetIndex];
      assets.pop();

      minAmount[_asset] = 0;
      maxAmount[_asset] = 0;

      return;
    }

    require(false, 'asset not found');
  }

  function setAssetMinMax(address _asset, uint _min, uint _max) external onlyGovernance {
    require(_min <= _max, 'min > max');
    minAmount[_asset] = _min;
    maxAmount[_asset] = _max;
  }

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

  function swapETHForTokens(
    address toTokenAddress,
    uint amountIn,
    uint amountOutMin
  ) external onlySwapController nonReentrant {

    IERC20 toToken = IERC20(toTokenAddress);
    uint balanceBefore = toToken.balanceOf(address(this));

    // TODO: should we allow more frequent trades?
    uint timeSinceLastTrade = block.timestamp.sub(lastSwapTime[toTokenAddress]);
    require(timeSinceLastTrade > twapOracle.periodSize(), 'too fast');

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
      require(ethBalanceAfter >= minAmount[ETH], 'insufficient ether left');
    }

    {
      // scope for token checks
      uint avgAmountOut = twapOracle.consult(ETH, amountIn, toTokenAddress);
      uint maxSlippageAmount = avgAmountOut.mul(MAX_SLIPPAGE).div(1e18);
      uint minOutOnMaxSlippage = avgAmountOut.sub(maxSlippageAmount);

      require(amountOutMin > minOutOnMaxSlippage, 'max slippage exceeded');
      require(balanceBefore < minAmount[toTokenAddress], 'balanceBefore >= min');
      require(balanceBefore.add(amountOutMin) <= maxAmount[toTokenAddress], 'balanceAfter > max');
    }

    address[] memory path = new address[](2);
    path[0] = router.WETH();
    path[1] = toTokenAddress;
    // TODO: pass deadline from off-chain?
    router.swapExactETHForTokens.value(amountIn)(amountOutMin, path, address(this), block.timestamp);

    uint balanceAfter = toToken.balanceOf(address(this));
    uint amountOut = balanceAfter.sub(balanceBefore);
    require(balanceAfter.sub(balanceBefore) >= amountOutMin, 'amount out too small');

    lastSwapTime[toTokenAddress] = block.timestamp;

    emit Swapped(ETH, toTokenAddress, amountIn, amountOut);
  }

  function swapTokensForETH(
    address fromTokenAddress,
    uint amountIn,
    uint amountOutMin
  ) external onlySwapController nonReentrant {

    IERC20 fromToken = IERC20(fromTokenAddress);
    uint balanceBefore = address(this).balance;

    // TODO: should we allow more frequent trades?
    uint timeSinceLastTrade = block.timestamp.sub(lastSwapTime[fromTokenAddress]);
    require(timeSinceLastTrade > twapOracle.periodSize(), 'too fast');

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
      uint avgAmountOut = twapOracle.consult(fromTokenAddress, amountIn, ETH);
      uint maxSlippageAmount = avgAmountOut.mul(MAX_SLIPPAGE).div(1e18);
      uint minOutOnMaxSlippage = avgAmountOut.sub(maxSlippageAmount);

      require(amountOutMin > minOutOnMaxSlippage, 'max slippage exceeded');
      require(balanceBefore > maxAmount[fromTokenAddress], 'balanceBefore <= max');
      require(balanceBefore.sub(amountIn) >= minAmount[fromTokenAddress], 'balanceAfter < min');
    }

    address[] memory path = new address[](2);
    path[0] = address(fromToken);
    path[1] = router.WETH();
    fromToken.safeApprove(address(router), amountIn);
    // TODO: pass deadline from off-chain?
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

  function upgradeCapitalPool(address payable newPoolAddress) external onlyMaster nonReentrant {

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
