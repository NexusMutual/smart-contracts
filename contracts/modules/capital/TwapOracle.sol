// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/ITwapOracle.sol";
import "../../abstract/MasterAwareV2.sol";
import "../../libraries/Math.sol";

contract TwapOracle is ITwapOracle, MasterAwareV2 {
  // change the type for packing
  Observation[8] public aboveObservations;
  Observation[8] public belowObservations;

  /* =========== IMMUTABLES ========== */

  uint public immutable periodSize;
  uint8 public immutable granularity;
  uint public immutable windowSize;

  /* ========== CONSTRUCTOR ========== */

  constructor() {
    // TODO: discuss the twap duration and granularity
    windowSize = 115200; // 4 * 8 = 32 hours
    granularity = 8;
    periodSize = 14400; // 4 hours = windowSize / granularity;
  }

  function currentBlockTimestamp() internal view returns (uint32) {
    return uint32(block.timestamp % 2 ** 32);
  }

  function observationIndexOf(uint timestamp) public view returns (uint8 index) {
    uint epochPeriod = timestamp / periodSize;
    return uint8(epochPeriod % granularity);
  }

  function getLatestObservationInWindow(bool above) private view returns (Observation storage lastObservation) {
    Observation[8] storage observations = above ? aboveObservations : belowObservations;

    uint8 lastObservationIndex = observationIndexOf(block.timestamp - periodSize);

    lastObservation = observations[lastObservationIndex];
    uint epochStartTimestamp = (block.timestamp / periodSize - 1) * periodSize;
    if (lastObservation.timestamp > epochStartTimestamp) {
      return lastObservation;
    }
    for (uint i = 0; i < granularity; i++) {
      if (observations[i].timestamp > lastObservation.timestamp) {
        lastObservation = observations[i];
      }
    }
  }

  function currentCumulativePrice(
    bool above,
    uint ethReserve,
    uint96 nxmA,
    uint96 nxmB
  ) internal view returns (uint80 priceCumulative) {
    uint32 blockTimestamp = currentBlockTimestamp();
    Observation storage lastObservation = getLatestObservationInWindow(above);
    uint96 nxmReserve = above ? nxmA : nxmB;

    // subtraction overflow is desired
    uint32 timeElapsed = blockTimestamp - lastObservation.timestamp;

    if (lastObservation.timestamp == blockTimestamp) {
      return lastObservation.priceCumulative;
    }
    priceCumulative = uint80(lastObservation.priceCumulative + (ethReserve / nxmReserve) * timeElapsed);
  }

  function update(
    bool above,
    uint ethReserve,
    uint96 nxmA,
    uint96 nxmB
  ) external onlyInternal {
    uint8 observationIndex = observationIndexOf(block.timestamp);
    Observation storage observation = above ? aboveObservations[observationIndex] : belowObservations[observationIndex];

    // we only want to commit updates once per period (i.e. windowSize / granularity)
    uint timeElapsed = block.timestamp - observation.timestamp;
    if (timeElapsed > periodSize) {
      uint priceCumulative = currentCumulativePrice(above, ethReserve, nxmA, nxmB);
      observation.timestamp = currentBlockTimestamp();
      observation.priceCumulative = uint80(priceCumulative);
    }
  }

  function consult(
    bool above,
    uint ethReserve,
    uint96 nxmA,
    uint96 nxmB,
    uint amount
  ) external onlyInternal view returns (uint amountOut) {
    Observation storage lastObservation = getLatestObservationInWindow(above);

    uint timeElapsed = block.timestamp - lastObservation.timestamp;
    require(timeElapsed <= windowSize, 'Missing historical observation');
    require(timeElapsed >= windowSize - periodSize * 2, 'Unexpected time elapsed');

    uint priceCumulative = currentCumulativePrice(above, ethReserve, nxmA, nxmB);
    return computeAmountOut(lastObservation.priceCumulative, priceCumulative, timeElapsed, amount);
  }

  function computeAmountOut(
    uint priceCumulativeStart,
    uint priceCumulativeEnd,
    uint timeElapsed,
    uint amountIn
  ) private pure returns (uint amountOut) {
    uint priceAverage = (priceCumulativeEnd - priceCumulativeStart) / timeElapsed;
    return priceAverage * amountIn;
  }

  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.RA)] = master.getLatestAddress("RA");
  }
}
