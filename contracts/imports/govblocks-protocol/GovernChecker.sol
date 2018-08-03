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


contract GBM {
	function getDappMasterAddress(bytes32 _gbUserName) public view returns(address masterAddress);
}


contract GovernChecker {

	mapping (bytes32 => address) public authorized;	//Mapping to store authorized address of every dApp

	GBM internal govBlockMaster; //GovBlockMaster instance to prevent registeration of non existant dApps.

	/// @dev Updates GBM address, can only be called by current GBM
	/// @param _govBlockMaster new govBlockMaster address
	function updateGBMAdress(address _govBlockMaster) public {
		require(address(govBlockMaster) == msg.sender || address(govBlockMaster) == address(0));
		govBlockMaster = GBM(_govBlockMaster);
	}

	/// @dev Allows dApp's master to add authorized address for initalization
	/// @param _dAppName new dApp's name
	/// @param authorizedAddress authorized address of the new dapp
	function initializeAuthorized(bytes32 _dAppName, address authorizedAddress) public {
		require(authorized[_dAppName] == address(0));
		require(govBlockMaster.getDappMasterAddress(_dAppName) == msg.sender);
		authorized[_dAppName] = authorizedAddress;
	}

	/// @dev Allows the authorized address to pass on the authorized to someone else
	/// @param _dAppName dApp's name whose authorizedAddress has to be changed
	/// @param authorizedAddress new authorized address of the dapp
	function updateAuthorized(bytes32 _dAppName, address authorizedAddress) public {
		require(authorized[_dAppName] == msg.sender);
		authorized[_dAppName] = authorizedAddress;
	}

	/// @dev Returns govBlockMaster Address
	function GetGovBlockMasterAddress() public view returns(address) {
		return address(govBlockMaster);
	}
}