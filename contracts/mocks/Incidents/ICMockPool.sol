// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../common/PoolMock.sol";
import "../../interfaces/IPriceFeedOracle.sol";

contract ICMockPool is PoolMock {

  IPriceFeedOracle public override priceFeedOracle;

  constructor (address _priceFeedOracle) {
    priceFeedOracle = IPriceFeedOracle(_priceFeedOracle);
  }

}
