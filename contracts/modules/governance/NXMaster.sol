// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../../interfaces/IMasterAwareV2.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IPool.sol";
import "./external/OwnedUpgradeabilityProxy.sol";

contract NXMaster is INXMMaster {

  address public _unusedM; // Governed contract masterAddress slot
  uint public _unused0;

  bytes2[] public contractCodes;
  mapping(address => bool) public contractsActive;
  mapping(bytes2 => address payable) public contractAddresses;
  mapping(bytes2 => bool) public isProxy;
  mapping(bytes2 => bool) public isReplaceable;

  address public tokenAddress;
  bool internal reentrancyLock;
  bool public masterInitialized;
  address public owner;
  uint public _unused1;

  address public emergencyAdmin;
  bool public paused;

  enum ContractType { Undefined, Replaceable, Proxy }

  event InternalContractAdded(bytes2 indexed code, address contractAddress, ContractType indexed contractType);
  event ContractUpgraded(bytes2 indexed code, address newAddress, address previousAddress, ContractType indexed contractType);
  event ContractRemoved(bytes2 indexed code, address contractAddress);
  event PauseConfigured(bool paused);

  modifier onlyAuthorizedToGovern() {
    require(getLatestAddress("GV") == msg.sender, "Not authorized");
    _;
  }

  modifier noReentrancy() {
    require(!reentrancyLock, "Reentrant call.");
    reentrancyLock = true;
    _;
    reentrancyLock = false;
  }

  modifier onlyEmergencyAdmin() {
    require(msg.sender == emergencyAdmin, "NXMaster: Not emergencyAdmin");
    _;
  }

  function initializeEmergencyAdmin() external {
    if (emergencyAdmin == address(0)) {
      emergencyAdmin = 0x422D71fb8040aBEF53f3a05d21A9B85eebB2995D;
    }
  }

  function addNewInternalContracts(
    bytes2[] calldata newContractCodes,
    address payable[] calldata newAddresses,
    uint[] calldata _types
  ) external onlyAuthorizedToGovern {
    require(newContractCodes.length == newAddresses.length, "NXMaster: newContractCodes.length != newAddresses.length.");
    require(newContractCodes.length == _types.length, "NXMaster: newContractCodes.length != _types.length");
    for (uint i = 0; i < newContractCodes.length; i++) {
      addNewInternalContract(newContractCodes[i], newAddresses[i], _types[i]);
    }
  }

  /// @dev Adds new internal contract
  /// @param contractCode contract code for new contract
  /// @param contractAddress contract address for new contract
  /// @param _type pass 1 if contract is replaceable, 2 if contract is proxy
  function addNewInternalContract(
    bytes2 contractCode,
    address payable contractAddress,
    uint _type
  ) internal {

    require(contractAddresses[contractCode] == address(0), "NXMaster: Code already in use");
    require(contractAddress != address(0), "NXMaster: Contract address is 0");

    contractCodes.push(contractCode);

    address payable newInternalContract;
    if (_type == uint(ContractType.Replaceable)) {

      newInternalContract = contractAddress;
      isReplaceable[contractCode] = true;
    } else if (_type == uint(ContractType.Proxy)) {

      newInternalContract = address(new OwnedUpgradeabilityProxy(contractAddress));
      isProxy[contractCode] = true;
    } else {
      revert("NXMaster: Unsupported contract type");
    }

    contractAddresses[contractCode] = newInternalContract;
    contractsActive[newInternalContract] = true;

    IMasterAwareV2 up = IMasterAwareV2(newInternalContract);
    up.changeMasterAddress(address(this));
    up.changeDependentContractAddress();

    emit InternalContractAdded(contractCode, contractAddress, ContractType(_type));
  }

  /// @dev upgrades multiple contracts at a time
  function upgradeMultipleContracts(
    bytes2[] calldata _contractCodes,
    address payable[] calldata newAddresses
  ) external onlyAuthorizedToGovern {
    require(_contractCodes.length == newAddresses.length, "NXMaster: _contractCodes.length != newAddresses.length");

    for (uint i = 0; i < _contractCodes.length; i++) {
      address payable newAddress = newAddresses[i];
      bytes2 code = _contractCodes[i];
      require(newAddress != address(0), "NXMaster: Contract address is 0");

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

      revert("NXMaster: Non-existant or non-upgradeable contract code");
    }

    updateAllDependencies();
  }

  function replaceContract(bytes2 code, address payable newAddress) internal {
    if (code == "P1") {
      IPool p1 = IPool(contractAddresses["P1"]);
      p1.upgradeCapitalPool(newAddress);
    }

    address payable oldAddress = contractAddresses[code];
    contractsActive[oldAddress] = false;
    contractAddresses[code] = newAddress;
    contractsActive[newAddress] = true;

    IMasterAwareV2 up = IMasterAwareV2(contractAddresses[code]);
    up.changeMasterAddress(address(this));
  }

  function removeContracts(bytes2[] calldata contractCodesToRemove) external onlyAuthorizedToGovern {

    for (uint i = 0; i < contractCodesToRemove.length; i++) {
      bytes2 code = contractCodesToRemove[i];
      address contractAddress = contractAddresses[code];
      require(contractAddress != address(0), "NXMaster: Address is 0");
      require(isInternal(contractAddress), "NXMaster: Contract not internal");
      contractsActive[contractAddress] = false;
      contractAddresses[code] = address(0);

      if (isProxy[code]) {
        isProxy[code] = false;
      }

      if (isReplaceable[code]) {
        isReplaceable[code] = false;
      }
      emit ContractRemoved(code, contractAddress);
    }

    // delete elements from contractCodes
    for (uint i = 0; i < contractCodes.length; i++) {
      for (uint j = 0; j < contractCodesToRemove.length; j++) {
        if (contractCodes[i] == contractCodesToRemove[j]) {
          contractCodes[i] = contractCodes[contractCodes.length - 1];
          contractCodes.pop();
          i = i == 0 ? 0 : i - 1;
        }
      }
    }

    updateAllDependencies();
  }

  function updateAllDependencies() internal {
    for (uint i = 0; i < contractCodes.length; i++) {
      IMasterAwareV2 up = IMasterAwareV2(contractAddresses[contractCodes[i]]);
      up.changeDependentContractAddress();
    }
  }

  /**
   * @dev set Emergency pause
   * @param _paused to toggle emergency pause ON/OFF
   */
  function setEmergencyPause(bool _paused) public onlyEmergencyAdmin {
    paused = _paused;
    emit PauseConfigured(_paused);
  }

  /// @dev checks whether the address is an internal contract address.
  function isInternal(address _contractAddress) public view returns (bool) {
    return contractsActive[_contractAddress];
  }

  /// @dev Checks whether emergency pause is on/not.
  function isPause() public view returns (bool) {
    return paused;
  }

  /// @dev checks whether the address is a member of the mutual or not.
  function isMember(address _add) public view returns (bool) {
    IMemberRoles mr = IMemberRoles(getLatestAddress("MR"));
    return mr.checkRole(_add, uint(IMemberRoles.Role.Member));
  }

  /// @dev Gets current contract codes and their addresses
  /// @return contractCodes
  /// @return contractAddresses
  function getInternalContracts() public view returns (
    bytes2[] memory _contractCodes,
    address[] memory _contractAddresses
  ) {
    _contractCodes = contractCodes;
    _contractAddresses = new address[](contractCodes.length);

    for (uint i = 0; i < _contractCodes.length; i++) {
      _contractAddresses[i] = contractAddresses[contractCodes[i]];
    }
  }

  /// @dev Gets latest contract address
  /// @param _contractName Contract name to fetch
  function getLatestAddress(bytes2 _contractName) public view returns (address payable contractAddress) {
    contractAddress = contractAddresses[_contractName];
  }

  /**
   * @dev to check if the address is authorized to govern or not
   * @param _add is the address in concern
   * @return the boolean status status for the check
   */
  function checkIsAuthToGoverned(address _add) public view returns (bool) {
    return getLatestAddress("GV") == _add;
  }

  /**
   * @dev to update the owner parameters
   * @param code is the associated code
   * @param val is value to be set
   */
  function updateOwnerParameters(bytes8 code, address payable val) public onlyAuthorizedToGovern {
    if (code == "EMADMIN") {
      emergencyAdmin = val;
    } else {
      revert("Invalid param code");
    }
  }
}
