// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverNFT.sol";

contract CoverGeneric is ICover {

  uint public constant GLOBAL_MIN_PRICE_RATIO = 100; // 1%
  uint public constant MAX_COMMISSION_RATIO = 3000; // 30%

  function getGlobalMinPriceRatio() public virtual pure returns (uint) {
    revert("Unsupported");
  }

  function coverDataCount() external virtual pure returns (uint) {
    revert("Unsupported");
  }

  function coverSegmentsCount(uint /* coverId */ ) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function coverSegments(uint /* coverId */ ) external virtual view returns (CoverSegment[] memory) {
    revert("Unsupported");
  }

  function coverSegmentWithRemainingAmount(uint, uint) external virtual view returns (CoverSegment memory) {
    revert("Unsupported");
  }

  function totalActiveCoverInAsset(uint) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function globalCapacityRatio() external virtual pure returns (uint) {
    revert("Unsupported");
  }

  function globalRewardsRatio() external virtual pure returns (uint) {
    revert("Unsupported");
  }

  function getPriceAndCapacityRatios(uint[] calldata) public virtual view returns (uint, uint, uint[] memory, uint[] memory) {
    revert("Unsupported");
  }

  function getGlobalCapacityAndPriceRatios() public virtual pure returns (uint, uint) {
    revert("Unsupported");
  }

  function getGlobalCapacityRatio() public virtual pure returns (uint) {
    revert("Unsupported");
  }

  function getGlobalRewardsRatio() public virtual pure returns (uint) {
    revert("Unsupported");
  }

  function coverData(uint) external virtual view returns (CoverData memory) {
    revert("Unsupported");
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function addLegacyCover(uint, uint, uint, uint, uint, address) external virtual returns (uint) {
    revert("Unsupported");
  }

  function buyCover(
    BuyCoverParams calldata /* params */,
    PoolAllocationRequest[] calldata /* coverChunkRequests */
  ) external virtual payable returns (uint) {
    revert("Unsupported");
  }

  function burnStake(
    uint /* coverId */,
    uint /* segmentId */,
    uint /* amount */
  ) external virtual returns (address /* coverOwner */) {
    revert("Unsupported");
  }

  function recalculateActiveCoverInAsset(uint) external virtual pure {
    revert("Unsupported");
  }

  function changeStakingPoolFactoryOperator() external virtual {
    revert("Unsupported");
  }

  function coverNFT() external virtual view returns (ICoverNFT) {
    revert("Unsupported");
  }

  function stakingNFT() external virtual view returns (IStakingNFT) {
    revert("Unsupported");
  }

  function stakingPoolFactory() external virtual view returns (ICompleteStakingPoolFactory) {
    revert("Unsupported");
  }
}
