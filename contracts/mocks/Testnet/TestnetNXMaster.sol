// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../../modules/governance/NXMaster.sol";

contract TestnetNXMaster is NXMaster {

  address public governanceOwner;

  modifier onlyGovernanceOwner() {
    require(msg.sender == governanceOwner, "Ownable: caller is not the owner");
    _;
  }

  function initializeGovernanceOwner() public {
    if (governanceOwner != address(0)) {
      revert("Already initialized");
    }
    governanceOwner = msg.sender;
  }

  function switchGovernanceAddress(address payable newGV) external onlyGovernanceOwner {
    address currentGV = contractAddresses["GV"];
    contractAddresses["GV"] = newGV;
    contractsActive[currentGV] = false;
    contractsActive[newGV] = true;
  }

  /// @dev upgrades multiple contracts at a time
  function upgradeMultipleContracts(
    bytes2[] memory _contractCodes,
    address payable[] memory newAddresses
  )
  public {

    require(getLatestAddress("GV") == msg.sender || governanceOwner == msg.sender, "Not authorized");

    require(_contractCodes.length == newAddresses.length, "NXMaster: _contractCodes.length != newAddresses.length");

    for (uint i = 0; i < _contractCodes.length; i++) {
      address payable newAddress = newAddresses[i];
      bytes2 code = _contractCodes[i];
      require(newAddress != address(0), "NXMaster: contract address is 0");

      if (isProxy[code]) {
        OwnedUpgradeabilityProxy proxy = OwnedUpgradeabilityProxy(contractAddresses[code]);
        address previousAddress = proxy.implementation();
        proxy.upgradeTo(newAddress);
        emit ContractUpgraded(code, newAddress, previousAddress, ContractType.Proxy);
        continue;
      }

      if (isReplaceable[code]) {
        address previousAddress = getLatestAddress(code);
        replaceContract(code, newAddress);
        emit ContractUpgraded(code, newAddress, previousAddress, ContractType.Replaceable);
        continue;
      }

      revert("NXMaster: non-existant or non-upgradeable contract code");
    }

    updateAllDependencies();
  }
}
