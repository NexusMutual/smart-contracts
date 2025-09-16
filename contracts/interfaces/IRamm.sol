// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./INXMToken.sol";
import "./IPool.sol";
import "./ITokenController.sol";

interface IRamm {

  // storage structs

  struct Slot0 {
    uint128 nxmReserveA;
    uint128 nxmReserveB;
  }

  struct Slot1 {
    uint128 ethReserve;
    uint88 budget;
    uint32 updatedAt;
    bool _unusedPause; // replaced with registry level pause
  }

  struct Observation {
    uint32 timestamp;
    uint112 priceCumulativeAbove;
    uint112 priceCumulativeBelow;
  }

  // memory structs

  struct State {
    uint nxmA;
    uint nxmB;
    uint eth;
    uint budget;
    uint ratchetSpeedB;
    uint timestamp;
  }

  struct Context {
    uint capital;
    uint supply;
    uint mcr;
  }

  struct CumulativePriceCalculationProps {
    uint previousEthReserve;
    uint currentEthReserve;
    uint previousNxmA;
    uint currentNxmA;
    uint previousNxmB;
    uint currentNxmB;
    uint previousTimestamp;
    uint observationTimestamp;
  }

  struct CumulativePriceCalculationTimes {
    uint secondsUntilBVAbove;
    uint secondsUntilBVBelow;
    uint timeElapsed;
    uint bvTimeBelow;
    uint bvTimeAbove;
    uint ratchetTimeAbove;
    uint ratchetTimeBelow;
  }

  /* ========== VIEWS ========== */

  function getReserves() external view returns (
    uint ethReserve,
    uint nxmA,
    uint nxmB,
    uint remainingBudget
  );

  function getSpotPrices() external view returns (uint spotPriceA, uint spotPriceB);

  function getBookValue() external view returns (uint bookValue);

  function getInternalPrice() external view returns (uint internalPrice);

  /* ==== MUTATIVE FUNCTIONS ==== */

  function updateTwap() external;

  function getInternalPriceAndUpdateTwap() external returns (uint internalPrice);

  function swap(uint nxmIn, uint minAmountOut, uint deadline) external payable returns (uint amountOut);

  function removeBudget() external;

  /* ========== EVENTS AND ERRORS ========== */

  event EthSwappedForNxm(address indexed member, uint ethIn, uint nxmOut);
  event NxmSwappedForEth(address indexed member, uint nxmIn, uint ethOut);
  event ObservationUpdated(uint32 timestamp, uint112 priceCumulativeAbove, uint112 priceCumulativeBelow);
  event BudgetRemoved();
  event SwapPauseConfigured(bool paused);
  event EthInjected(uint value);
  event EthExtracted(uint value);

  // Pause
  error SystemPaused();
  error SwapPaused();

  // Input
  error OneInputOnly();
  error OneInputRequired();

  // Expiry
  error SwapExpired(uint deadline, uint blockTimestamp);

  // Locked for voting
  error LockedForVoting();

  // Insufficient amount out
  error InsufficientAmountOut(uint amountOut, uint minAmountOut);

  // Buffer Zone
  error NoSwapsInBufferZone();

  // ETH Transfer
  error EthTransferFailed();

  // Circuit breakers
  error EthCircuitBreakerHit();
  error NxmCircuitBreakerHit();
}
