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

  uint public totalPrincipal; // Total principal deposited in the contract

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
   * @dev Requires the sender to have approved the contract to spend at least `amount` tokens on their behalf.
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
    deposits[msg.sender] += amount;
    initialRates[msg.sender] = getCurrentTokenPrice();

    totalPrincipal += amount;
    uint coverAmount = updateCoverAmount(msg.sender);

    emit TokenDeposited(msg.sender, amount, coverAmount);
  }

  /**
   * @notice Withdraws the entire principal amount previously deposited by the caller.
   * @dev Transfers the deposited tokens back to the caller and resets their deposited balance to zero.
   *      This action is only possible if the caller has a positive deposited balance.
   */
  function withdraw() external nonReentrant {

    uint principalAmount = deposits[msg.sender];
    if (principalAmount <= 0) {
      revert InsufficientDepositForWithdrawal();
    }

    uint currentRate = getCurrentTokenPrice();
    uint withdrawAmount = (principalAmount * initialRates[msg.sender]) / currentRate;

    totalPrincipal -= principalAmount;
    deposits[msg.sender] = 0;
    coverAmounts[msg.sender] = 0;
    initialRates[msg.sender] = 0;

    token.safeTransfer(msg.sender, withdrawAmount);

    emit TokenWithdrawn(msg.sender, withdrawAmount);
  }

  /**
   * @notice Allows the contract owner to withdraw the accumulated yield.
   * @dev The yield is defined as the difference between the current token balance of the contract
   *      and the total principal. Reverts with `NoYieldAvailable` if there is no yield.
   */
  function withdrawAvailableYield() external onlyOwner nonReentrant {

    uint availableYield = getAvailableYield();
    if (availableYield == 0) {
      revert NoYieldAvailable();
    }

    token.safeTransfer(owner(), availableYield);
  }

  /**
   * @notice Retrieves the current yield of the contract based on the token's price and total deposits.
   * @dev Calculates yield as the difference between current token value and total principal if positive.
   * @return The current yield as an unsigned integer. Returns zero if the current value is less than the total principal.
   */
  function getAvailableYield() public view returns (uint) {

    uint currentContractValue = getCurrentTokenValue();
    if (currentContractValue < totalPrincipal) {
      return 0;
    }
    return currentContractValue - totalPrincipal;
  }

  /**
   * @notice Calculates the current market value of the tokens held by the contract.
   * @dev Fetches the latest token price from the Chainlink price feed and multiplies it by the number of tokens in the contract.
   * @return The total value of the tokens held by the contract as an unsigned integer.
   */
  function getCurrentTokenValue() private view returns (uint) {

    uint totalTokens = token.balanceOf(address(this));
    uint currentTokenPrice = getCurrentTokenPrice();

    return (totalTokens * currentTokenPrice) / (10 ** tokenDecimals);
  }

  /**
   * @dev Updates the cover amount for a given user based on their deposits and the current token price.
   * @param user The address of the user.
   * @return coverAmount The updated cover amount in uint.
   */

  function updateCoverAmount(address user) private returns (uint coverAmount) {

    uint256 userDeposits = deposits[user];
    uint256 currentPrice = getCurrentTokenPrice();

    // Calculate cover amount in ETH
    coverAmount = (userDeposits * currentPrice * coverPricePercentage) / PRICE_DENOMINATOR / (10 ** tokenDecimals);
    coverAmounts[user] = coverAmount;
  }

  /**
   * @dev Updates the cover price percentage. Only the owner can call this function.
   * @param _coverPricePercentage The new cover price percentage to set.
   */
  function updateCoverPricePercentage(uint16 _coverPricePercentage) external onlyOwner {
    coverPricePercentage = _coverPricePercentage;
  }

  /**
   * @dev Gets the current token price from the price feed contract.
   * @return uint The current token price.
   */
  function getCurrentTokenPrice() public view returns (uint) {

    (, int256 price, , , ) = priceFeed.latestRoundData();
    if (price <= 0) {
      revert InvalidTokenRate();
    }
    return uint256(price);
  }
}
