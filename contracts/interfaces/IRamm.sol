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
  uint nxm;
  uint liquiditySpeed;
  uint ratchetSpeed;
}

struct Configuration {
  uint targetLiquidity;
  uint twapDuration;
  uint aggressiveLiqSpeed;
  uint oracleBuffer;
}

interface IRamm {

  /* ========== VIEWS ========== */

  function getReserves() external view returns (uint eth, uint nxmA, uint nxmB, uint budget);

  function getSpotPrices() external view returns (uint spotPriceA, uint spotPriceB);

  /* === MUTATIVE FUNCTIONS ==== */

  function swap(uint nxmIn)  external payable;

  function updateUintParameters(UintParams[] calldata paramNames, uint[] calldata values) external;

  function addBudget(uint amount) external;

  /* ========== EVENTS ========== */
}
