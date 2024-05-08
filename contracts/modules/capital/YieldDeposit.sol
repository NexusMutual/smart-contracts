// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts-v4/access/Ownable.sol";
import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../interfaces/IYieldDeposit.sol";

/// @title Yield Deposit
/// @notice Contract for depositing yield bearing tokens and using the yield to manually purchase cover for the user

contract YieldDeposit is IYieldDeposit, Ownable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  /* ========== STATE VARIABLES ========== */

  AggregatorV3Interface internal priceFeed;
  IERC20 public token;
  uint8 public tokenDecimals;
  uint16 public coverPricePercentage; // between 0 - 10,000
  // TODO: do we need productId?
  // uint public productId;

  mapping(address => uint256) public deposits; // User's principal deposits
  mapping(address => uint256) public coverAmounts;
  mapping(address => uint256) public initialRates;

  uint public totalDeposit;
  uint public availableYield;
  uint public previousRate;

  /* ========== CONSTANTS ========== */

  uint private constant PRICE_DENOMINATOR = 10_000;

  /* ========== CONSTRUCTOR ========== */

  constructor(
    address _manager,
    address _tokenAddress,
    uint8 _decimals,
    address _priceFeedAddress,
    uint16 _coverPricePercentage
  ) {
    token = IERC20(_tokenAddress);
    tokenDecimals = _decimals;
    priceFeed = AggregatorV3Interface(_priceFeedAddress);
    coverPricePercentage = _coverPricePercentage;
    transferOwnership(_manager);
  }

  /**
   * @notice Deposits a specified amount of tokens into the contract.
   * @dev User can must withdraw first to change their deposit amount.
   *      Reverts with `InvalidDepositAmount` if the deposit amount is zero or negative.
   * @param amount The quantity of tokens to deposit.
   */
  function deposit(uint256 amount) external {
    if (deposits[msg.sender] > 0) {
      revert WithdrawBeforeMakingNewDeposit();
    }
    if (amount <= 0) {
      revert InvalidDepositAmount();
    }

    token.safeTransferFrom(msg.sender, address(this), amount);

    uint currentRate = getCurrentTokenRate();
    recalculateAvailableYield(currentRate);

    deposits[msg.sender] += amount;
    initialRates[msg.sender] = currentRate;
    totalDeposit = amount * currentRate;

    uint coverAmount = (amount * currentRate * coverPricePercentage) / PRICE_DENOMINATOR / (10 ** tokenDecimals);
    coverAmounts[msg.sender] = coverAmount;

    emit TokenDeposited(msg.sender, amount, coverAmount);
  }

  /**
   * @notice Withdraws the entire principal amount previously deposited by the caller.
   * @dev Transfers the deposited tokens back to the caller and resets their deposited balance to zero.
   *      This action is only possible if the caller has a positive deposited balance.
   */
  function withdraw() external nonReentrant {
    uint userDeposit = deposits[msg.sender];
    if (userDeposit <= 0) {
      revert InsufficientDepositForWithdrawal();
    }

    uint currentRate = getCurrentTokenRate();
    recalculateAvailableYield(currentRate);

    uint withdrawAmount = (userDeposit * initialRates[msg.sender]) / currentRate;

    totalDeposit -= withdrawAmount;
    deposits[msg.sender] = 0;
    coverAmounts[msg.sender] = 0;
    initialRates[msg.sender] = 0;

    token.safeTransfer(msg.sender, withdrawAmount);

    emit TokenWithdrawn(msg.sender, withdrawAmount);
  }

  /**
   * @dev Gets the current token price from the price feed contract.
   * @return uint The current token price.
   */
  function getCurrentTokenRate() public view returns (uint) {
    (, int256 price, , , ) = priceFeed.latestRoundData();
    if (price <= 0) {
      revert InvalidTokenRate();
    }
    return uint256(price);
  }

  /**
   * @notice Allows the contract owner to withdraw the accumulated yield.
   * @dev The yield is defined as the difference between the current token balance of the contract
   *      and the total principal. Reverts with `NoYieldAvailable` if there is no yield.
   */
  function withdrawAvailableYield() external onlyOwner nonReentrant {
    uint currentRate = getCurrentTokenRate();
    recalculateAvailableYield(currentRate);

    if (availableYield == 0) {
      revert NoYieldAvailable();
    }

    token.safeTransfer(owner(), availableYield);
  }

  /**
   * @dev Recalculates financial metrics based on the current token price.
   */
  function recalculateAvailableYield(uint currentRate) private {
    if (previousRate > 0 && totalDeposit > 0) {
      uint previousDeposits = totalDeposit;
      totalDeposit = (previousDeposits * previousRate) / currentRate;
      uint newYield = previousDeposits - totalDeposit; // will underflow if rate dropped
      availableYield += newYield;
    }
    previousRate = currentRate;
  }

  /**
   * @dev Updates the cover price percentage. Only the owner can call this function.
   * @param _coverPricePercentage The new cover price percentage to set.
   */
  function updateCoverPricePercentage(uint16 _coverPricePercentage) external onlyOwner {
    coverPricePercentage = _coverPricePercentage;
  }
}
