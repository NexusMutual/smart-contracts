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

// This contract is now deprecated, merged with quotation2
// due to increase in gas limits

pragma solidity ^0.4.8;

import "./NXMToken.sol";
import "./pool.sol";
import "./quotationData.sol";
import "./quotation2.sol";
import "./NXMToken2.sol";
import "./MCR.sol";
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
    MCR m1;
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
    function changeMCRAddress(address _add) onlyInternal
    {
        mcrAddress = _add;
        m1=MCR(mcrAddress);
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


    /// @dev Get the total number of Quotes
    /// @return Number of the quotes created till date
    function getQuoteLength() constant returns(uint len)
    {
        qd1 = quotationData(quotationDataAddress);
        len = qd1.getQuoteLength();
    }

    /// @dev Gets the total number of Covers created till date. 
    /// @return Number of the covers created till date
    function getCoverLength() constant returns(uint len)
    {
        qd1 = quotationData(quotationDataAddress);
        len = qd1.getCoverLength();
    }

    /// @dev Expires a quotation after a set period of time. Changes the status of the Quotation.
    /// @dev Removes the Sum Assured of the quotation from the Area Cover Sum Assured.
    /// @dev Creates the cover of the quotation if amount has been funded to it.
    /// @param id Quotation Id
     function expireQuotation(uint id) 
    {
         qd1 = quotationData(quotationDataAddress);
         q2=quotation2(quotation2Address);
      if(qd1.getQuotationStatus(id) != "coverGenerated")
      {   
            if(q2.checkQuoteExpired(id)==1 && qd1.getQuotationStatus(id) != "Expired")
            {
                if(qd1.getQuotationAmountFunded(id)==0)
                {
                    qd1.changeQuotationStatus(id,"Expired");
                    q2.removeSAFromAreaCSA(id,qd1.getQuotationSumAssured(id));
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
                    q2.removeSAFromAreaCSA(id,diffInSA);
                
                    makeCover(id,qd1.getQuoteMemberAddress(id));
                }
                q2.changePendingQuoteStart();

            }
      }  
    }
    
    /// @dev Create cover of the quotation, change the status of the quotation, update the total sum assured and lock the tokens of the cover of a quote.
    /// @param quoteId Quotation Id
    /// @param from Quote member Ethereum address
    function makeCover(uint quoteId , address from) internal 
    {
        qd1 = quotationData(quotationDataAddress);
        if(qd1.getQuotationStatus(quoteId) != "coverGenerated")
      {   
            p1=pool(poolAddress);
            qd1.changeQuotationStatus(quoteId,"coverGenerated");
            uint claimCount=0;
            bytes16 curr = qd1.getQuotationCurrency(quoteId);
            uint SA = qd1.getQuotationSumAssured(quoteId);
            qd1.addInTotalSumAssured(curr,SA);
            uint CP = qd1.getCoverPeriod(quoteId);
            uint timeinseconds=CP * 1 days;
            uint validUntill = now + timeinseconds;
            uint lockedToken=0;
            uint id=qd1.getCoverLength();
            qd1.addCover(quoteId,id,validUntill,claimCount,lockedToken,"active");
            p1.closeCoverOraclise(id,timeinseconds);
            qd1.addCoveridInQuote(quoteId,id);
            qd1.addUserCover(id,from);
            uint prem = qd1.getPremiumCalculated(quoteId)/10000000000;    
            t1=NXMToken(tokenAddress);
            t2=NXMToken2(token2Address);
            lockedToken = t2.lockCN(prem,curr,CP,id,from);
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
         q2=quotation2(quotation2Address);
        uint result = q2.calPremium(qd1.getQuotationSumAssured(id) , qd1.getCoverPeriod(id) , num);
        qd1.changePremiumCalculated(id,result);
    }

    /// @dev Funds the Quotations using NXM tokens.
    /// @param tokens Token Amount.
    /// @param fundAmt fund amounts for each selected quotation.
    /// @param quoteId multiple quotations ID that will get funded.
    function fundQuoteUsingNXMTokens(uint tokens , uint[] fundAmt , uint[] quoteId)
    {
        qd1 = quotationData(quotationDataAddress);
        t1=NXMToken(tokenAddress);
        t1.burnTokenForFunding(tokens,msg.sender);
        fundQuote(fundAmt,quoteId,msg.sender);
    }

    /// @dev Funds the Quotations.
    /// @param fundAmt fund amounts for each selected quotation.
    /// @param quoteId multiple quotations ID that will get funded.
    /// @param from address of funder.
    function fundQuote(uint[] fundAmt , uint[] quoteId ,address from) {
        
        qd1 = quotationData(quotationDataAddress);
        if(qd1.getQuoteMemberAddress(quoteId[0]) != from ) throw;
        for(uint i=0;i<fundAmt.length;i++)
        {
            uint256 amount=fundAmt[i];
            qd1.changeAmountFunded(quoteId[i],qd1.getQuotationAmountFunded(quoteId[i])+amount);
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
}