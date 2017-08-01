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
import "./NXMToken.sol";
import "./pool.sol";
import "./quotationData.sol";
import "./quotation.sol";
import "./NXMToken2.sol";
import "./MCR.sol";
import "./master.sol";
contract quotation2{

    NXMToken t1;
    pool p1;
    quotation q1;
    quotationData qd1;
    NXMToken2 t2;
    master ms1;
    MCR m1;
    address masterAddress;
    address  token2Address;
     address mcrAddress;
    address quotationAddress;
    address tokenAddress;
    address poolAddress;
    address quotationDataAddress;
    
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
    function changeToken2Address(address _add) onlyInternal
    {
        token2Address = _add;
        t2 = NXMToken2(token2Address);
        q1=quotation(quotationAddress);
        q1.changeToken2Address(_add);
    }
     function changeMCRAddress(address _add) onlyInternal
    {
        mcrAddress = _add;
        q1=quotation(quotationAddress);
        q1.changeMCRAddress(_add);
        m1=MCR(mcrAddress);
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
    function changeQuotationAddress(address _add) onlyInternal
    {
        quotationAddress = _add;
    }
    function changeTokenAddress(address _add) onlyInternal
    {
        tokenAddress = _add;
        q1=quotation(quotationAddress);
        q1.changeTokenAddress(_add);
    }
    function changeQuotationDataAddress(address _add) onlyInternal
    {
        quotationDataAddress = _add;
        qd1 = quotationData(quotationDataAddress);
        q1=quotation(quotationAddress);
        q1.changeQuotationDataAddress(_add);
    }
    function changePoolAddress(address _add) onlyInternal
    {
        poolAddress = _add;
         q1=quotation(quotationAddress);
        q1.changePoolAddress(_add);
    }


    function getUserQuoteLength()constant returns (uint length){
         qd1 = quotationData(quotationDataAddress);
        return (qd1.getUserQuoteLength(msg.sender));
    }
    function getUserCoverLength()constant returns (uint length){
         qd1 = quotationData(quotationDataAddress);
        return (qd1.getUserCoverLength(msg.sender));
    }
    function getQuoteByIndex1(uint index) constant returns(uint productId,uint quoteId,bytes16 lat , bytes16 long ,bytes16 currencyCode,uint sumAssured)
    {
         qd1 = quotationData(quotationDataAddress);
        (productId,quoteId,lat,long,currencyCode,sumAssured) = qd1.getQuoteByIndex1(index);
    }
    function getQuoteByIndex2(uint index) constant returns(uint coverPeriod,uint premiumCalculated,uint dateAdd,uint validUntil,bytes16 status,uint amountFunded,uint coverId)
    {
         qd1 = quotationData(quotationDataAddress);
        (coverPeriod,premiumCalculated,dateAdd,validUntil,status,amountFunded,coverId) = qd1.getQuoteByIndex2(index);
    }




    function getQuoteByAddressAndIndex2(uint ind) constant returns(uint coverPeriod,uint premiumCalculated,uint dateAdd,uint validUntil,bytes16 status,uint amountFunded,uint coverId)
    {
         qd1 = quotationData(quotationDataAddress);
        uint index=qd1.getQuoteByAddressAndIndex(ind , msg.sender);
        (coverPeriod,premiumCalculated,dateAdd,validUntil,status,amountFunded,coverId) = qd1.getQuoteByIndex2(index);
    }


    function getQuoteByAddressAndIndex1(uint ind) constant returns(uint productId,uint quoteId,bytes16 lat , bytes16 long ,bytes16 currencyCode,uint sumAssured)
    {
         qd1 = quotationData(quotationDataAddress);
        uint index=qd1.getQuoteByAddressAndIndex(ind , msg.sender);
       (productId,quoteId,lat,long,currencyCode,sumAssured) = qd1.getQuoteByIndex1(index);
    }
    
    function getCoverByIndex(uint index) constant returns(uint quoteId,uint validUntil,uint claimCount,uint lockedTokens,bytes16 status)
    {
         qd1 = quotationData(quotationDataAddress);
       (quoteId,validUntil,claimCount,lockedTokens,status) = qd1.getCoverByIndex(index);
    }
    
    function getCoverByAddressAndIndex(uint ind) constant returns(uint coverId,uint quoteId,uint validUntil,uint claimCount,uint lockedTokens,bytes16 status)
    {
         qd1 = quotationData(quotationDataAddress);
        coverId=qd1.getCoverIdByAddressAndIndex(ind , msg.sender);
        (quoteId,validUntil,claimCount,lockedTokens,status) = qd1.getCoverByIndex(coverId);
    }
    
    function getCoverIdByAddressAndIndex(uint ind) constant returns(uint coverId)
    {
         qd1 = quotationData(quotationDataAddress);
        coverId = qd1.getCoverIdByAddressAndIndex(ind , msg.sender);
    }
    function changeQuoteExpireTime(uint time) onlyOwner
    {
         qd1 = quotationData(quotationDataAddress);
         p1=pool(poolAddress);
        qd1.changeQuoteExpireTime(time);
        uint time1=time;
        uint quoteLength = qd1.getQuoteLength();
        for(uint i=qd1.pendingQuoteStart();i<quoteLength;i++)
        {
            if(qd1.getQuotationDateAdd(i) +time1 <now)
            {
                 q1=quotation(quotationAddress);
                q1.expireQuotation(i);
            }
            else{
                uint timeLeft = qd1.getQuotationDateAdd(i) + qd1.getQuoteExpireTime() -now;
                p1.closeQuotationOraclise(i , timeLeft);
            }
        }
    }
   
    
    function changePendingQuoteStart()
    {
         qd1 = quotationData(quotationDataAddress);
        uint currPendingQStart = qd1.pendingQuoteStart();
        uint quotelen = qd1.getQuoteLength();
        for(uint i=currPendingQStart ; i < quotelen ; i++)
        {
            bytes16 stat = qd1.getQuotationStatus(i);
            if(stat != "NEW" && stat!="partiallyFunded")
                currPendingQStart++;
            else
                break;
        }
        qd1.updatePendingQuoteStart(currPendingQStart);
    }
    function checkQuoteExpired(uint id) constant returns (uint expire)
    {
         qd1 = quotationData(quotationDataAddress);
        
        if(qd1.getQuotationDateAdd(id)+qd1.getQuoteExpireTime() < now)
            expire=1;
        else
            expire=0;
    }
    function expireCover(uint coverid) onlyInternal
    {
        qd1 = quotationData(quotationDataAddress);
        t2 = NXMToken2(token2Address);
        if( checkCoverExpired(coverid) == 1 && qd1.getCoverStatus(coverid)!="Cover Expired")
        {
            qd1.changeCoverStatus(coverid , "Cover Expired");
            t1=NXMToken(tokenAddress);
            t1.unlockCN(coverid);
            uint qid = qd1.getQuoteId(coverid);
            changeCSAAfterPayoutOrExpire(qid);
            bytes16 curr = qd1.getQuotationCurrency(qid);
            qd1.subFromTotalSumAssured(curr,qd1.getQuotationSumAssured(qid));
            
        }
        
    }
    function calPremium(uint sumAssured , uint CP ,uint risk )  constant returns(uint premium) 
    {
        qd1 = quotationData(quotationDataAddress);
        uint minDays = qd1.getMinDays();
        uint PM = qd1.getPM();
        uint STL = qd1.getSTL();
        uint STLP = qd1.getSTLP();
        uint a=CP-minDays;
        if(STLP<a)
            a=STLP;
        a=a*a;
        
        uint d=(CP-minDays)*1000;

        uint i1=sumAssured;
        uint k=36525;
        uint res=((a*STL/STLP)+d);
        uint result=res*risk*PM*i1/k;
        result = result/1000;
        premium=result*1000000000000000;
    }

    function getCoverAndQuoteDetails(uint coverId) constant returns(uint claimCount , uint lockedTokens, uint validity ,bytes16 lat , bytes16 long , bytes16 curr , uint sum)
    {
        qd1 = quotationData(quotationDataAddress);
        uint qId = qd1.getCoverQuoteid(coverId);
        claimCount = qd1.getCoverClaimCount(coverId);
        lockedTokens = qd1.getCoverLockedTokens(coverId);
        validity = qd1.getCoverValidity(coverId);
        lat = qd1.getLatitude(qId);
        long = qd1.getLongitude(qId);
        sum = qd1.getQuotationSumAssured(qId);
        curr = qd1.getQuotationCurrency(qId);
        
    }

    function checkCoverExpired(uint coverid) constant returns (uint expire)
    {
         qd1 = quotationData(quotationDataAddress);
       
        if(qd1.getCoverValidity(coverid) < now)
            expire=1;
        else
            expire=0;
    }
    function removeSAFromAreaCSA(uint id , uint amount)
    {
        ms1=master(masterAddress);
        if(!(ms1.isOwner(msg.sender)==1 || ms1.isInternal(msg.sender) ==1)) throw;
         qd1 = quotationData(quotationDataAddress);
        uint len = qd1.getQuotationAreaLength(id);
        bytes16 quoteCurr =  qd1.getQuotationCurrency(id);
        for(uint i=0;i<len ;i++)
        {
            uint32 index = qd1.getQuotationAreaByIndex(id,i);
            qd1.removeCSAFromArea(index,quoteCurr,amount);
        }
    }

    
    function changeCSAAfterPayoutOrExpire(uint qid)
    {
        ms1=master(masterAddress);
        if(!(ms1.isOwner(msg.sender)==1 || ms1.isInternal(msg.sender) ==1)) throw;
        qd1 = quotationData(quotationDataAddress);
        removeSAFromAreaCSA(qid,qd1.getQuotationSumAssured(qid));
    }    

    function addQuote(uint[] arr1 , bytes16[] arr2 ,uint32[] area ,int[] latlong) {
        qd1 = quotationData(quotationDataAddress);
        m1=MCR(mcrAddress);
        if(m1.checkForMinMCR() == 1) throw;
        uint j=0;
        uint p=0;
        uint areaIndex=0;
        uint32[] individualArea;
        uint time1 = qd1.getQuoteExpireTime();
        p1=pool(poolAddress);
        for(uint i=0;i<arr1.length;i+=3)
        {
            uint k1=area[areaIndex];
            
            areaIndex += 1;
            uint currentQuoteLen = qd1.getQuoteLength();
            qd1.addQuote();
            qd1.updateQuote1(arr1[i+0],currentQuoteLen,msg.sender,arr2[j]);
            qd1.updateQuote2(arr1[i+2],0,now,now+time1,"NEW",currentQuoteLen);
            qd1.updateQuote3(currentQuoteLen,0,0,individualArea);
            qd1.updateQuote4(currentQuoteLen,arr2[j+1],arr2[j+2]);
            qd1.changeTotalSumAssured(currentQuoteLen,arr1[i+1]);
            p1.callQuotationOracalise(arr2[j+1],arr2[j+2],currentQuoteLen);
            qd1.addUserQuote(currentQuoteLen,msg.sender);
            p1.closeQuotationOraclise(currentQuoteLen , time1);
            
            while(k1 > 0)
            {
                qd1.addAreaInQuotation(currentQuoteLen,area[areaIndex]);
                qd1.addCSAFromArea(area[areaIndex],arr2[j+0],arr1[i+1]);
                areaIndex++;
                k1--;
            }
            j =j+3;
            p =p+4;
        }
    }

    // function strConcat(string _a, string _b, string _c, string _d, string _e) internal returns (string)
    // {
    // bytes memory _ba = bytes(_a);
    // bytes memory _bb = bytes(_b);
    // bytes memory _bc = bytes(_c);
    // bytes memory _bd = bytes(_d);
    // bytes memory _be = bytes(_e);
    // string memory abcde = new string(_ba.length + _bb.length + _bc.length + _bd.length + _be.length);
    // bytes memory babcde = bytes(abcde);
    // uint k = 0;
    // for (uint i = 0; i < _ba.length; i++) babcde[k++] = _ba[i];
    // for (i = 0; i < _bb.length; i++) babcde[k++] = _bb[i];
    // for (i = 0; i < _bc.length; i++) babcde[k++] = _bc[i];
    // for (i = 0; i < _bd.length; i++) babcde[k++] = _bd[i];
    // for (i = 0; i < _be.length; i++) babcde[k++] = _be[i];
    // return string(babcde);
    // }

    // function callQuoteOraclize(bytes16 lat , bytes16 long , uint quoteid) constant returns(string res)
    // {
    //    return strConcat("http://43.242.214.177/nexusmutual-api/api/pricing/getEarthquakeRisk/",bytes16ToString(lat),"/",bytes16ToString(long),"");
    // }

    
}