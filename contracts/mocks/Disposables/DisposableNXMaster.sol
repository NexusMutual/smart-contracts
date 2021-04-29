pragma solidity ^0.5.0;

import "../../modules/governance/NXMaster.sol";

contract DisposableNXMaster is NXMaster {

  function initialize(
    address _owner,
    address _tokenAddress,
    uint _pauseTime,
    bytes2[] calldata _contractNames,
    uint8[] calldata _contractTypes, // 0 - eternal storage, 1 - "upgradable", 2 - proxy
    address payable[] calldata _contractAddresses
  ) external {

    require(!masterInitialized, "!init");
    masterInitialized = true;

    owner = _owner;
    tokenAddress = _tokenAddress;
    pauseTime = _pauseTime;

    masterAddress = address(this);
    contractsActive[address(this)] = true;

    require(
      _contractNames.length == _contractTypes.length,
      "check names & types arrays length"
    );

    for (uint i = 0; i < _contractNames.length; i++) {

      bytes2 name = _contractNames[i];
      address payable contractAddress = _contractAddresses[i];

      allContractNames.push(name);
      allContractVersions[name] = contractAddress;
      contractsActive[contractAddress] = true;

      if (_contractTypes[i] == 1) {
        isUpgradable[name] = true;
      } else if (_contractTypes[i] == 2) {
        isProxy[name] = true;
      }
    }
  }

  function switchGovernanceAddress(address payable newGV) external {

    {// change governance address
      address currentGV = allContractVersions["GV"];
      allContractVersions["GV"] = newGV;
      contractsActive[currentGV] = false;
      contractsActive[newGV] = true;
    }

    // notify all contracts about address change
    for (uint i = 0; i < allContractNames.length; i++) {
      address _address = allContractVersions[allContractNames[i]];
      Iupgradable up = Iupgradable(_address);
      up.changeMasterAddress(address(this));
      up.changeDependentContractAddress();
    }
  }

}
