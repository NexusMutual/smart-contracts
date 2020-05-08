pragma solidity ^0.5.7;

import "../NXMaster.sol";

contract NXMasterMock is NXMaster {

    constructor(address _tokenAdd) public NXMaster(_tokenAdd) {
    }

    function _addContractNames() internal {
        super._addContractNames();
        allContractNames.push("PS");
    }
}
