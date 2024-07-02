// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IMasterAware.sol";
import "../../interfaces/IMCR.sol";

contract DisposableMCR is IMCR {

  uint80 public mcr;
  uint80 public desiredMCR;
  uint32 public lastUpdateTime;
  uint16 public maxMCRIncrement;
  uint24 public gearingFactor;
  uint16 public minUpdateTime;

  constructor(
    uint80 _mcr,
    uint80 _desiredMCR,
    uint32 _lastUpdateTime,
    uint16 _maxMCRIncrement,
    uint24 _gearingFactor,
    uint16 _minUpdateTime
  ) {

    require(_lastUpdateTime < block.timestamp, "_lastUpdateTime is in the future");

    // values
    mcr = _mcr;
    desiredMCR = _desiredMCR;
    lastUpdateTime = _lastUpdateTime;

    // parameters
    maxMCRIncrement = _maxMCRIncrement;
    gearingFactor = _gearingFactor;
    minUpdateTime = _minUpdateTime;

    currentMcrAddress = address(this);
  }

  function getMCR() external pure returns (uint) {
    revert("MCRMockMCRAndFakeMaster: Unexpected getLatestAddress() call");
  }

  function updateMCRInternal(bool) external pure {
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
