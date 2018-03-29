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


pragma solidity 0.4.11;
import "./master.sol";
import "./SafeMaths.sol";

contract quotationData{
    master ms1;
    address masterAddress;
    using SafeMaths for uint;
    struct quote
    {
        uint8 productId;
        address memberAddress;
        bytes4 currencyCode;
        uint16 sumAssured;
        uint32 coverPeriod;
        uint premiumCalculated;
        uint dateAdd;
        uint validUntil;
        uint16 status;
        uint amountFunded;
        uint coverId;
        // Arjun - Data Begin
        int[] intParams;
        bytes32[] bytesParams;
        address[] addParams;
        // Arjun - Data End
    }
    struct cover
    {
        uint quoteId;
        uint validUntil;
        uint8 claimCount;
        uint lockedTokens;
        uint16 status;
    }
    // Arjun - Data Begin
    struct Product_Details{
       uint16 STLP;
       uint16 STL;
       uint16 PM;
       uint64 minDays;
    }
    
    // Arjun - Data End
    address public ipfsHashAddress;
    string CSAHash;
    string quoteAreaHash;
    bytes16[] quoteStatus;
    bytes16[] coverStatus;
    mapping(bytes4=>uint) totalSumAssured;
    mapping ( address=>uint[] ) quote_user;
    mapping ( address=>uint[] ) cover_user;
    // Arjun - Data Begin
    mapping(uint=>Product_Details) ProductDetails;
    mapping(address=>mapping(bytes4=>uint)) totalSumAssured_SC;
    // Arjun - Data End
    quote[] quotations;
    cover[] allCovers;
    uint quote_length;
    uint cover_length;
    uint public pendingQuoteStart;
    uint public pendingCoverStart;
    uint64 public quoteExpireTime;
    address owner;
    function quotationData(){
        pendingQuoteStart=0;
        pendingCoverStart = 0;
        owner = msg.sender;
        quote_length=0;
        cover_length=0;
        // STLP=90;
        // STL=500;
        // PM=12;
        // minDays=42;
        quoteExpireTime=SafeMaths.mul64(7,1 days);
        CSAHash="QmVkvoPGi9jvvuxsHDVJDgzPEzagBaWSZRYoRDzU244HjZ";
        quoteAreaHash="QmVkvoPGi9jvvuxsHDVJDgzPEzagBaWSZRYoRDzU244HjZ";
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
    function changeIPFSHashAddress(address _add) onlyOwner
    {
        ipfsHashAddress=_add;
    }
    /// @dev Pushes status of quote.
    function pushQuoteStatus(bytes16 status) onlyInternal
    {
        quoteStatus.push(status);
    }
    /// @dev Pushes status of cover.
    function pushCoverStatus(bytes16 status) onlyInternal
    {
        coverStatus.push(status);
    }
    /// @dev Gets status of a given quotation id.
    function getQuotationStatus(uint16 index) constant returns(bytes16 status)
    {
        return quoteStatus[index];
    }
    /// @dev Gets status of a given cover id.
    function getCoverStatus(uint16 index)constant returns(bytes16 status)
    {
        return coverStatus[index];
    }
    /// @dev Gets all possible status for quotations.
    function getAllQuotationStatus() constant returns(bytes16[] status)
    {
        return quoteStatus;
    }
    /// @dev Gets all possible status for covers.
    function getAllCoverStatus() constant returns(bytes16[] status)
    {
        return coverStatus;
    }
    /// @dev Gets length of quote status master.
    function getQuoteStatusLen() constant returns(uint len)
    {
        return quoteStatus.length;
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
    /// @dev Updates the pending quotation start variable, which is the lowest quotation id with "NEW" or "partiallyFunded" status.
    /// @param val new start position
    function updatePendingQuoteStart(uint val) onlyInternal
    {
        pendingQuoteStart = val;
    }

    /// @dev Updates the pending cover start variable, which is the lowest cover id with "active" status.
    /// @param val new start position
    function updatePendingCoverStart(uint val) onlyInternal
    {
        pendingCoverStart = val;
    }

    /// @dev Gets total number of Quotations created till date.
    function getQuoteLength() constant returns(uint len)
    {
        return (quotations.length);
    }

    /// @dev Gets total number Covers created till date.
    function getCoverLength() constant returns(uint len)
    {
        return (allCovers.length);
    }

    /// @dev Gets the date of creation of a given quote id.
    /// @param qid Quotation Id.
    /// @return date_add date of creation (timestamp).
    function getQuotationDateAdd(uint qid) constant returns (uint date_add)
    {
        date_add = quotations[qid].dateAdd;
    }

    /// @dev Adds the amount in Total Sum Assured of a given currency.
    /// @param curr Currency Name.
    /// @param amount Amount to be added.
    function addInTotalSumAssured(bytes4 curr , uint amount) onlyInternal
    {
        totalSumAssured[curr] =SafeMaths.add(totalSumAssured[curr],amount);
    }

    /// @dev Subtracts the amount from Total Sum Assured of a given currency.
    /// @param curr Currency Name.
    /// @param amount Amount to be subtracted.
    function subFromTotalSumAssured(bytes4 curr , uint amount) onlyInternal
    {
        totalSumAssured[curr] =SafeMaths.sub(totalSumAssured[curr],amount);
    }

    /// @dev Gets the Total Sum Assured amount of a given currency.
    function getTotalSumAssured(bytes4 curr) constant returns(uint amount)
    {
        amount = totalSumAssured[curr];
    }

    /// @dev Changes the time (in seconds) after which a quote expires
    function changeQuoteExpireTime(uint64 time) onlyInternal
    {
        quoteExpireTime=time;
    }

    /// @dev Gets time (in seconds) after which a quote expires.
    function getQuoteExpireTime() constant returns(uint64 _time)
    {
        _time = quoteExpireTime;
    }

    /// @dev Gets the status of a given quotation.
    function getQuotationStatusNo(uint qid) constant returns(uint16 stat)
    {
        stat = quotations[qid].status;
    }

    /// @dev Changes the status of a given quotation.
    /// @param qid Quotation Id.
    /// @param stat New status.
    function changeQuotationStatus(uint qid , uint16 stat) onlyInternal
    {
        quotations[qid].status = stat;
    }

    /// @dev Gets the Funded Amount of a given quotation.
    function getQuotationAmountFunded(uint qid) constant returns(uint amount)
    {
        amount = quotations[qid].amountFunded;
    }

    /// @dev Changes the Funded Amount of a given quotation.
    /// @param qid Quotation Id.
    /// @param amount New Funded Amount.
    function changeAmountFunded(uint qid , uint amount) onlyInternal
    {
        quotations[qid].amountFunded = amount;
    }

    /// @dev Gets the Premium of a given quotation.
    function getPremiumCalculated(uint qid) constant returns(uint prem) 
    {
        prem = quotations[qid].premiumCalculated;
    }

    /// @dev Changes the Premium of a given quotation.
    /// @param qid Quotation Id.
    /// @param prem New Premium. 
    function changePremiumCalculated(uint qid , uint prem) onlyInternal
    {
        quotations[qid].premiumCalculated = prem;
    }

    /// @dev Gets the Cover Period (in days) of a given quotation.
    function getCoverPeriod(uint qid)constant returns(uint32 _days)
    {
        _days = quotations[qid].coverPeriod;
    }

    /// @dev Gets the Sum Assured Amount of a given quotation.
    function getQuotationSumAssured(uint qid)constant returns(uint16 sa)
    {
        sa = quotations[qid].sumAssured;
    }
      
    /// @dev Changes the Sum Assured Amount of a given quotation.
    /// @param qid Quotation Id.
    /// @param sa New Sum Assured Amount. 
    function changeSumAssured(uint qid , uint16 sa) onlyInternal
    {
        quotations[qid].sumAssured = sa;
    }

    /// @dev Gets the Currency Name in which a given quotation is assured.
    function getQuotationCurrency(uint qid)constant returns(bytes4 curr)
    {
        curr = quotations[qid].currencyCode;
    }
    
    /// @dev Creates a New Cover.
    /// @param qid Quotation id against which cover will be created.
    /// @param cid Cover Id.
    /// @param validuntill Timestamp till which cover is valid.
    /// @param user User's address.
    function addCover(uint qid,uint cid,uint validuntill,address user) onlyInternal
    {
        allCovers.push(cover(qid,validuntill,0,0,0));
        quotations[qid].coverId = cid;
        cover_user[user].push(cid);
    }

    /// @dev Maps the Cover Id to its owner's address.
    function addUserCover(uint cid , address _add) onlyInternal
    {
         cover_user[_add].push(cid);
    }

    /// @dev Maps the Quotation Id to its owner's address.
    function addUserQuote(uint qid , address _add) onlyInternal
    {
        quote_user[_add].push(qid);
    }

    /// @dev Gets total number of covers generated by a given address
    function getUserCoverLength(address _add)constant returns(uint len)
    {
        len=cover_user[_add].length;
    }
    /// @dev Gets total number of quotations generated by a given address
    function getUserQuoteLength(address _add)constant returns(uint len)
    {
        len=quote_user[_add].length;
    }
    /// @dev Updates the cover id generated against a given quote id.
    /// @param qid Quotation Id.
    /// @param cid Cover Id.
    function addCoveridInQuote(uint qid , uint cid) onlyInternal
    {
        quotations[qid].coverId = cid;
    }

    /// @dev Updates the number of tokens locked against a given cover id.
    function changeLockedTokens(uint cid , uint tokens) onlyInternal
    {
        allCovers[cid].lockedTokens = tokens;
    }
     /// @dev Gets the validity date (timestamp) of a given cover.
    function getCoverValidity(uint cid) constant returns(uint date)
    {
        date = allCovers[cid].validUntil;
    }

    /// @dev Gets the number of tokens locked against a given quotation.
    function getCoverLockedTokens(uint cid) constant returns(uint tokens)
    {
        tokens = allCovers[cid].lockedTokens;
    }

     /// @dev Gets all the quotation ids created by a given address.
    function getUserAllQuotes(address _add) constant returns(uint[] allQuotes)
    {
        return(quote_user[_add]);
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
    // Arjun - Data Begin
    function addQuote(uint32 coverPeriod,uint16 SA) onlyInternal
    { 
        quotations.push(quote(0,0,"",SA,coverPeriod,0,0,0,0,0,0,new int[](0),new bytes32[](0),new address[](0)));
    }
    // Arjun - Data End
    /// @dev Updates the Product id, quote id, owner address and currency of a given quotation
    /// @param productId Insurance product id.
    /// @param qid Quotation Id.
    /// @param userAddress Quotation's owner/creator address.
    /// @param currencyCode Currency's Name.
    /// @param intParams Integer Parameters.
    /// @param bytesParams Bytes Parameters.
    /// @param addParams Address Parameters.
    function updateQuote1(uint8 productId,uint qid,address userAddress,bytes4 currencyCode,int[] intParams, bytes32[] bytesParams, address[] addParams) onlyInternal
    {
        quotations[qid].productId = productId;
        quotations[qid].memberAddress = userAddress;
        quotations[qid].currencyCode = currencyCode;
        quotations[qid].dateAdd = now;
        quotations[qid].validUntil = SafeMaths.add(now,quoteExpireTime);
        quotations[qid].status = 0;
        uint i=0;
        for(i=0;i<intParams.length;i++)
           quotations[qid].intParams.push(intParams[i]);
        for(i=0;i<bytesParams.length;i++)
           quotations[qid].bytesParams.push(bytesParams[i]);
        for(i=0;i<addParams.length;i++)
           quotations[qid].addParams.push(addParams[i]);
        quote_user[userAddress].push(qid);
        
    }
    /// @dev Updates quote area hash.
    function updateHash(string CSAhash,string Areahash) 
    {
        if(ipfsHashAddress!=msg.sender) throw;
        CSAHash=CSAhash;
        quoteAreaHash=Areahash;
    }
    /// @dev Gets current sum assured hash.
    function getCSAHash() constant returns(string hash)
    {
        return CSAHash;
    }
     /// @dev Gets quote area hash.
    function getQuoteAreaHash() constant returns(string hash)
    {
        return quoteAreaHash;
    }

    /// @dev Updates the Sum Assured of a given quotation.    
    function changeTotalSumAssured(uint quoteId , uint16 SA) onlyInternal
    {
        quotations[quoteId].sumAssured = SA;
    }

    /// @dev Gets the Cover Id of a given quotation.
    function getQuoteCoverid(uint qid)constant returns(uint cid)
    {
        cid = quotations[qid].coverId;
    }

    /// @dev Gets the Quotation Id of a given Cover.
    function getCoverQuoteid(uint cid)constant returns(uint qid)
    {
        qid = allCovers[cid].quoteId;
    }
    
    // Arjun - Data Begin
    /// @dev Gets the Product Id of a given Cover.
    function getCoverProdId(uint cid)constant returns(uint16 pid)
    {
        pid = quotations[allCovers[cid].quoteId].productId;
    }
    /// @dev Gets the Product Id of a given Quote.
    function getQuoteProdId(uint qid)constant returns(uint16 pid)
    {
        pid = quotations[qid].productId;
    }
    function getIntParams(uint quoteId) constant returns(uint ,int[])
    {
       return (quoteId,quotations[quoteId].intParams);
    }
    function getIntParamsLength(uint quoteId) constant returns(uint,uint)
    {
       return (quoteId,quotations[quoteId].intParams.length);
    }
    function getIntParamsByQuoteIdAndIndex(uint quoteId,uint index) constant returns(uint,uint,int)
    {
       return (quoteId,index,quotations[quoteId].intParams[index]);
    }
    function getBytesParams(uint quoteId) constant returns(uint,bytes32[])
    {
       return (quoteId,quotations[quoteId].bytesParams);
    }
    function getBytesParamsLength(uint quoteId) constant returns(uint,uint)
    {
       return (quoteId,quotations[quoteId].bytesParams.length);
    }
    function getBytesParamsByQuoteIdAndIndex(uint quoteId,uint index) constant returns(uint,uint,bytes32)
    {
       return (quoteId,index,quotations[quoteId].bytesParams[index]);
    }
    function getAddressParams(uint quoteId) constant returns(uint,address[])
    {
       return (quoteId,quotations[quoteId].addParams);
    }
    function getAddressParamsLength(uint quoteId) constant returns(uint,uint)
    {
       return (quoteId,quotations[quoteId].addParams.length);
    }
    function getAddressParamsByQuoteIdAndIndex(uint quoteId,uint index) constant returns(address)
    {
       return (quotations[quoteId].addParams[index]);
    }

    function getQuoteParams(uint quoteId) constant returns(uint,uint,int[],bytes32[],address[])
    {
       return(quoteId,quotations[quoteId].productId,quotations[quoteId].intParams,quotations[quoteId].bytesParams,quotations[quoteId].addParams);
    }
   // Arjun - Data End

    /// @dev Gets the owner address of a given quotation.
    function getQuoteMemberAddress(uint qid) constant returns(address _add)
    {
        _add = quotations[qid].memberAddress;
    }

    /// @dev Gets number of claims submitted against a given cover.
    function getCoverClaimCount(uint cid) constant returns(uint8 count)
    {
        count = allCovers[cid].claimCount;
    }

    /// @dev Updates the claim count of a given cover.
    function changeClaimCount(uint coverid , uint8 val) onlyInternal
    {
        allCovers[coverid].claimCount = val;
    }

    /// @dev Gets the cover id of a given user at a given index.
    function getCoverIdByAddressAndIndex(uint ind , address _of) constant returns(uint coverId)
    {
        uint index=cover_user[_of][ind];
        return (index);
    }

    /// @dev Gets the quote id of a given user at a given index.
    function getQuoteByAddressAndIndex(uint ind,address _of) constant returns(uint qid)
    {
        qid = quote_user[_of][ind];
    }
    /// @dev Gets Premium details.
    ///@return  _minDays minimum cover period.
    ///@return  _PM Profit margin.
    ///@return  _STL short term Load.
    ///@return  _STLP short term load period.
    function getPremiumDetails(uint prodId) constant returns(uint64 _minDays,uint16 _PM,uint16 _STL,uint16 _STLP)
    {
        _minDays=ProductDetails[prodId].minDays;
        _PM=ProductDetails[prodId].PM;
        _STL=ProductDetails[prodId].STL;
        _STLP=ProductDetails[prodId].STLP;
    }

    /// @dev Provides the details of a Quotation Id
    /// @param quoteid Quotation Id
    /// @return productId Insurance Product id.
    /// @return quoteId Quotation Id.
    /// @return intParams Integer Array
    /// @return bytesParams Bytes Array
    /// @return addParams Address Array
    /// @return currencyCode Currency in which quotation is assured
    /// @return sumAssured Sum assurance of quotation.
    // Arjun - Data Begin
    function getQuoteByIndex1(uint quoteid) constant returns(uint8 productId,uint quoteId,int[] intParams, bytes32[] bytesParams,address[] addParams,bytes4 currencyCode,uint16 sumAssured)
    {
        return (quotations[quoteid].productId,quoteid,quotations[quoteid].intParams,quotations[quoteid].bytesParams,quotations[quoteid].addParams,quotations[quoteid].currencyCode,quotations[quoteid].sumAssured);
    }
    // Arjun - Data End

    /// @dev Provides details of a Quotation Id
    /// @param quoteid Quotation Id
    /// @return coverPeriod Cover Period of quotation (in days).
    /// @return premiumCalculated Premium of quotation.
    /// @return dateAdd timestamp at which quotation is created.
    /// @return status current status of Quotation.
    /// @return amountFunded Amount funded to the quotation.
    /// @return coverId cover of a quoation.
    function getQuoteByIndex2(uint quoteid) constant returns(uint32 coverPeriod,uint premiumCalculated,uint dateAdd,uint validUntil,uint16 status,uint amountFunded,uint coverId)
    {
        return (quotations[quoteid].coverPeriod,quotations[quoteid].premiumCalculated,quotations[quoteid].dateAdd,quotations[quoteid].validUntil,quotations[quoteid].status,quotations[quoteid].amountFunded,quotations[quoteid].coverId);
    }
    /// @dev Provides details of a Quotation Id
    /// @param quoteid Quotation Id
    /// @return currencyCode Currency in which quotation is assured
    /// @return sumAssured Sum assurance of quotation.
    /// @return coverPeriod Cover Period of quotation (in days).
    /// @return premiumCalculated Premium of quotation.
    function getQuoteByIndex3(uint quoteid) constant returns(bytes4 currencyCode, uint16 sumAssured,uint32 coverPeriod,uint premiumCalculated)
    {
        return (quotations[quoteid].currencyCode,quotations[quoteid].sumAssured,quotations[quoteid].coverPeriod,quotations[quoteid].premiumCalculated);
    }
    /// @dev Provides the information of a given Cover Id.
    /// @param coverid Cover Id.
    /// @return quoteId Quotation Id associated with the cover.
    /// @return validUntil validity timestamp of cover.
    /// @return claimCount Number of claims submitted against a cover.
    /// @return lockedTokens Number of tokens locked against a cover.
    /// @return status Current status of cover. 
    function getCoverByIndex(uint coverid) constant returns(uint quoteId,uint validUntil,uint8 claimCount,uint lockedTokens,uint16 status)
    {
        return (allCovers[coverid].quoteId,allCovers[coverid].validUntil,allCovers[coverid].claimCount,allCovers[coverid].lockedTokens,allCovers[coverid].status);
    }    
    /// @dev Provides the information of the quote id, mapped against the user  calling the function, at the given index
    /// @param ind User's Quotation Index.
    /// @return coverPeriod Cover Period of quotation in days.
    /// @return premiumCalculated Premium of quotation.
    /// @return dateAdd timestamp at which quotation is created.
    /// @return status current status of Quotation.
    /// @return amountFunded number of tokens funded to the quotation.
    /// @return coverId cover of a quoation
    function getQuoteByAddressAndIndex2(uint ind) constant returns(uint coverPeriod,uint premiumCalculated,uint dateAdd,uint validUntil,bytes16 status,uint amountFunded,uint coverId,uint quoteid)
    {
        uint16 statusNo;
        quoteid=getQuoteByAddressAndIndex(ind , msg.sender);
        (coverPeriod,premiumCalculated,dateAdd,validUntil,statusNo,amountFunded,coverId) = getQuoteByIndex2(quoteid);
        status=getQuotationStatus(statusNo);
    }
    /// @dev Gets Quote details using current address and quoteid.
    function getQuoteByAddressAndIndex1(uint ind) constant returns(uint8 productId,int[] intParams, bytes32[] bytesParams,address[] addParams,bytes4 currencyCode,uint sumAssured,uint quoteid)
    {
        quoteid=getQuoteByAddressAndIndex(ind , msg.sender);
       (productId,,intParams,bytesParams,addParams,currencyCode,sumAssured) = getQuoteByIndex1(quoteid);
    }
    function setProductDetails(uint prodId,uint64 _minDays,uint16 _PM,uint16 _STL,uint16 _STLP)
    {
       ProductDetails[prodId]=(Product_Details(_STLP,_STL,_PM,_minDays));
    }

    /// @dev Adds the amount in Total Sum Assured of a given currency.
    /// @param _add Smart Contract Address.
    /// @param _amount Amount to be added.
    function addInTotalSumAssuredSC(address _add , bytes4 _curr, uint _amount) onlyInternal
    {
        totalSumAssured_SC[_add][_curr] =SafeMaths.add(totalSumAssured_SC[_add][_curr],_amount);
    }

    /// @dev Subtracts the amount from Total Sum Assured of a given currency.
    /// @param _add Smart Contract Address.
    /// @param _amount Amount to be subtracted.
    function subFromTotalSumAssuredSC(address _add , bytes4 _curr, uint _amount) onlyInternal
    {
        totalSumAssured_SC[_add][_curr] =SafeMaths.sub(totalSumAssured_SC[_add][_curr],_amount);
    }

    /// @dev Gets the Total Sum Assured amount of a given currency.
    function getTotalSumAssuredSC(address _add, bytes4 _curr) constant returns(uint amount)
    {
        amount = totalSumAssured_SC[_add][_curr];
    }
}