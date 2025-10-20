// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/ICoverProducts.sol";

contract CoverGeneric is ICover {

  uint public constant DEFAULT_MIN_PRICE_RATIO = 100; // 1%
  uint public constant MAX_COMMISSION_RATIO = 3000; // 30%

  function getDefaultMinPriceRatio() public virtual pure returns (uint) {
    revert("Unsupported");
  }

  function getCoverDataCount() external virtual pure returns (uint) {
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

  function getCoverData(uint) external virtual view returns (CoverData memory) {
    revert("Unsupported");
  }

  function getCoverRi(uint) external virtual view returns (Ri memory) {
    revert("Unsupported");
  }

  function getCoverDataWithRi(uint) external virtual view returns (CoverData memory, Ri memory) {
    revert("Unsupported");
  }

  function getCoverMetadata(uint) external virtual view returns (string memory) {
    revert("Unsupported");
  }

  function getPoolAllocations(uint) external virtual view returns (PoolAllocation[] memory) {
    revert("Unsupported");
  }

  function getCoverReference(uint) external virtual view returns (CoverReference memory) {
    revert("Unsupported");
  }

  function getCoverDataWithReference(uint) external virtual view returns (
    CoverData memory,
    CoverReference memory
  ) {
    revert("Unsupported");
  }

  function getLatestEditCoverData(uint) external virtual view returns (CoverData memory) {
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

  function executeCoverBuy(
    BuyCoverParams calldata /* params */,
    PoolAllocationRequest[] calldata /* coverChunkRequests */,
    address /*buyer*/
  ) external virtual payable returns (uint) {
    revert("Unsupported");
  }

  function buyCoverWithRi(
    BuyCoverParams calldata /* params */,
    PoolAllocationRequest[] calldata /* coverChunkRequests */,
    RiRequest calldata /* riRequest */
  ) external virtual payable returns (uint) {
    revert("Unsupported");
  }

  function burnStake(
    uint /* coverId */,
    uint /* amount */
  ) external virtual {
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

  function stakingPoolFactory() external virtual view returns (address) {
    revert("Unsupported");
  }

  function stakingPoolImplementation() external virtual view returns (address) {
    revert("Unsupported");
  }

  function coverProducts() external virtual view returns (ICoverProducts) {
    revert("Unsupported");
  }
}
