// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./IPool.sol";
import "./INXMToken.sol";
import "./ITokenController.sol";


enum UintParams {
  targetLiquidity,
  twapDuration,
  aggressiveLiqSpeed,
  oracleBuffer
}

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

interface IRamm {

  /* ========== VIEWS ========== */

  function getReserves() external view returns (uint eth, uint nxmA, uint nxmB, uint budget);

  function getSpotPrices() external view returns (uint spotPriceA, uint spotPriceB);

  function getBookValue() external view returns (uint bookValue);

  /* === MUTATIVE FUNCTIONS ==== */

  function swap(uint nxmIn)  external payable;

  function addBudget(uint amount) external;

  /* ========== EVENTS ========== */
}
