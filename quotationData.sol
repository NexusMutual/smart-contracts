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
    master ms1;
    address masterAddress;
    using SafeMaths for uint;
    struct cover
    {
        bytes8 productName;
        address memberAddress;
        bytes4 currencyCode;
        uint16 sumAssured;
        uint16 coverPeriod;
        uint validUntil;
        uint16 status;
        address addParams;
    }

    struct Product_Details{
        bytes8 productName;
        string productHash;
        uint16 STLP;
        uint16 STL;
        uint16 PM;
        uint64 minDays;
    }
    
    address public authQuoteEngine;
    address AuthAddress;     //authorised address for signing the cover details   
    bytes16[] coverStatus;
    mapping(bytes4=>uint) currentSumAssured;
    mapping ( address=>uint[] ) cover_user;
    mapping(uint=>Product_Details) ProductDetails;
    mapping(address=>mapping(bytes4=>uint)) currentSumAssured_SC;

    cover[] allCovers;

    uint public pendingCoverStart;

    event Cover(address indexed from, address indexed smartcontract, uint256 premiumCalculated,uint256 dateAdd,string coverHash);
    function quotationData(){
        pendingCoverStart = 0;
    }
    function changeMasterAddress(address _add) 
    {
        if(masterAddress == 0x000)
            masterAddress = _add;
        else
        {
            ms1=master(masterAddress);
            if(ms1.isInternal(msg.sender) == 1)
                masterAddress = _add;
            else
                throw;
        }
    }
   
    modifier onlyInternal {
        ms1=master(masterAddress);
        require(ms1.isInternal(msg.sender) == 1);
        _; 
    }
    modifier onlyOwner{
        ms1=master(masterAddress);
        require(ms1.isOwner(msg.sender) == 1);
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
    function changePM(uint prodId,uint16 pm) onlyOwner
    {
        ProductDetails[prodId].PM = pm;
    }
    /// @dev Changes the existing Short Term Load Period (STLP) value.
    function changeSTLP(uint prodId,uint16 stlp) onlyOwner
    {
        ProductDetails[prodId].STLP = stlp;
    }
    /// @dev Changes the existing Short Term Load (STL) value.
    function changeSTL(uint prodId,uint16 stl) onlyOwner
    {
        ProductDetails[prodId].STL = stl;
    }
    /// @dev Changes the existing Minimum cover period (in days)
    function changeMinDays(uint prodId,uint64 _days) onlyOwner
    {
        ProductDetails[prodId].minDays = _days;
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
    /// @param curr Currency Name.
    /// @param amount Amount to be added.
    function addInTotalSumAssured(bytes4 curr , uint amount) onlyInternal
    {
        currentSumAssured[curr] =SafeMaths.add(currentSumAssured[curr],amount);
    }

    /// @dev Subtracts the amount from Total Sum Assured of a given currency.
    /// @param curr Currency Name.
    /// @param amount Amount to be subtracted.
    function subFromTotalSumAssured(bytes4 curr , uint amount) onlyInternal
    {
        currentSumAssured[curr] =SafeMaths.sub(currentSumAssured[curr],amount);
    }

    /// @dev Gets the Total Sum Assured amount of a given currency.
    function getTotalSumAssured(bytes4 curr) constant returns(uint amount)
    {
        amount = currentSumAssured[curr];
    }

    /// @dev Gets the status of a given quotation.
    function getCoversStatusNo(uint cid) constant returns(uint16 stat)
    {
        stat = allCovers[cid].status;
    }

    /// @dev Changes the status of a given quotation.
    /// @param cid Quotation Id.
    /// @param stat New status.
    function changeCoversStatus(uint cid , uint16 stat) onlyInternal
    {
        allCovers[cid].status = stat;
    }
 
    /// @dev Gets the Cover Period (in days) of a given quotation.
    function getCoverPeriod(uint cid)constant returns(uint32 _days)
    {
        _days = allCovers[cid].coverPeriod;
    }

    /// @dev Gets the Sum Assured Amount of a given quotation.
    function getCoverSumAssured(uint cid)constant returns(uint16 sa)
    {
        sa = allCovers[cid].sumAssured;
    }
      
    /// @dev Changes the Sum Assured Amount of a given quotation.
    /// @param cid Quotation Id.
    /// @param sa New Sum Assured Amount. 
    function changeSumAssured(uint cid , uint16 sa) onlyInternal
    {
        allCovers[cid].sumAssured = sa;
    }

    /// @dev Gets the Currency Name in which a given quotation is assured.
    function getCoverCurrency(uint cid)constant returns(bytes4 curr)
    {
        curr = allCovers[cid].currencyCode;
    }

    /// @dev Maps the Cover Id to its owner's address.
    function addUserCover(uint cid , address _add) onlyInternal
    {
         cover_user[_add].push(cid);
    }

    /// @dev Gets total number of covers generated by a given address
    function getUserCoverLength(address _add)constant returns(uint len)
    {
        len=cover_user[_add].length;
    }

     /// @dev Gets the validity date (timestamp) of a given cover.
    function getCoverValidity(uint cid) constant returns(uint date)
    {
        date = allCovers[cid].validUntil;
    }

    /// @dev Gets all the Cover ids generated by a given address.
    /// @param _add User's address.
    /// @return allCover array of covers. 
    function getUserAllCover(address _add) constant returns(uint[] allCover)
    {
        return(cover_user[_add]);
    }

    /// @dev Gets the current status of a given cover id.
    function getCoverStatusNo(uint cid) constant returns(uint16 stat)
    {
        stat = allCovers[cid].status;
    }
    
    /// @dev Changes the status of a given cover.
    function changeCoverStatus(uint cid , uint16 stat) onlyInternal
    {
        allCovers[cid].status = stat;
    }  

     /// @dev Creates a blank new Quotation.
    function addCover(uint16 coverPeriod,uint16 SA,bytes8 productName,uint cid,address userAddress,bytes4 currencyCode, address addParams) onlyInternal
    { 
        allCovers[cid].sumAssured=SA;
        allCovers[cid].coverPeriod=coverPeriod;
        allCovers[cid].productName = productName;
        allCovers[cid].memberAddress = userAddress;
        allCovers[cid].currencyCode = currencyCode;
        allCovers[cid].validUntil = SafeMaths.add(now,SafeMaths.mul(coverPeriod,1 days));
        allCovers[cid].status = 2;
        allCovers[cid].addParams=addParams;
    }

    /// @dev Updates the Sum Assured of a given quotation.    
    function changeTotalSumAssured(uint coverId , uint16 SA) onlyInternal
    {
        allCovers[coverId].sumAssured = SA;
    }

    /// @dev Gets the Product Id of a given Quote.
    function getCoverProductName(uint cid)constant returns(bytes8 prodName)
    {
        prodName = allCovers[cid].productName;
    }

    function getAddressParams(uint coverId) constant returns(uint,address)
    {
       return (coverId,allCovers[coverId].addParams);
    }

    /// @dev Gets the owner address of a given quotation.
    function getCoverMemberAddress(uint cid) constant returns(address _add)
    {
        _add = allCovers[cid].memberAddress;
    }

    /// @dev Gets Premium details.
    /// @return  _minDays minimum cover period.
    /// @return  _PM Profit margin.
    /// @return  _STL short term Load.
    /// @return  _STLP short term load period.
    function getPremiumDetails(uint prodId) constant returns(bytes8 _productName,string _productHash,uint64 _minDays,uint16 _PM,uint16 _STL,uint16 _STLP)
    {
        _productName =ProductDetails[prodId].productName;
        _productHash=ProductDetails[prodId].productHash;
        _minDays=ProductDetails[prodId].minDays;
        _PM=ProductDetails[prodId].PM;
        _STL=ProductDetails[prodId].STL;
        _STLP=ProductDetails[prodId].STLP;
    }
    
    function getProductName(uint8 prodId) constant returns(bytes8 _productName){
        return ProductDetails[prodId].productName;
    }

    /// @dev Provides the details of a Quotation Id
    /// @param cid Quotation Id
    /// @return productId Insurance Product id.
    /// @return cid Quotation Id.
    /// @return addParams Address Array
    /// @return currencyCode Currency in which quotation is assured
    /// @return sumAssured Sum assurance of quotation.
    function getCoverByIndex1(uint _cid) constant returns(bytes8 productName, uint cid,address addParams,bytes4 currencyCode,uint16 sumAssured, uint16 statusNo) 
    {
        return (allCovers[_cid].productName,cid,allCovers[_cid].addParams,allCovers[_cid].currencyCode,allCovers[_cid].sumAssured,allCovers[_cid].status);
    }

    /// @dev Provides details of a Quotation Id
    /// @param coverid Quotation Id
    /// @return coverPeriod Cover Period of quotation (in days).
    /// @return premiumCalculated Premium of quotation.
    /// @return dateAdd timestamp at which quotation is created.
    /// @return status current status of Quotation.
    /// @return amountFunded Amount funded to the quotation.
    /// @return coverId cover of a quoation.
    function getCoverByIndex2(uint coverid) constant returns(address memberAddress,uint16 coverPeriod,uint validUntil,uint16 status)
    {
        return ( allCovers[coverid].memberAddress,allCovers[coverid].coverPeriod,allCovers[coverid].validUntil,allCovers[coverid].status);
    }
    
    // /// @dev Provides details of a Quotation Id
    // /// @param _cid Cover Id
    // /// @return currencyCode Currency in which Cover is assured
    // /// @return sumAssured Sum assurance of Cover.
    // /// @return premiumCalculated Premium of Cover.
    // function getCoverByIndex3(uint _cid) constant returns(bytes8 productName, uint cid,address addParams,bytes4 currencyCode,uint16 sumAssured, uint16 statusNo) 
    // {
    //     return (allCovers[_cid].productName,cid,allCovers[_cid].addParams,allCovers[_cid].currencyCode,allCovers[_cid].sumAssured,allCovers[_cid].status);
    // }
    
    /// @dev Provides the information of the quote id, mapped against the user  calling the function, at the given index
    /// @param ind User's Quotation Index.
    /// @return coverPeriod Cover Period of quotation in days.
    /// @return premiumCalculated Premium of quotation.
    /// @return dateAdd timestamp at which quotation is created.
    /// @return status current status of Quotation.
    /// @return amountFunded number of tokens funded to the quotation.
    function getCoverByAddressAndIndex2(uint ind) constant returns(address memAddress,uint16 coverPeriod,uint validUntil,bytes16 status)
    {
        uint16 statusNo;
        (memAddress,coverPeriod,validUntil,statusNo) = getCoverByIndex2(ind);
        status=getCoverStatus(statusNo);
    }
    
    /// @dev Gets Quote details using current address and quoteid.
    function getCoverByAddressAndIndex1(uint ind) constant returns(bytes8 productName,address addParams,bytes4 currencyCode,uint sumAssured)
    {
        (productName,,addParams,currencyCode,sumAssured,) = getCoverByIndex1(ind);
    }
    
    function setProductDetails(uint prodId,bytes8 _productName,string _productHash,uint64 _minDays,uint16 _PM,uint16 _STL,uint16 _STLP)
    {
        ProductDetails[prodId]=(Product_Details(_productName,_productHash,_STLP,_STL,_PM,_minDays));
    }

    /// @dev Adds the amount in Total Sum Assured of a given currency.
    /// @param _add Smart Contract Address.
    /// @param _amount Amount to be added.
    function addInTotalSumAssuredSC(address _add , bytes4 _curr, uint _amount) onlyInternal
    {
        currentSumAssured_SC[_add][_curr] =SafeMaths.add(currentSumAssured_SC[_add][_curr],_amount);
    }

    /// @dev Subtracts the amount from Total Sum Assured of a given currency.
    /// @param _add Smart Contract Address.
    /// @param _amount Amount to be subtracted.
    function subFromTotalSumAssuredSC(address _add , bytes4 _curr, uint _amount) onlyInternal
    {
        currentSumAssured_SC[_add][_curr] =SafeMaths.sub(currentSumAssured_SC[_add][_curr],_amount);
    }

    /// @dev Gets the Total Sum Assured amount of a given currency.
    function getTotalSumAssuredSC(address _add, bytes4 _curr) constant returns(uint amount)
    {
        amount = currentSumAssured_SC[_add][_curr];
    }
     function getAuthAddress()constant returns(address add){
        return AuthAddress;
    }
    
    function changeAuthAddress(address add) onlyOwner {
        AuthAddress = add;
    }
}