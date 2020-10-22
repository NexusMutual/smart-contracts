import "../../modules/capital/PoolData.sol";

contract PoolDataMCRMock is PoolData {


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

}
