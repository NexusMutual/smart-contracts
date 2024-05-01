// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../common/PoolMock.sol";
import "../../interfaces/IPriceFeedOracle.sol";

contract STMockPool is PoolMock {

  IPriceFeedOracle public override priceFeedOracle;

  constructor(address _priceFeedOracle, address _swapOperator) {
    priceFeedOracle = IPriceFeedOracle(_priceFeedOracle);
    swapOperator = _swapOperator;
  }

}
