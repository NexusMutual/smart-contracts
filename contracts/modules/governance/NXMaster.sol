// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../abstract/RegistryAware.sol";
import "../../interfaces/IMasterAwareV2.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/ILegacyPool.sol";
import "../../interfaces/IUpgradeableProxy.sol";

contract NXMaster is INXMMaster {

  address public _unusedM;
  uint public _unused0;

  bytes2[] public contractCodes;
  mapping(address => bool) public contractsActive;
  mapping(bytes2 => address payable) public contractAddresses;
  mapping(bytes2 => bool) public isProxy;
  mapping(bytes2 => bool) public isReplaceable;

  address public tokenAddress;

  bool internal _unusedReentrancyLock;
  bool internal _unusedMasterInitialized;
  address internal _unusedOwner;
  uint internal _unused1;

  address public emergencyAdmin;
  bool internal paused;

  IRegistry public registry;

  function isPause() public view returns (bool) {
    return registry.isPaused(PAUSE_GLOBAL);
  }

  function isMember(address _add) public view returns (bool) {
    IMemberRoles mr = IMemberRoles(getLatestAddress("MR"));
    return mr.checkRole(_add, uint(IMemberRoles.Role.Member));
  }

  function isAdvisoryBoardMember(address _add) public view returns (bool) {
    IMemberRoles mr = IMemberRoles(getLatestAddress("MR"));
    return mr.checkRole(_add, uint(IMemberRoles.Role.AdvisoryBoard));
  }

  function isInternal(address _contractAddress) public view returns (bool) {

    if (address(registry) == address(0)) {
      return contractsActive[_contractAddress];
    }

    return registry.getContractIndexByAddress(_contractAddress) > 0;
  }

  function getInternalContracts() public view returns (
    bytes2[] memory _contractCodes,
    address[] memory _contractAddresses
  ) {

    _contractCodes = contractCodes;
    _contractAddresses = new address[](contractCodes.length);

    for (uint i = 0; i < _contractCodes.length; i++) {
      _contractAddresses[i] = getLatestAddress(_contractCodes[i]);
    }
  }

  function getLatestAddress(bytes2 _contractName) public view returns (address payable contractAddress) {

    if (address(registry) == address(0)) {
      return contractAddresses[_contractName];
    }

    // all codes: SP CO AS CP CI ST TC RA PC P1 MR MC GV LO MS

    if (_contractName == "SP") {
      return registry.getContractAddressByIndex(C_STAKING_PRODUCTS);
    }

    if (_contractName == "CO") {
      return registry.getContractAddressByIndex(C_COVER);
    }

    if (_contractName == "AS") {
      return registry.getContractAddressByIndex(C_ASSESSMENT);
    }

    if (_contractName == "CP") {
      return registry.getContractAddressByIndex(C_COVER_PRODUCTS);
    }

    if (_contractName == "CI") {
      return registry.getContractAddressByIndex(C_CLAIMS);
    }

    if (_contractName == "ST") {
      return registry.getContractAddressByIndex(C_SAFE_TRACKER);
    }

    if (_contractName == "TC") {
      return registry.getContractAddressByIndex(C_TOKEN_CONTROLLER);
    }

    if (_contractName == "RA") {
      return registry.getContractAddressByIndex(C_RAMM);
    }

    // PC: ProposalCategory dropped

    if (_contractName == "P1") {
      return registry.getContractAddressByIndex(C_POOL);
    }

    // MR: MemberRoles dropped

    // MC: MCR dropped

    if (_contractName == "GV") {
      return registry.getContractAddressByIndex(C_GOVERNOR);
    }

    if (_contractName == "LO") {
      return registry.getContractAddressByIndex(C_LIMIT_ORDERS);
    }

    // MS: NXMaster dropped

    // the ones that we drop
    return contractAddresses[_contractName];
  }

  function checkIsAuthToGoverned(address _add) public view returns (bool) {
    return getLatestAddress("GV") == _add;
  }

  function migrate(address _registry) external {

    require(getLatestAddress("GV") == msg.sender, "NXMaster: Not authorized");
    require(address(registry) == address(0), "NXMaster: Already migrated");

    // transfer proxies' ownership
    uint contractCount = contractCodes.length;

    for (uint i = 0; i < contractCount; i++) {
      bytes2 code = contractCodes[i];
      address contractAddress = contractAddresses[code];

      if (isProxy[code]) {
        IUpgradeableProxy(contractAddress).transferProxyOwnership(_registry);
      }
    }

    // upgrade capital pool
    address pool = getLatestAddress("P1");
    address payable newPool = IRegistry(_registry).getContractAddressByIndex(C_POOL);
    ILegacyPool(pool).upgradeCapitalPool(newPool);

    // transfer the control over to registry
    registry = IRegistry(_registry);
  }

}
