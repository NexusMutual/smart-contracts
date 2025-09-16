// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import "../../abstract/ReentrancyGuard.sol";
import "../../abstract/RegistryAware.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ISafeTracker.sol";

contract SafeTracker is ISafeTracker, RegistryAware, ReentrancyGuard {

  // master + mapping
  uint[2] internal _unused;
  uint public coverReInvestmentUSDC;

  string public constant symbol = "NXMIS";
  string public constant name = "NXMIS";
  uint8 public constant decimals = 18;

  address public immutable safe;
  uint public immutable investmentLimit;

  IERC20 public immutable usdc;
  IERC20 public immutable weth;
  IERC20 public immutable aweth;
  IERC20 public immutable debtUsdc;
  IPool public immutable pool;

  /* ========== CONSTRUCTOR ========== */

  constructor(
    address _registry,
    uint _investmentLimit,
    address _safe,
    address _usdc,
    address _weth,
    address _aweth,
    address _debtUsdc
  ) RegistryAware(_registry) {

    require(
      _usdc != address(0) && _weth != address(0) && _aweth != address(0) && _debtUsdc != address(0),
      "SafeTracker: tokens address cannot be zero address"
    );

    investmentLimit = _investmentLimit;
    safe = _safe;
    usdc = IERC20(_usdc);
    weth = IERC20(_weth);
    aweth = IERC20(_aweth);
    debtUsdc = IERC20(_debtUsdc);
    pool = IPool(fetch(C_POOL));
  }

  /**
  * @dev Gets the balance of the safe
  * @return An uint256 representing the amount of the safe.
  */
  function totalSupply() external view returns (uint256) {
    return _calculateBalance();
  }

  /**
  * @dev Gets the balance of the safe
  * @return An uint256 representing the amount of the safe.
  */
  function balanceOf(address account) external view returns (uint256) {
    return account == address(pool) ? _calculateBalance() : 0;
  }

  /**
  * @dev Updates invested USDC in CoverRe
  */
  function updateCoverReInvestmentUSDC(uint investedUSDC) external {

    require(msg.sender == safe, OnlySafe());
    require(investedUSDC <= investmentLimit, InvestmentSurpassesLimit());

    coverReInvestmentUSDC = investedUSDC;
    emit CoverReInvestmentUSDCUpdated(investedUSDC);
  }

  function transferAssetToSafe(
    address assetAddress,
    uint amount
  ) external onlyContracts(C_GOVERNOR) whenNotPaused(PAUSE_GLOBAL) nonReentrant {
    pool.transferAssetToSafe(assetAddress, safe, amount);
  }

  /**
  * @dev emits Transfer event only if it's called by Pool or SwapOperator
  */
  function transfer(address to, uint256 amount) external returns (bool) {
    return _transfer(msg.sender, to, amount);
  }

  /**
  * @dev emits Transfer event only if it's called by Pool or SwapOperator
  */
  function transferFrom(address from, address to, uint256 amount) external returns (bool) {
    return _transfer(from, to, amount);
  }

  function allowance(address, address) external pure returns (uint256) {
    return 0;
  }

  function approve(address spender, uint256 value) external override returns (bool) {
    emit Approval(msg.sender, spender, value);
    return true;
  }

  /**
   * @dev Returns the latest answer for the price of NXMIS in ETH
   * @dev Same signature as Aggregator.latestAnswer so we can use it as its own oracle
   * @return 1e18 (1 NXMIS = 1 ETH)
   */
  function latestAnswer() external pure returns (uint256) {
    return 1 ether;
  }

  /**
  * @dev Fetches all necessary information about the tokens that are used in the safe and calculates the balance
  * @return balance ETH value of the safe.
  */
  function _calculateBalance() internal view returns (uint256 balance) {

    // eth in the safe, weth and aweth balance, weth and aweth are 1:1 to eth
    uint ethAmount = address(safe).balance + weth.balanceOf(safe) + aweth.balanceOf(safe);

    // usdc actually in the safe and usdc invested in CoverRe
    uint usdcAmount = usdc.balanceOf(safe) + coverReInvestmentUSDC;
    uint usdcValueInEth = pool.getEthForAsset(address(usdc), usdcAmount);

    // usdc debt (borrowed usdc)
    uint debtUsdcAmount = debtUsdc.balanceOf(safe);
    uint debtUsdcValueInEth = pool.getEthForAsset(address(usdc), debtUsdcAmount);

    return ethAmount + usdcValueInEth - debtUsdcValueInEth;
  }

  function _transfer(address from, address to, uint256 amount) internal returns (bool) {

    require(amount == 0 || msg.sender == address(pool), AmountExceedsBalance());

    emit Transfer(from, to, amount);
    return true;
  }

}
