pragma solidity ^0.5.0;

import "../../modules/capital/MCR.sol";

contract DisposableMCR is MCR {

    constructor(address masterAddress) public MCR(masterAddress) {
    }

    function initialize(
        uint112 _mcr,
        uint112 _mcrFloor,
        uint112 _desiredMCR,
        uint32 _lastUpdateTime,
        uint24 _mcrFloorIncrementThreshold,
        uint24 _maxMCRFloorIncrement,
        uint24 _maxMCRIncrement,
        uint24 _gearingFactor,
        uint24 _minUpdateTime
    ) external {
        require(_lastUpdateTime < now, "_lastUpdateTime is in the future");
        mcr = _mcr;
        mcrFloor = _mcrFloor;
        desiredMCR = _desiredMCR;
        lastUpdateTime = _lastUpdateTime;
        mcrFloorIncrementThreshold = _mcrFloorIncrementThreshold;
        maxMCRFloorIncrement = _maxMCRFloorIncrement;
        maxMCRIncrement = _maxMCRIncrement;
        gearingFactor = _gearingFactor;
        minUpdateTime = _minUpdateTime;
    }
}
