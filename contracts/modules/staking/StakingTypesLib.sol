// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

// 4 x (uint48 activeCoverAmount, uint16 lastBucketId)
type CoverAmountGroup is uint;
type CoverAmount is uint64;
// 8 x (uint32 expiringCoverAmount)
type BucketTrancheGroup is uint;

library StakingTypesLib {

  // CoverAmount

  function lastBucketId(CoverAmount item) internal pure returns (uint16) {
    return uint16(CoverAmount.unwrap(item));
  }

  function activeCoverAmount(CoverAmount item) internal pure returns (uint48) {
    return uint48(CoverAmount.unwrap(item) >> 16);
  }

  function newCoverAmount(
    uint48 activeCoverAmount,
    uint16 bucketId
  ) internal pure returns (CoverAmount) {
    return CoverAmount.wrap((uint64(activeCoverAmount) << 16) | bucketId);
  }

  // CoverAmountGroup

  function getItemAt(
    CoverAmountGroup items,
    uint index
  ) internal pure returns (CoverAmount) {
    uint underlying = CoverAmountGroup.unwrap(items);
    uint64 item = uint64(underlying >> (index * 64));
    return CoverAmount.wrap(item);
  }

  // heads up: does not mutate the CoverAmountGroup but returns a new one instead
  function setItemAt(
    CoverAmountGroup items,
    uint index,
    CoverAmount item
  ) internal pure returns (CoverAmountGroup) {
    // applying the mask using binary AND to clear target item's bits
    uint mask = ~(uint(type(uint64).max) << (index * 64));
    uint itemUnderlying = uint(CoverAmount.unwrap(item)) << (index * 64);
    uint groupUnderlying = CoverAmountGroup.unwrap(items) & mask | itemUnderlying;
    return CoverAmountGroup.wrap(groupUnderlying);
  }

  // BucketTrancheGroup

  function getItemAt(
    BucketTrancheGroup items,
    uint index
  ) internal pure returns (uint32) {
    uint underlying = BucketTrancheGroup.unwrap(items);
    return uint32(underlying << (index * 32));
  }

  // heads up: does not mutate the BucketTrancheGroup but returns a new one instead
  function setItemAt(
    BucketTrancheGroup items,
    uint index,
    uint32 value
  ) internal pure returns (BucketTrancheGroup) {
    // applying the mask using binary AND to clear target item's bits
    uint mask = ~(type(uint32).max << uint32(index * 32));
    uint groupUnderlying = BucketTrancheGroup.unwrap(items) & mask | value;
    return BucketTrancheGroup.wrap(groupUnderlying);
  }

}
