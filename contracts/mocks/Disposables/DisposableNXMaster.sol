// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../../modules/governance/NXMaster.sol";

contract DisposableNXMaster is NXMaster {

  function initialize(
    address _owner,
    address _tokenAddress,
    address _emergencyAdmin,
    bytes2[] calldata _contractNames,
    uint8[] calldata _contractTypes, // 0 - eternal storage, 1 - "upgradable", 2 - proxy
    address payable[] calldata _contractAddresses
  ) external {

    require(!masterInitialized, "!init");
    masterInitialized = true;

    owner = _owner;
    tokenAddress = _tokenAddress;
    emergencyAdmin = _emergencyAdmin;

    contractsActive[address(this)] = true;

    require(
      _contractNames.length == _contractTypes.length,
      "check names & types arrays length"
    );

    for (uint i = 0; i < _contractNames.length; i++) {

      bytes2 name = _contractNames[i];
      address payable contractAddress = _contractAddresses[i];

      contractCodes.push(name);
      contractAddresses[name] = contractAddress;
      contractsActive[contractAddress] = true;

      if (_contractTypes[i] == 1) {
        isReplaceable[name] = true;
      } else if (_contractTypes[i] == 2) {
        isProxy[name] = true;
      }
    }
  }

  function switchGovernanceAddress(address payable newGV) external {

    {// change governance address
      address currentGV = contractAddresses["GV"];
      contractAddresses["GV"] = newGV;
      contractsActive[currentGV] = false;
      contractsActive[newGV] = true;
    }

    // notify all contracts about address change
    for (uint i = 0; i < contractCodes.length; i++) {
      address _address = contractAddresses[contractCodes[i]];
      IMasterAwareV2 up = IMasterAwareV2(_address);
      up.changeMasterAddress(address(this));
      up.changeDependentContractAddress();
    }
  }

}
