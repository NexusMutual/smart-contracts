// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../../libraries/external/SafeMath.sol";
import "../../abstract/LegacyMasterAware.sol";

contract LegacyQuotationData is LegacyMasterAware {
  using SafeMath for uint;

  enum HCIDStatus {NA, kycPending, kycPass, kycFailedOrRefunded, kycPassNoCover}

  enum CoverStatus {Active, ClaimAccepted, ClaimDenied, CoverExpired, ClaimSubmitted, Requested}

  struct Cover {
    address payable memberAddress;
    bytes4 currencyCode;
    uint sumAssured;
    uint16 coverPeriod;
    uint validUntil;
    address scAddress;
    uint premiumNXM;
  }

  struct HoldCover {
    uint holdCoverId;
    address payable userAddress;
    address scAddress;
    bytes4 coverCurr;
    uint[] coverDetails;
    uint16 coverPeriod;
  }

  address public authQuoteEngine;

  mapping(bytes4 => uint) internal currencyCSA;
  mapping(address => uint[]) internal userCover;
  mapping(address => uint[]) public userHoldedCover;
  mapping(address => bool) public refundEligible;
  mapping(address => mapping(bytes4 => uint)) internal currencyCSAOfSCAdd;
  mapping(uint => uint8) public coverStatus;
  mapping(uint => uint) public holdedCoverIDStatus;
  mapping(uint => bool) public timestampRepeated;


  Cover[] internal allCovers;
  HoldCover[] internal allCoverHolded;

  uint public stlp;
  uint public stl;
  uint public pm;
  uint public minDays;
  uint public tokensRetained;
  address public kycAuthAddress;

  event CoverDetailsEvent(
    uint indexed cid,
    address scAdd,
    uint sumAssured,
    uint expiry,
    uint premium,
    uint premiumNXM,
    bytes4 curr
  );

  event CoverStatusEvent(uint indexed cid, uint8 statusNum);

  constructor(address _authQuoteAdd, address _kycAuthAdd) public {
    authQuoteEngine = _authQuoteAdd;
    kycAuthAddress = _kycAuthAdd;
    stlp = 90;
    stl = 100;
    pm = 30;
    minDays = 30;
    tokensRetained = 10;
    allCovers.push(Cover(address(0), "0x00", 0, 0, 0, address(0), 0));
    uint[] memory arr = new uint[](1);
    allCoverHolded.push(HoldCover(0, address(0), address(0), 0x00, arr, 0));
  }

  /// @dev Adds the amount in Total Sum Assured of a given currency of a given smart contract address.
  /// @param _add Smart Contract Address.
  /// @param _amount Amount to be added.
  function addInTotalSumAssuredSC(address _add, bytes4 _curr, uint _amount) external onlyInternal {
    currencyCSAOfSCAdd[_add][_curr] = currencyCSAOfSCAdd[_add][_curr].add(_amount);
  }

  /// @dev Subtracts the amount from Total Sum Assured of a given currency and smart contract address.
  /// @param _add Smart Contract Address.
  /// @param _amount Amount to be subtracted.
  function subFromTotalSumAssuredSC(address _add, bytes4 _curr, uint _amount) external onlyInternal {
    currencyCSAOfSCAdd[_add][_curr] = currencyCSAOfSCAdd[_add][_curr].sub(_amount);
  }

  /// @dev Subtracts the amount from Total Sum Assured of a given currency.
  /// @param _curr Currency Name.
  /// @param _amount Amount to be subtracted.
  function subFromTotalSumAssured(bytes4 _curr, uint _amount) external onlyInternal {
    currencyCSA[_curr] = currencyCSA[_curr].sub(_amount);
  }

  /// @dev Adds the amount in Total Sum Assured of a given currency.
  /// @param _curr Currency Name.
  /// @param _amount Amount to be added.
  function addInTotalSumAssured(bytes4 _curr, uint _amount) external onlyInternal {
    currencyCSA[_curr] = currencyCSA[_curr].add(_amount);
  }

  /// @dev sets bit for timestamp to avoid replay attacks.
  function setTimestampRepeated(uint _timestamp) external onlyInternal {
    timestampRepeated[_timestamp] = true;
  }

  /// @dev Creates a blank new cover.
  function addCover(
    uint16 _coverPeriod,
    uint _sumAssured,
    address payable _userAddress,
    bytes4 _currencyCode,
    address _scAddress,
    uint premium,
    uint premiumNXM
  )
  external
  onlyInternal
  {
    uint expiryDate = now.add(uint(_coverPeriod).mul(1 days));
    allCovers.push(Cover(_userAddress, _currencyCode,
      _sumAssured, _coverPeriod, expiryDate, _scAddress, premiumNXM));
    uint cid = allCovers.length.sub(1);
    userCover[_userAddress].push(cid);
    emit CoverDetailsEvent(cid, _scAddress, _sumAssured, expiryDate, premium, premiumNXM, _currencyCode);
  }

  /// @dev create holded cover which will process after verdict of KYC.
  function addHoldCover(
    address payable from,
    address scAddress,
    bytes4 coverCurr,
    uint[] calldata coverDetails,
    uint16 coverPeriod
  )
  external
  onlyInternal
  {
    uint holdedCoverLen = allCoverHolded.length;
    holdedCoverIDStatus[holdedCoverLen] = uint(HCIDStatus.kycPending);
    allCoverHolded.push(HoldCover(holdedCoverLen, from, scAddress,
      coverCurr, coverDetails, coverPeriod));
    userHoldedCover[from].push(allCoverHolded.length.sub(1));

  }

  ///@dev sets refund eligible bit.
  ///@param _add user address.
  ///@param status indicates if user have pending kyc.
  function setRefundEligible(address _add, bool status) external onlyInternal {
    refundEligible[_add] = status;
  }

  /// @dev to set current status of particular holded coverID (1 for not completed KYC,
  /// 2 for KYC passed, 3 for failed KYC or full refunded,
  /// 4 for KYC completed but cover not processed)
  function setHoldedCoverIDStatus(uint holdedCoverID, uint status) external onlyInternal {
    holdedCoverIDStatus[holdedCoverID] = status;
  }

  /**
   * @dev to set address of kyc authentication
   * @param _add is the new address
   */
  function setKycAuthAddress(address _add) external onlyInternal {
    kycAuthAddress = _add;
  }

  /// @dev Changes authorised address for generating quote off chain.
  function changeAuthQuoteEngine(address _add) external onlyInternal {
    authQuoteEngine = _add;
  }

  /**
   * @dev Gets Uint Parameters of a code
   * @param code whose details we want
   * @return string value of the code
   * @return associated amount (time or perc or value) to the code
   */
  function getUintParameters(bytes8 code) external view returns (bytes8 codeVal, uint val) {
    codeVal = code;

    if (code == "STLP") {
      val = stlp;

    } else if (code == "STL") {

      val = stl;

    } else if (code == "PM") {

      val = pm;

    } else if (code == "QUOMIND") {

      val = minDays;

    } else if (code == "QUOTOK") {

      val = tokensRetained;

    }

  }

  /// @dev Gets Product details.
  /// @return  _minDays minimum cover period.
  /// @return  _PM Profit margin.
  /// @return  _STL short term Load.
  /// @return  _STLP short term load period.
  function getProductDetails()
  external
  view
  returns (
    uint _minDays,
    uint _pm,
    uint _stl,
    uint _stlp
  )
  {

    _minDays = minDays;
    _pm = pm;
    _stl = stl;
    _stlp = stlp;
  }

  /// @dev Gets total number covers created till date.
  function getCoverLength() external view returns (uint len) {
    return (allCovers.length);
  }

  /// @dev Gets Authorised Engine address.
  function getAuthQuoteEngine() external view returns (address _add) {
    _add = authQuoteEngine;
  }

  /// @dev Gets the Total Sum Assured amount of a given currency.
  function getTotalSumAssured(bytes4 _curr) external view returns (uint amount) {
    amount = currencyCSA[_curr];
  }

  /// @dev Gets all the Cover ids generated by a given address.
  /// @param _add User's address.
  /// @return allCover array of covers.
  function getAllCoversOfUser(address _add) external view returns (uint[] memory allCover) {
    return (userCover[_add]);
  }

  /// @dev Gets total number of covers generated by a given address
  function getUserCoverLength(address _add) external view returns (uint len) {
    len = userCover[_add].length;
  }

  /// @dev Gets the status of a given cover.
  function getCoverStatusNo(uint _cid) external view returns (uint8) {
    return coverStatus[_cid];
  }

  /// @dev Gets the Cover Period (in days) of a given cover.
  function getCoverPeriod(uint _cid) external view returns (uint32 cp) {
    cp = allCovers[_cid].coverPeriod;
  }

  /// @dev Gets the Sum Assured Amount of a given cover.
  function getCoverSumAssured(uint _cid) external view returns (uint sa) {
    sa = allCovers[_cid].sumAssured;
  }

  /// @dev Gets the Currency Name in which a given cover is assured.
  function getCurrencyOfCover(uint _cid) external view returns (bytes4 curr) {
    curr = allCovers[_cid].currencyCode;
  }

  /// @dev Gets the validity date (timestamp) of a given cover.
  function getValidityOfCover(uint _cid) external view returns (uint date) {
    date = allCovers[_cid].validUntil;
  }

  /// @dev Gets Smart contract address of cover.
  function getscAddressOfCover(uint _cid) external view returns (uint, address) {
    return (_cid, allCovers[_cid].scAddress);
  }

  /// @dev Gets the owner address of a given cover.
  function getCoverMemberAddress(uint _cid) external view returns (address payable _add) {
    _add = allCovers[_cid].memberAddress;
  }

  /// @dev Gets the premium amount of a given cover in NXM.
  function getCoverPremiumNXM(uint _cid) external view returns (uint _premiumNXM) {
    _premiumNXM = allCovers[_cid].premiumNXM;
  }

  /// @dev Provides the details of a cover Id
  /// @param _cid cover Id
  /// @return memberAddress cover user address.
  /// @return scAddress smart contract Address
  /// @return currencyCode currency of cover
  /// @return sumAssured sum assured of cover
  /// @return premiumNXM premium in NXM
  function getCoverDetailsByCoverID1(
    uint _cid
  )
  external
  view
  returns (
    uint cid,
    address _memberAddress,
    address _scAddress,
    bytes4 _currencyCode,
    uint _sumAssured,
    uint premiumNXM
  )
  {
    return (
    _cid,
    allCovers[_cid].memberAddress,
    allCovers[_cid].scAddress,
    allCovers[_cid].currencyCode,
    allCovers[_cid].sumAssured,
    allCovers[_cid].premiumNXM
    );
  }

  /// @dev Provides details of a cover Id
  /// @param _cid cover Id
  /// @return status status of cover.
  /// @return sumAssured Sum assurance of cover.
  /// @return coverPeriod Cover Period of cover (in days).
  /// @return validUntil is validity of cover.
  function getCoverDetailsByCoverID2(
    uint _cid
  )
  external
  view
  returns (
    uint cid,
    uint8 status,
    uint sumAssured,
    uint16 coverPeriod,
    uint validUntil
  )
  {

    return (
    _cid,
    coverStatus[_cid],
    allCovers[_cid].sumAssured,
    allCovers[_cid].coverPeriod,
    allCovers[_cid].validUntil
    );
  }

  /// @dev Provides details of a holded cover Id
  /// @param _hcid holded cover Id
  /// @return scAddress SmartCover address of cover.
  /// @return coverCurr currency of cover.
  /// @return coverPeriod Cover Period of cover (in days).
  function getHoldedCoverDetailsByID1(
    uint _hcid
  )
  external
  view
  returns (
    uint hcid,
    address scAddress,
    bytes4 coverCurr,
    uint16 coverPeriod
  )
  {
    return (
    _hcid,
    allCoverHolded[_hcid].scAddress,
    allCoverHolded[_hcid].coverCurr,
    allCoverHolded[_hcid].coverPeriod
    );
  }

  /// @dev Gets total number holded covers created till date.
  function getUserHoldedCoverLength(address _add) external view returns (uint) {
    return userHoldedCover[_add].length;
  }

  /// @dev Gets holded cover index by index of user holded covers.
  function getUserHoldedCoverByIndex(address _add, uint index) external view returns (uint) {
    return userHoldedCover[_add][index];
  }

  /// @dev Provides the details of a holded cover Id
  /// @param _hcid holded cover Id
  /// @return memberAddress holded cover user address.
  /// @return coverDetails array contains SA, Cover Currency Price,Price in NXM, Expiration time of Qoute.
  function getHoldedCoverDetailsByID2(
    uint _hcid
  )
  external
  view
  returns (
    uint hcid,
    address payable memberAddress,
    uint[] memory coverDetails
  )
  {
    return (
    _hcid,
    allCoverHolded[_hcid].userAddress,
    allCoverHolded[_hcid].coverDetails
    );
  }

  /// @dev Gets the Total Sum Assured amount of a given currency and smart contract address.
  function getTotalSumAssuredSC(address _add, bytes4 _curr) external view returns (uint amount) {
    amount = currencyCSAOfSCAdd[_add][_curr];
  }

  //solhint-disable-next-line
  function changeDependentContractAddress() public {}

  /// @dev Changes the status of a given cover.
  /// @param _cid cover Id.
  /// @param _stat New status.
  function changeCoverStatusNo(uint _cid, uint8 _stat) public onlyInternal {
    coverStatus[_cid] = _stat;
    emit CoverStatusEvent(_cid, _stat);
  }

  /**
   * @dev Updates Uint Parameters of a code
   * @param code whose details we want to update
   * @param val value to set
   */
  function updateUintParameters(bytes8 code, uint val) public {

    require(ms.checkIsAuthToGoverned(msg.sender));
    if (code == "STLP") {
      _changeSTLP(val);

    } else if (code == "STL") {

      _changeSTL(val);

    } else if (code == "PM") {

      _changePM(val);

    } else if (code == "QUOMIND") {

      _changeMinDays(val);

    } else if (code == "QUOTOK") {

      _setTokensRetained(val);

    } else {

      revert("Invalid param code");
    }

  }

  /// @dev Changes the existing Profit Margin value
  function _changePM(uint _pm) internal {
    pm = _pm;
  }

  /// @dev Changes the existing Short Term Load Period (STLP) value.
  function _changeSTLP(uint _stlp) internal {
    stlp = _stlp;
  }

  /// @dev Changes the existing Short Term Load (STL) value.
  function _changeSTL(uint _stl) internal {
    stl = _stl;
  }

  /// @dev Changes the existing Minimum cover period (in days)
  function _changeMinDays(uint _days) internal {
    minDays = _days;
  }

  /**
   * @dev to set the the amount of tokens retained
   * @param val is the amount retained
   */
  function _setTokensRetained(uint val) internal {
    tokensRetained = val;
  }
}
