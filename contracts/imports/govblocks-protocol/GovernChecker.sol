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

	mapping (bytes32 => address[]) public authorized;	//Mapping to store authorized address of every dApp

	GBM internal govBlockMaster; //GovBlockMaster instance to prevent registeration of non existant dApps.

	/// @dev Updates GBM address, can only be called by current GBM
	/// @param _govBlockMaster new govBlockMaster address
	function updateGBMAdress(address _govBlockMaster) public {
		require(address(govBlockMaster) == msg.sender || address(govBlockMaster) == address(0));
		govBlockMaster = GBM(_govBlockMaster);
	}

	/// @dev Allows dApp's master to add authorized address for initalization
	/// @param _dAppName new dApp's name
	/// @param _authorizedAddress authorized address of the new dapp
	function initializeAuthorized(bytes32 _dAppName, address _authorizedAddress) public {
		require(authorized[_dAppName].length == 0);
		if(address(govBlockMaster) != address(0))
			require(govBlockMaster.getDappMasterAddress(_dAppName) == msg.sender);
		authorized[_dAppName].push(_authorizedAddress);
	}

	/// @dev Allows the authorized address to pass on the authorized to someone else
	/// @param _dAppName dApp's name whose _authorizedAddress has to be changed
	/// @param _authorizedAddress new authorized address of the dapp
	function updateAuthorized(bytes32 _dAppName, address _authorizedAddress) public {
		uint authNumber = authorizedAddressNumber(_dAppName, msg.sender);
		require(authNumber > 0);
		authorized[_dAppName][authNumber - 1] = _authorizedAddress;
	}

	/// @dev add authorized address (a new voting type)
	/// @param _dAppName dApp's name whose _authorizedAddress has to be changed
	/// @param _authorizedAddress new authorized address of the dapp
	function addAuthorized(bytes32 _dAppName, address _authorizedAddress) public {
		uint authNumber = authorizedAddressNumber(_dAppName, msg.sender);
		require(authNumber > 0);
		authNumber = authorizedAddressNumber(_dAppName, _authorizedAddress);
		if(authNumber == 0)
			authorized[_dAppName].push(_authorizedAddress);
	}

	function authorizedAddressNumber(bytes32 _dAppName, address _authorizedAddress)
		public 
		view 
		returns(uint authorizationNumber) 
	{
		for(uint i = 0; i < authorized[_dAppName].length; i++) {
			if(authorized[_dAppName][i] == _authorizedAddress) {
				return(i + 1); 
			}
		}
	}

	/// @dev Returns govBlockMaster Address
	function GetGovBlockMasterAddress() public view returns(address) {
		return address(govBlockMaster);
	}
}