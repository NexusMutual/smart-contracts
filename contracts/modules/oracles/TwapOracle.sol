/* Copyright (C) 2020 NexusMutual.io

  This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity ^0.5.0;

import "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import "@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol";

contract TwapOracle {
  using FixedPoint for *;

  struct Bucket {
    uint timestamp;
    uint price0Cumulative;
    uint price1Cumulative;
  }

  event Updated(address indexed pair, uint timestamp, uint price0Cumulative, uint price1Cumulative);

  uint constant public periodSize = 1800;
  uint constant public periodsPerWindow = 8;
  uint constant public windowSize = periodSize * periodsPerWindow;

  address public factory;

  // token pair => Bucket[8]
  mapping(address => Bucket[8]) public buckets;

  constructor (address _factory) public {
    factory = _factory;
  }

  /* utils */

  // https://uniswap.org/docs/v2/smart-contract-integration/getting-pair-addresses/
  function _pairFor(address _factory, address tokenA, address tokenB) internal pure returns (address pair) {

    // sort tokens
    (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);

    require(token0 != token1, "TWAP: identical addresses");
    require(token0 != address(0), "TWAP: zero address");

    pair = address(uint(keccak256(abi.encodePacked(
        hex'ff',
        _factory,
        keccak256(abi.encodePacked(token0, token1)),
        hex'96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f'
      ))));
  }

  function timestampToIndex(uint timestamp) internal pure returns (uint index) {
    uint epochPeriod = timestamp / periodSize;
    return epochPeriod % periodsPerWindow;
  }

  function pairFor(address tokenA, address tokenB) external view returns (address pair) {
    return _pairFor(factory, tokenA, tokenB);
  }

  function currentBucketIndex() external view returns (uint index) {
    return timestampToIndex(block.timestamp);
  }

  /* update */

  function update(address[] calldata pairs) external {

    for (uint i = 0; i < pairs.length; i++) {

      // note: not reusing canUpdate() because we need the bucket variable
      address pair = pairs[i];
      uint index = timestampToIndex(block.timestamp);
      Bucket storage bucket = buckets[pair][index];

      if (block.timestamp - bucket.timestamp < periodSize) {
        continue;
      }

      (uint price0Cumulative, uint price1Cumulative,) = UniswapV2OracleLibrary.currentCumulativePrices(pair);
      bucket.timestamp = block.timestamp;
      bucket.price0Cumulative = price0Cumulative;
      bucket.price1Cumulative = price1Cumulative;

      emit Updated(pair, block.timestamp, price0Cumulative, price1Cumulative);
    }
  }

  function canUpdate(address pair) external view returns (bool) {

    uint index = timestampToIndex(block.timestamp);
    Bucket storage bucket = buckets[pair][index];
    uint timeElapsed = block.timestamp - bucket.timestamp;

    return timeElapsed > periodSize;
  }

  /* consult */

  function _getCumulativePrices(
    address tokenIn,
    address tokenOut
  ) internal view returns (uint priceCumulativeStart, uint priceCumulativeEnd, uint timeElapsed) {

    uint currentIndex = timestampToIndex(block.timestamp);
    uint firstBucketIndex = (currentIndex + 1) % periodsPerWindow;

    address pair = _pairFor(factory, tokenIn, tokenOut);
    Bucket storage firstBucket = buckets[pair][firstBucketIndex];

    timeElapsed = block.timestamp - firstBucket.timestamp;
    require(timeElapsed <= windowSize, "TWAP: missing historical reading");
    require(timeElapsed >= windowSize - periodSize * 2, "TWAP: unexpected time elapsed");

    (uint price0Cumulative, uint price1Cumulative,) = UniswapV2OracleLibrary.currentCumulativePrices(pair);

    if (tokenIn < tokenOut) {
      return (firstBucket.price0Cumulative, price0Cumulative, timeElapsed);
    }

    return (firstBucket.price1Cumulative, price1Cumulative, timeElapsed);
  }

  function _computeAmountOut(
    uint priceCumulativeStart,
    uint priceCumulativeEnd,
    uint timeElapsed,
    uint amountIn
  ) internal pure returns (uint amountOut) {

    // overflow is desired.
    FixedPoint.uq112x112 memory priceAverage = FixedPoint.uq112x112(
      uint224((priceCumulativeEnd - priceCumulativeStart) / timeElapsed)
    );

    return priceAverage.mul(amountIn).decode144();
  }

  /**
   *  @dev Returns the amount out corresponding to the amount in for a given token using the
   *  @dev   moving average over the time range [now - [windowSize, windowSize - periodSize * 2], now]
   *  @dev   update must have been called for the bucket corresponding to timestamp `now - windowSize`
   */
  function consult(address tokenIn, uint amountIn, address tokenOut) external view returns (uint amountOut) {

    uint pastPriceCumulative;
    uint currentPriceCumulative;
    uint timeElapsed;

    (pastPriceCumulative, currentPriceCumulative, timeElapsed) = _getCumulativePrices(tokenIn, tokenOut);

    return _computeAmountOut(
      pastPriceCumulative,
      currentPriceCumulative,
      timeElapsed,
      amountIn
    );
  }

}
