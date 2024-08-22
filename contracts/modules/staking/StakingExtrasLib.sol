// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IStakingPool.sol";
import "../../libraries/Math.sol";
import "../../libraries/UncheckedMath.sol";
import "../../libraries/SafeUintCast.sol";

library StakingExtrasLib {
  using SafeUintCast for uint;
  using UncheckedMath for uint;

  uint public constant TRANCHE_DURATION = 91 days;
  uint public constant MAX_ACTIVE_TRANCHES = 8;
  uint public constant POOL_FEE_DENOMINATOR = 100;
  uint public constant ONE_NXM = 1 ether;

  function updateRewardsShares(
    // storage refs
    mapping(uint => mapping(uint => IStakingPool.Deposit)) storage deposits,
    mapping(uint => IStakingPool.Tranche) storage tranches,
    // state
    uint accNxmPerRewardsShare,
    uint rewardsSharesSupply,
    uint poolFee,
    // input
    uint trancheId,
    uint[] calldata tokenIds
  ) external returns (uint newRewardsSharesSupply) {

    IStakingPool.Deposit memory feeDeposit = deposits[0][trancheId];
    IStakingPool.Tranche memory tranche = tranches[trancheId];

    {
      // update manager's pending rewards
      uint newRewardPerRewardsShare = accNxmPerRewardsShare.uncheckedSub(feeDeposit.lastAccNxmPerRewardShare);
      feeDeposit.pendingRewards += (newRewardPerRewardsShare * feeDeposit.rewardsShares / ONE_NXM).toUint96();
      feeDeposit.lastAccNxmPerRewardShare = accNxmPerRewardsShare.toUint96();
    }

    uint trancheShares;

    for (uint i = 0; i < tokenIds.length; i++) {
      require(tokenIds[i] != 0, "INVALID_TOKEN_ID");

      // sload and sum up
      IStakingPool.Deposit memory deposit = deposits[tokenIds[i]][trancheId];
      trancheShares += deposit.stakeShares;

      // update
      uint newRewardPerRewardsShare = accNxmPerRewardsShare.uncheckedSub(deposit.lastAccNxmPerRewardShare);
      deposit.pendingRewards += (newRewardPerRewardsShare * deposit.rewardsShares / ONE_NXM).toUint96();
      deposit.lastAccNxmPerRewardShare = accNxmPerRewardsShare.toUint96();

      // reset rewards shares
      deposit.rewardsShares = deposit.stakeShares;

      // sstore
      deposits[tokenIds[i]][trancheId] = deposit;
    }

    // make sure all deposits (token ids) for the current tranche were included in the input
    require(trancheShares == tranche.stakeShares, "INVALID_TOTAL_SHARES");

    // update manager's rewards shares
    feeDeposit.rewardsShares = (trancheShares * poolFee / (POOL_FEE_DENOMINATOR - poolFee)).toUint128();

    {
      // update tranche rewards shares and supply
      uint previousRewardsShares = tranche.rewardsShares;
      uint updatedRewardsShares = trancheShares + feeDeposit.rewardsShares;

      tranche.rewardsShares = updatedRewardsShares.toUint128();
      rewardsSharesSupply = rewardsSharesSupply - previousRewardsShares + updatedRewardsShares;
    }

    // sstore
    deposits[0][trancheId] = feeDeposit;
    tranches[trancheId] = tranche;

    return rewardsSharesSupply;
  }
}
