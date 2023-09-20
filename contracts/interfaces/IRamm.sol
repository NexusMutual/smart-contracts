// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./IPool.sol";
import "./INXMToken.sol";
import "./ITokenController.sol";

// storage structs

struct Slot0 {
  uint128 nxmReserveA;
  uint128 nxmReserveB;
}

struct Slot1 {
  uint128 ethReserve;
  uint96 budget;
  uint32 updatedAt;
}

struct Observation {
  uint32 timestamp;
  uint64 priceCumulativeAbove;
  uint64 priceCumulativeBelow;
}

// memory structs

struct State {
  uint nxmA;
  uint nxmB;
  uint eth;
  uint budget;
  uint timestamp;
}

library RammLib {

  function clone(Observation memory src) internal pure returns (Observation memory) {
    return Observation(src.timestamp, src.priceCumulativeAbove, src.priceCumulativeBelow);
  }

  function clone(State memory state) internal pure returns (State memory) {
    return State(state.nxmA, state.nxmB, state.eth, state.budget, state.timestamp);
  }

}

interface IRamm {

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

  function getInternalPrice() external returns (uint price);

  /* === MUTATIVE FUNCTIONS ==== */

  function swap(uint nxmIn) external payable;

  function removeBudget() external;

  /* ========== EVENTS ========== */
}
