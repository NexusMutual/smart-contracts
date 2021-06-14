// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;

contract P1MockMCR {
    uint public mcr;

    function getMCR() public view returns (uint) {
        return mcr;
    }

    function changeMasterAddress(address) external {
        // no-op
    }

    function changeDependentContractAddress() external {
        // no-op
    }

    function setMCR(uint _mcr) public  {
        mcr = _mcr;
    }

    function updateMCR(uint) external {
        // no-op
    }

    function updateMCRInternal(uint, bool) public {
        // no-op
    }
}
