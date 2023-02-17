// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

// 5 x uint48 activeAllocation + 1 x uint16 lastBucketId
// 5 * 48 + 16 = 256
type TrancheAllocationGroup is uint;

// group ids:   ________0_________|_________1_________|_________3__ ...
// tranche ids: 0   1   2   3   4 | 5   6   7   8   9 | 10  11  12  ...
// active tranches:         \________________________________/

// 8 x (uint32 expiringAllocation)
type TrancheGroupBucket is uint;

library StakingTypesLib {

  // TrancheAllocationGroup

  function getLastBucketId(TrancheAllocationGroup items) internal pure returns (uint16) {
    return uint16(TrancheAllocationGroup.unwrap(items));
  }

  function setLastBucketId(
    TrancheAllocationGroup items,
    uint16 lastBucketId
  ) internal pure returns (TrancheAllocationGroup) {
    // applying the mask using binary AND to clear target item's bits
    uint mask = ~(uint(type(uint16).max));
    uint underlying = TrancheAllocationGroup.unwrap(items);
    return TrancheAllocationGroup.wrap(underlying & mask | uint(lastBucketId));
  }

  function getItemAt(
    TrancheAllocationGroup items,
    uint index
  ) internal pure returns (uint48 allocation) {
    uint underlying = TrancheAllocationGroup.unwrap(items);
    return uint48(underlying >> (index * 48 + 16));
  }

  // heads up: does not mutate the TrancheAllocationGroup but returns a new one instead
  function setItemAt(
    TrancheAllocationGroup items,
    uint index,
    uint48 allocation
  ) internal pure returns (TrancheAllocationGroup) {
    // applying the mask using binary AND to clear target item's bits
    uint mask = ~(uint(type(uint64).max) << (index * 48 + 16));
    uint item = uint(allocation) << (index * 48 + 16);
    uint underlying = TrancheAllocationGroup.unwrap(items) & mask | item;
    return TrancheAllocationGroup.wrap(underlying);
  }

  // TrancheGroupBucket

  function getItemAt(
    TrancheGroupBucket items,
    uint index
  ) internal pure returns (uint32) {
    uint underlying = TrancheGroupBucket.unwrap(items);
    return uint32(underlying >> (index * 32));
  }

  // heads up: does not mutate the TrancheGroupBucket but returns a new one instead
  function setItemAt(
    TrancheGroupBucket items,
    uint index,
    uint32 value
  ) internal pure returns (TrancheGroupBucket) {
    // applying the mask using binary AND to clear target item's bits
    uint mask = ~(uint(type(uint32).max) << (index * 32));
    uint itemUnderlying = uint(value) << (index * 32);
    uint groupUnderlying = TrancheGroupBucket.unwrap(items) & mask | itemUnderlying;
    return TrancheGroupBucket.wrap(groupUnderlying);
  }

}
