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


pragma solidity ^0.4.11;
import "./master.sol";
import "./SafeMaths.sol";

contract quotationData{
    master ms;
    address masterAddress;
    using SafeMaths for uint;
    struct cover
    {
        bytes8 productName;
        address memberAddress;
        bytes4 currencyCode;
        uint sumAssured;
        uint16 coverPeriod;
        uint validUntil;
        // uint16 status;
        address scAddress;
        // uint lockedTokens;
    }

    struct Product_Details{
        bytes8 productName;
        string productHash;
        uint16 STLP;
        uint16 STL;
        uint16 PM;
        uint16 minDays;
    }
    
    address public authQuoteEngine;
    mapping(uint=>uint8) cover_status;
    //address AuthAddress;     //authorised address for signing the cover details   
    bytes16[] coverStatus;
    mapping(bytes4=>uint) currency_CSA;
    mapping (address=>uint[]) user_Cover;
    Product_Details[] ProductDetails;
    mapping(address=>mapping(bytes4=>uint)) currency_CSA_ofSCAdd;
    cover[] allCovers;
    uint public pendingCoverStart;
    // event Cover(address indexed from, address indexed smartcontract, uint premiumCalculated,uint dateAdd,string coverHash);

    function quotationData(){
        pendingCoverStart = 0;
        //Add smartcontractcover 
        ProductDetails.push(Product_Details("EQC","Earth Quake",90,500,12,43));
        ProductDetails.push(Product_Details("SCC","Smart Contract Cover",90,1000,12,0));
    }
    function changeMasterAddress(address _add) 
    {
        if(masterAddress == 0x000){
            masterAddress = _add;
            ms=master(masterAddress);
        }
        else
        {
            ms=master(masterAddress);
            if(ms.isInternal(msg.sender) == true)
                masterAddress = _add;
            else
                throw;
        }
    }
   
    modifier onlyInternal {
        // ms=master(masterAddress);
        require(ms.isInternal(msg.sender) == true);
        _; 
    }
    modifier onlyOwner {
        // ms=master(masterAddress);
        require(ms.isOwner(msg.sender) == true);
        _; 
    }

    /// @dev Changes authorised address for posting IPFS hash.
    function changeAuthQuoteEngine(address _add) onlyOwner
    {
        authQuoteEngine=_add;
    }
    function getAuthQuoteEngine()constant returns(address _add) 
    {
        _add=authQuoteEngine;
    }

    /// @dev Pushes status of cover.
    function pushCoverStatus(bytes16 status) onlyInternal
    {
        coverStatus.push(status);
    }

    /// @dev Gets status of a given cover id.
    function getCoverStatus(uint16 index)constant returns(bytes16 status)
    {
        return coverStatus[index];
    }
    
    /// @dev Gets all possible status for covers.
    function getAllCoverStatus() constant returns(bytes16[] status)
    {
        return coverStatus;
    }

    /// @dev Gets length of cover status master. 
    function getCoverStatusLen() constant returns(uint len)
    {
        return coverStatus.length;
    }
    /// @dev Changes the existing Profit Margin value
    function changePM(uint _prodId,uint16 _pm) onlyOwner
    {
        ProductDetails[_prodId].PM = _pm;
    }
    /// @dev Changes the existing Short Term Load Period (STLP) value.
    function changeSTLP(uint _prodId,uint16 _stlp) onlyOwner
    {
        ProductDetails[_prodId].STLP = _stlp;
    }
    /// @dev Changes the existing Short Term Load (STL) value.
    function changeSTL(uint _prodId,uint16 _stl) onlyOwner
    {
        ProductDetails[_prodId].STL = _stl;
    }
    /// @dev Changes the existing Minimum cover period (in days)
    function changeMinDays(uint _prodId,uint16 _days) onlyOwner
    {
        ProductDetails[_prodId].minDays = _days;
    }
    
    /// @dev Changes the existing Minimum cover period (in days)
    function changeProductHash(uint _prodId,string _productHash) onlyOwner
    {
        ProductDetails[_prodId].productHash = _productHash;
    }
    
    function getProductName(uint _prodId) constant returns(bytes8 _productName){
        return ProductDetails[_prodId].productName;
    }
    
    function getProductHash(uint _prodId) constant returns(string _productHash){
        return ProductDetails[_prodId].productHash;
    }
    
    function getAllProductCount() constant returns (uint length){
        return ProductDetails.length;
    }
    
    function addProductDetails(bytes8 _productName,string _productHash,uint16 _minDays,uint16 _PM,uint16 _STL,uint16 _STLP) onlyOwner
    {
        ProductDetails.push(Product_Details(_productName,_productHash,_STLP,_STL,_PM,_minDays));
    }

    /// @dev Gets Product details.
    /// @return  _minDays minimum cover period.
    /// @return  _PM Profit margin.
    /// @return  _STL short term Load.
    /// @return  _STLP short term load period.
    function getProductDetails(uint _prodId) constant returns(uint _productId,bytes8 _productName, string _productHash, uint64 _minDays, uint16 _PM, uint16 _STL, uint16 _STLP)
    {
        _productId=_prodId;
        _productName=ProductDetails[_prodId].productName;
        _productHash=ProductDetails[_prodId].productHash;
        _minDays=ProductDetails[_prodId].minDays;
        _PM=ProductDetails[_prodId].PM;
        _STL=ProductDetails[_prodId].STL;
        _STLP=ProductDetails[_prodId].STLP;
    }
    
    /// @dev Updates the pending cover start variable, which is the lowest cover id with "active" status.
    /// @param val new start position
    function updatePendingCoverStart(uint val) onlyInternal
    {
        pendingCoverStart = val;
    }
    
    function getPendingCoverStart()constant returns(uint val)
    {
       val  = pendingCoverStart;
    }
    
    /// @dev Gets total number Covers created till date.
    function getCoverLength() constant returns(uint len)
    {
        return (allCovers.length);
    }

    /// @dev Adds the amount in Total Sum Assured of a given currency.
    /// @param _curr Currency Name.
    /// @param _amount Amount to be added.
    function addInTotalSumAssured(bytes4 _curr , uint _amount) onlyInternal
    {
        currency_CSA[_curr] =SafeMaths.add(currency_CSA[_curr],_amount);
    }

    /// @dev Subtracts the amount from Total Sum Assured of a given currency.
    /// @param _curr Currency Name.
    /// @param _amount Amount to be subtracted.
    function subFromTotalSumAssured(bytes4 _curr , uint _amount) onlyInternal
    {
        currency_CSA[_curr] =SafeMaths.sub(currency_CSA[_curr],_amount);
    }

    /// @dev Gets the Total Sum Assured amount of a given currency.
    function getTotalSumAssured(bytes4 _curr) constant returns(uint amount)
    {
        amount = currency_CSA[_curr];
    }
    
    /// @dev Maps the Cover Id to its owner's address.
    function addUserCover(uint _cid , address _add) onlyInternal
    {
         user_Cover[_add].push(_cid);
    }
    
    /// @dev Gets all the Cover ids generated by a given address.
    /// @param _add User's address.
    /// @return allCover array of covers. 
    function getAllCoversOfUser(address _add) constant returns(uint[] allCover)
    {
        return(user_Cover[_add]);
    }

    /// @dev Gets total number of covers generated by a given address
    function getUserCoverLength(address _add)constant returns(uint len)
    {
        len=user_Cover[_add].length;
    }
    
    /// @dev Gets the Product Id of a given Quote.
    function getProductNameOfCover(uint _cid)constant returns(bytes8 prodName)
    {
        prodName = allCovers[_cid].productName;
    }
    
    /// @dev Gets the status of a given cover.
    function getCoverStatusNo(uint _cid) constant returns(uint8 stat)
    {
        stat = cover_status[_cid];
    }

    /// @dev Changes the status of a given cover.
    /// @param _cid cover Id.
    /// @param _stat New status.
    function changeCoverStatusNo(uint _cid , uint8 _stat) onlyInternal
    {
        cover_status[_cid] = _stat;
    }
 
    /// @dev Gets the Cover Period (in days) of a given cover.
    function getCoverPeriod(uint _cid)constant returns(uint32 cp)
    {
        cp = allCovers[_cid].coverPeriod;
    }
    
    /// @dev Change the Cover Period (in days) of a given cover.
    function changeCoverPeriod(uint _cid, uint16 _days) onlyInternal
    {
        allCovers[_cid].coverPeriod = _days;
    }
    
    /// @dev Gets the Sum Assured Amount of a given cover.
    function getCoverSumAssured(uint _cid)constant returns(uint sa)
    {
        sa = allCovers[_cid].sumAssured;
    }
      
    /// @dev Changes the Sum Assured Amount of a given cover.
    /// @param _cid cover Id.
    /// @param _sa New Sum Assured Amount. 
    function changeSumAssured(uint _cid , uint _sa) onlyInternal
    {
        allCovers[_cid].sumAssured = _sa;
    }

    /// @dev Gets the Currency Name in which a given cover is assured.
    function getCurrencyOfCover(uint _cid)constant returns(bytes4 curr)
    {
        curr = allCovers[_cid].currencyCode;
    }
    
    /// @dev Gets the Currency Name in which a given cover is assured.
    function changeCurrencyOfCover(uint _cid, bytes4 curr) onlyInternal
    {
        allCovers[_cid].currencyCode = curr;
    }

    /// @dev Gets the validity date (timestamp) of a given cover.
    function getValidityOfCover(uint _cid) constant returns(uint date)
    {
        date = allCovers[_cid].validUntil;
    }
    
    /// @dev Change the validity date (timestamp) of a given cover.
    function ChangeValidityOfCover(uint _cid, uint _date) onlyInternal
    {
        allCovers[_cid].validUntil = _date;
    }
    
    function getscAddressOfCover(uint _cid) constant returns(uint,address)
    {
       return (_cid,allCovers[_cid].scAddress);
    }

    /// @dev Gets the owner address of a given cover.
    function getCoverMemberAddress(uint _cid) constant returns(address _add)
    {
        _add = allCovers[_cid].memberAddress;
    }

    /// @dev Creates a blank new cover.
    function addCover(uint16 _coverPeriod,uint _SA,bytes8 _productName,address _userAddress,bytes4 _currencyCode, address _scAddress) onlyInternal
    { 
        allCovers.push(cover(_productName,_userAddress,_currencyCode,_SA,_coverPeriod,SafeMaths.add(now,SafeMaths.mul(_coverPeriod,1 days)),_scAddress));
        // allCovers[_cid].sumAssured= _SA;
        // allCovers[_cid].coverPeriod= _coverPeriod;
        // allCovers[_cid].productName = _productName;
        // allCovers[_cid].memberAddress = _userAddress;
        // allCovers[_cid].currencyCode = _currencyCode;
        // allCovers[_cid].validUntil = SafeMaths.add(now,SafeMaths.mul(_coverPeriod,1 days));
        // allCovers[_cid].status = 2;
        // allCovers[_cid].scAddress=_scAddress;
        user_Cover[_userAddress].push(SafeMaths.sub(allCovers.length,1));
    }

    /// @dev Provides the details of a cover Id
    /// @param _cid cover Id
    /// @return productName Insurance Product Name.
    /// @return cid cover Id.
    /// @return scAddress Address Array
    function getCoverDetailsByCoverID1(uint _cid) constant returns(uint cid, bytes8 productName,address memberAddress, address scAddress,bytes16 status) 
    {
        return (_cid,allCovers[_cid].productName,allCovers[_cid].memberAddress,allCovers[_cid].scAddress,coverStatus[cover_status[_cid]]);
    }

    /// @dev Provides details of a cover Id
    /// @param _cid cover Id
    /// @return currencyCode Currency in which cover is assured
    /// @return sumAssured Sum assurance of cover.
    /// @return coverPeriod Cover Period of cover (in days).
    /// @return validUntil is validity of cover.
    function getCoverDetailsByCoverID2(uint _cid) constant returns(uint cid,bytes4 currencyCode,uint sumAssured,uint16 coverPeriod,uint validUntil)
    {
        return (_cid,allCovers[_cid].currencyCode,allCovers[_cid].sumAssured,allCovers[_cid].coverPeriod,allCovers[_cid].validUntil);
    }
    
    // /// @dev Provides the information of the quote id, mapped against the user  calling the function, at the given index
    // /// @param _cid User's cover Index.
    // /// @return coverPeriod Cover Period of cover in days.
    // /// @return premiumCalculated Premium of cover.
    // /// @return dateAdd timestamp at which cover is created.
    // /// @return status current status of cover.
    // /// @return amountFunded number of tokens funded to the cover.
    // function getCoverByAddressAndIndex2(uint _cid) constant returns(uint cid, address memAddress,uint16 coverPeriod,uint validUntil,bytes16 status)
    // {
    //     uint16 statusNo;
    //     (cid,memAddress,coverPeriod,validUntil,statusNo,) = getCoverByIndex2(_cid);
    //     status=getCoverStatus(statusNo);
    // }
    
    // /// @dev Gets Quote details using current address and quoteid.
    // function getCoverByAddressAndIndex1(uint _cid) constant returns(bytes8 productName,uint cid,address scAddress,bytes4 currencyCode,uint sumAssured)
    // {
    //     (productName,cid,scAddress,currencyCode,sumAssured,) = getCoverByIndex1(_cid);
    // }
    
    /// @dev Adds the amount in Total Sum Assured of a given currency.
    /// @param _add Smart Contract Address.
    /// @param _amount Amount to be added.
    function addInTotalSumAssuredSC(address _add , bytes4 _curr, uint _amount) onlyInternal
    {
        currency_CSA_ofSCAdd[_add][_curr] =SafeMaths.add(currency_CSA_ofSCAdd[_add][_curr],_amount);
    }

    /// @dev Subtracts the amount from Total Sum Assured of a given currency.
    /// @param _add Smart Contract Address.
    /// @param _amount Amount to be subtracted.
    function subFromTotalSumAssuredSC(address _add , bytes4 _curr, uint _amount) onlyInternal
    {
        currency_CSA_ofSCAdd[_add][_curr] =SafeMaths.sub(currency_CSA_ofSCAdd[_add][_curr],_amount);
    }

    /// @dev Gets the Total Sum Assured amount of a given currency.
    function getTotalSumAssuredSC(address _add, bytes4 _curr) constant returns(uint amount)
    {
        amount = currency_CSA_ofSCAdd[_add][_curr];
    }
    // /// @dev Updates the number of tokens locked against a given cover id.
    // function changeLockedTokens(uint _cid , uint _tokens) onlyInternal
    // {
    //     allCovers[_cid].lockedTokens = _tokens;
    // }
    
    // /// @dev Gets the number of tokens locked against a given cover.
    // function getCoverLockedTokens(uint _cid) constant returns(uint tokens)
    // {
    //     tokens = allCovers[_cid].lockedTokens;
    // }
    // function callCoverEvent(address from, address scAddress, uint premiumCalculated,string coverHash) onlyInternal {
    //     Cover(from, scAddress, premiumCalculated, now, coverHash);
    // }
}
