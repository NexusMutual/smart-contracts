pragma solidity 0.4.24;

import "./NXMaster.sol";


contract Iupgradable {

    NXMaster public ms;
    address public nxMasterAddress;

    modifier onlyInternal {
        require(ms.isInternal(msg.sender));
        _;
    }

    modifier isMemberAndcheckPause {
        require(ms.isPause() == false && ms.isMember(msg.sender) == true);
        _;
    }

    modifier onlyOwner {
        require(ms.isOwner(msg.sender));
        _;
    }

    modifier checkPause {
        require(ms.isPause() == false);
        _;
    }

    modifier isMember {
        require(ms.isMember(msg.sender), "Not member");
        _;
    }

    /**
     * @dev Iupgradable Interface to update dependent contract address
     */
    function  changeDependentContractAddress() public;

    /**
     * @dev change master address
     * @param _masterAddress is the new address
     */
    function changeMasterAddress(address _masterAddress) public {
        if (address(ms) != address(0)) {
            require(ms.isInternal(msg.sender), "Not internal");
        }
        ms = NXMaster(_masterAddress);
        nxMasterAddress = _masterAddress;
    }

}
