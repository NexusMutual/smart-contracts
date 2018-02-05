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
        bytes16 latstring;
        bytes16 longstring;
    }
    struct cover
    {
        uint quoteId;
        uint validUntil;
        uint8 claimCount;
        uint lockedTokens;
        uint16 status;
    }
    address public ipfsHashAddress;
    string CSAHash;
    string quoteAreaHash;
    bytes16[] quoteStatus;
    bytes16[] coverStatus;
    mapping(bytes4=>uint) totalSumAssured;
    mapping ( address=>uint[] ) quote_user;
    mapping ( address=>uint[] ) cover_user;
    quote[] quotations;
    cover[] allCovers;
    uint quote_length;
    uint cover_length;
    uint16 STLP;
    uint16 STL;
    uint16 PM;
    uint64 minDays;
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
        STLP=90;
        STL=500;
        PM=12;
        minDays=42;
        quoteExpireTime=SafeMaths.mul64(7,1 days);
        CSAHash="QmVkvoPGi9jvvuxsHDVJDgzPEzagBaWSZRYoRDzU244HjZ";
        quoteAreaHash="QmVkvoPGi9jvvuxsHDVJDgzPEzagBaWSZRYoRDzU244HjZ";
        // quoteStatus.push("NEW");
        // quoteStatus.push("partiallyFunded");
        // quoteStatus.push("coverGenerated");
        // quoteStatus.push("Expired");
        // coverStatus.push("active");
        // coverStatus.push("Claim Accepted");
        // coverStatus.push("Claim Denied");
        // coverStatus.push("Cover Expired");
        // coverStatus.push("Claim Submitted");
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
     function changeIPFSHashAddress(address _add) onlyOwner
    {
        ipfsHashAddress=_add;
    }
    function pushQuoteStatus(bytes16 status) onlyInternal
    {
        quoteStatus.push(status);
    }
    function pushCoverStatus(bytes16 status) onlyInternal
    {
        coverStatus.push(status);
    }
    function getQuotationStatus(uint16 index) constant returns(bytes16 status)
    {
        return quoteStatus[index];
    }
    function getCoverStatus(uint16 index)constant returns(bytes16 status)
    {
        return coverStatus[index];
    }
    function getAllQuotationStatus() constant returns(bytes16[] status)
    {
        return quoteStatus;
    }
    function getAllCoverStatus() constant returns(bytes16[] status)
    {
        return coverStatus;
    }
    function getQuoteStatusLen() constant returns(uint len)
    {
        return quoteStatus.length;
    }
    function getCoverStatusLen() constant returns(uint len)
    {
        return coverStatus.length;
    }
    /// @dev Changes the existing Profit Margin value
    function changePM(uint16 pm) onlyOwner
    {
        PM = pm;
    }

   
    // function getPM() constant returns(uint16 pm)
    // {
    //     pm = PM;
    // }

    /// @dev Changes the existing Short Term Load Period (STLP) value.
    function changeSTLP(uint16 stlp) onlyOwner
    {
        STLP = stlp;
    }

    
    // function getSTLP() constant returns(uint16 stlp)
    // {
    //     stlp = STLP;
    // }
    
    /// @dev Changes the existing Short Term Load (STL) value.
    function changeSTL(uint16 stl) onlyOwner
    {
        STL = stl;
    }

   
    // function getSTL() constant returns(uint16 stl)
    // {
    //     stl = STL;
    // }

    /// @dev Changes the existing Minimum cover period (in days)
    function changeMinDays(uint64 _days) onlyOwner
    {
        minDays = _days;
    }

   
    // function getMinDays()constant returns(uint64 _days)
    // {
    //     _days = minDays;
    // }

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
    /// @param quoteid Quotation Id.
    /// @return date_add date of creation (timestamp).
    function getQuotationDateAdd(uint quoteid) constant returns (uint date_add)
    {
        date_add = quotations[quoteid].dateAdd;
    }

    /// @dev Adds the amount in Total Sum Assured of a given currency.
    /// @param curr Currency Name.
    /// @param amount Amount to be added.
    function addInTotalSumAssured(bytes4 curr , uint amount) onlyInternal
    {
        //totalSumAssured[curr] +=amount;
        totalSumAssured[curr] =SafeMaths.add(totalSumAssured[curr],amount);
    }

    /// @dev Subtracts the amount from Total Sum Assured of a given currency.
    /// @param curr Currency Name.
    /// @param amount Amount to be subtracted.
    function subFromTotalSumAssured(bytes4 curr , uint amount) onlyInternal
    {
        //totalSumAssured[curr] -=amount;
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
    function getQuotationStatusNo(uint id) constant returns(uint16 stat)
    {
        stat = quotations[id].status;
    }

    
    /// @dev Changes the status of a given quotation.
    /// @param id Quotation Id.
    /// @param stat New status.
    function changeQuotationStatus(uint id , uint16 stat) onlyInternal
    {
        quotations[id].status = stat;
    }

    /// @dev Gets the Funded Amount of a given quotation.
    function getQuotationAmountFunded(uint id) constant returns(uint amount)
    {
        amount = quotations[id].amountFunded;
    }

    /// @dev Changes the Funded Amount of a given quotation.
    /// @param id Quotation Id.
    /// @param amount New Funded Amount.
    function changeAmountFunded(uint id , uint amount) onlyInternal
    {
        quotations[id].amountFunded = amount;
    }

    /// @dev Gets the Premium of a given quotation.
    function getPremiumCalculated(uint id) constant returns(uint prem) 
    {
        prem = quotations[id].premiumCalculated;
    }

   
    /// @dev Changes the Premium of a given quotation.
    /// @param id Quotation Id.
    /// @param prem New Premium. 
    function changePremiumCalculated(uint id , uint prem) onlyInternal
    {
        quotations[id].premiumCalculated = prem;
    }

    /// @dev Gets the Cover Period (in days) of a given quotation.
    function getCoverPeriod(uint id)constant returns(uint32 _days)
    {
        _days = quotations[id].coverPeriod;
    }

    /// @dev Gets the Sum Assured Amount of a given quotation.
    function getQuotationSumAssured(uint id)constant returns(uint16 sa)
    {
        sa = quotations[id].sumAssured;
    }
      
    /// @dev Changes the Sum Assured Amount of a given quotation.
    /// @param id Quotation Id.
    /// @param sa New Sum Assured Amount. 
    function changeSumAssured(uint id , uint16 sa) onlyInternal
    {
        quotations[id].sumAssured = sa;
    }

    /// @dev Gets the Currency Name in which a given quotation is assured.
    function getQuotationCurrency(uint id)constant returns(bytes4 curr)
    {
        curr = quotations[id].currencyCode;
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
    function getCoverValidity(uint id) constant returns(uint date)
    {
        date = allCovers[id].validUntil;
    }

    /// @dev Gets the number of tokens locked against a given quotation.
    function getCoverLockedTokens(uint id) constant returns(uint tokens)
    {
        tokens = allCovers[id].lockedTokens;
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
    function getCoverStatusNo(uint id) constant returns(uint16 stat)
    {
        stat = allCovers[id].status;
    }
    
    /// @dev Changes the status of a given cover.
    function changeCoverStatus(uint id , uint16 stat) onlyInternal
    {
        allCovers[id].status = stat;
    }  

    /// @dev Creates a blank new Quotation.
    function addQuote(uint32 coverPeriod,uint16 SA) onlyInternal
    { 
        quotations.push(quote(0,0,"",SA,coverPeriod,0,0,0,0,0,0,"",""));
       
    }
    /// @dev Updates the Product id, quote id, owner address and currency of a given quotation
    /// @param productId Insurance product id.
    /// @param id Quotation Id.
    /// @param userAddress Quotation's owner/creator address.
    /// @param currencyCode Currency's Name.
    /// @param lat Latitude.
    /// @param long Longitude.
    function updateQuote1(uint8 productId,uint id,address userAddress,bytes4 currencyCode,bytes16 lat,bytes16 long) onlyInternal
    {
        quotations[id].productId = productId;
        quotations[id].memberAddress = userAddress;
        quotations[id].currencyCode = currencyCode;
        quotations[id].dateAdd = now;
        quotations[id].validUntil = SafeMaths.add(now,quoteExpireTime);
        quotations[id].status = 0;
        quotations[id].latstring = lat;
        quotations[id].longstring = long;
        quote_user[userAddress].push(id);
        
    }
    function updateHash(string CSAhash,string Areahash) 
    {
        if(ipfsHashAddress!=msg.sender) throw;
        CSAHash=CSAhash;
        quoteAreaHash=Areahash;
    }
    function getCSAHash() constant returns(string hash)
    {
        return CSAHash;
    }
    function getQuoteAreaHash() constant returns(string hash)
    {
        return quoteAreaHash;
    }

    /// @dev Updates the Sum Assured of a given quotation.    
    function changeTotalSumAssured(uint id , uint16 SA) onlyInternal
    {
        quotations[id].sumAssured = SA;
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

    /// @dev Gets the Latitude and Longitude of a given quotation.
    function getLatitude(uint id) constant returns(bytes16 lat)
    {
        lat = quotations[id].latstring;
    }

   
    function getLongitude(uint id) constant returns(bytes16 long)
    {
        long = quotations[id].longstring;
    }

    /// @dev Gets the owner address of a given quotation.
    function getQuoteMemberAddress(uint id) constant returns(address _add)
    {
        _add = quotations[id].memberAddress;
    }

    /// @dev Gets number of claims submitted against a given cover.
    function getCoverClaimCount(uint id) constant returns(uint8 count)
    {
        count = allCovers[id].claimCount;
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
    function getPremiumDetails() constant returns(uint64 _minDays,uint16 _PM,uint16 _STL,uint16 _STLP)
    {
        _minDays=minDays;
        _PM=PM;
        _STL=STL;
        _STLP=STLP;
    }

    /// @dev Provides the details of a Quotation Id
    /// @param index Quotation Id
    /// @return productId Insurance Product id.
    /// @return quoteId Quotation Id.
    /// @return lat Latitude position of quotation
    /// @return long Longitude position of quotation
    /// @return currencyCode Currency in which quotation is assured
    /// @return sumAssured Sum assurance of quotation.
    function getQuoteByIndex1(uint index) constant returns(uint8 productId,bytes16 lat,bytes16 long,bytes4 currencyCode,uint16 sumAssured)
    {
        return (quotations[index].productId,quotations[index].latstring,quotations[index].longstring,quotations[index].currencyCode,quotations[index].sumAssured);
    }

    /// @dev Provides details of a Quotation Id
    /// @param index Quotation Id
    /// @return coverPeriod Cover Period of quotation (in days).
    /// @return premiumCalculated Premium of quotation.
    /// @return dateAdd timestamp at which quotation is created.
    /// @return status current status of Quotation.
    /// @return amountFunded Amount funded to the quotation.
    /// @return coverId cover of a quoation.
    function getQuoteByIndex2(uint index) constant returns(uint32 coverPeriod,uint premiumCalculated,uint dateAdd,uint validUntil,uint16 status,uint amountFunded,uint coverId)
    {
        return (quotations[index].coverPeriod,quotations[index].premiumCalculated,quotations[index].dateAdd,quotations[index].validUntil,quotations[index].status,quotations[index].amountFunded,quotations[index].coverId);
    }
    /// @dev Provides details of a Quotation Id
    /// @param index Quotation Id
    /// @return currencyCode Currency in which quotation is assured
    /// @return sumAssured Sum assurance of quotation.
    /// @return coverPeriod Cover Period of quotation (in days).
    /// @return premiumCalculated Premium of quotation.
    function getQuoteByIndex3(uint index) constant returns(bytes4 currencyCode, uint16 sumAssured,uint32 coverPeriod,uint premiumCalculated)
    {
        return (quotations[index].currencyCode,quotations[index].sumAssured,quotations[index].coverPeriod,quotations[index].premiumCalculated);
    }
    /// @dev Provides the information of a given Cover Id.
    /// @param index Cover Id.
    /// @return quoteId Quotation Id associated with the cover.
    /// @return validUntil validity timestamp of cover.
    /// @return claimCount Number of claims submitted against a cover.
    /// @return lockedTokens Number of tokens locked against a cover.
    /// @return status Current status of cover. 
    function getCoverByIndex(uint index) constant returns(uint quoteId,uint validUntil,uint8 claimCount,uint lockedTokens,uint16 status)
    {
        return (allCovers[index].quoteId,allCovers[index].validUntil,allCovers[index].claimCount,allCovers[index].lockedTokens,allCovers[index].status);
    }    
    /// @dev Provides the information of the quote id, mapped against the user  calling the function, at the given index
    /// @param ind User's Quotation Index.
    /// @return coverPeriod Cover Period of quotation in days.
    /// @return premiumCalculated Premium of quotation.
    /// @return dateAdd timestamp at which quotation is created.
    /// @return status current status of Quotation.
    /// @return amountFunded number of tokens funded to the quotation.
    /// @return coverId cover of a quoation
    function getQuoteByAddressAndIndex2(uint ind) constant returns(uint coverPeriod,uint premiumCalculated,uint dateAdd,uint validUntil,bytes16 status,uint amountFunded,uint coverId,uint index)
    {
        
        uint16 statusNo;
         index=getQuoteByAddressAndIndex(ind , msg.sender);
        (coverPeriod,premiumCalculated,dateAdd,validUntil,statusNo,amountFunded,coverId) = getQuoteByIndex2(index);
        status=getQuotationStatus(statusNo);
    }

    function getQuoteByAddressAndIndex1(uint ind) constant returns(uint8 productId,bytes16 lat , bytes16 long ,bytes4 currencyCode,uint sumAssured,uint index)
    {
       
        index=getQuoteByAddressAndIndex(ind , msg.sender);
       (productId,lat,long,currencyCode,sumAssured) = getQuoteByIndex1(index);
    }
}