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

import "./master.sol";
import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMaths.sol";


contract quotationData is Iupgradable {
    master ms;
    address masterAddress;

    using SafeMaths
    for uint;

    struct cover {
        bytes8 productName;
        address memberAddress;
        bytes4 currencyCode;
        uint sumAssured;
        uint16 coverPeriod;
        uint validUntil;
        address scAddress;
        uint premium;
    }

    struct Product_Details {
        bytes8 productName;
        string productHash;
        uint16 stlp;
        uint16 stl;
        uint16 pm;
        uint16 minDays;
    }

    address public authQuoteEngine;
    mapping(uint => uint8) coverstatus;
    bytes16[] coverStatus;
    mapping(bytes4 => uint) currencyCSA;
    mapping(address => uint[]) userCover;
    Product_Details[] productDetails;
    mapping(address => mapping(bytes4 => uint)) currencyCSAOfSCAdd;
    cover[] allCovers;
    uint public pendingCoverStart;

    function quotationData() {
        pendingCoverStart = 0;
        productDetails.push(Product_Details("SCC", "Smart Contract Cover", 90, 1000, 12, 0));
        allCovers.push(cover("0x00", 0x000, "0x00", 0, 0, 0, 0x000, 0));

    }

    function changeMasterAddress(address _add) {
        if (masterAddress == 0x000) {
            masterAddress = _add;
            ms = master(masterAddress);
        } else {
            ms = master(masterAddress);
            require(ms.isInternal(msg.sender) == true);
            masterAddress = _add;
           
        }
    }

    function changeDependentContractAddress() onlyInternal {
        
    }
    
    modifier onlyInternal {
        require(ms.isInternal(msg.sender) == true);
        _;
    }

    modifier onlyOwner {
        require(ms.isOwner(msg.sender) == true);
        _;
    }

    /// @dev Changes authorised address for generating quote off chain.
    function changeAuthQuoteEngine(address _add) onlyOwner {
        authQuoteEngine = _add;
    }

    /// @dev Gets Authorised Engine address.
    function getAuthQuoteEngine() constant returns(address _add) {
        _add = authQuoteEngine;
    }

    /// @dev Pushes status of cover.
    function pushCoverStatus(bytes16 status) onlyInternal {
        coverStatus.push(status);
    }

    /// @dev Gets status of a given index.
    function getCoverStatus(uint16 index) constant returns(bytes16 status) {
        return coverStatus[index];
    }

    /// @dev Gets all possible status for covers.
    function getAllCoverStatus() constant returns(bytes16[] status) {
        return coverStatus;
    }

    /// @dev Gets length of cover status master. 
    function getCoverStatusLen() constant returns(uint len) {
        return coverStatus.length;
    }

    /// @dev Changes the existing Profit Margin value
    function changePM(uint _prodId, uint16 _pm) onlyOwner {
        productDetails[_prodId].pm = _pm;
    }

    /// @dev Changes the existing Short Term Load Period (STLP) value.
    function changeSTLP(uint _prodId, uint16 _stlp) onlyOwner {
        productDetails[_prodId].stlp = _stlp;
    }

    /// @dev Changes the existing Short Term Load (STL) value.
    function changeSTL(uint _prodId, uint16 _stl) onlyOwner {
        productDetails[_prodId].stl = _stl;
    }

    /// @dev Changes the existing Minimum cover period (in days)
    function changeMinDays(uint _prodId, uint16 _days) onlyOwner {
        productDetails[_prodId].minDays = _days;
    }

    /// @dev Changes the existing Minimum cover period (in days)
    function changeProductHash(uint _prodId, string _productHash) onlyOwner {
        productDetails[_prodId].productHash = _productHash;
    }

    /// @dev Gets Product Name.
    function getProductName(uint _prodId) constant returns(bytes8 _productName) {
        return productDetails[_prodId].productName;
    }

    /// @dev Gets Product Hash.
    function getProductHash(uint _prodId) constant returns(string _productHash) {
        return productDetails[_prodId].productHash;
    }

    /// @dev Gets Count of products.
    function getAllProductCount() constant returns(uint length) {
        return productDetails.length;
    }

    /// @dev Adds insured product details.
    function addProductDetails(bytes8 _productName, string _productHash, uint16 _minDays, uint16 _pm, uint16 _stl, uint16 _stlp) onlyOwner {
        productDetails.push(Product_Details(_productName, _productHash, _stlp, _stl, _pm, _minDays));
    }

    /// @dev Gets Product details.
    /// @return  _minDays minimum cover period.
    /// @return  _PM Profit margin.
    /// @return  _STL short term Load.
    /// @return  _STLP short term load period.
    function getProductDetails(uint _prodId) 
    constant 
    returns(
        uint _productId, 
        bytes8 _productName, 
        string _productHash, 
        uint64 _minDays, 
        uint16 _pm, 
        uint16 _stl, 
        uint16 _stlp
        ) {
        _productId = _prodId;
        _productName = productDetails[_prodId].productName;
        _productHash = productDetails[_prodId].productHash;
        _minDays = productDetails[_prodId].minDays;
        _pm = productDetails[_prodId].pm;
        _stl = productDetails[_prodId].stl;
        _stlp = productDetails[_prodId].stlp;
    }

    /// @dev Updates the pending cover start variable.
    ///      It is the lowest cover id with "active" status.
    /// @param val new start position
    function updatePendingCoverStart(uint val) onlyInternal {
        pendingCoverStart = val;
    }

    /// @dev Gets the pending cover start variable.
    ///      It is the lowest cover id with "active" status.
    function getPendingCoverStart() constant returns(uint val) {
        val = pendingCoverStart;
    }

    /// @dev Gets total number covers created till date.
    function getCoverLength() constant returns(uint len) {
        return (allCovers.length);
    }

    /// @dev Adds the amount in Total Sum Assured of a given currency.
    /// @param _curr Currency Name.
    /// @param _amount Amount to be added.
    function addInTotalSumAssured(bytes4 _curr, uint _amount) onlyInternal {
        currencyCSA[_curr] = SafeMaths.add(currencyCSA[_curr], _amount);
    }

    /// @dev Subtracts the amount from Total Sum Assured of a given currency.
    /// @param _curr Currency Name.
    /// @param _amount Amount to be subtracted.
    function subFromTotalSumAssured(bytes4 _curr, uint _amount) onlyInternal {
        currencyCSA[_curr] = SafeMaths.sub(currencyCSA[_curr], _amount);
    }

    /// @dev Gets the Total Sum Assured amount of a given currency.
    function getTotalSumAssured(bytes4 _curr) constant returns(uint amount) {
        amount = currencyCSA[_curr];
    }

    /// @dev Maps the Cover Id to its owner's address.
    function addUserCover(uint _cid, address _add) onlyInternal {
        userCover[_add].push(_cid);
    }

    /// @dev Gets all the Cover ids generated by a given address.
    /// @param _add User's address.
    /// @return allCover array of covers. 
    function getAllCoversOfUser(address _add) constant returns(uint[] allCover) {
        return (userCover[_add]);
    }

    /// @dev Gets total number of covers generated by a given address
    function getUserCoverLength(address _add) constant returns(uint len) {
        len = userCover[_add].length;
    }

    /// @dev Gets the Product Id of a given Quote.
    function getProductNameOfCover(uint _cid) constant returns(bytes8 prodName) {
        prodName = allCovers[_cid].productName;
    }

    /// @dev Gets the status of a given cover.
    function getCoverStatusNo(uint _cid) constant returns(uint8 stat) {
        stat = coverstatus[_cid];
    }

    /// @dev Changes the status of a given cover.
    /// @param _cid cover Id.
    /// @param _stat New status.
    function changeCoverStatusNo(uint _cid, uint8 _stat) onlyInternal {
        coverstatus[_cid] = _stat;
    }

    /// @dev Gets the Cover Period (in days) of a given cover.
    function getCoverPeriod(uint _cid) constant returns(uint32 cp) {
        cp = allCovers[_cid].coverPeriod;
    }

    /// @dev Change the Cover Period (in days) of a given cover.
    function changeCoverPeriod(uint _cid, uint16 _days) onlyInternal {
        allCovers[_cid].coverPeriod = _days;
    }

    /// @dev Gets the Sum Assured Amount of a given cover.
    function getCoverSumAssured(uint _cid) constant returns(uint sa) {
        sa = allCovers[_cid].sumAssured;
    }

    /// @dev Changes the Sum Assured Amount of a given cover.
    /// @param _cid cover Id.
    /// @param _sa New Sum Assured Amount. 
    function changeSumAssured(uint _cid, uint _sa) onlyInternal {
        allCovers[_cid].sumAssured = _sa;
    }

    /// @dev Gets the Currency Name in which a given cover is assured.
    function getCurrencyOfCover(uint _cid) constant returns(bytes4 curr) {
        curr = allCovers[_cid].currencyCode;
    }

    /// @dev Gets the Currency Name in which a given cover is assured.
    function changeCurrencyOfCover(uint _cid, bytes4 curr) onlyInternal {
        allCovers[_cid].currencyCode = curr;
    }

    /// @dev Gets the validity date (timestamp) of a given cover.
    function getValidityOfCover(uint _cid) constant returns(uint date) {
        date = allCovers[_cid].validUntil;
    }

    /// @dev Changes the validity date (timestamp) of a given cover.
    function changeValidityOfCover(uint _cid, uint _date) onlyInternal {
        allCovers[_cid].validUntil = _date;
    }

    /// @dev Gets Smart contract address of cover.
    function getscAddressOfCover(uint _cid) constant returns(uint, address) {
        return (_cid, allCovers[_cid].scAddress);
    }

    /// @dev Gets the owner address of a given cover.
    function getCoverMemberAddress(uint _cid) constant returns(address _add) {
        _add = allCovers[_cid].memberAddress;
    }

    /// @dev Gets the owner address of a given cover.
    function getCoverPremium(uint _cid) constant returns(uint _premium) {
        _premium = allCovers[_cid].premium;
    }

    /// @dev Creates a blank new cover.
    function addCover(
        uint16 _coverPeriod, 
        uint _sumAssured, 
        bytes8 _productName, 
        address _userAddress, 
        bytes4 _currencyCode, 
        address _scAddress, 
        uint premium
        ) onlyInternal {
        allCovers.push(
            cover(
            _productName, 
            _userAddress, 
            _currencyCode, 
            _sumAssured, 
            _coverPeriod, 
            SafeMaths.add(now, SafeMaths.mul(_coverPeriod, 1 days)), 
            _scAddress, 
            premium
            )
            );
        userCover[_userAddress].push(SafeMaths.sub(allCovers.length, 1));
    }

    /// @dev Provides the details of a cover Id
    /// @param _cid cover Id
    /// @return productName Insurance Product Name.
    /// @return cid cover Id.
    /// @return scAddress Address Array
    function getCoverDetailsByCoverID1(uint _cid) 
    constant 
    returns(
        uint cid, 
        bytes8 productName, 
        address memberAddress, 
        address scAddress, 
        bytes16 status
        ) {
        return (_cid, allCovers[_cid].productName, allCovers[_cid].memberAddress, allCovers[_cid].scAddress, coverStatus[coverstatus[_cid]]);
    }

    /// @dev Provides details of a cover Id
    /// @param _cid cover Id
    /// @return currencyCode Currency in which cover is assured
    /// @return sumAssured Sum assurance of cover.
    /// @return coverPeriod Cover Period of cover (in days).
    /// @return validUntil is validity of cover.
    function getCoverDetailsByCoverID2(uint _cid) 
    constant 
    returns(
        uint cid, 
        bytes4 currencyCode, 
        uint sumAssured, 
        uint16 coverPeriod, 
        uint validUntil
        ) {
        return (_cid, allCovers[_cid].currencyCode, allCovers[_cid].sumAssured, allCovers[_cid].coverPeriod, allCovers[_cid].validUntil);
    }

    /// @dev Adds the amount in Total Sum Assured of a given currency of a given smart contract address.
    /// @param _add Smart Contract Address.
    /// @param _amount Amount to be added.
    function addInTotalSumAssuredSC(address _add, bytes4 _curr, uint _amount) onlyInternal {
        currencyCSAOfSCAdd[_add][_curr] = SafeMaths.add(currencyCSAOfSCAdd[_add][_curr], _amount);
    }

    /// @dev Subtracts the amount from Total Sum Assured of a given currency and smart contract address.
    /// @param _add Smart Contract Address.
    /// @param _amount Amount to be subtracted.
    function subFromTotalSumAssuredSC(address _add, bytes4 _curr, uint _amount) onlyInternal {
        currencyCSAOfSCAdd[_add][_curr] = SafeMaths.sub(currencyCSAOfSCAdd[_add][_curr], _amount);
    }

    /// @dev Gets the Total Sum Assured amount of a given currency and smart contract address.
    function getTotalSumAssuredSC(address _add, bytes4 _curr) constant returns(uint amount) {
        amount = currencyCSAOfSCAdd[_add][_curr];
    }

}
