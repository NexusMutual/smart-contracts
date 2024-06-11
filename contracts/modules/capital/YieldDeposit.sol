// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts-v4/access/Ownable.sol";
import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../interfaces/IYieldDeposit.sol";


import "hardhat/console.sol";
/// @title Yield Deposit
/// @notice Contract for depositing yield bearing tokens and using the yield to manually purchase cover for the user

contract YieldDeposit is IYieldDeposit, Ownable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  /* ========== STATE VARIABLES ========== */

  mapping(address => address) public priceFeedOracle;
  mapping(address => uint16) public tokenCoverPricePercentages;
  mapping(address => mapping(address => uint)) public userTokenDepositValue; // user > token > depositValue
  mapping(address => bool) public tokenDepositEnabled;
  mapping(address => uint) public tokenDepositLimit;

  mapping(address => uint) public totalDepositValue; // the total deposits for each token valued at the priceRate at the time of each deposit

  /* ========== CONSTANTS ========== */

  uint private constant PRICE_DENOMINATOR = 10_000;
  uint private constant RATE_DENOMINATOR = 1e18;

  /* ========== CONSTRUCTOR ========== */

  constructor(address _manager) {
    transferOwnership(_manager);
  }

  function listToken(address tokenAddress, address priceFeedAddress, uint depositLimitAmount, uint16 coverPricePercentage) external onlyOwner {
    tokenDepositEnabled[tokenAddress] = true;
    priceFeedOracle[tokenAddress] = priceFeedAddress;
    tokenDepositLimit[tokenAddress] = depositLimitAmount;
    tokenCoverPricePercentages[tokenAddress] = coverPricePercentage;
  }

  function disableToken(address tokenAddress) external onlyOwner {
    // disable deposits
    tokenDepositEnabled[tokenAddress] = false;

    // ensure ALL users has 0 balance
    IERC20 token = IERC20(tokenAddress);
    uint balance = token.balanceOf(address(this));
    if (balance != 0) {
      // NOTE: do not revert token deposit disable
      return;
    }
    
    delete priceFeedOracle[tokenAddress];
    delete tokenCoverPricePercentages[tokenAddress];
  }

  /**
   * @notice Deposits a specified amount of tokens into the contract.
   * @dev User must withdraw first to change their deposit amount.
   *      Reverts with `InvalidDepositAmount` if the deposit amount is zero or negative.
   * @param amount The quantity of tokens to deposit.
   */
  function deposit(address tokenAddress, uint256 amount) external {
    if (tokenDepositEnabled[tokenAddress] == false) {
      revert TokenDepositDisabled();
    }

    if (amount <= 0) {
      revert InvalidDepositAmount();
    }

    IERC20 token = IERC20(tokenAddress);
    uint balance = token.balanceOf(address(this));
    uint maxDepositAmount = tokenDepositLimit[tokenAddress];

    if (balance + amount > maxDepositAmount) {
      revert ExceedTokenDepositLimit(maxDepositAmount - balance);
    }

    token.safeTransferFrom(msg.sender, address(this), amount);

    uint currentRate = getCurrentTokenRate(tokenAddress);
    uint userDepositValue = (amount * currentRate) / RATE_DENOMINATOR;

    totalDepositValue[tokenAddress] += userDepositValue;
    userTokenDepositValue[msg.sender][tokenAddress] += userDepositValue;

    emit TokenDeposited(msg.sender, amount, currentRate);
  }

  /**
   * @notice Withdraws the given amount of the principal previously deposited by the caller.
   * @dev MAX_UINT amount withdraws ALL principal deposit of the caller
   * @param tokenAddress - TODO
   */
  function withdraw(address tokenAddress, uint amount) external nonReentrant {
    uint currentRate = getCurrentTokenRate(tokenAddress);
    uint userDepositValue = userTokenDepositValue[msg.sender][tokenAddress];
    uint maxWithdrawalAmount = (userDepositValue * RATE_DENOMINATOR) / currentRate;

    if (userDepositValue <= 0) {
      revert InsufficientDepositForWithdrawal();
    }

    if (amount != type(uint).max && (amount == 0 || amount > maxWithdrawalAmount)) {
      revert InvalidWithdrawalAmount(maxWithdrawalAmount);
    }

    if (amount == type(uint).max) {
      amount = maxWithdrawalAmount;
    }
    uint withdrawalValue = (amount * currentRate) / RATE_DENOMINATOR;

    totalDepositValue[tokenAddress] -= withdrawalValue;
    userTokenDepositValue[msg.sender][tokenAddress] -= withdrawalValue;

    IERC20 token = IERC20(tokenAddress);
    token.safeTransfer(msg.sender, amount);

    emit TokenWithdrawn(msg.sender, amount, currentRate);
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
  function withdrawCurrentYield(address tokenAddress) external onlyOwner nonReentrant {
    (uint availableYieldAmount, uint usersMaxTokenWithdrawalAmount, uint currentRate) = getCurrentYieldInfo(tokenAddress);
    if (availableYieldAmount == 0) {
      revert NoYieldAvailable();
    }

    IERC20 token = IERC20(tokenAddress);
    token.safeTransfer(owner(), availableYieldAmount);

    // update the token's total deposit value
    totalDepositValue[tokenAddress] = usersMaxTokenWithdrawalAmount * currentRate / RATE_DENOMINATOR;
  }

  // TODO: docs
  function getCurrentYieldInfo(
    address tokenAddress
  ) public view returns (uint availableYieldAmount, uint usersMaxTokenWithdrawalAmount, uint currentRate) {
    currentRate = getCurrentTokenRate(tokenAddress);
    uint tokenTotalDepositValue = totalDepositValue[tokenAddress];

    IERC20 token = IERC20(tokenAddress);
    uint totalDepositAmount = token.balanceOf(address(this));

    // TODO: double check is there a scenario where one of tokenTotalDepositValue / totalDepositAmount is 0 but the other is not
    if (tokenTotalDepositValue == 0 || totalDepositAmount == 0) {
      return (0, 0, currentRate);
    }

    usersMaxTokenWithdrawalAmount = (tokenTotalDepositValue * RATE_DENOMINATOR) / currentRate;
    availableYieldAmount = totalDepositAmount - usersMaxTokenWithdrawalAmount;
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
  
  function updateDepositLimit(address tokenAddress, uint maxDepositAmount) external onlyOwner {
    tokenDepositLimit[tokenAddress] = maxDepositAmount;
  }
}


// TODO:
// listToken / disableToken unit tests
// put this in external/cover directly