// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../../interfaces/IMasterAware.sol";
import "../../interfaces/IMCR.sol";

contract DisposableMCR is IMCR {

  uint112 public mcr;
  uint112 public mcrFloor;
  uint112 public desiredMCR;
  uint32 public lastUpdateTime;
  uint24 public mcrFloorIncrementThreshold;
  uint24 public maxMCRFloorIncrement;
  uint24 public maxMCRIncrement;
  uint24 public gearingFactor;
  uint24 public minUpdateTime;

  constructor(
    uint112 _mcr,
    uint112 _mcrFloor,
    uint112 _desiredMCR,
    uint32 _lastUpdateTime,
    uint24 _mcrFloorIncrementThreshold,
    uint24 _maxMCRFloorIncrement,
    uint24 _maxMCRIncrement,
    uint24 _gearingFactor,
    uint24 _minUpdateTime
  ) {

    require(_lastUpdateTime < block.timestamp, "_lastUpdateTime is in the future");

    // values
    mcr = _mcr;
    mcrFloor = _mcrFloor;
    desiredMCR = _desiredMCR;
    lastUpdateTime = _lastUpdateTime;

    // parameters
    mcrFloorIncrementThreshold = _mcrFloorIncrementThreshold;
    maxMCRFloorIncrement = _maxMCRFloorIncrement;
    maxMCRIncrement = _maxMCRIncrement;
    gearingFactor = _gearingFactor;
    minUpdateTime = _minUpdateTime;

    currentMcrAddress = address(this);
  }

  function getMCR() external pure returns (uint) {
    revert("MCRMockMCRAndFakeMaster: Unexpected getLatestAddress() call");
  }

  function updateMCRInternal(uint, bool) external pure {
    revert("MCRMockMCRAndFakeMaster: Unexpected updateMCRInternal() call");
  }

  /* fake master functions */

  address internal currentMcrAddress = address(this);

  function getLatestAddress(bytes2) external view returns (address) {
    return currentMcrAddress;
  }

  // update from fake master (this contract) to the real one and trigger initialization
  function initializeNextMcr(IMasterAware mcrContract, address newMasterAddress) external {
    currentMcrAddress = address(mcrContract);
    mcrContract.changeDependentContractAddress();
    mcrContract.changeMasterAddress(newMasterAddress);
    mcrContract.changeDependentContractAddress();
  }

  /* end fake master functions */

}
