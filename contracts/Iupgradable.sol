pragma solidity 0.4.24;

import "./NXMaster.sol";


contract Iupgradable {

    NXMaster public ms;

    modifier onlyInternal {
        require(ms.isInternal(msg.sender));
        _;
    }

    function  changeDependentContractAddress() public;

    function changeMasterAddress(address _masterAddress) public {
        if (address(ms) != address(0)) {
            require(ms.isInternal(msg.sender), "Not internal");
        }
        ms = NXMaster(_masterAddress);
    }

}
