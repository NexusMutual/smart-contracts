pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../../abstract/MasterAware.sol";
import "./SwapAgent.sol";

contract Pool is MasterAware, ReentrancyGuard {
  using SafeMath for uint;
  using SafeERC20 for IERC20;

  struct AssetData {
    uint112 minAmount;
    uint112 maxAmount;
    uint32 lastSwapTime;
    // 18 decimals of precision. 0.01% -> 0.0001 -> 1e14
    uint maxSlippageRatio;
  }

  /* storage */
  address[] public assets;
  mapping(address => AssetData) public assetData;

  address public twapOracle;
  address public swapController;
  uint112 public minPoolEth;
  bool public swapsEnabled = true;

  /* constants */
  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  /* events */
  event Swapped(address indexed fromAsset, address indexed toAsset, uint amountIn, uint amountOut);

  /* logic */
  modifier onlySwapController {
    require(msg.sender == swapController, "Pool: not swapController");
    _;
  }

  modifier whenSwapsEnabled {
    require(swapsEnabled, "Pool: swaps not enabled");
    _;
  }

  constructor (
    address[] memory _assets,
    uint112[] memory _minAmounts,
    uint112[] memory _maxAmounts,
    uint[] memory _maxSlippageRatios,
    address _master,
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
    twapOracle = _twapOracle;
    swapController = _swapController;
  }

  // fallback function
  function() external payable {}

  // for Pool1 upgrade compatibility
  function sendEther() external payable {}

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
    AssetData memory data = assetData[_asset];

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
    assetData[_asset] = AssetData(_min, _max, 0, _maxSlippageRatio);
  }

  function removeAsset(address _asset) external onlyGovernance {

    IERC20 token = IERC20(_asset);
    uint tokenBalance = token.balanceOf(address(this));

    require(tokenBalance == 0, "Pool: balance must be 0");

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
  ) external whenNotPaused whenSwapsEnabled onlySwapController nonReentrant {

    uint amountOut = SwapAgent.swapETHForAsset(
      twapOracle,
      assetData[toTokenAddress],
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
  ) external whenNotPaused whenSwapsEnabled onlySwapController nonReentrant {

    uint amountOut = SwapAgent.swapAssetForETH(
      twapOracle,
      assetData[fromTokenAddress],
      fromTokenAddress,
      amountIn,
      amountOutMin
    );

    emit Swapped(fromTokenAddress, ETH, amountIn, amountOut);
  }

  /* pool lifecycle functions */

  function transferAsset(address asset, uint amount, address payable destination) external onlyGovernance nonReentrant {

    require(assetData[asset].maxAmount == 0, "Pool: max not zero");
    require(destination != address(0), "Pool: dest zero");

    IERC20 token = IERC20(asset);
    uint balance = token.balanceOf(address(this));
    uint transferable = amount > balance ? balance : amount;

    token.safeTransfer(destination, transferable);
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

}
