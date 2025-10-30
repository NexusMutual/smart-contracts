// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../abstract/RegistryAware.sol";
import "../../interfaces/ILegacyMCR.sol";
import "../../interfaces/ILegacyPool.sol";
import "../../interfaces/IMasterAwareV2.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IPool.sol";
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

    if (address(registry) == address(0)) {
      return paused;
    }

    return registry.isPaused(PAUSE_GLOBAL);
  }

  function isMember(address _add) public view returns (bool) {

    if (address(registry) == address(0)) {
      IMemberRoles mr = IMemberRoles(getLatestAddress("MR"));
      return mr.checkRole(_add, uint(IMemberRoles.Role.Member));
    }

    return registry.isMember(_add);
  }

  function isAdvisoryBoardMember(address _add) public view returns (bool) {

    if (address(registry) == address(0)) {
      IMemberRoles mr = IMemberRoles(getLatestAddress("MR"));
      return mr.checkRole(_add, uint(IMemberRoles.Role.AdvisoryBoard));
    }

    return registry.isAdvisoryBoardMember(_add);
  }

  function isInternal(address _contractAddress) public view returns (bool) {

    if (address(registry) == address(0)) {
      return contractsActive[_contractAddress];
    }

    return registry.getContractIndexByAddress(_contractAddress) > 0;
  }

  function getContractIndexByCode(bytes2 code) public pure returns (uint index) {
    return
      code == "SP" ? C_STAKING_PRODUCTS :
      code == "CO" ? C_COVER            :
      code == "AS" ? C_ASSESSMENTS      :
      code == "CP" ? C_COVER_PRODUCTS   :
      code == "CI" ? C_CLAIMS           :
      code == "ST" ? C_SAFE_TRACKER     :
      code == "TC" ? C_TOKEN_CONTROLLER :
      code == "RA" ? C_RAMM             :
      code == "P1" ? C_POOL             :
      code == "GV" ? C_GOVERNOR         :
      code == "LO" ? C_LIMIT_ORDERS     :
      code == "MC" ? C_POOL             : // MCR functions are now in the Pool contract
      0;
  }

  function getLatestAddress(bytes2 _contractName) public view returns (address payable contractAddress) {

    // all codes: SP CO AS CP CI ST TC RA PC P1 MR MC GV LO MS
    // PC/ProposalCategory - dropped
    // MR/MemberRoles, MS/NXMaster - forward compatible

    if (address(registry) == address(0)) {
      return contractAddresses[_contractName];
    }

    uint index = getContractIndexByCode(_contractName);

    return index > 0
      ? registry.getContractAddressByIndex(index)
      : contractAddresses[_contractName];
  }

  function checkIsAuthToGoverned(address _add) public view returns (bool) {
    return getLatestAddress("GV") == _add;
  }

  function transferOwnershipToRegistry(address _registry) external {

    require(getLatestAddress("GV") == msg.sender, "NXMaster: Not authorized");

   // transfer proxies' ownership
    uint contractCount = contractCodes.length;

    for (uint i = 0; i < contractCount; i++) {
      bytes2 code = contractCodes[i];
      address contractAddress = contractAddresses[code];

      if (isProxy[code]) {
        IUpgradeableProxy proxy = IUpgradeableProxy(contractAddress);
        if (proxy.proxyOwner() == address(this)) {
          proxy.transferProxyOwnership(_registry);
        }
      }
    }
  }

  function migrate(address _registry) external {

    require(getLatestAddress("GV") == msg.sender, "NXMaster: Not authorized");
    require(address(registry) == address(0), "NXMaster: Already migrated");

    // upgrade capital pool
    address oldPool = getLatestAddress("P1");
    address oldMCR = getLatestAddress("MC");
    address payable newPool = IRegistry(_registry).getContractAddressByIndex(C_POOL);

    // update first so the new pool is internal
    contractsActive[oldPool] = false;
    contractAddresses['P1'] = newPool;
    contractsActive[newPool] = true;

    // trigger assets/aggregators/mcr copy
    IPool(newPool).migrate(oldPool, oldMCR);

    // move the funds
    ILegacyPool(oldPool).upgradeCapitalPool(newPool);

    // transfer the control over to registry
    registry = IRegistry(_registry);
  }

}
