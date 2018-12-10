/* Copyright (C) 2017 NexusMutual.io

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

pragma solidity 0.4.24;

import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMath.sol";


contract QuotationData is Iupgradable {
    using SafeMath for uint;

    enum HCIDStatus { NA, kycPending, kycPass, kycFailedOrRefunded, kycPassNoCover }

    enum CoverStatus { Active, ClaimAccepted, ClaimDenied, CoverExpired, ClaimSubmitted, Requested }

    struct Cover {
        address memberAddress;
        bytes4 currencyCode;
        uint sumAssured;
        uint16 coverPeriod;
        uint validUntil;
        address scAddress;
        uint premium;
    }

    struct HoldCover {
        uint holdCoverId;
        address userAddress;
        address scAddress;
        bytes4 coverCurr;
        uint[] coverDetails;
        uint16 coverPeriod;
    }

    address public authQuoteEngine;
    uint public pendingCoverStart;
  
    mapping(bytes4 => uint) internal currencyCSA;
    mapping(address => uint[]) internal userCover;
    mapping(address => uint[]) public userHoldedCover;
    mapping(address => bool) public refundEligible;
    mapping(address => mapping(bytes4 => uint)) internal currencyCSAOfSCAdd;
    mapping(uint => uint8) public coverStatus;
    mapping(uint => uint) public holdedCoverIDStatus;
    

    Cover[] internal allCovers;
    HoldCover[] internal allCoverHolded;

    bytes8 public productName;
    string public productHash;
    uint16 public stlp;
    uint16 public stl;
    uint16 public pm;
    uint16 public minDays;

    event CoverDetailsEvent(
        uint indexed cid,
        address scAdd,
        uint sumAssured,
        uint expiry,
        uint premium,
        bytes4 curr
    );

    event CoverStatusEvent(uint indexed cid, uint8 statusNum);

    constructor() public {
        pendingCoverStart = 0;
        productName = "SCC";
        productHash = "Smart Contract Cover";
        stlp = 90;
        stl = 1000;
        pm = 13;
        minDays = 30;
        allCovers.push(Cover(address(0), "0x00", 0, 0, 0, address(0), 0));
        uint[] memory arr = new uint[](1);
        allCoverHolded.push(HoldCover(0, address(0), address(0), 0x00, arr, 0));

    }

    modifier onlyOwner {
        require(ms.isOwner(msg.sender) == true);
        _;
    }

    /// @dev Changes authorised address for generating quote off chain.
    function changeAuthQuoteEngine(address _add) external onlyOwner {
        authQuoteEngine = _add;
    }

    // /// @dev Pushes status of cover.
    // function pushCoverStatus(bytes16 status) external onlyInternal {
    //     coverStatus.push(status);
    // }

    /// @dev Changes the existing Profit Margin value
    function changePM(uint16 _pm) external onlyOwner {
        pm = _pm;
    }

    /// @dev Changes the existing Short Term Load Period (STLP) value.
    function changeSTLP(uint16 _stlp) external onlyOwner {
        stlp = _stlp;
    }

    /// @dev Changes the existing Short Term Load (STL) value.
    function changeSTL(uint16 _stl) external onlyOwner {
        stl = _stl;
    }

    /// @dev Changes the existing Minimum cover period (in days)
    function changeMinDays(uint16 _days) external onlyOwner {
        minDays = _days;
    }

    /// @dev Changes the existing Product Hash
    function changeProductHash(string _productHash) external onlyOwner {
        productHash = _productHash;
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
    
    /// @dev Creates a blank new cover.
    function addCover(
        uint16 _coverPeriod,
        uint _sumAssured,
        address _userAddress,
        bytes4 _currencyCode,
        address _scAddress,
        uint premium
    )   
        external
        onlyInternal
    {
        uint expiryDate = now.add(uint(_coverPeriod).mul(1 days));
        allCovers.push(Cover(_userAddress, _currencyCode,
                _sumAssured, _coverPeriod, expiryDate, _scAddress, premium));
        uint cid = allCovers.length.sub(1);
        userCover[_userAddress].push(cid);
        emit CoverDetailsEvent(cid, _scAddress, _sumAssured, expiryDate, premium, _currencyCode);
    }

    function addHoldCover(
        address from,
        address scAddress,
        bytes4 coverCurr, 
        uint[] coverDetails,
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

    function setRefundEligible(address _add, bool status) external onlyInternal {
        refundEligible[_add] = status;
    }

    /// @dev to set current status of particular holded coverID (1 for not completed KYC,
    /// 2 for KYC passed, 3 for failed KYC or full refunded,
    /// 4 for KYC completed but cover not processed)
    function setHoldedCoverIDStatus(uint holdedCoverID, uint status) external onlyInternal {
        holdedCoverIDStatus[holdedCoverID] = status;
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
            bytes8 _productName,
            string _productHash,
            uint64 _minDays,
            uint16 _pm,
            uint16 _stl,
            uint16 _stlp
        )
    {
        _productName = productName;
        _productHash = productHash;
        _minDays = minDays;
        _pm = pm;
        _stl = stl;
        _stlp = stlp;
    }

    /// @dev Gets total number covers created till date.
    function getCoverLength() external view returns(uint len) {
        return (allCovers.length);
    }

    /// @dev Gets Authorised Engine address.
    function getAuthQuoteEngine() external view returns(address _add) {
        _add = authQuoteEngine;
    }

    // /// @dev Gets status of a given index.
    // function getCoverStatus(uint16 index) external view returns(bytes16 status) {
    //     return coverStatus[index];
    // }

    // /// @dev Gets all possible status for covers.
    // function getAllCoverStatus() external view returns(bytes16[] status) {
    //     return coverStatus;
    // }

    // /// @dev Gets length of cover status NXMaster.
    // function getCoverStatusLen() external view returns(uint len) {
    //     return coverStatus.length;
    // }

    /// @dev Gets the Total Sum Assured amount of a given currency.
    function getTotalSumAssured(bytes4 _curr) external view returns(uint amount) {
        amount = currencyCSA[_curr];
    }

    /// @dev Gets all the Cover ids generated by a given address.
    /// @param _add User's address.
    /// @return allCover array of covers.
    function getAllCoversOfUser(address _add) external view returns(uint[] allCover) {
        return (userCover[_add]);
    }

    /// @dev Gets total number of covers generated by a given address
    function getUserCoverLength(address _add) external view returns(uint len) {
        len = userCover[_add].length;
    }

    /// @dev Gets the status of a given cover.
    function getCoverStatusNo(uint _cid) external view returns(uint8) {
        return coverStatus[_cid];
    }

    /// @dev Gets the Cover Period (in days) of a given cover.
    function getCoverPeriod(uint _cid) external view returns(uint32 cp) {
        cp = allCovers[_cid].coverPeriod;
    }

    /// @dev Gets the Sum Assured Amount of a given cover.
    function getCoverSumAssured(uint _cid) external view returns(uint sa) {
        sa = allCovers[_cid].sumAssured;
    }

    /// @dev Gets the Currency Name in which a given cover is assured.
    function getCurrencyOfCover(uint _cid) external view returns(bytes4 curr) {
        curr = allCovers[_cid].currencyCode;
    }

    /// @dev Gets the validity date (timestamp) of a given cover.
    function getValidityOfCover(uint _cid) external view returns(uint date) {
        date = allCovers[_cid].validUntil;
    }

    /// @dev Gets Smart contract address of cover.
    function getscAddressOfCover(uint _cid) external view returns(uint, address) {
        return (_cid, allCovers[_cid].scAddress);
    }

    /// @dev Gets the owner address of a given cover.
    function getCoverMemberAddress(uint _cid) external view returns(address _add) {
        _add = allCovers[_cid].memberAddress;
    }

    /// @dev Gets the premium amount of a given cover.
    function getCoverPremium(uint _cid) external view returns(uint _premium) {
        _premium = allCovers[_cid].premium;
    }

    /// @dev Provides the details of a cover Id
    /// @param _cid cover Id
    /// @return productName Insurance Product Name.
    /// @return memberAddress cover user address.
    /// @return scAddress smart contract Address 
    /// @return currencyCode currency of cover
    /// @return sumAssured sum assured of cover
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
            uint _sumAssured   
        ) 
    {
        return (
            _cid,
            allCovers[_cid].memberAddress,
            allCovers[_cid].scAddress,
            allCovers[_cid].currencyCode,
            allCovers[_cid].sumAssured
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

        // status = coverStatus[_cid];
        return (
            _cid,
            coverStatus[_cid],
            allCovers[_cid].sumAssured,
            allCovers[_cid].coverPeriod,
            allCovers[_cid].validUntil
        );
    }

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

    function getUserHoldedCoverLength(address _add) external view returns (uint) {
        return userHoldedCover[_add].length;
    }

    function getUserHoldedCoverByIndex(address _add, uint index) external view returns (uint) {
        return userHoldedCover[_add][index];
    }

    function getHoldedCoverDetailsByID2(
        uint _hcid
    ) 
        external
        view
        returns (
            uint hcid,
            address memberAddress, 
            uint[] coverDetails
        )
    {
        return (
            _hcid,
            allCoverHolded[_hcid].userAddress,
            allCoverHolded[_hcid].coverDetails
        );
    }

    /// @dev Gets the Total Sum Assured amount of a given currency and smart contract address.
    function getTotalSumAssuredSC(address _add, bytes4 _curr) external view returns(uint amount) {
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
}
