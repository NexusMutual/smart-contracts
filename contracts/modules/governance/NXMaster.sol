/* Copyright (C) 2020 NexusMutual.io

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

pragma solidity ^0.5.0;

import "../capital/Pool.sol";
import "../cover/Quotation.sol";
import "../claims/Claims.sol";
import "./external/Governed.sol";
import "./external/OwnedUpgradeabilityProxy.sol";
import "../capital/LegacyPoolData.sol";

contract NXMaster is Governed {
  using SafeMath for uint;

  struct EmergencyPause {
    bool pause;
    uint time;
    bytes4 by;
  }

  EmergencyPause[] public emergencyPaused;

  bytes2[] internal allContractNames;
  mapping(address => bool) public contractsActive;
  mapping(bytes2 => address payable) internal allContractVersions;
  mapping(bytes2 => bool) public isProxy;
  mapping(bytes2 => bool) public isUpgradable;

  address public tokenAddress;
  bool internal reentrancyLock;
  bool public masterInitialized;
  address public owner;
  uint public pauseTime;

  modifier noReentrancy() {
    require(!reentrancyLock, "Reentrant call.");
    reentrancyLock = true;
    _;
    reentrancyLock = false;
  }

  function upgradeMultipleImplementations(
    bytes2[] calldata _contractNames,
    address[] calldata _contractAddresses
  )
  external
  onlyAuthorizedToGovern
  {
    require(_contractNames.length == _contractAddresses.length, "Array length should be equal.");
    for (uint i = 0; i < _contractNames.length; i++) {
      require(_contractAddresses[i] != address(0), "null address is not allowed.");
      require(isProxy[_contractNames[i]], "Contract should be proxy.");
      OwnedUpgradeabilityProxy proxy = OwnedUpgradeabilityProxy(allContractVersions[_contractNames[i]]);
      proxy.upgradeTo(_contractAddresses[i]);
    }
  }

  /// @dev Adds new internal contract
  /// @param _contractName contract code for new contract
  /// @param _contractAddress contract address for new contract
  /// @param _type pass 1 if contract is upgradable, 2 if contract is proxy, any other uint if none.
  function addNewInternalContract(
    bytes2 _contractName,
    address payable _contractAddress,
    uint _type
  )
  external
  onlyAuthorizedToGovern {
    require(allContractVersions[_contractName] == address(0), "Contract code is already available.");
    require(_contractAddress != address(0), "NULL address is not allowed.");
    allContractNames.push(_contractName);
    address newInternalContract = _contractAddress;
    if (_type == 1) {
      isUpgradable[_contractName] = true;
    } else if (_type == 2) {
      newInternalContract = _generateProxy(_contractAddress);
      isProxy[_contractName] = true;
    }
    allContractVersions[_contractName] = address(uint160(newInternalContract));
    contractsActive[newInternalContract] = true;
    Iupgradable up = Iupgradable(allContractVersions[_contractName]);
    up.changeMasterAddress(address(this));
    up.changeDependentContractAddress();
  }

  /**
   * @dev Anyone can close a claim if oraclize fails to close it.
   * @param _claimId id of claim to be closed.
   */
  function closeClaim(uint _claimId) external {

    require(canCall(_claimId), "Payout retry time not reached.");
    ClaimsReward cr = ClaimsReward(getLatestAddress("CR"));
    cr.changeClaimStatus(_claimId);
  }

  function getOwnerParameters(bytes8 code) external view returns (bytes8 codeVal, address val) {
    codeVal = code;
    QuotationData qd;
    LegacyPoolData pd;
    if (code == "MSWALLET") {
      TokenData td;
      td = TokenData(getLatestAddress("TD"));
      val = td.walletAddress();

    } else if (code == "MCRNOTA") {

      pd = LegacyPoolData(getLatestAddress("PD"));
      val = pd.notariseMCR();

    } else if (code == "OWNER") {

      val = owner;

    } else if (code == "QUOAUTH") {

      qd = QuotationData(getLatestAddress("QD"));
      val = qd.authQuoteEngine();

    } else if (code == "KYCAUTH") {
      qd = QuotationData(getLatestAddress("QD"));
      val = qd.kycAuthAddress();

    }

  }

  /// @dev Add Emergency pause
  /// @param _pause to set Emergency Pause ON/OFF
  /// @param _by to set who Start/Stop EP
  function addEmergencyPause(bool _pause, bytes4 _by) public onlyAuthorizedToGovern {
    emergencyPaused.push(EmergencyPause(_pause, now, _by));
    if (_pause == false) {
      Claims c1 = Claims(allContractVersions["CL"]);
      c1.submitClaimAfterEPOff(); // Process claims submitted while EP was on
      c1.startAllPendingClaimsVoting(); // Resume voting on all pending claims
    }
  }

  ///@dev update time in seconds for which emergency pause is applied.
  function updatePauseTime(uint _time) public {
    require(isInternal(msg.sender), "Not internal call.");
    pauseTime = _time;
  }

  /// @dev upgrades multiple contracts at a time
  function upgradeMultipleContracts(
    bytes2[] memory _contractsName,
    address payable[] memory _contractsAddress
  )
  public
  onlyAuthorizedToGovern
  {
    require(_contractsName.length == _contractsAddress.length, "Array length should be equal.");

    for (uint i = 0; i < _contractsName.length; i++) {

      address payable newAddress = _contractsAddress[i];
      require(newAddress != address(0), "NULL address is not allowed.");
      require(isUpgradable[_contractsName[i]], "Contract should be upgradable.");

      if (_contractsName[i] == "QT") {
        Quotation qt = Quotation(allContractVersions["QT"]);
        qt.transferAssetsToNewContract(newAddress);

      } else if (_contractsName[i] == "CR") {
        TokenController tc = TokenController(getLatestAddress("TC"));
        tc.addToWhitelist(newAddress);
        tc.removeFromWhitelist(allContractVersions["CR"]);
        ClaimsReward cr = ClaimsReward(allContractVersions["CR"]);
        cr.upgrade(newAddress);

      } else if (_contractsName[i] == "P1") {
        Pool p1 = Pool(allContractVersions["P1"]);
        p1.upgradeCapitalPool(newAddress);
      }

      address payable oldAddress = allContractVersions[_contractsName[i]];
      contractsActive[oldAddress] = false;
      allContractVersions[_contractsName[i]] = newAddress;
      contractsActive[newAddress] = true;

      Iupgradable up = Iupgradable(allContractVersions[_contractsName[i]]);
      up.changeMasterAddress(address(this));
    }

    _changeAllAddress();
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
    uint length = emergencyPaused.length;
    return length > 0 && emergencyPaused[length - 1].pause;
  }

  /// @dev checks whether the address is a member of the mutual or not.
  function isMember(address _add) public view returns (bool) {
    MemberRoles mr = MemberRoles(getLatestAddress("MR"));
    return mr.checkRole(_add, uint(MemberRoles.Role.Member));
  }

  ///@dev Gets the number of emergency pause has been toggled.
  function getEmergencyPausedLength() public view returns (uint len) {
    len = emergencyPaused.length;
  }

  ///@dev Gets last emergency pause details.
  function getLastEmergencyPause() public view returns (bool _pause, uint _time, bytes4 _by) {
    _pause = false;
    _time = 0;
    _by = "";
    uint len = getEmergencyPausedLength();
    if (len > 0) {
      len = len.sub(1);
      _pause = emergencyPaused[len].pause;
      _time = emergencyPaused[len].time;
      _by = emergencyPaused[len].by;
    }
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
    contractsName = allContractNames;
    contractsAddress = new address[](allContractNames.length);

    for (uint i = 0; i < allContractNames.length; i++) {
      contractsAddress[i] = allContractVersions[allContractNames[i]];
    }
  }

  /**
   * @dev returns the address of token controller
   * @return address is returned
   */
  function dAppLocker() public view returns (address _add) {

    _add = getLatestAddress("TC");

  }

  /**
   * @dev returns the address of nxm token
   * @return address is returned
   */
  function dAppToken() public view returns (address _add) {
    _add = tokenAddress;
  }

  /// @dev Gets latest contract address
  /// @param _contractName Contract name to fetch
  function getLatestAddress(bytes2 _contractName) public view returns (address payable contractAddress) {
    contractAddress = allContractVersions[_contractName];
  }

  /// @dev Creates a new version of contract addresses
  /// @param _contractAddresses Array of contract addresses which will be generated
  function addNewVersion(address payable[] memory _contractAddresses) public {

    require(msg.sender == owner && !masterInitialized, "Caller should be owner and should only be called once.");
    require(_contractAddresses.length == allContractNames.length, "array length not same");
    masterInitialized = true;

    MemberRoles mr = MemberRoles(_contractAddresses[14]);
    // shoud send proxy address for proxy contracts (if not 1st time deploying)
    // bool isMasterUpgrade = mr.nxMasterAddress() != address(0);

    for (uint i = 0; i < allContractNames.length; i++) {
      require(_contractAddresses[i] != address(0), "NULL address is not allowed.");
      allContractVersions[allContractNames[i]] = _contractAddresses[i];
      contractsActive[_contractAddresses[i]] = true;

    }

    // Need to override owner as owner in MR to avoid inconsistency as owner in MR is some other address.
    (, address[] memory mrOwner) = mr.members(uint(MemberRoles.Role.Owner));
    owner = mrOwner[0];
  }

  /**
   * @dev to check if the address is authorized to govern or not
   * @param _add is the address in concern
   * @return the boolean status status for the check
   */
  function checkIsAuthToGoverned(address _add) public view returns (bool) {
    return isAuthorizedToGovern(_add);
  }

  /// @dev Allow AB Members to Start Emergency Pause
  function startEmergencyPause() public onlyAuthorizedToGovern {
    addEmergencyPause(true, "AB"); // Start Emergency Pause
    Claims c1 = Claims(allContractVersions["CL"]);
    c1.pauseAllPendingClaimsVoting(); // Pause Voting of all pending Claims
  }

  /**
   * @dev to update the owner parameters
   * @param code is the associated code
   * @param val is value to be set
   */
  function updateOwnerParameters(bytes8 code, address payable val) public onlyAuthorizedToGovern {
    QuotationData qd;
    LegacyPoolData pd;
    if (code == "MSWALLET") {
      TokenData td;
      td = TokenData(getLatestAddress("TD"));
      td.changeWalletAddress(val);

    } else if (code == "MCRNOTA") {

      pd = LegacyPoolData(getLatestAddress("PD"));
      pd.changeNotariseAddress(val);

    } else if (code == "OWNER") {

      MemberRoles mr = MemberRoles(getLatestAddress("MR"));
      mr.swapOwner(val);
      owner = val;

    } else if (code == "QUOAUTH") {

      qd = QuotationData(getLatestAddress("QD"));
      qd.changeAuthQuoteEngine(val);

    } else if (code == "KYCAUTH") {
      qd = QuotationData(getLatestAddress("QD"));
      qd.setKycAuthAddress(val);

    } else {
      revert("Invalid param code");
    }
  }

  /**
   * @dev to generater proxy
   * @param _implementationAddress of the proxy
   */
  function _generateProxy(address _implementationAddress) internal returns (address) {
    OwnedUpgradeabilityProxy proxy = new OwnedUpgradeabilityProxy(_implementationAddress);
    return address(proxy);
  }

  /// @dev Sets the older versions of contract addresses as inactive and the latest one as active.
  function _changeAllAddress() internal {
    for (uint i = 0; i < allContractNames.length; i++) {
      contractsActive[allContractVersions[allContractNames[i]]] = true;
      Iupgradable up = Iupgradable(allContractVersions[allContractNames[i]]);
      up.changeDependentContractAddress();
    }
  }

  function canCall(uint _claimId) internal view returns (bool)
  {
    ClaimsData cd = ClaimsData(getLatestAddress("CD"));
    (, , , uint status, uint dateUpd,) = cd.getClaim(_claimId);
    if (status == 12) {
      if (dateUpd.add(cd.payoutRetryTime()) > now) {
        return false;
      }
    }
    return true;
  }
}
