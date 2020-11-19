import "../../modules/capital/PoolData.sol";

contract P1MockPoolData is PoolData {


  constructor(address _notariseAdd, address _daiFeedAdd, address _daiAdd) PoolData(_notariseAdd, _daiFeedAdd, _daiAdd) public {
  }

  struct LastMCR {
    uint mcrPercentagex100;
    uint mcrEtherx1E18;
    uint vFull;
    uint64 date;
  }
  LastMCR lastMCR;
  mapping (bytes4 => uint) rates;


  function _getAvgRate(bytes4 curr, bool isIA) internal view returns (uint rate) {
    return rates[curr];
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
