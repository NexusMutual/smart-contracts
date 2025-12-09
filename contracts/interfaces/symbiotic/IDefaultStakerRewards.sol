// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IStakerRewards} from "./IStakerRewards.sol";

interface IDefaultStakerRewards is IStakerRewards {
  error AlreadySet();
  error HighAdminFee();
  error InsufficientAdminFee();
  error InsufficientReward();
  error InvalidAdminFee();
  error InvalidHintsLength();
  error InvalidRecipient();
  error InvalidRewardTimestamp();
  error MissingRoles();
  error NoRewardsToClaim();
  error NotNetwork();
  error NotNetworkMiddleware();
  error NotVault();

  /**
   * @notice Initial parameters needed for a staker rewards contract deployment.
   * @param vault address of the vault to get stakers' data from
   * @param adminFee admin fee (up to ADMIN_FEE_BASE inclusively)
   * @param defaultAdminRoleHolder address of the initial DEFAULT_ADMIN_ROLE holder
   * @param adminFeeClaimRoleHolder address of the initial ADMIN_FEE_CLAIM_ROLE holder
   * @param adminFeeSetRoleHolder address of the initial ADMIN_FEE_SET_ROLE holder
   */
  struct InitParams {
    address vault;
    uint256 adminFee;
    address defaultAdminRoleHolder;
    address adminFeeClaimRoleHolder;
    address adminFeeSetRoleHolder;
  }

  /**
   * @notice Structure for a reward distribution.
   * @param amount amount of tokens to be distributed (admin fee is excluded)
   * @param timestamp time point stakes must taken into account at
   */
  struct RewardDistribution {
    uint256 amount;
    uint48 timestamp;
  }

  /**
   * @notice Emitted when a vault is initialized.
   * @param vault address of the vault
   */
  event InitVault(address vault);

  /**
   * @notice Emitted when a reward is claimed.
   * @param network network whose rewards are claimed
   * @param token address of the token
   * @param claimer address of the claimer
   * @param firstClaimedRewardIndex first claimed reward index
   * @param rewardsClaimed number of rewards claimed
   */
  event ClaimRewardsExtra(
    address indexed network,
    address indexed token,
    address indexed claimer,
    uint256 firstClaimedRewardIndex,
    uint256 rewardsClaimed
  );

  /**
   * @notice Emitted when an admin fee is claimed.
   * @param recipient account that received the fee
   * @param amount amount of the fee claimed
   */
  event ClaimAdminFee(address indexed recipient, uint256 amount);

  /**
   * @notice Emitted when the admin fee is set.
   * @param adminFee new admin fee
   */
  event SetAdminFee(uint256 adminFee);

  /**
   * @notice Get the maximum admin fee (= 100%).
   * @return maximum admin fee
   */
  function ADMIN_FEE_BASE() external view returns (uint256);

  /**
   * @notice Get the admin fee claimer's role.
   * @return identifier of the admin fee claimer role
   */
  function ADMIN_FEE_CLAIM_ROLE() external view returns (bytes32);

  /**
   * @notice Get the admin fee setter's role.
   * @return identifier of the admin fee setter role
   */
  function ADMIN_FEE_SET_ROLE() external view returns (bytes32);

  /**
   * @notice Get the vault factory's address.
   * @return address of the vault factory
   */
  function VAULT_FACTORY() external view returns (address);

  /**
   * @notice Get the network middleware service's address.
   * @return address of the network middleware service
   */
  function NETWORK_MIDDLEWARE_SERVICE() external view returns (address);

  /**
   * @notice Get the vault's address.
   * @return address of the vault
   */
  function VAULT() external view returns (address);

  /**
   * @notice Get an admin fee.
   * @return admin fee
   */
  function adminFee() external view returns (uint256);

  /**
   * @notice Get a total number of rewards using a particular token for a given network.
   * @param token address of the token
   * @param network address of the network
   * @return total number of the rewards using the token by the network
   */
  function rewardsLength(address token, address network) external view returns (uint256);

  /**
   * @notice Get a particular reward distribution.
   * @param token address of the token
   * @param network address of the network
   * @param rewardIndex index of the reward distribution using the token
   * @return amount amount of tokens to be distributed
   * @return timestamp time point stakes must taken into account at
   */
  function rewards(
    address token,
    address network,
    uint256 rewardIndex
  ) external view returns (uint256 amount, uint48 timestamp);

  /**
   * @notice Get the first index of the unclaimed rewards using a particular token by a given account.
   * @param account address of the account
   * @param token address of the token
   * @param network address of the network
   * @return first index of the unclaimed rewards
   */
  function lastUnclaimedReward(address account, address token, address network) external view returns (uint256);

  /**
   * @notice Get a claimable admin fee amount for a particular token.
   * @param token address of the token
   * @return claimable admin fee
   */
  function claimableAdminFee(address token) external view returns (uint256);

  /**
   * @notice Claim an admin fee.
   * @param recipient account that will receive the fee
   * @param token address of the token
   * @dev Only the vault owner can call this function.
   */
  function claimAdminFee(address recipient, address token) external;

  /**
   * @notice Set an admin fee.
   * @param adminFee admin fee (up to ADMIN_FEE_BASE inclusively)
   * @dev Only the ADMIN_FEE_SET_ROLE holder can call this function.
   */
  function setAdminFee(uint256 adminFee) external;
}
