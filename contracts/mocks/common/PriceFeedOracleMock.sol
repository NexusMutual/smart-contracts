// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IPriceFeedOracle.sol";

contract PriceFeedOracleMock is IPriceFeedOracle {

  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  mapping(address => OracleAsset) public assets;

  uint public ethRate;

  constructor(uint _ethRate) {
    ethRate = _ethRate;
  }

  function getAssetToEthRate(address) public view returns (uint) {
    return ethRate;
  }

  function getAssetForEth(address, uint ethIn) external view returns (uint) {
    return ethIn * ethRate;
  }

  function getEthForAsset(address, uint amount) external view returns (uint) {
    return amount / ethRate;
  }
}
