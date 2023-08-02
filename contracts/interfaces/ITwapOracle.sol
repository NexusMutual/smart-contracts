// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

struct Observation {
  uint32 timestamp;
  uint80 priceCumulative;
}

interface ITwapOracle {

  /* ========== VIEWS ========== */

  function consult(
    bool above,
    uint ethReserve,
    uint96 nxmA,
    uint96 nxmB,
    uint amount
  ) external view returns (uint amountOut);

  /* === MUTATIVE FUNCTIONS ==== */

  function update(
    bool above,
    uint ethReserve,
    uint96 nxmA,
    uint96 nxmB
  )  external;

  /* ========== EVENTS ========== */
}
