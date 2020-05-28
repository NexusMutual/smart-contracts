pragma solidity ^0.5.7;

import "../NXMaster.sol";

contract NXMasterMock is NXMaster {

    constructor(address _tokenAdd) public NXMaster(_tokenAdd) {
    }

    function _addContractNames() internal {
        super._addContractNames();
        allContractNames.push("PS");
    }

    function setContractAddress(bytes2 contractName, address payable contractAddress) external {
        contractsActive[contractAddress] == true;
        allContractVersions[contractName] = contractAddress;
    }
}
