// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../common/PoolMock.sol";
import "../../../interfaces/IPriceFeedOracle.sol";

contract MCRMockPool is PoolMock {

  IPriceFeedOracle public _priceFeedOracle;

  constructor(address priceFeedOracleAddress) {
    _priceFeedOracle = IPriceFeedOracle(priceFeedOracleAddress);
  }

  function priceFeedOracle() external override view returns (IPriceFeedOracle) {
    return _priceFeedOracle;
  }

}
