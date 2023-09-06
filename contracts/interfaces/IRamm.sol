// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./IPool.sol";
import "./INXMToken.sol";
import "./ITokenController.sol";

struct Pool {
  uint96 nxmReserve;
  uint16 liquiditySpeed;
  uint16 ratchetSpeed;
}

struct Observation {
  uint32 timestamp;
  uint64 priceCumulativeAbove;
  uint64 priceCumulativeBelow;
}

 struct CumulativePriceCalculationProps {
  uint previousEthReserve;
  uint currentEthReserve;
  uint previousNxmA;
  uint currentNxmA;
  uint previousNxmB;
  uint currentNxmB;
  uint ratchetSpeedA;
  uint ratchetSpeedB;
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


interface IRamm {

  /* ========== VIEWS ========== */

  function getReserves(
    uint capital,
    uint supply,
    uint timestamp
  ) external view returns (uint ethReserve, uint nxmA, uint nxmB, uint remainingBudget);

  function getSpotPrices() external view returns (uint spotPriceA, uint spotPriceB);

  function getBookValue() external view returns (uint bookValue);

  function getInternalPrice() external view returns (uint price);

  /* === MUTATIVE FUNCTIONS ==== */

  function swap(uint nxmIn) external payable;

  /* ========== EVENTS ========== */
}
