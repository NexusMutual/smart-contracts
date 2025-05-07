// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./ICoverProducts.sol";
import "./IStakingPool.sol";

interface IStakingProducts {

  struct StakedProductParam {
    uint productId;
    bool recalculateEffectiveWeight;
    bool setTargetWeight;
    uint8 targetWeight;
    bool setTargetPrice;
    uint96 targetPrice;
  }

  struct Weights {
    uint32 totalEffectiveWeight;
    uint32 totalTargetWeight;
  }

  struct StakedProduct {
    uint16 lastEffectiveWeight;
    uint8 targetWeight;
    uint96 targetPrice;
    uint96 bumpedPrice;
    uint32 bumpedPriceUpdateTime;
  }

  /* ============= PRODUCT FUNCTIONS ============= */

  function setProducts(uint poolId, StakedProductParam[] memory params) external;

  function getProductTargetWeight(uint poolId, uint productId) external view returns (uint);

  function getTotalTargetWeight(uint poolId) external view returns (uint);

  function getTotalEffectiveWeight(uint poolId) external view returns (uint);

  function getProduct(uint poolId, uint productId) external view returns (
    uint lastEffectiveWeight,
    uint targetWeight,
    uint targetPrice,
    uint bumpedPrice,
    uint bumpedPriceUpdateTime
  );

  function getPoolManager(uint poolId) external view returns (address);

  /* ============= PRICING FUNCTIONS ============= */

  function getPremium(
    uint poolId,
    uint productId,
    uint period,
    uint coverAmount,
    uint totalCapacity,
    uint productMinPrice,
    bool useFixedPrice,
    uint nxmPerAllocationUnit
  ) external returns (uint premium);

  function calculateFixedPricePremium(
    uint coverAmount,
    uint period,
    uint fixedPrice,
    uint nxmPerAllocationUnit,
    uint targetPriceDenominator
  ) external pure returns (uint);


  function calculatePremium(
    StakedProduct memory product,
    uint period,
    uint coverAmount,
    uint totalCapacity,
    uint targetPrice,
    uint currentBlockTimestamp,
    uint nxmPerAllocationUnit,
    uint targetPriceDenominator
  ) external pure returns (uint premium, StakedProduct memory);

  /* ========== STAKING POOL CREATION ========== */

  function stakingPool(uint poolId) external view returns (IStakingPool);

  function getStakingPoolCount() external view returns (uint);

  function createStakingPool(
    bool isPrivatePool,
    uint initialPoolFee,
    uint maxPoolFee,
    ProductInitializationParams[] calldata productInitParams,
    string calldata ipfsDescriptionHash
  ) external returns (uint poolId, address stakingPoolAddress);

  function changeStakingPoolFactoryOperator(address newOperator) external;

  function setPoolMetadata(uint poolId, string memory ipfsHash) external;

  function getPoolMetadata(uint poolId) external view returns (string memory ipfsHash);

  /* ============= EVENTS ============= */

  event ProductUpdated(uint productId, uint8 targetWeight, uint96 targetPrice);

  /* ============= ERRORS ============= */

  // Auth
  error OnlyStakingPool();
  error OnlyCoverContract();
  error OnlyManager();

  // Products & weights
  error MustSetPriceForNewProducts();
  error MustSetWeightForNewProducts();
  error TargetPriceTooHigh();
  error TargetPriceBelowMin();
  error TargetWeightTooHigh();
  error MustRecalculateEffectiveWeight();
  error TotalTargetWeightExceeded();
  error TotalEffectiveWeightExceeded();

  // Staking Pool creation
  error ProductDoesntExistOrIsDeprecated();
  error InvalidProductType();
  error TargetPriceBelowMinPriceRatio();

  // IPFS
  error IpfsHashRequired();
}
