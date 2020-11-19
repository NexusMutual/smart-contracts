pragma solidity ^0.5.0;

contract TOMockUniswapPair {

  uint public price0CumulativeLast;
  uint public price1CumulativeLast;

  uint112 public reserve0;
  uint112 public reserve1;
  uint32 public blockTimestampLast;

  function setCumulativePrices(
    uint _price0CumulativeLast,
    uint _price1CumulativeLast
  ) external {
    price0CumulativeLast = _price0CumulativeLast;
    price1CumulativeLast = _price1CumulativeLast;
  }

  function getReserves() external view returns (
    uint112 _reserve0,
    uint112 _reserve1,
    uint32 _blockTimestampLast
  ) {
    return (reserve0, reserve1, blockTimestampLast);
  }

  function setReserves(
    uint112 _reserve0,
    uint112 _reserve1,
    uint32 _blockTimestampLast
  ) external {
    reserve0 = _reserve0;
    reserve1 = _reserve1;
    blockTimestampLast = _blockTimestampLast;
  }

}
