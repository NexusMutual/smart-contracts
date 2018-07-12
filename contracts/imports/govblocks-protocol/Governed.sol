pragma solidity ^0.4.24;

contract GovernChecker {
    function authorized(bytes32 _dAppName) public view returns(address);
    function initializeAuthorized(bytes32 _dAppName, address authorizedAddress) public;
    function updateGBMAdress(address _govBlockMaster) public;
}

contract Governed {

    GovernChecker internal governChecker;

    bytes32 internal dAppName;

    modifier onlyAuthorizedToGovern() {
        require(governChecker.authorized(dAppName) == msg.sender);
        _;
    }

    function Governed (bytes32 _dAppName) {
        setGovernChecker();
        dAppName = _dAppName;
    } 

    function setGovernChecker() public {
        if (getCodeSize(0x56f8fec317d95c9eb755268abc2afb99afbdcb47) > 0)        //kovan testnet
            governChecker = GovernChecker(0x56f8fec317d95c9eb755268abc2afb99afbdcb47);
        else if (getCodeSize(0xd38c85468f36d68e3745f6b9198c4fc66b170f70) > 0)   //RSK testnet
            governChecker = GovernChecker(0xd38c85468f36d68e3745f6b9198c4fc66b170f70);
    }

    function getCodeSize(address _addr) internal view returns(uint _size) {
        assembly {
            _size := extcodesize(_addr)
        }
    }

    function getGovernCheckerAddress() public view returns(address) {
        return address(governChecker);
    }
}