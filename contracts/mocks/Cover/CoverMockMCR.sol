import "../../interfaces/IMCR.sol";

contract CoverMockMCR is IMCR {

  uint public mockMCRValue;

  function updateMCRInternal(uint poolValueInEth, bool forceUpdate) external override {
    revert("Unsupported");
  }

  function getMCR() external override view returns (uint) {
    return mockMCRValue;
  }

  function setMCR(uint _mcrValue) external {
    mockMCRValue = _mcrValue;
  }

  function maxMCRFloorIncrement() external override view returns (uint24) {
    revert("Unsupported");
  }

  function mcrFloor() external override view returns (uint112) {
    revert("Unsupported");
  }
  function mcr() external override view returns (uint112) {
    revert("Unsupported");
  }
  function desiredMCR() external override view returns (uint112) {
    revert("Unsupported");
  }
  function lastUpdateTime() external override view returns (uint32) {
    revert("Unsupported");
  }
}
