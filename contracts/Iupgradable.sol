pragma solidity 0.4.24;

import "./NXMaster.sol";


contract Iupgradable {

    NXMaster public ms;

    modifier onlyInternal {
        require(ms.isInternal(msg.sender));
        _;
    }

    function  changeDependentContractAddress() public;

    function changeMasterAddress() public {
        if (address(ms) == address(0))
            ms = NXMaster(msg.sender);
        else
            ms = NXMaster(ms.getLatestAddress("MS"));
    }

}
