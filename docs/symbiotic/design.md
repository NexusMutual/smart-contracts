# Design Proposal

## Epoch Length (90 days)

* We're intending to set the epoch length to 90 days so that the lifetime of most covers will be <= the epoch length

## Slashable Stake

This is the current logic in [Vault.onSlash](https://github.com/symbioticfi/core/blob/7cb06639c5cd656d1d212dafa2c270b5fde39306/src/contracts/vault/Vault.sol#L229)
```solidity
        if (captureEpoch == currentEpoch_) {
            uint256 slashableStake = activeStake_ + nextWithdrawals;
            ...
        } else {
            uint256 withdrawals_ = withdrawals[currentEpoch_];
            uint256 slashableStake = activeStake_ + withdrawals_ + nextWithdrawals;
            ...
        }
```

## Slashable == Capacity == Rewardable

If the stake is slashable we want to:
* count it as part of our capacity (given it fits w/in the lifetime of the cover)
* reward it over the lifetime of the cover

This means that we will:
* modify our capacity allocation service
* fork the DefaultStakerRewards contract

to mirror the Vault.onSlash logic:
* if `captureTimestamp` is from current epoch
  * `slashable/capacity/rewardable = activeStake + withdrawals[nextEpoch]`
* if `captureTimestamp` is from previous epoch
  * `slashable/capacity/rewardable = activeStake + withdrawals[currentEpoch] + withdrawals[nextEpoch]`

## Capacity Allocation

We will count the current epoch's activeStake and next epoch's withdrawals.

```js
capacity = activeStake + withdrawals[nextEpoch]
```

Capacity is only evaluated at cover buy time, which is always in the current epoch. Hence capacity calculations never hit the "previous epoch" branch for capacity, only `activeStake + withdrawals[nextEpoch]` branch applies.

## Distributing Rewards

We are planning to distribute the rewards weekly throughout the lifetime of the cover.

For example:
* 10 ETH buy cover fee
* 70 days cover lifecycle (35 days cover + 35 days grace period)
* 1 ETH weekly rewards distribution for 10 weeks

Each weekly distribution will call our forked rewards contract with `timestamp = coverStart`, so it uses the same `captureTimestamp` as slashing.

## Slashing

When there is a valid cover claim, we will need to slash to pay for the claim payout.

* A user can raise a cover claim at any point throughout the cover lifetime
* The `captureTimestamp` of the slash call will be the coverStart
* We expect this to remain valid for the entire cover lifetime because we only allocate capacity to stake that stays locked and slashable throughout the cover lifetime which we keep <= the epoch length

## Timestamps

* Capacity
  * `tSnap = coverStart + cover lifetime`
  * `coverLifetime = coverPeriod + gracePeriod + buffer`
* Rewards
  * `timestamp = coverStart`
* Slash
  * `captureTimestamp = coverStart`
