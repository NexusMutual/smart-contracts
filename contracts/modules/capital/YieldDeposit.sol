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

  mapping(address => address) public priceFeedOracle;
  mapping(address => uint16) public tokenCoverPricePercentages;
  mapping(address => mapping(address => uint)) public userTokenDepositValue; // user > token > depositValue

  mapping(address => uint) public totalDepositValue; // the total deposits for each token valued at the priceRate at the time of each deposit
  mapping(address => uint) public totalYieldWithdrawn;

  /* ========== CONSTANTS ========== */

  uint private constant PRICE_DENOMINATOR = 10_000;
  uint private constant RATE_DENOMINATOR = 1e18;

  /* ========== CONSTRUCTOR ========== */

  constructor(address _manager) {
    transferOwnership(_manager);
  }

  function listToken(address tokenAddress, address priceFeedAddress, uint16 coverPricePercentage) external onlyOwner {
    priceFeedOracle[tokenAddress] = priceFeedAddress;
    tokenCoverPricePercentages[tokenAddress] = coverPricePercentage;
  }

  /**
   * @notice Deposits a specified amount of tokens into the contract.
   * @dev User must withdraw first to change their deposit amount.
   *      Reverts with `InvalidDepositAmount` if the deposit amount is zero or negative.
   * @param amount The quantity of tokens to deposit.
   */
  function deposit(address tokenAddress, uint256 amount) external {
    if (amount <= 0) {
      revert InvalidDepositAmount();
    }

    uint currentRate = getCurrentTokenRate(tokenAddress);
    uint userDepositValue = (amount * currentRate) / RATE_DENOMINATOR;

    IERC20 token = IERC20(tokenAddress);
    token.safeTransferFrom(msg.sender, address(this), amount);

    totalDepositValue[tokenAddress] += userDepositValue;
    userTokenDepositValue[msg.sender][tokenAddress] += userDepositValue;

    emit TokenDeposited(msg.sender, amount, currentRate);
  }

  /**
   * @notice Withdraws the entire principal amount previously deposited by the caller.
   * @dev Transfers the deposited tokens back to the caller and resets their deposited balance to zero.
   *      This action is only possible if the caller has a positive deposited balance.
   * @param tokenAddress - TODO
   */
  function withdraw(address tokenAddress, uint amount) external nonReentrant {
    uint currentRate = getCurrentTokenRate(tokenAddress);
    uint userDepositValue = userTokenDepositValue[msg.sender][tokenAddress];
    uint maxWithdrawalAmount = userDepositValue * RATE_DENOMINATOR / currentRate;

    if (userDepositValue <= 0) {
      revert InsufficientDepositForWithdrawal();
    }

    if (amount == 0 || amount > maxWithdrawalAmount) {
      revert InvalidWithdrawalAmount(maxWithdrawalAmount);
    }

    uint withdrawalValue = amount * currentRate / RATE_DENOMINATOR;

    totalDepositValue[tokenAddress] -= withdrawalValue;
    userTokenDepositValue[msg.sender][tokenAddress] -= withdrawalValue;

    IERC20 token = IERC20(tokenAddress);
    token.safeTransfer(msg.sender, amount);

    emit TokenWithdrawn(msg.sender, amount, currentRate);
  }

  /**
   * @notice Withdraws the entire principal amount previously deposited by the caller.
   * TODO: finish
   */
  function withdrawAll(address tokenAddress) external nonReentrant {
    uint userDepositValue = userTokenDepositValue[msg.sender][tokenAddress];
    if (userDepositValue <= 0) {
      revert InsufficientDepositForWithdrawal();
    }

    uint currentRate = getCurrentTokenRate(tokenAddress);
    uint withdrawalAmount = userDepositValue * RATE_DENOMINATOR / currentRate; // withdraw max amount
    uint withdrawalValue = userDepositValue;

    totalDepositValue[tokenAddress] -= withdrawalValue;
    userTokenDepositValue[msg.sender][tokenAddress] -= withdrawalValue;

    IERC20 token = IERC20(tokenAddress);
    token.safeTransfer(msg.sender, withdrawalAmount);

    emit TokenWithdrawn(msg.sender, withdrawalAmount, currentRate);
  }

  /**
   * @dev Gets the current token price from the price feed contract.
   * @return uint The current token price.
   * @param tokenAddress - TODO
   */
  function getCurrentTokenRate(address tokenAddress) public view returns (uint) {
    address priceFeedAddress = priceFeedOracle[tokenAddress];
    if (priceFeedAddress == address(0)) {
      revert TokenNotSupported();
    }

    AggregatorV3Interface priceFeed = AggregatorV3Interface(priceFeedAddress);
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
  function withdrawAvailableYield(address tokenAddress) external onlyOwner nonReentrant {
    uint currentRate = getCurrentTokenRate(tokenAddress);
    uint usersMaxWithdrawalAmount = totalDepositValue / currentRate;

    IERC20 token = IERC20(tokenAddress);
    uint totalDepositAmount = token.balanceOf(address(this));
    uint totalYield = totalDepositAmount - usersMaxWithdrawalAmount;

    uint availableYield = totalYield - totalYieldWithdrawn;
    if (availableYield == 0) {
      revert NoYieldAvailable();
    }

    totalYieldWithdrawn += availableYield;
    
    token.safeTransfer(owner(), availableYield);
  }

  /**
   * @dev Updates the cover price percentage. Only the owner can call this function.
   * @param tokenAddress - TODO
   * @param newCoverPricePercentage The new cover price percentage to set.
   */
  function updateCoverPricePercentage(address tokenAddress, uint16 newCoverPricePercentage) external onlyOwner {
    // ensure tokenAddress has corresponding priceOracle
    address priceFeedAddress = priceFeedOracle[tokenAddress];
    if (priceFeedAddress == address(0)) {
      revert TokenNotSupported();
    }
    
    tokenCoverPricePercentages[tokenAddress] = newCoverPricePercentage;
  }
}
