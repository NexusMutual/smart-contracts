/* Copyright (C) 2017 GovBlocks.io
  This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
  You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity 0.4.24;


contract GovernChecker {
    function authorizedAddressNumber(bytes32 _dAppName, address _authorizedAddress) public view returns(uint);
    function initializeAuthorized(bytes32 _dAppName, address _authorizedAddress) public;
    function updateGBMAdress(address _govBlockMaster) public;
    function updateAuthorized(bytes32 _dAppName, address _authorizedAddress) public;
    function addAuthorized(bytes32 _dAppName, address _authorizedAddress) public;
}


contract Governed {

    GovernChecker public governChecker; // Instance of governCheckerContract

    bytes32 public dappName; // Name of the dApp, needs to be set by contracts inheriting this contract

    /// @dev modifier that allows only the authorized addresses to execute the function
    modifier onlyAuthorizedToGovern() {
        if (address(governChecker) != address(0))
            require(governChecker.authorizedAddressNumber(dappName, msg.sender) > 0);
        else {
            setGovernChecker();
            require(_isAuthToGovern(msg.sender));
        }
        _;
    }

    constructor() public {
        setGovernChecker();
    }

    /// @dev checks if an address is authorized to govern
    function isAuthorizedToGovern(address _toCheck) public view returns(bool) {
        return _isAuthToGovern(_toCheck);
    }

    /// @dev sets the address of governChecker based on the network being used.
    function setGovernChecker() public {
        /* solhint-disable */
        if (getCodeSize(0x70c0191CAFBe32FAc38Cece874fb5aDA1f2ff497) > 0)        //kovan testnet
            governChecker = GovernChecker(0x70c0191CAFBe32FAc38Cece874fb5aDA1f2ff497);
        else if (getCodeSize(0xdF6c6a73BCf71E8CAa6A2c131bCf98f10eBb5162) > 0)   //RSK testnet
            governChecker = GovernChecker(0xdF6c6a73BCf71E8CAa6A2c131bCf98f10eBb5162);
        else if (getCodeSize(0x67995F25f04d61614d05607044c276727DEA9Cf0) > 0)   //Rinkeyby testnet
            governChecker = GovernChecker(0x67995F25f04d61614d05607044c276727DEA9Cf0);
        else if (getCodeSize(0xb5fE0857770D85302585564b04C81a5Be96022C8) > 0)   //Ropsten testnet
            governChecker = GovernChecker(0xb5fE0857770D85302585564b04C81a5Be96022C8);
        else if (getCodeSize(0x962d110554E0b20E18E5c3680018b49A58EF0bBB) > 0)   //Private testnet
            governChecker = GovernChecker(0x962d110554E0b20E18E5c3680018b49A58EF0bBB);
        /* solhint-enable */
    }

    /// @dev returns the code size at an address, used to confirm that a contract exisits at an address.
    function getCodeSize(address _addr) internal view returns(uint _size) {
        //solhint-disable-next-line
        assembly {
            _size := extcodesize(_addr)
        }
    }

    function _isAuthToGovern(address _toCheck) internal view returns(bool auth) {
        if (address(governChecker) == address(0) || 
                governChecker.authorizedAddressNumber(dappName, _toCheck) > 0)
            return true;
    }
}