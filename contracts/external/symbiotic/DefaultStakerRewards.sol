// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {MulticallUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IRegistry} from "@symbioticfi/core/src/interfaces/common/IRegistry.sol";
import {INetworkMiddlewareService} from "@symbioticfi/core/src/interfaces/service/INetworkMiddlewareService.sol";
import {IVault} from "@symbioticfi/core/src/interfaces/vault/IVault.sol";

import {IDefaultStakerRewards} from "../../interfaces/symbiotic/IDefaultStakerRewards.sol";
import {IStakerRewards} from "../../interfaces/symbiotic/IStakerRewards.sol";
import {SafeUintCast} from "../../libraries/SafeUintCast.sol";

contract DefaultStakerRewards is
  AccessControlUpgradeable,
  ReentrancyGuardUpgradeable,
  MulticallUpgradeable,
  IDefaultStakerRewards
{
  using SafeERC20 for IERC20;
  using Math for uint256;

  /**
   * @inheritdoc IStakerRewards
   */
  uint64 public constant version = 2;

  /**
   * @inheritdoc IDefaultStakerRewards
   */
  uint256 public constant ADMIN_FEE_BASE = 10_000;

  /**
   * @inheritdoc IDefaultStakerRewards
   */
  bytes32 public constant ADMIN_FEE_CLAIM_ROLE = keccak256("ADMIN_FEE_CLAIM_ROLE");

  /**
   * @inheritdoc IDefaultStakerRewards
   */
  bytes32 public constant ADMIN_FEE_SET_ROLE = keccak256("ADMIN_FEE_SET_ROLE");

  /**
   * @inheritdoc IDefaultStakerRewards
   */
  address public immutable VAULT_FACTORY;

  /**
   * @inheritdoc IDefaultStakerRewards
   */
  address public immutable NETWORK_MIDDLEWARE_SERVICE;

  /**
   * @inheritdoc IDefaultStakerRewards
   */
  address public VAULT;

  /**
   * @inheritdoc IDefaultStakerRewards
   */
  uint256 public adminFee;

  /**
   * @inheritdoc IDefaultStakerRewards
   */
  mapping(address token => mapping(address network => RewardDistribution[] rewards_)) public rewards;

  /**
   * @inheritdoc IDefaultStakerRewards
   */
  mapping(address account => mapping(address token => mapping(address network => uint256 rewardIndex)))
    public lastUnclaimedReward;

  /**
   * @inheritdoc IDefaultStakerRewards
   */
  mapping(address token => uint256 amount) public claimableAdminFee;

  // eligibleShares = activeShares + withdrawalShares[nextEpoch]
  mapping(uint48 timestamp => uint256 amount) private _eligibleSharesCache;

  constructor(address vaultFactory, address networkMiddlewareService) {
    _disableInitializers();

    VAULT_FACTORY = vaultFactory;
    NETWORK_MIDDLEWARE_SERVICE = networkMiddlewareService;
  }

  /**
   * @inheritdoc IDefaultStakerRewards
   */
  function rewardsLength(address token, address network) external view returns (uint256) {
    return rewards[token][network].length;
  }

  /**
   * @inheritdoc IStakerRewards
   */
  function claimable(
    address token,
    address account,
    bytes calldata data
  ) external view override returns (uint256 amount) {
    // network - a network to claim rewards for
    // maxRewards - the maximum amount of rewards to process
    (address network, uint256 maxRewards) = abi.decode(data, (address, uint256));

    RewardDistribution[] storage rewardsByTokenNetwork = rewards[token][network];
    uint256 rewardIndex = lastUnclaimedReward[account][token][network];

    uint256 processed;

    // loop until we hit maxRewards or run out of reward distributions
    while (processed < maxRewards && rewardIndex < rewardsByTokenNetwork.length) {
      RewardDistribution storage reward = rewardsByTokenNetwork[rewardIndex];

      amount += (IVault(VAULT).activeSharesOfAt(account, reward.timestamp, new bytes(0)) +
        // withdrawal shares of the account in the next epoch
        IVault(VAULT).withdrawalSharesOf(IVault(VAULT).epochAt(reward.timestamp) + 1, account)).mulDiv(
          reward.amount,
          _eligibleSharesCache[reward.timestamp]
        );

      unchecked {
        ++processed;
        ++rewardIndex;
      }
    }
  }

  function initialize(InitParams calldata params) external initializer {
    if (!IRegistry(VAULT_FACTORY).isEntity(params.vault)) {
      revert NotVault();
    }

    if (params.defaultAdminRoleHolder == address(0)) {
      if (params.adminFee == 0) {
        if (params.adminFeeClaimRoleHolder == address(0)) {
          if (params.adminFeeSetRoleHolder != address(0)) {
            revert MissingRoles();
          }
        } else if (params.adminFeeSetRoleHolder == address(0)) {
          revert MissingRoles();
        }
      } else if (params.adminFeeClaimRoleHolder == address(0)) {
        revert MissingRoles();
      }
    }

    __ReentrancyGuard_init();

    VAULT = params.vault;
    emit InitVault(params.vault);

    _setAdminFee(params.adminFee);

    if (params.defaultAdminRoleHolder != address(0)) {
      _grantRole(DEFAULT_ADMIN_ROLE, params.defaultAdminRoleHolder);
    }
    if (params.adminFeeClaimRoleHolder != address(0)) {
      _grantRole(ADMIN_FEE_CLAIM_ROLE, params.adminFeeClaimRoleHolder);
    }
    if (params.adminFeeSetRoleHolder != address(0)) {
      _grantRole(ADMIN_FEE_SET_ROLE, params.adminFeeSetRoleHolder);
    }
  }

  /**
   * @inheritdoc IStakerRewards
   */
  function distributeRewards(
    address network,
    address token,
    uint256 amount,
    bytes calldata data
  ) external override nonReentrant {
    // timestamp - a time point stakes must be taken into account at
    // maxAdminFee - the maximum admin fee to allow
    // activeSharesHint - a hint index to optimize `activeSharesAt()` processing
    // activeStakeHint - a hint index to optimize `activeStakeAt()` processing
    (uint48 timestamp, uint256 maxAdminFee, bytes memory activeSharesHint, bytes memory activeStakeHint) = abi.decode(
      data,
      (uint48, uint256, bytes, bytes)
    );

    if (INetworkMiddlewareService(NETWORK_MIDDLEWARE_SERVICE).middleware(network) != msg.sender) {
      revert NotNetworkMiddleware();
    }

    if (timestamp >= SafeUintCast.toUint48(block.timestamp)) {
      revert InvalidRewardTimestamp();
    }

    uint256 adminFee_ = adminFee;
    if (maxAdminFee < adminFee_) {
      revert HighAdminFee();
    }

    if (_eligibleSharesCache[timestamp] == 0) {
      uint256 nextEpoch = IVault(VAULT).epochAt(timestamp) + 1;

      // activeShares + withdrawalShares[nextEpoch]
      uint256 activeShares = IVault(VAULT).activeSharesAt(timestamp, activeSharesHint);
      uint256 withdrawalSharesNextEpoch = IVault(VAULT).withdrawalShares(nextEpoch);
      uint256 totalEligibleShares = activeShares + withdrawalSharesNextEpoch;

      // activeStake + withdrawalStake[nextEpoch]
      uint256 activeStake_ = IVault(VAULT).activeStakeAt(timestamp, activeStakeHint);
      uint256 withdrawalStakeNextEpoch_ = IVault(VAULT).withdrawals(nextEpoch);
      uint256 totalEligibleStake_ = activeStake_ + withdrawalStakeNextEpoch_;

      // revert if no eligible stake or shares
      if (totalEligibleShares == 0 || totalEligibleStake_ == 0) {
        revert InvalidRewardTimestamp();
      }

      _eligibleSharesCache[timestamp] = totalEligibleShares;
    }

    uint256 balanceBefore = IERC20(token).balanceOf(address(this));
    IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    amount = IERC20(token).balanceOf(address(this)) - balanceBefore;

    if (amount == 0) {
      revert InsufficientReward();
    }

    uint256 adminFeeAmount = amount.mulDiv(adminFee_, ADMIN_FEE_BASE);
    uint256 distributeAmount = amount - adminFeeAmount;

    claimableAdminFee[token] += adminFeeAmount;

    if (distributeAmount > 0) {
      rewards[token][network].push(RewardDistribution({amount: distributeAmount, timestamp: timestamp}));
    }

    emit DistributeRewards(network, token, distributeAmount, adminFeeAmount, timestamp);
  }

  /**
   * @inheritdoc IStakerRewards
   */
  function claimRewards(address recipient, address token, bytes calldata data) external override nonReentrant {
    // network - a network to claim rewards for
    // maxRewards - the maximum amount of rewards to process
    // activeSharesOfHints - hint indexes to optimize `activeSharesOf()` processing
    (address network, uint256 maxRewards, bytes[] memory activeSharesOfHints) = abi.decode(
      data,
      (address, uint256, bytes[])
    );

    if (recipient == address(0)) {
      revert InvalidRecipient();
    }

    uint256 amount;
    uint256 rewardsToClaim;
    uint256 lastUnclaimedReward_;

    {
      RewardDistribution[] storage rewardsByTokenNetwork = rewards[token][network];
      lastUnclaimedReward_ = lastUnclaimedReward[msg.sender][token][network];

      rewardsToClaim = Math.min(maxRewards, rewardsByTokenNetwork.length - lastUnclaimedReward_);

      if (rewardsToClaim == 0) {
        revert NoRewardsToClaim();
      }

      if (activeSharesOfHints.length == 0) {
        activeSharesOfHints = new bytes[](rewardsToClaim);
      } else if (activeSharesOfHints.length != rewardsToClaim) {
        revert InvalidHintsLength();
      }

      uint256 rewardIndex = lastUnclaimedReward_;
      for (uint256 i; i < rewardsToClaim; ) {
        RewardDistribution storage reward = rewardsByTokenNetwork[rewardIndex];

        uint48 rewardTimestamp = reward.timestamp;
        uint256 nextEpoch = IVault(VAULT).epochAt(rewardTimestamp) + 1;

        uint256 activeSharesOfAt = IVault(VAULT).activeSharesOfAt(msg.sender, rewardTimestamp, activeSharesOfHints[i]);
        uint256 withdrawalSharesOfNextEpoch = IVault(VAULT).withdrawalSharesOf(nextEpoch, msg.sender);
        uint256 eligibleSharesOfAt = activeSharesOfAt + withdrawalSharesOfNextEpoch;

        amount += eligibleSharesOfAt.mulDiv(reward.amount, _eligibleSharesCache[rewardTimestamp]);

        unchecked {
          ++i;
          ++rewardIndex;
        }
      }

      lastUnclaimedReward[msg.sender][token][network] = rewardIndex;
    }

    if (amount > 0) {
      IERC20(token).safeTransfer(recipient, amount);
    }

    emit ClaimRewards(network, token, msg.sender, amount, recipient);
    emit ClaimRewardsExtra(network, token, msg.sender, lastUnclaimedReward_, rewardsToClaim);
  }

  /**
   * @inheritdoc IDefaultStakerRewards
   */
  function claimAdminFee(address recipient, address token) external nonReentrant onlyRole(ADMIN_FEE_CLAIM_ROLE) {
    uint256 claimableAdminFee_ = claimableAdminFee[token];
    if (claimableAdminFee_ == 0) {
      revert InsufficientAdminFee();
    }

    claimableAdminFee[token] = 0;

    IERC20(token).safeTransfer(recipient, claimableAdminFee_);

    emit ClaimAdminFee(token, claimableAdminFee_);
  }

  /**
   * @inheritdoc IDefaultStakerRewards
   */
  function setAdminFee(uint256 adminFee_) external onlyRole(ADMIN_FEE_SET_ROLE) {
    if (adminFee == adminFee_) {
      revert AlreadySet();
    }

    _setAdminFee(adminFee_);
  }

  function _setAdminFee(uint256 adminFee_) private {
    if (adminFee_ > ADMIN_FEE_BASE) {
      revert InvalidAdminFee();
    }

    adminFee = adminFee_;

    emit SetAdminFee(adminFee_);
  }
}
