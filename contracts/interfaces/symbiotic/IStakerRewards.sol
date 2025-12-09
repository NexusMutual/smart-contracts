// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IStakerRewards {
  /**
   * @notice Emitted when a reward is distributed.
   * @param network network on behalf of which the reward is distributed
   * @param token address of the token
   * @param distributeAmount amount of tokens to distribute
   * @param adminFeeAmount amount of tokens to keep as an admin fee
   * @param timestamp timestamp of the distribution
   */
  event DistributeRewards(
    address indexed network,
    address indexed token,
    uint256 distributeAmount,
    uint256 adminFeeAmount,
    uint48 timestamp
  );

  /**
   * @notice Emitted when a reward is claimed.
   * @param network network whose rewards are claimed
   * @param token address of the token
   * @param claimer address of the claimer
   * @param amount amount of tokens
   * @param recipient address of the tokens' recipient
   */
  event ClaimRewards(
    address indexed network,
    address indexed token,
    address indexed claimer,
    uint256 amount,
    address recipient
  );

  /**
   * @notice Get a version of the staker rewards contract (different versions mean different interfaces).
   * @return version of the staker rewards contract
   * @dev Must return 2 for this one.
   */
  function version() external view returns (uint64);

  /**
   * @notice Get an amount of rewards claimable by a particular account of a given token.
   * @param token address of the token
   * @param account address of the claimer
   * @param data some data to use
   * @return amount of claimable tokens
   */
  function claimable(address token, address account, bytes calldata data) external view returns (uint256);

  /**
   * @notice Distribute rewards on behalf of a particular network using a given token.
   * @param network network on behalf of which the reward to distribute
   * @param token address of the token
   * @param amount amount of tokens
   * @param data some data to use
   */
  function distributeRewards(address network, address token, uint256 amount, bytes calldata data) external;

  /**
   * @notice Claim rewards using a given token.
   * @param recipient address of the tokens' recipient
   * @param token address of the token
   * @param data some data to use
   */
  function claimRewards(address recipient, address token, bytes calldata data) external;
}
