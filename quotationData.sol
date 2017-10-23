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


pragma solidity ^0.4.8;
import "./master.sol";
contract quotationData{
    master ms1;
    address masterAddress;
    struct quote {
        uint productId;
        uint quoteId;
        address memberAddress;
        bytes16 currencyCode;
        uint sumAssured;
        uint coverPeriod;
        uint premiumCalculated;
        uint dateAdd;
        uint validUntil;
        bytes16 status;
        uint amountFunded;
        uint coverId;
        uint32[] area;
        bytes16 latstring;
        bytes16 longstring;
    }
    struct cover {
        uint quoteId;
        uint coverId;
        uint validUntil;
        uint claimCount;
        uint lockedTokens;
        bytes16 status;
    }

    mapping(bytes16=>uint) totalSumAssured;
    mapping (uint32=>mapping(bytes16=>uint)) area_CSA;
    mapping ( address=>uint[] ) quote_user;
    mapping ( address=>uint[] ) cover_user;
    //quote[] quotations;
    mapping(uint=>quote) quotations;
    cover[] allCovers;
    uint quote_length;
    uint cover_length;
    uint STLP;
    uint STL;
    uint PM;
    uint minDays;
    uint public pendingQuoteStart;
    uint public pendingCoverStart;
    uint public quoteExpireTime;
    address owner;
    uint32[] nullArr;
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
        quoteExpireTime=7*1 days;
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

    /// @dev Changes the existing Profit Margin value
    function changePM(uint pm) onlyOwner
    {
        PM = pm;
    }

    /// @dev Gets the Profit Margin (PM) value
    function getPM() constant returns(uint pm)
    {
        pm = PM;
    }

    /// @dev Changes the existing Short Term Load Period (STLP) value.
    function changeSTLP(uint stlp) onlyOwner
    {
        STLP = stlp;
    }

    /// @dev Gets the Short Term Load Period (STLP) value
    function getSTLP() constant returns(uint stlp)
    {
        stlp = STLP;
    }

    
    /// @dev Changes the existing Short Term Load (STL) value.
    function changeSTL(uint stl) onlyOwner
    {
        STL = stl;
    }

    /// @dev Gets the Short Term Load (STL) value
    function getSTL() constant returns(uint stl)
    {
        stl = STL;
    }

    /// @dev Changes the existing Minimum cover period (in days)
    function changeMinDays(uint _days) onlyOwner
    {
        minDays = _days;
    }

    /// @dev Gets the Minimum cover period (in days).
    function getMinDays()constant returns(uint _days)
    {
        _days = minDays;
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
        return quote_length;
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
    function addInTotalSumAssured(bytes16 curr , uint amount) onlyInternal
    {
        totalSumAssured[curr] +=amount;
    }

    /// @dev Subtracts the amount from Total Sum Assured of a given currency.
    /// @param curr Currency Name.
    /// @param amount Amount to be subtracted.
    function subFromTotalSumAssured(bytes16 curr , uint amount) onlyInternal
    {
        totalSumAssured[curr] -=amount;
    }

    /// @dev Gets the Total Sum Assured amount of a given currency.
    function getTotalSumAssured(bytes16 curr) constant returns(uint amount)
    {
        amount = totalSumAssured[curr];
    }

    /// @dev Changes the time (in seconds) after which a quote expires
    function changeQuoteExpireTime(uint time) onlyInternal
    {
        quoteExpireTime=time;
    }

    /// @dev Gets time (in seconds) after which a quote expires.
    function getQuoteExpireTime() constant returns(uint _time)
    {
        _time = quoteExpireTime;
    }

    /// @dev Gets the status of a given quotation.
    function getQuotationStatus(uint id) constant returns(bytes16 stat)
    {
        stat = quotations[id].status;
    }

    
    /// @dev Changes the status of a given quotation.
    /// @param id Quotation Id.
    /// @param stat New status.
    function changeQuotationStatus(uint id , bytes16 stat) onlyInternal
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
    function getCoverPeriod(uint id)constant returns(uint _days)
    {
        _days = quotations[id].coverPeriod;
    }

    /// @dev Gets the Sum Assured Amount of a given quotation.
    function getQuotationSumAssured(uint id)constant returns(uint sa)
    {
        sa = quotations[id].sumAssured;
    }
      
    /// @dev Changes the Sum Assured Amount of a given quotation.
    /// @param id Quotation Id.
    /// @param sa New Sum Assured Amount. 
    function changeSumAssured(uint id , uint sa) onlyInternal
    {
        quotations[id].sumAssured = sa;
    }

     /// @dev Gets the area ids in which a quotation lies.
     /// @param id Quotation Id.
     /// @return Area Array of Area Ids in which a quotation lies.
    function getQuotationArea(uint id)constant returns(uint32[] Area)
    {
        Area = quotations[id].area;
    }

    /// @dev Gets the number of predefined areas in which a quotation lies.
    function getQuotationAreaLength(uint id)constant returns(uint len)
    {
        len = quotations[id].area.length;
    }

    /// @dev Gets the Area id of a given quotation by index.
    function getQuotationAreaByIndex(uint id , uint index)constant returns(uint32 ind)
    {
        ind = quotations[id].area[index];
    }

    /// @dev Subtracts a given amount of a given currency from the Current Sum Assured Amount of a given Area.
    /// @ index Area Id.
    /// @param curr Currency Name.
    /// @param amount Amount to be subtracted.
    function removeCSAFromArea(uint32 index,bytes16 curr,uint amount) onlyInternal
    {
        area_CSA[index][curr] -=amount;
    }

    /// @dev Adds a given amount of a given currency in the Current Sum Assured Amount of a given Area.
    /// @ index Area Id.
    /// @param curr Currency Name.
    /// @param amount Amount to be added.
    function addCSAFromArea(uint32 index,bytes16 curr,uint amount) onlyInternal
    {
        area_CSA[index][curr] +=amount;
    }

    /// @dev Gets the Current Sum Assured Amount of a given Area.
    /// @param index Area Id.
    /// @param curr Currency Name.
    /// @return amount Current Sum Assured Amount of area
    function getCSA(uint32 index, bytes16 curr) constant returns(uint amount)
    {
        amount = area_CSA[index][curr];
    }

    /// @dev Gets the Currency Name in which a given quotation is assured.
    function getQuotationCurrency(uint id)constant returns(bytes16 curr)
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
        
        allCovers.push(cover(qid,cid,validuntill,0,0,"active"));
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
    /// @param allCover array of covers. 
    function getUserAllCover(address _add) constant returns(uint[] allCover)
    {
        return(cover_user[_add]);
    }

    /// @dev Gets the current status of a given cover id.
    function getCoverStatus(uint id) constant returns(bytes16 stat)
    {
        stat = allCovers[id].status;
    }
    
    /// @dev Changes the status of a given cover.
    function changeCoverStatus(uint id , bytes16 stat) onlyInternal
    {
        allCovers[id].status = stat;
    }  

    /// @dev Gets the Quote id associated to a given cover id.
    
    // function getQuoteId(uint coverId) constant returns (uint quoteId)
    // {
    //     quoteId = allCovers[coverId].quoteId;
    // }

    /// @dev Creates a blank new Quotation.
    function addQuote(uint coverPeriod,uint SA) onlyInternal
    { 
        //quotations.push(quote(0,0,0,"",SA,coverPeriod,0,0,0,"",0,0,nullArr,"",""));
        quotations[quote_length]=quote(0,0,0,"",SA,coverPeriod,0,0,0,"",0,0,nullArr,"","");
        quote_length++;

    }
    /// @dev Updates the Product id, quote id, owner address and currency of a given quotation
    /// @param productId Insurance product id.
    /// @param id Quotation Id.
    /// @param userAddress Quotation's owner/creator address.
    /// @param currencyCode Currency's Name.

    function updateQuote1(uint productId,uint id,address userAddress,bytes16 currencyCode) onlyInternal
    {
        quotations[id].productId = productId;
        quotations[id].quoteId = id;
        quotations[id].memberAddress = userAddress;
        quotations[id].currencyCode = currencyCode;
        quotations[id].dateAdd = now;
        quotations[id].validUntil = now+quoteExpireTime;
        quotations[id].status = "NEW";
        quote_user[userAddress].push(id);
        
    }

    /// @dev Updates the cover period,premium, date of creation, validity and status of a given quotation id.
    /// @param p6 Cover period in days.
    /// @param p7 Premium of quoation.
    /// @param p8 timestamp at which quotation is created.
    /// @param p9 timestamp till which quotation is valid.
    /// @param p10 Status of quotation.
    /// @param id Quotation Id.

     /*  function updateQuote2(uint p6,uint p7,uint p8,uint p9,bytes16 p10,uint id) onlyInternal
    {
        quotations[id].coverPeriod = p6;
        quotations[id].premiumCalculated = p7;
        quotations[id].dateAdd = p8;
        quotations[id].validUntil = p9;
        quotations[id].status = p10;
       
    }*/

    /// @dev Updates the Latitude, Longitude and sum assured of a given quotation.
    /// @param id Quotation id.
    /// @param lat Latitude of quotation
    /// @param long Longitude of quotation.
    function updateQuote3(uint id,bytes16 lat,bytes16 long) onlyInternal
    {
        quotations[id].latstring = lat;
        quotations[id].longstring = long;
        //quotations[id].sumAssured = SA;
        //quotations[id].coverPeriod = coverPeriod;
        
    }
    /// @dev Adds all Area Ids in which a given quotation lies.
    /// @param id Quotation id.
    /// @param areaId array of Area ids in which a quotation lies.
    function updateQuoteArea(uint id,uint32[] areaId)
    {
        quotations[id].area = areaId;
        bytes16 curr= quotations[id].currencyCode;
        uint amount=quotations[id].sumAssured;
        for(uint32 i=0;i<areaId.length;i++)
        {
            area_CSA[i][curr] +=amount;
        }
    }
    /// @dev Updates the Latitude and Longitude of a given quotation.
    /// @param id Quotation Id.
    /// @param p14 Latitude of quotation
    /// @param p15 Longitude of quotation.

   /* function updateQuote4(uint id,bytes16 p14,bytes16 p15) onlyInternal
    {
        quotations[id].latstring = p14;
        quotations[id].longstring = p15;
    }*/
    /// @dev Updates the Sum Assured of a given quotation.    
    function changeTotalSumAssured(uint id , uint SA) onlyInternal
    {
        quotations[id].sumAssured = SA;
    }

    /// @dev Adds an Area ID in which a given quotation lies.
    function addAreaInQuotation(uint id , uint32 areaid) onlyInternal
    {
        quotations[id].area.push(areaid);
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

    /// @dev Gets the Latitude of a given quotation.
    function getLatitude(uint id) constant returns(bytes16 lat)
    {
        lat = quotations[id].latstring;
    }

    /// @dev Gets the Longitude of a given quotation.
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
    function getCoverClaimCount(uint id) constant returns(uint count)
    {
        count = allCovers[id].claimCount;
    }

    /// @dev Updates the claim count of a given cover.
    function changeClaimCount(uint coverid , uint val) onlyInternal
    {
        allCovers[coverid].claimCount = val;
    }

    /// @dev Gets the cover id of a given user at a given index.
    function getCoverIdByAddressAndIndex(uint ind , address _of) constant returns(uint coverId)
    {
        uint index=cover_user[_of][ind];
        return (allCovers[index].coverId);
    }

    /// @dev Gets the quote id of a given user at a given index.
    function getQuoteByAddressAndIndex(uint ind,address _of) constant returns(uint qid)
    {
        qid = quote_user[_of][ind];
    }
    function getPremiumDetails() constant returns(uint _minDays,uint _PM,uint _STL,uint _STLP)
    {
        _minDays=minDays;
        _PM=PM;
        _STL=STL;
        _STLP=STLP;
    }

    /// @dev Provides the details of a Quotation Id
    /// @param index Quotation Id
    /// @param productId Insurance Product id.
    /// @param quoteId Quotation Id.
    /// @param lat Latitude position of quotation
    /// @param long Longitude position of quotation
    /// @param currencyCode Currency in which quotation is assured
    /// @param sumAssured Sum assurance of quotation.
    function getQuoteByIndex1(uint index) constant returns(uint productId,uint quoteId,bytes16 lat,bytes16 long,bytes16 currencyCode,uint sumAssured)
    {
        return (quotations[index].productId,quotations[index].quoteId,quotations[index].latstring,quotations[index].longstring,quotations[index].currencyCode,quotations[index].sumAssured);
    }

    /// @dev Provides details of a Quotation Id
    /// @param index Quotation Id
    /// @return coverPeriod Cover Period of quotation (in days).
    /// @return premiumCalculated Premium of quotation.
    /// @return dateAdd timestamp at which quotation is created.
    /// @return status current status of Quotation.
    /// @return amountFunded Amount funded to the quotation.
    /// @return coverId cover of a quoation.
    function getQuoteByIndex2(uint index) constant returns(uint coverPeriod,uint premiumCalculated,uint dateAdd,uint validUntil,bytes16 status,uint amountFunded,uint coverId)
    {
        return (quotations[index].coverPeriod,quotations[index].premiumCalculated,quotations[index].dateAdd,quotations[index].validUntil,quotations[index].status,quotations[index].amountFunded,quotations[index].coverId);
    }
    /// @dev Provides details of a Quotation Id
    /// @param index Quotation Id
    /// @param currencyCode Currency in which quotation is assured
    /// @param sumAssured Sum assurance of quotation.
    /// @return coverPeriod Cover Period of quotation (in days).
    /// @return premiumCalculated Premium of quotation.
    function getQuoteByIndex3(uint index) constant returns(bytes16 currencyCode, uint sumAssured,uint coverPeriod,uint premiumCalculated)
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
    function getCoverByIndex(uint index) constant returns(uint quoteId,uint validUntil,uint claimCount,uint lockedTokens,bytes16 status)
    {
        return (allCovers[index].quoteId,allCovers[index].validUntil,allCovers[index].claimCount,allCovers[index].lockedTokens,allCovers[index].status);
    }
    
}