pragma solidity ^0.5.7;

import "../modules/governance/NXMaster.sol";

contract DisposableNXMaster is NXMaster {

  function initialize(
    address _owner,
    address _tokenAddress,
    uint _pauseTime,
    bytes2[] calldata _contractNames,
    uint8[] calldata _contractTypes, // 0 - eternal storage, 1 - "upgradable", 2 - proxy
    address payable[] calldata _contractAddresses // 0 - eternal storage, 1 - "upgradable", 2 - proxy
  ) external {

    require(!constructorCheck, "Already initialized");
    constructorCheck = true;
    masterInitialized = true;

    owner = _owner;
    tokenAddress = _tokenAddress;
    pauseTime = _pauseTime;

    masterAddress = address(this);
    contractsActive[address(this)] = true;

    require(
      _contractNames.length == _contractTypes.length,
      'contract names and types arrays should have the same length'
    );

    for (uint i = 0; i < _contractNames.length; i++) {

      bytes2 name = _contractNames[i];
      address add = _contractAddresses[i];

      allContractNames.push(name);
      contractsActive[add] = true;

      if (_contractTypes[i] == 1) {
        isUpgradable[name] = true;
      } else if (_contractTypes[i] == 2) {
        isProxy[name] = true;
      }

    }

    // _changeAllAddress();
    // TokenController tc = TokenController(getLatestAddress("TC"));
    // tc.changeOperator(getLatestAddress("TC"));

    //    allContractNames.push("TD");
    //    allContractNames.push("CD");
    //    allContractNames.push("PD");
    //    allContractNames.push("QT");
    //    allContractNames.push("TF");
    //    allContractNames.push("TC");
    //    allContractNames.push("CL");
    //    allContractNames.push("CR");
    //    allContractNames.push("P1");
    //    allContractNames.push("P2");
    //    allContractNames.push("MC");
    //    allContractNames.push("GV");
    //    allContractNames.push("PC");
    //    allContractNames.push("MR");
    //    allContractNames.push("PS");

        isUpgradable["TF"] = true;
        isUpgradable["CL"] = true;
        isUpgradable["CR"] = true;
        isUpgradable["P1"] = true;
        isUpgradable["P2"] = true;
        isUpgradable["MC"] = true;

        isProxy["TC"] = true;
        isProxy["GV"] = true;
        isProxy["PC"] = true;
        isProxy["MR"] = true;
        isProxy["PS"] = true;

  }

  /// @dev Original NXMaster.addNewVersion function that initializes a master on a fresh deploy
  /// @dev Not needed in production but required for the test environment
  /// @param _contractAddresses Array of contract addresses which will be generated
  function addNewVersion(address payable[] memory _contractAddresses) public {

    require(msg.sender == owner && !masterInitialized, "Caller should be owner and should only be called once.");
    require(_contractAddresses.length == allContractNames.length, "array length not same");
    masterInitialized = true;

    MemberRoles mr = MemberRoles(_contractAddresses[14]);
    // shoud send proxy address for proxy contracts (if not 1st time deploying)
    bool isMasterUpgrade = mr.nxMasterAddress() != address(0);

    for (uint i = 0; i < allContractNames.length; i++) {
      require(_contractAddresses[i] != address(0), "NULL address is not allowed.");
      if (isProxy[allContractNames[i]]) {
        if (isMasterUpgrade) {
          allContractVersions[allContractNames[i]] = _contractAddresses[i];
        } else {
          address proxyAddress = _generateProxy(_contractAddresses[i]);
          allContractVersions[allContractNames[i]] = address(uint160(proxyAddress));
          contractsActive[proxyAddress] = true;
          if (allContractNames[i] == "MR") {
            mr = MemberRoles(proxyAddress);
            mr.memberRolesInitiate(owner, allContractVersions["TF"]);
          }
        }
      } else {
        allContractVersions[allContractNames[i]] = _contractAddresses[i];
      }
      Iupgradable up = Iupgradable(allContractVersions[allContractNames[i]]);
      up.changeMasterAddress(address(this));
    }

    if (!isMasterUpgrade) {
      _changeAllAddress();
      TokenController tc = TokenController(getLatestAddress("TC"));
      tc.changeOperator(getLatestAddress("TC"));
    }

    // Need to override owner as owner in MR to avoid inconsistency as owner in MR is some other address.
    (, address[] memory mrOwner) = mr.members(uint(MemberRoles.Role.Owner));
    owner = mrOwner[0];
  }

}
