pragma solidity ^0.5.0;

import "../../modules/capital/PoolData.sol";

contract P1MockPoolData {

  struct LastMCR {
    uint mcrPercentagex100;
    uint mcrEtherx1E18;
    uint vFull;
    uint64 date;
  }

  LastMCR lastMCR;
  mapping (bytes4 => uint) rates;

  uint public constant c = 5800000;
  uint public constant a = 1028;

  function _getAvgRate(bytes4 curr) internal view returns (uint rate) {
    return rates[curr];
  }

  function getAllCurrenciesLen() external pure returns (uint) {
    return 1;
  }

  function getTokenPriceDetails(bytes4 curr) external view returns (uint _a, uint _c, uint rate) {
    _a = a;
    _c = c;
    rate = _getAvgRate(curr);
  }

  function setAverageRate(bytes4 currency, uint rate) external {
    rates[currency] = rate;
  }

  function getLastMCR() external view returns (uint mcrPercentagex100, uint mcrEtherx1E18, uint vFull, uint64 date) {
    return (
    lastMCR.mcrPercentagex100,
    lastMCR.mcrEtherx1E18,
    lastMCR.vFull,
    lastMCR.date
    );
  }

  function setLastMCR(uint mcrPercentagex100, uint mcrEtherx1E18, uint vFull, uint64 date) external {
    lastMCR = LastMCR(mcrPercentagex100, mcrEtherx1E18, vFull, date);
  }

  /// @dev Gets last Minimum Capital Requirement percentage of Capital Model
  /// @return val MCR% value,multiplied by 100.
  function getLastMCRPerc() external view returns (uint) {
    return lastMCR.mcrPercentagex100;
  }

  /// @dev Gets last Ether price of Capital Model
  /// @return val ether value,multiplied by 100.
  function getLastMCREther() external view returns (uint) {
    return lastMCR.mcrEtherx1E18;
  }

  /// @dev Gets Pool fund value in Ether used in the last full daily calculation from the Capital model.
  function getLastVfull() external view returns (uint) {
    return lastMCR.vFull;
  }

  /// @dev Gets last Minimum Capital Requirement in Ether.
  /// @return date of MCR.
  function getLastMCRDate() external view returns (uint64 date) {
    return lastMCR.date;
  }

}
