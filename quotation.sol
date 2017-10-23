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
contract quotation {
    
    address owner;
    address tokenAddress;
    address poolAddress;
    address quotationDataAddress;
    address token2Address;
    address mcrAddress;
    address quotation2Address;
    master ms1;
    address masterAddress;
    MCR md1;
    NXMToken2 t2;
    NXMToken t1;
    pool p1;
    quotationData qd1;
    quotation2 q2;

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
    function changeMCRAddress(address _add) onlyInternal
    {
        mcrAddress = _add;
        md1=MCR(mcrAddress);
    }
    function changeQuotation2Address(address _a) onlyInternal
    {
        quotation2Address=_a;
    }
    function changeToken2Address(address _add) onlyInternal
    {
        token2Address = _add;
        t2=NXMToken2(token2Address);
    }
    function changeQuotationDataAddress(address _add) onlyInternal
    {
        quotationDataAddress = _add;
        qd1 = quotationData(quotationDataAddress);
    }

    function changePoolAddress(address _to) onlyInternal
    {
        poolAddress = _to;
    }

    /// @dev Gets the number of the Quotations created by the address calling the function
    /// @return Number of the quotations created by the user till date
    function getUserQuoteLength()constant returns (uint length){
         qd1 = quotationData(quotationDataAddress);
        return (qd1.getUserQuoteLength(msg.sender));
    }

    /// @dev Gets the number of the Covers created by the address calling the function
    /// @return Number of the covers created by the user till date
    function getUserCoverLength()constant returns (uint length){
         qd1 = quotationData(quotationDataAddress);
        return (qd1.getUserCoverLength(msg.sender));
    }

    /// @dev Provides the information of a Quotation of a given quote id.
    /// @param index Quotation Id
    /// @param productId Insurance Product Id.
    /// @param quoteId Quotation Id.
    /// @param lat Latitude position of quotation
    /// @param long Longitude position of quotation
    /// @param currencyCode Currency in which sum is assured
    /// @param sumAssured Sum assurance of quotation.
    function getQuoteByIndex1(uint index) constant returns(uint productId,uint quoteId,bytes16 lat , bytes16 long ,bytes16 currencyCode,uint sumAssured)
    {
         qd1 = quotationData(quotationDataAddress);
        (productId,quoteId,lat,long,currencyCode,sumAssured) = qd1.getQuoteByIndex1(index);
    }

    
    /// @dev Provides the information of a Quotation of a given quote id.
    /// @param index Quotation Id.
    /// @return coverPeriod Cover Period of a quotation in days.
    /// @return premiumCalculated Premium of quotation.
    /// @return dateAdd timestamp at which quotation is created.
    /// @return status current status of Quotation.
    /// @return amountFunded Amount funded to the quotation.
    /// @return coverId cover id associated with the quoation.
    function getQuoteByIndex2(uint index) constant returns(uint coverPeriod,uint premiumCalculated,uint dateAdd,uint validUntil,bytes16 status,uint amountFunded,uint coverId)
    {
         qd1 = quotationData(quotationDataAddress);
        (coverPeriod,premiumCalculated,dateAdd,validUntil,status,amountFunded,coverId) = qd1.getQuoteByIndex2(index);
    }

    /// @dev Provides the information of the quote id, mapped against the user  calling the function, at the given index
    /// @param ind User's Quotation Index.
    /// @return coverPeriod Cover Period of quotation in days.
    /// @return premiumCalculated Premium of quotation.
    /// @return dateAdd timestamp at which quotation is created.
    /// @return status current status of Quotation.
    /// @return amountFunded number of tokens funded to the quotation.
    /// @return coverId cover of a quoation
    function getQuoteByAddressAndIndex2(uint ind) constant returns(uint coverPeriod,uint premiumCalculated,uint dateAdd,uint validUntil,bytes16 status,uint amountFunded,uint coverId)
    {
         qd1 = quotationData(quotationDataAddress);
        uint index=qd1.getQuoteByAddressAndIndex(ind , msg.sender);
        (coverPeriod,premiumCalculated,dateAdd,validUntil,status,amountFunded,coverId) = qd1.getQuoteByIndex2(index);
    }

    /// @dev Provides the information of the quote id, mapped against the user calling the function, at the given index
    /// @param ind User's Quotation Index.
    /// @param productId Insurance Product id.
    /// @param quoteId Quotation Id.
    /// @param lat Latitude position of quotation
    /// @param long Longitude position of quotation
    /// @param currencyCode Currency in which sum is assured
    /// @param sumAssured Sum assurance of quotation.
    function getQuoteByAddressAndIndex1(uint ind) constant returns(uint productId,uint quoteId,bytes16 lat , bytes16 long ,bytes16 currencyCode,uint sumAssured)
    {
         qd1 = quotationData(quotationDataAddress);
        uint index=qd1.getQuoteByAddressAndIndex(ind , msg.sender);
       (productId,quoteId,lat,long,currencyCode,sumAssured) = qd1.getQuoteByIndex1(index);
    }
    
     /// @dev Provides the information of a Cover when given the cover id.
    /// @param index Cover Id
    /// @return quoteId Quotation id against which the cover was generated.
    /// @return validUntil validity timestamp of cover.
    /// @return claimCount Number of claims submitted against a cover.
    /// @return lockedTokens Number of tokens locked against a cover.
    /// @return status Current status of cover. 
    function getCoverByIndex(uint index) constant returns(uint quoteId,uint validUntil,uint claimCount,uint lockedTokens,bytes16 status)
    {
         qd1 = quotationData(quotationDataAddress);
       (quoteId,validUntil,claimCount,lockedTokens,status) = qd1.getCoverByIndex(index);
    }
    
    /// @dev Provides the information of the cover id, mapped against the user  calling the function, at the given index
    /// @param ind User's Cover Id
    /// @return quoteId  Quotation id against which the cover was generated.
    /// @return validUntil validity timestamp of cover.
    /// @return claimCount Number of claims submitted against a cover.
    /// @return lockedTokens Number of tokens locked against a cover.
    /// @return status Current status of cover. 
    function getCoverByAddressAndIndex(uint ind) constant returns(uint coverId,uint quoteId,uint validUntil,uint claimCount,uint lockedTokens,bytes16 status)
    {
         qd1 = quotationData(quotationDataAddress);
        coverId=qd1.getCoverIdByAddressAndIndex(ind , msg.sender);
        (quoteId,validUntil,claimCount,lockedTokens,status) = qd1.getCoverByIndex(coverId);
    }
    /// @dev Gets cover id mapped against the user calling the function, at the given index
    /// @param ind User's Cover Index.
    /// @return coverId cover id.
    function getCoverIdByAddressAndIndex(uint ind) constant returns(uint coverId)
    {
         qd1 = quotationData(quotationDataAddress);
        coverId = qd1.getCoverIdByAddressAndIndex(ind , msg.sender);
    }

    /// @dev Changes the time (in seconds) after which a quote expires.
    /// @param time new Expiration time (in seconds)
    function changeQuoteExpireTime(uint time) onlyOwner
    {
         qd1 = quotationData(quotationDataAddress);
         p1=pool(poolAddress);
        qd1.changeQuoteExpireTime(time);
        uint time1=time;
        uint quoteLength = qd1.getQuoteLength();
        for(uint i=qd1.pendingQuoteStart();i<quoteLength;i++)
        {
            //Expire a quote, in case quote creation date+new expiry time<current timestamp
            if(qd1.getQuotationDateAdd(i) +time1 <now)
            {
                expireQuotation(i);
            }
            //Creates an oraclize call to expire the quote as per the new expiry time
            else
            {
                uint timeLeft = qd1.getQuotationDateAdd(i) + qd1.getQuoteExpireTime() -now;
                p1.closeQuotationOraclise(i , timeLeft);
            }
        }
    }
   
     /// @dev Updates the pending quotation start variable, which is the lowest quotation id with "NEW" or "partiallyFunded" status.
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

    /// @dev Checks if a quotation should get expired or not.
    /// @param id Quotation Index.
    /// @return expire 1 if the Quotation's should be expired, 0 otherwise.
    function checkQuoteExpired(uint id) constant returns (uint expire)
    {
        qd1 = quotationData(quotationDataAddress);
        if(qd1.getQuotationDateAdd(id)+qd1.getQuoteExpireTime() < now)
            expire=1;
        else
            expire=0;
    }


    /// @dev Expires a cover after a set period of time. 
    /// @dev Changes the status of the Cover and reduces the current sum assured of all areas in which the quotation lies
    /// @dev Unlocks the CN tokens of the cover. Updates the Total Sum Assured value.
    /// @param coverid Cover Id.
    function expireCover(uint coverid) onlyInternal
    {
        qd1 = quotationData(quotationDataAddress);
        t2 = NXMToken2(token2Address);
        if(checkCoverExpired(coverid) == 1 && qd1.getCoverStatus(coverid)!="Cover Expired")
        {
            qd1.changeCoverStatus(coverid , "Cover Expired");
            t1=NXMToken(tokenAddress);
            t1.unlockCN(coverid);
            uint qid = qd1.getCoverQuoteid(coverid);
            changeCSAAfterPayoutOrExpire(qid);
            bytes16 curr = qd1.getQuotationCurrency(qid);
            qd1.subFromTotalSumAssured(curr,qd1.getQuotationSumAssured(qid));
        }
        
    }

    /// @dev Calculates the Premium.
    /// @param sumAssured Quotation's Sum Assured
    /// @param CP Quotation's Cover Period 
    /// @param risk Risk Cost fetched from the external oracle
    /// @return premium Premium Calculated for a quote
    function calPremium(uint sumAssured , uint CP ,uint risk )  internal constant returns(uint premium)
    {
        qd1 = quotationData(quotationDataAddress);
        uint minDays;uint PM; uint STL; uint STLP;
        (minDays,PM,STL,STLP)=qd1.getPremiumDetails();
        // uint minDays = qd1.getMinDays();
        // uint PM = qd1.getPM();   //Profit Margin
        // uint STL = qd1.getSTL(); // Short Term Load
        // uint STLP = qd1.getSTLP(); // Short Term Load period
        uint a=CP-minDays; 
        if(STLP<a)
            a=STLP;
        a=a*a;
        
        //uint d=(CP-minDays)*1000;
        uint d=a*1000;
        //uint i1=sumAssured;
        uint k=36525;
        uint res=((a*STL/STLP)+d);
        uint result=res*risk*PM*sumAssured/k;
        result = result/1000;
        premium=result*1000000000000000;
    }


    /// @dev Provides the information of Quotation and Cover for a  given Cover Id.
    /// @param coverId Cover Id.
    /// @return claimCount number of claims submitted against a given cover.
    /// @return lockedTokens number of tokens locked against a cover.
    /// @return validity timestamp till which cover is valid.
    /// @return lat Latitude of quotation
    /// @return long Longitude of quotation
    /// @return curr Currency in which quotation is assured.
    /// @return sum Sum Assured of quotation.
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

    /// @dev Checks if a cover should get expired/closed or not.
    /// @param coverid Cover Index.
    /// @return expire 1 if the Cover's time has expired, 0 otherwise.
    function checkCoverExpired(uint coverid) internal constant returns (uint expire)
    {
         qd1 = quotationData(quotationDataAddress);
       
        if(qd1.getCoverValidity(coverid) < now)
            expire=1;
        else
            expire=0;
    }

    /// @dev Updates the Sum Assured Amount of all the Areas in which a quotation lies.
    /// @param id Quotation id
    /// @param amount that will get subtracted from all the Areas' Current Sum Assured Amount that comes under a quotation.
    function removeSAFromAreaCSA(uint id , uint amount) internal
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

    
    /// @dev Decreases the current sum assured of the areas in which the quotation lies.
    /// @param qid Quotation Id
    function changeCSAAfterPayoutOrExpire(uint qid)
    {
        ms1=master(masterAddress);
        if(!(ms1.isOwner(msg.sender)==1 || ms1.isInternal(msg.sender) ==1)) throw;
        qd1 = quotationData(quotationDataAddress);
        removeSAFromAreaCSA(qid,qd1.getQuotationSumAssured(qid));
    }    


    /*** function from quotation2.sol ***/
      function expireQuotation(uint id) 
    {
         qd1 = quotationData(quotationDataAddress);
         if(qd1.getQuotationStatus(id) != "coverGenerated")
        {   
            if(checkQuoteExpired(id)==1 && qd1.getQuotationStatus(id) != "Expired")
            {
                if(qd1.getQuotationAmountFunded(id)==0)
                {
                    qd1.changeQuotationStatus(id,"Expired");
                    removeSAFromAreaCSA(id,qd1.getQuotationSumAssured(id));
                }
                else 
                {
                    uint amountfunded = qd1.getQuotationAmountFunded(id);
                    uint perc = (amountfunded* 100)/(qd1.getPremiumCalculated(id));
                    qd1.changePremiumCalculated(id,amountfunded);
                    uint prevSA = qd1.getQuotationSumAssured(id);
                    uint newSA = (perc * prevSA)/100;
                    qd1.changeSumAssured(id,newSA);
                    uint diffInSA = prevSA - newSA;
                    removeSAFromAreaCSA(id,diffInSA);
                
                    makeCover(id,qd1.getQuoteMemberAddress(id));
                }
                changePendingQuoteStart();
            }
        }  
    }
    
    /// @dev Create cover of the quotation, change the status of the quotation ,update the total sum assured and lock the tokens of the cover of a quote.
    /// @param quoteId Quotation Id
    /// @param from Quote member Ethereum address
    function makeCover(uint quoteId , address from) internal 
    {
        qd1 = quotationData(quotationDataAddress);
        if(qd1.getQuotationStatus(quoteId) != "coverGenerated")
        {   
            p1=pool(poolAddress);
            qd1.changeQuotationStatus(quoteId,"coverGenerated");
            bytes16 curr;
            uint SA;
            uint CP;
            uint prem;
            (curr,SA,CP,prem)=qd1.getQuoteByIndex3(quoteId);
            uint premium=prem/10000000000;
            qd1.addInTotalSumAssured(curr,SA);
            uint timeinseconds=CP * 1 days;
            uint validUntill = now + timeinseconds;
            uint lockedToken=0;
            uint id=qd1.getCoverLength();
            qd1.addCover(quoteId,id,validUntill,from);
            // if cover period of quote is less than 60 days.
            if(CP<=60)
            {
                p1.closeCoverOraclise(id,timeinseconds);
            }
            t2=NXMToken2(token2Address);
            lockedToken = t2.lockCN(premium,curr,CP,id,from);
            qd1.changeLockedTokens(id,lockedToken);
      
        }  
    }

    /// @dev Gets the Current Sum Assured Amount of a given Area.
    /// @param index1 Area Id.
    /// @param curr Currency Name.
    /// @return CSA Current Sum Assured Amount of area
    function getCSA(uint32 index1 , bytes16 curr) constant returns(uint32 index , bytes16 currency , uint CSA)
    {
        qd1 = quotationData(quotationDataAddress);
        return(index1,curr,qd1.getCSA(index1,curr));
    }
    
    /// @dev Calculates and Changes the premium of a given quotation
    /// @param id Quotation Id
    /// @param riskstr Risk cost fetched from the external oracle
      function changePremium(uint id , string riskstr) onlyInternal
    {
        qd1 = quotationData(quotationDataAddress);
        uint num=0;
        bytes memory ab = bytes(riskstr);
        for(uint i=0;i<ab.length;i++)
        {
            if(ab[i]=="0")
                num=num*10 + 0;
            else if(ab[i]=="1")
                num=num*10 + 1;
            else if(ab[i]=="2")
                num=num*10 + 2;
            else if(ab[i]=="3")
                num=num*10 + 3;
            else if(ab[i]=="4")
                num=num*10 + 4;
            else if(ab[i]=="5")
                num=num*10 + 5;
            else if(ab[i]=="6")
                num=num*10 + 6;
            else if(ab[i]=="7")
                num=num*10 + 7;
            else if(ab[i]=="8")
                num=num*10 + 8;
            else if(ab[i]=="9")
                num=num*10 + 9;
            else if(ab[i]==".")
                break;
            
        }
        uint result =calPremium(qd1.getQuotationSumAssured(id) , qd1.getCoverPeriod(id) , num);
        qd1.changePremiumCalculated(id,result);
    }

    /// @dev Funds the Quotations using NXM tokens.
    /// @param tokens Token Amount.
    /// @param fundAmt fund amounts for each selected quotation.
    /// @param quoteId multiple quotations ID that will get funded.
    function fundQuoteUsingNXMTokens(uint tokens , uint[] fundAmt , uint[] quoteId)
    {
        t1=NXMToken(tokenAddress);
        t1.burnTokenForFunding(tokens,msg.sender);
        fundQuote(fundAmt,quoteId,msg.sender);
    }

    /// @dev Funds the Quotations.
    /// @param fundAmt fund amounts for each selected quotation.
    /// @param quoteId multiple quotations ID that will get funded.
    /// @param from address of funder.
    function fundQuote(uint[] fundAmt , uint[] quoteId ,address from) onlyInternal{
        
        qd1 = quotationData(quotationDataAddress);
        if(qd1.getQuoteMemberAddress(quoteId[0]) != from ) throw;
        for(uint i=0;i<fundAmt.length;i++)
        {
            //uint256 amount=fundAmt[i];
            qd1.changeAmountFunded(quoteId[i],qd1.getQuotationAmountFunded(quoteId[i])+fundAmt[i]);
            if(qd1.getPremiumCalculated(quoteId[i]) > qd1.getQuotationAmountFunded(quoteId[i]))
            {
                qd1.changeQuotationStatus(quoteId[i],"patiallyFunded");
            }
            else if(qd1.getPremiumCalculated(quoteId[i]) <= qd1.getQuotationAmountFunded(quoteId[i]))
            {
                makeCover(quoteId[i] , from);
            }
            
        }
    }

    /// @dev Checks whether a given quotation is funded or not.
    /// @return result 1 if quotation is funded, else 0.
    function isQuoteFunded(uint quoteid) constant returns (uint result)
    {
        qd1 = quotationData(quotationDataAddress);
        if( qd1.getQuotationAmountFunded(quoteid)<qd1.getPremiumCalculated(quoteid)) result=0;
        else result=1;
    }
       /// @dev Gets the Total Sum Assurance of a given currency
    /// @param curr Currency Name
    /// @return totalSum Total Sum Assurance
    function getTotalSumAssured(bytes16 curr) constant returns (uint totalSum)
    {
        qd1 = quotationData(quotationDataAddress);
        totalSum = qd1.getTotalSumAssured(curr); 
    }

    /// @dev Gets the Cover Period  when given the Quotation Id.
    /// @param quoteid Quotation Id.
    /// @return result Cover Period Time(in days)
    function getCoverPeriod(uint quoteid) constant returns (uint result)
    {
        qd1 = quotationData(quotationDataAddress);
        result=qd1.getCoverPeriod(quoteid);
    }


    /// @dev Gets the Sum Assured amount of quotation when given the cover id.
    /// @param coverid Cover Id.
    /// @return result Sum Assured amount.
    function getSumAssured(uint coverid) constant returns (uint result)
    {
        qd1 = quotationData(quotationDataAddress);
        uint quoteId = qd1.getCoverQuoteid(coverid);
        result=qd1.getQuotationSumAssured(quoteId);
    }

    
    /// @dev Gets the Address of Owner of a given Cover.
    /// @param coverid Cover Id.
    /// @return result Owner's address.
    function getMemberAddress(uint coverid) onlyInternal constant returns (address result) 
    {
        qd1 = quotationData(quotationDataAddress);
        uint quoteId = qd1.getCoverQuoteid(coverid);
        result=qd1.getQuoteMemberAddress(quoteId);
    }


    /// @dev Gets the Premium of a Quotation
    /// @param quoteid Quote Id.
    /// @return result Premium Amount.
    function getPremiumCalculated(uint quoteid) onlyInternal constant returns (uint result)
    {
        qd1 = quotationData(quotationDataAddress);
        result=qd1.getPremiumCalculated(quoteid);
    }

    /// @dev Gets the Cover Id when given the quote id.
    /// @param quoteid Quote Id.
    /// @return result Cover Id.
    function getCoverId(uint quoteid) onlyInternal constant returns (uint result)
    {
        qd1 = quotationData(quotationDataAddress);
        result=qd1.getQuoteCoverid(quoteid);
    }

    function changeTokenAddress(address newAddress) onlyInternal 
    {
        qd1 = quotationData(quotationDataAddress);
        tokenAddress = newAddress;
    }

    /// @dev Gets the Currency Name in which a given quotation is assured.
    /// @param quoteId Quotation Id.
    /// @return curr Name of the Currency.
    function getCurrencyOfQuote(uint quoteId) onlyInternal constant returns(bytes16 curr)
    {
        qd1 = quotationData(quotationDataAddress);
        curr = qd1.getQuotationCurrency(quoteId);
    }
    
    /// @dev Gets the Name of Quotation's Currency in which a given quotation is assured when given the cover id.
    /// @param coverid Cover Id.
    /// @return curr Name of the Currency of Quotation.
    function getCurrencyOfCover(uint coverid) onlyInternal constant returns(bytes16 curr)
    {
        qd1 = quotationData(quotationDataAddress);
        uint quoteId = qd1.getCoverQuoteid(coverid);
        curr = qd1.getQuotationCurrency(quoteId);
    }

    /// @dev Gets the Quotation Id when given the cover id.
    /// @param coverId Cover Id.
    /// @return quoteId  Quotation Id.
    function getQuoteId(uint coverId) onlyInternal constant returns (uint quoteId)
    {
        qd1 = quotationData(quotationDataAddress);
        quoteId = qd1.getCoverQuoteid(coverId);
    }

    /// @dev Gets the number of tokens locked against a given quotation
    /// @param coverId Quotation Id.
    /// @return lockedTokens number of Locked tokens.
    function getLockedTokens(uint coverId) onlyInternal constant returns (uint lockedTokens)
    {
        qd1 = quotationData(quotationDataAddress);
        lockedTokens = qd1.getCoverLockedTokens(coverId);
    }
        
    /// @dev Updates the status and claim's count by 1 of an existing cover.
    /// @param coverId Cover Id.
    /// @param newstatus New status name.
    function updateCoverStatusAndCount(uint coverId,bytes16 newstatus) onlyInternal
    {
        qd1 = quotationData(quotationDataAddress);
        qd1.changeCoverStatus(coverId,newstatus);
        uint cc = qd1.getCoverClaimCount(coverId);
        qd1.changeClaimCount(coverId,cc+1);
        
    }

    /// @dev Updates the status of an existing cover.
    /// @param coverId Cover Id.
    /// @param newstatus New status name.
    function updateCoverStatus(uint coverId,bytes16 newstatus) onlyInternal
    {
        qd1 = quotationData(quotationDataAddress);
        qd1.changeCoverStatus(coverId,newstatus);
    }

    /// @dev Provides the Cover Details of a given Cover id.
    /// @param coverid Cover Id.
    /// @return cId Cover Id.
    /// @return lat Latitude.
    /// @return long Longitude.
    /// @return coverOwner Address of the owner of the cover.
    /// @return sumAss Amount of the cover. 
    function getCoverDetailsForAB(uint coverid) constant returns (uint cId, bytes16 lat , bytes16 long ,address coverOwner,uint sumAss)
    {   
        qd1 = quotationData(quotationDataAddress);
        cId = coverid;
        uint qid = qd1.getCoverQuoteid(coverid);
        lat = qd1.getLatitude(qid);
        long = qd1.getLongitude(qid);
        coverOwner = qd1.getQuoteMemberAddress(qid);
        sumAss = qd1.getQuotationSumAssured(qid);
    }

    /// @dev Increases Claim's count of a Cover by 1 when a Claim gets submitted against a cover.
    /// @param coverid Cover Id
    function increaseClaimCount(uint coverid) onlyInternal
    {
        qd1 = quotationData(quotationDataAddress);
        uint cc = qd1.getCoverClaimCount(coverid);
        qd1.changeClaimCount(coverid,cc+1);
    }
      /// @dev Get the total number of Quotes
    /// @return Number of the quotes created till date
    function getQuoteLength() constant returns(uint len)
    {
        qd1 = quotationData(quotationDataAddress);
        len = qd1.getQuoteLength();
    }

    /// @dev Get the length of all the Covers 
    /// @return Number of the covers created till date
    function getCoverLength() constant returns(uint len)
    {
        qd1 = quotationData(quotationDataAddress);
        len = qd1.getCoverLength();
    }


    
}