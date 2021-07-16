// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../abstract/MasterAware.sol";
import "../../interfaces/IClaims.sol";
import "../../interfaces/IClaimsData.sol";
import "../../interfaces/IClaimsReward.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IQuotation.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/ITokenData.sol";
import "../capital/LegacyPoolData.sol";
import "./external/Governed.sol";
import "./external/OwnedUpgradeabilityProxy.sol";

contract NXMaster is INXMMaster, Governed {
  using SafeMath for uint;

  uint public _unused0;

  bytes2[] public contractCodes;
  mapping(address => bool) public contractsActive;
  mapping(bytes2 => address payable) internal contractAddresses;
  mapping(bytes2 => bool) public isProxy;
  mapping(bytes2 => bool) public isUpgradable;

  address public tokenAddress;
  bool internal reentrancyLock;
  bool public masterInitialized;
  address public owner;
  uint public _unused1;

  address public emergencyAdmin;
  bool public paused;

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

  /// @dev Adds new internal contract
  /// @param contractCode contract code for new contract
  /// @param contractAddress contract address for new contract
  /// @param _type pass 1 if contract is upgradable, 2 if contract is proxy
  function addNewInternalContract(
    bytes2 contractCode,
    address payable contractAddress,
    uint _type
  )
  external
  onlyAuthorizedToGovern {

    require(contractAddresses[contractCode] == address(0), "NXMaster: code already in use");
    require(contractAddress != address(0), "NXMaster: contract address is 0");

    contractCodes.push(contractCode);

    address newInternalContract;
    if (_type == 1) {

      newInternalContract = contractAddress;
      isUpgradable[contractCode] = true;
    } else if (_type == 2) {

      newInternalContract = address(new OwnedUpgradeabilityProxy(contractAddress));
      isProxy[contractCode] = true;
    } else {
      revert("NXMaster: Unsupported contract type");
    }

    contractAddresses[contractCode] = address(uint160(newInternalContract));
    contractsActive[newInternalContract] = true;

    MasterAware up = MasterAware(contractAddresses[contractCode]);
    up.changeMasterAddress(address(this));
    up.changeDependentContractAddress();
  }

  /// @dev upgrades multiple contracts at a time
  function upgradeMultipleContracts(
    bytes2[] memory _contractCodes,
    address payable[] memory newAddresses
  )
  public
  onlyAuthorizedToGovern
  {
    require(_contractCodes.length == newAddresses.length, "NXMaster: Array length should be equal.");

    for (uint i = 0; i < _contractCodes.length; i++) {

      address payable newAddress = newAddresses[i];
      bytes2 code = _contractCodes[i];
      require(newAddress != address(0), "NXMaster: contract address is 0");
      if (isProxy[code]) {
        OwnedUpgradeabilityProxy proxy = OwnedUpgradeabilityProxy(contractAddresses[code]);
        proxy.upgradeTo(newAddress);
        continue;
      }

      if (isUpgradable[code]) {
        replaceContract(code, newAddress);
        continue;
      }

      revert("NXMaster: non-existant contract code");
    }

    for (uint i = 0; i < contractCodes.length; i++) {
      contractsActive[contractAddresses[contractCodes[i]]] = true;
      MasterAware up = MasterAware(contractAddresses[contractCodes[i]]);
      up.changeDependentContractAddress();
    }
  }

  function replaceContract(bytes2 code, address payable newAddress) internal {

    if (code == "QT") {
      IQuotation qt = IQuotation(contractAddresses["QT"]);
      qt.transferAssetsToNewContract(newAddress);

    } else if (code == "CR") {
      ITokenController tc = ITokenController(getLatestAddress("TC"));
      tc.addToWhitelist(newAddress);
      tc.removeFromWhitelist(contractAddresses["CR"]);
      IClaimsReward cr = IClaimsReward(contractAddresses["CR"]);
      cr.upgrade(newAddress);

    } else if (code == "P1") {
      IPool p1 = IPool(contractAddresses["P1"]);
      p1.upgradeCapitalPool(newAddress);
    }

    address payable oldAddress = contractAddresses[code];
    contractsActive[oldAddress] = false;
    contractAddresses[code] = newAddress;
    contractsActive[newAddress] = true;

    MasterAware up = MasterAware(contractAddresses[code]);
    up.changeMasterAddress(address(this));
  }

  /**
   * @dev set Emergency pause
   * @param _paused to toggle emergency pause ON/OFF
   */
  function setEmergencyPause(bool _paused) public onlyEmergencyAdmin {
    paused = _paused;
  }

  /// @dev checks whether the address is an internal contract address.
  function isInternal(address _contractAddress) public view returns (bool) {
    return contractsActive[_contractAddress];
  }

  /// @dev checks whether the address is the Owner or not.
  function isOwner(address _address) public view returns (bool) {
    return owner == _address;
  }

  /// @dev Checks whether emergency pause id on/not.
  function isPause() public view returns (bool) {
    return paused;
  }

  /// @dev checks whether the address is a member of the mutual or not.
  function isMember(address _add) public view returns (bool) {
    IMemberRoles mr = IMemberRoles(getLatestAddress("MR"));
    return mr.checkRole(_add, uint(IMemberRoles.Role.Member));
  }

  /// @dev Gets latest version name and address
  /// @return contractsName Latest version's contract names
  /// @return contractsAddress Latest version's contract addresses
  function getVersionData()
  public
  view
  returns (
    bytes2[] memory contractsName,
    address[] memory contractsAddress
  )
  {
    contractsName = contractCodes;
    contractsAddress = new address[](contractCodes.length);

    for (uint i = 0; i < contractCodes.length; i++) {
      contractsAddress[i] = contractAddresses[contractCodes[i]];
    }
  }

  /**
   * @dev returns the address of token controller
   * @return address is returned
   */
  function dAppLocker() public view returns (address) {
    return getLatestAddress("TC");
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
    return isAuthorizedToGovern(_add);
  }

  /**
   * @dev to update the owner parameters
   * @param code is the associated code
   * @param val is value to be set
   */
  function updateOwnerParameters(bytes8 code, address payable val) public onlyAuthorizedToGovern {
    IQuotationData qd;
    LegacyPoolData pd;
    if (code == "MSWALLET") {

      ITokenData td;
      td = ITokenData(getLatestAddress("TD"));
      td.changeWalletAddress(val);

    } else if (code == "OWNER") {

      IMemberRoles mr = IMemberRoles(getLatestAddress("MR"));
      mr.swapOwner(val);
      owner = val;

    } else if (code == "QUOAUTH") {

      qd = IQuotationData(getLatestAddress("QD"));
      qd.changeAuthQuoteEngine(val);

    } else if (code == "KYCAUTH") {

      qd = IQuotationData(getLatestAddress("QD"));
      qd.setKycAuthAddress(val);

    } else if (code == "EMADMIN") {

      emergencyAdmin = val;

    } else {
      revert("Invalid param code");
    }
  }
}
