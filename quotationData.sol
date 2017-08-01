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
    quote[] quotations;
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
    function changePM(uint pm) onlyOwner
    {
        PM = pm;
    }
    function getPM() constant returns(uint pm)
    {
        pm = PM;
    }
    function changeSTLP(uint stlp) onlyOwner
    {
        STLP = stlp;
    }
    function getSTLP() constant returns(uint stlp)
    {
        stlp = STLP;
    }
    function changeSTL(uint stl) onlyOwner
    {
        STL = stl;
    }
    function getSTL() constant returns(uint stl)
    {
        stl = STL;
    }
    function changeMinDays(uint _days) onlyOwner
    {
        minDays = _days;
    }
    function getMinDays()constant returns(uint _days)
    {
        _days = minDays;
    }
    function updatePendingQuoteStart(uint val) onlyInternal
    {
        pendingQuoteStart = val;
    }
    function updatePendingCoverStart(uint val) onlyInternal
    {
        pendingCoverStart = val;
    }
    function getQuoteLength() constant returns(uint len)
    {
        return (quotations.length);
    }

    function getCoverLength() constant returns(uint len)
    {
        return (allCovers.length);
    }
    function getQuotationDateAdd(uint quoteid) constant returns (uint date_add)
    {
        date_add = quotations[quoteid].dateAdd;
    }
    function addInTotalSumAssured(bytes16 curr , uint amount) onlyInternal
    {
        totalSumAssured[curr] +=amount;
    }
    function subFromTotalSumAssured(bytes16 curr , uint amount) onlyInternal
    {
        totalSumAssured[curr] -=amount;
    }
    function getTotalSumAssured(bytes16 curr) constant returns(uint amount)
    {
        amount = totalSumAssured[curr];
    }
    function changeQuoteExpireTime(uint time) onlyInternal
    {
        quoteExpireTime=time;
    }
    function getQuoteExpireTime() constant returns(uint _time)
    {
        _time = quoteExpireTime;
    }
    function getQuotationStatus(uint id) constant returns(bytes16 stat)
    {
        stat = quotations[id].status;
    }
    function changeQuotationStatus(uint id , bytes16 stat) onlyInternal
    {
        quotations[id].status = stat;
    }
    function getQuotationAmountFunded(uint id) constant returns(uint amount)
    {
        amount = quotations[id].amountFunded;
    }
    function changeAmountFunded(uint id , uint amount) onlyInternal
    {
        quotations[id].amountFunded = amount;
    }
    function getPremiumCalculated(uint id) constant returns(uint prem) 
    {
        prem = quotations[id].premiumCalculated;
    }
    function changePremiumCalculated(uint id , uint prem) onlyInternal
    {
        quotations[id].premiumCalculated = prem;
    }
    function getCoverPeriod(uint id)constant returns(uint _days)
    {
        _days = quotations[id].coverPeriod;
    }
    function getQuotationSumAssured(uint id)constant returns(uint sa)
    {
        sa = quotations[id].sumAssured;
    }
    function changeSumAssured(uint id , uint sa) onlyInternal
    {
        quotations[id].sumAssured = sa;
    }
    function getQuotationArea(uint id)constant returns(uint32[] Area)
    {
        Area = quotations[id].area;
    }
    function getQuotationAreaLength(uint id)constant returns(uint len)
    {
        len = quotations[id].area.length;
    }
    function getQuotationAreaByIndex(uint id , uint index)constant returns(uint32 ind)
    {
        ind = quotations[id].area[index];
    }
    function removeCSAFromArea(uint32 index,bytes16 curr,uint amount) onlyInternal
    {
        area_CSA[index][curr] -=amount;
    }
    function addCSAFromArea(uint32 index,bytes16 curr,uint amount) onlyInternal
    {
        area_CSA[index][curr] +=amount;
    }
    function getCSA(uint32 index, bytes16 curr) constant returns(uint amount)
    {
        amount = area_CSA[index][curr];
    }
    function getQuotationCurrency(uint id)constant returns(bytes16 curr)
    {
        curr = quotations[id].currencyCode;
    }
    function addCover(uint qid,uint cid,uint validuntill,uint claimcount,uint lt,bytes16 stat) onlyInternal
    {
        allCovers.push(cover(qid,cid,validuntill,claimcount,lt,stat));
    }
    function addUserCover(uint cid , address _add) onlyInternal
    {
         cover_user[_add].push(cid);
    }
    function addUserQuote(uint qid , address _add) onlyInternal
    {
        quote_user[_add].push(qid);
    }
    function getUserCoverLength(address _add)constant returns(uint len)
    {
        len=cover_user[_add].length;
    }
    function getUserQuoteLength(address _add)constant returns(uint len)
    {
        len=quote_user[_add].length;
    }
    function addCoveridInQuote(uint qid , uint cid) onlyInternal
    {
        quotations[qid].coverId = cid;
    }
    function changeLockedTokens(uint cid , uint tokens) onlyInternal
    {
        allCovers[cid].lockedTokens = tokens;
    }
    function getCoverValidity(uint id) constant returns(uint date)
    {
        date = allCovers[id].validUntil;
    }
    function getCoverLockedTokens(uint id) constant returns(uint tokens)
    {
        tokens = allCovers[id].lockedTokens;
    }

    function getUserAllQuotes(address _add) constant returns(uint[] allQuotes)
    {
        return(quote_user[_add]);
    }
    function getUserAllCover(address _add) constant returns(uint[] allCover)
    {
        return(cover_user[_add]);
    }
    function getCoverStatus(uint id) constant returns(bytes16 stat)
    {
        stat = allCovers[id].status;
    }
    function changeCoverStatus(uint id , bytes16 stat) onlyInternal
    {
        allCovers[id].status = stat;
    }   
    function getQuoteId(uint coverId) constant returns (uint quoteId)
    {
        quoteId = allCovers[coverId].quoteId;
    }
    function addQuote() onlyInternal
    { 
        quotations.push(quote(0,0,0,"",0,0,0,0,0,"",0,0,nullArr,"",""));
    }
    function updateQuote1(uint p1,uint p2,address p3,bytes16 p4) onlyInternal
    {
        quotations[p2].productId = p1;
        quotations[p2].quoteId = p2;
        quotations[p2].memberAddress = p3;
        quotations[p2].currencyCode = p4;
        
    }
    function updateQuote2(uint p6,uint p7,uint p8,uint p9,bytes16 p10,uint id) onlyInternal
    {
         quotations[id].coverPeriod = p6;
        quotations[id].premiumCalculated = p7;
        quotations[id].dateAdd = p8;
        quotations[id].validUntil = p9;
        quotations[id].status = p10;
       
    }
    function updateQuote3(uint id,uint p11,uint p12,uint32[] p13) onlyInternal
    {
        quotations[id].amountFunded = p11;
        quotations[id].coverId = p12;
        quotations[id].area = p13;
        
    }
    function updateQuote4(uint id,bytes16 p14,bytes16 p15) onlyInternal
    {
        quotations[id].latstring = p14;
        quotations[id].longstring = p15;
    }
    function changeTotalSumAssured(uint id , uint SA) onlyInternal
    {
        quotations[id].sumAssured = SA;
    }
    function addAreaInQuotation(uint id , uint32 areaid) onlyInternal
    {
        quotations[id].area.push(areaid);
    }
    function getQuoteCoverid(uint qid)constant returns(uint cid)
    {
        cid = quotations[qid].coverId;
    }
    function getCoverQuoteid(uint cid)constant returns(uint qid)
    {
        qid = allCovers[cid].quoteId;
    }
    function getLatitude(uint id) constant returns(bytes16 lat)
    {
        lat = quotations[id].latstring;
    }
    function getLongitude(uint id) constant returns(bytes16 long)
    {
        long = quotations[id].longstring;
    }
    function getQuoteMemberAddress(uint id) constant returns(address _add)
    {
        _add = quotations[id].memberAddress;
    }
    function getCoverClaimCount(uint id) constant returns(uint count)
    {
        count = allCovers[id].claimCount;
    }
    function changeClaimCount(uint coverid , uint val) onlyInternal
    {
        allCovers[coverid].claimCount = val;
    }
    function getCoverIdByAddressAndIndex(uint ind , address _of) constant returns(uint coverId)
    {
        uint index=cover_user[_of][ind];
        return (allCovers[index].coverId);
    }
    function getQuoteByAddressAndIndex(uint ind,address _of) constant returns(uint qid)
    {
        qid = quote_user[_of][ind];
    }
    function getQuoteByIndex1(uint index) constant returns(uint productId,uint quoteId,bytes16 lat,bytes16 long,bytes16 currencyCode,uint sumAssured)
    {
        return (quotations[index].productId,quotations[index].quoteId,quotations[index].latstring,quotations[index].longstring,quotations[index].currencyCode,quotations[index].sumAssured);
    }
    function getQuoteByIndex2(uint index) constant returns(uint coverPeriod,uint premiumCalculated,uint dateAdd,uint validUntil,bytes16 status,uint amountFunded,uint coverId)
    {
        return (quotations[index].coverPeriod,quotations[index].premiumCalculated,quotations[index].dateAdd,quotations[index].validUntil,quotations[index].status,quotations[index].amountFunded,quotations[index].coverId);
    }
    
    function getCoverByIndex(uint index) constant returns(uint quoteId,uint validUntil,uint claimCount,uint lockedTokens,bytes16 status)
    {
        return (allCovers[index].quoteId,allCovers[index].validUntil,allCovers[index].claimCount,allCovers[index].lockedTokens,allCovers[index].status);
    }
    
}