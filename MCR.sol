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
import "./pool.sol";
import "./NXMToken.sol";
import "./fiatFaucet.sol";
import "./MCRData.sol";
import "./master.sol";
import "./NXMToken2.sol";
import "./NXMTokenData.sol";
import "./SafeMaths.sol";
contract MCR
{
    using SafeMaths for uint;
    pool p1;
    NXMToken t1;
    fiatFaucet f1;
    MCRData md1;
    address MCRDataAddress;
    address poolAddress;
    address tokenAddress;
    address fiatFaucetAddress;
    master ms1;
    address masterAddress;
    NXMToken2 t2;
    address token2Address;
    NXMTokenData td1;
    quotationData qd1;
    address quotationDataAddress;
    address tokenDataAddress;
    event apiresult(address indexed sender,string msg);

    
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
    modifier checkPause
    {
        ms1=master(masterAddress);
        require(ms1.isPause()==0);
        _;
    }
    function changeToken2Address(address _add) onlyInternal
    {
        token2Address =_add;
    }
     function changeTokenDataAddress(address _add) onlyInternal
    {
        tokenDataAddress = _add;
        td1=NXMTokenData(tokenDataAddress);
    }
    function changeMCRDataAddress(address _add) onlyInternal
    {
        MCRDataAddress = _add;
        md1 = MCRData(MCRDataAddress);
    }
    function changeQuotationDataAddress(address _add) onlyInternal
    {
        quotationDataAddress=_add;
        qd1=quotationData(quotationDataAddress);

    }
    /// @dev Changes minimum Capital Requirement for system to sustain.
    function changeMinReqMCR(uint32 minMCR) onlyInternal
    {
        md1.changeMinReqMCR(minMCR);
    }
    /// @dev Gets minimum value of Capital Requirement.
    function getminMCRReq()constant returns(uint32 mcrmin)
    {
        md1 = MCRData(MCRDataAddress);
        mcrmin = md1.getMinMCR();
    }
    /// @dev Checks if last notarised Minimum Capital Requirement(MCR) percentage is less than minimum capital required or not.
    /// @return check 1 if last added MCR%<Minimum MCR value
    function checkForMinMCR()constant returns(uint8 check)
    {
        md1 = MCRData(MCRDataAddress);
        check=0;
        if(getlastMCRPerc() < md1.getMinMCR())
            check=1;
    }
     /// @dev Changes time period for obtaining new MCR data from external oracle query.
    function changeMCRTime(uint64 _time) onlyOwner
    {
        md1 = MCRData(MCRDataAddress);
        md1.changeMCRTime(_time);
    }
      /// @dev Stores name of currencies accepted by the system.
      /// @param curr Currency Name.
    function addCurrency(bytes4 curr) checkPause
    {
        ms1=master(masterAddress);
        if( ms1.isInternal(msg.sender) != 1 && ms1.isOwner(msg.sender)!=1) throw;
        md1 = MCRData(MCRDataAddress);
        md1.addCurrency(curr);
        
    }
    /// @dev Gets number of currencies accepted by the system.
    function getCurrenciesLength()constant returns(uint len)
    {
        md1 = MCRData(MCRDataAddress);
        len = md1.getCurrLength();
    }
    /// @dev Gets name of currency at a given index.
    function getCurrency_Index(uint16 index) constant returns(uint16 id ,bytes4 curr)
    {
        md1 = MCRData(MCRDataAddress);
        curr = md1.getCurrency_Index(index);
        id = index;
    }
    /// @dev Gets the 3 day average exchange rate of a currency.
    /// @param curr Currency Name.
    /// @return rate Average exchange rate (of last 3 days) against ETH.
    function getCurrency3DaysAvg(bytes4 curr)constant returns(uint avg)
    {
        md1 = MCRData(MCRDataAddress);
        avg = md1.getCurr3DaysAvg(curr);
    }

    function changePoolAddress(address _add) onlyInternal
    {
        poolAddress = _add;
    }
    /// @dev Changes scaling factor.
    function changeSF(uint32 val) onlyOwner
    {
        md1 = MCRData(MCRDataAddress);
        md1.changeSF(val);
    }
    function changeTokenAddress(address _add) onlyInternal
    {
        tokenAddress = _add;
    }
    function changeFiatFaucetAddress(address _add) onlyInternal
    {
        fiatFaucetAddress = _add;
    }
     /// @dev Changes address which can notise MCR
     function changenotariseAddress(address nadd) onlyOwner
    {
        md1 = MCRData(MCRDataAddress);
        md1.changenotarise(nadd);
    }

    /// @dev Adds new MCR data and calls for Surplus distribution.
    /// @param mcrP  Minimum Capital Requirement in percentage.
    /// @param mcrE  Minimum Capital Requirement in ether.
    /// @param vF Pool fund value in Ether used in the last full daily calculation of the Capital model.
    /// @param curr array of Currency's name.
    /// @param rates array of Currency's rate * 100.
    /// @param onlyDate  Date(yyyymmdd) at which MCR details are getting added.
    function addMCRData(uint32 mcrP , uint mcrE , uint64 vF ,bytes4[] curr ,uint32[] rates , uint64 onlyDate) checkPause
    {

        md1 = MCRData(MCRDataAddress);
        if(md1.isnotarise(msg.sender)==0) throw;
        t1=NXMToken(tokenAddress);
        t2=NXMToken2(token2Address);
        vF = SafeMaths.mul64(vF , 1000000000000000000);
        uint VTP=0;
        uint upperThreshold=0;
        uint lowerThreshold=0;
        uint lower=0;
        uint len = md1.getMCRDataLength();
        if(len>1)
        {
            (VTP, )=calVtpAndMCRtp();
             
            if(VTP>=uint(vF))
            {
                upperThreshold=SafeMaths.div(VTP,(SafeMaths.mul(md1.getMinCap(),1000000000000000000)));
                upperThreshold=SafeMaths.mul(upperThreshold,100);
                
            }
            else
            {
                upperThreshold=SafeMaths.div(vF,(SafeMaths.mul(md1.getMinCap(),1000000000000000000)));
                upperThreshold=SafeMaths.mul(upperThreshold,100);
                
                
            }
            if(VTP>0)
            {
                lower=SafeMaths.div((SafeMaths.mul(getAllSumAssurance(),100)),md1.getShockParameter());
                lower=SafeMaths.mul(lower,1000000000000000000);
            }
            if(lower>0)
            {
                lowerThreshold=SafeMaths.div(VTP,lower);
            }
        }    
        if(len==1 || ((SafeMaths.div(mcrP,100))>=lowerThreshold && (SafeMaths.div(mcrP,100))<=upperThreshold))
        {            
            md1.pushMCRData(mcrP,mcrE,vF,now,block.number);
            for(uint i=0;i<curr.length;i++)
            {
                md1.updateCurrRates(len,curr[i],rates[i]);
            }
          
            changeAvgRateOfCurr();
            // Oraclize call for next MCR calculation
            if(md1.getMCRIndexByDate(onlyDate)==0)
            {
                callOracliseForMCR();
            }
            md1.updateDateWiseMCR(onlyDate,len);
        
        }
        else
        {
            callOracliseForMCRFail(onlyDate);
        }
        // Initiate Surplus Distribution
        // t2.distributeSurplusDistrubution();
        
    }
    
    function addLastMCRData(uint Date) checkPause
    {
        md1 = MCRData(MCRDataAddress);
        uint lastLen=md1.getMCRDataLength();
        uint64 lastdate=md1.getIndexWiseDate(SafeMaths.sub(lastLen,1));
        uint64 failedDate=uint64(Date);
        if(failedDate>=lastdate)
        {
            uint32 mcrP;uint mcrE;uint64 vF;
            (mcrP,mcrE,vF, , )=md1.getLastMCR();
            uint16 len=md1.getCurrLength();
          
            uint len1 = md1.getMCRDataLength();
            md1.pushMCRData(mcrP,mcrE,vF,now,block.number);
            
            for(uint16 j=0;j<len;j++)
            {
                bytes4 curr_name=md1.getCurrency_Index(j);
                uint32 r=md1.getCurrencyRateByIndex(SafeMaths.sub(lastLen,1),curr_name);
                md1.updateCurrRates(len1,curr_name,r);
              
            }
            md1.updateDateWiseMCR(failedDate,len1);
            changeAvgRateOfCurr();
            // Oraclize call for next MCR calculation
            callOracliseForMCR();
            // t2.distributeSurplusDistrubution();
        }
    }

    function getAllSumAssurance() constant returns(uint amount1)
    {
        md1 = MCRData(MCRDataAddress);
        qd1=quotationData(quotationDataAddress);
        uint len=md1.getCurrLength();
        uint amount;
        for(uint16 i=0;i<len;i++)
        {
            bytes4 curr_name=md1.getCurrency_Index(i);
            if(curr_name=="ETH")
            {
                amount=SafeMaths.add(amount,qd1.getTotalSumAssured(curr_name));
            }
            else
            {   if(md1.getCurr3DaysAvg(curr_name)>0)
                amount=SafeMaths.add(amount,SafeMaths.div((SafeMaths.mul(qd1.getTotalSumAssured(curr_name),100)),md1.getCurr3DaysAvg(curr_name)));
            }
        }
        amount1=amount;
    }

    /// @dev Calls oraclize query to calculate MCR details after 24 hours.
    function callOracliseForMCR() internal
    {
        md1 = MCRData(MCRDataAddress);
        p1=pool(poolAddress);
        p1.MCROraclise(md1.getMCRTime());
    }

    
    function callOracliseForMCRFail(uint64 failedDate) internal
    {
        md1 = MCRData(MCRDataAddress);
        p1=pool(poolAddress);
        p1.MCROracliseFail(failedDate,md1.getMCRFailTime());
    }
     

    /// @dev Gets the details of last added MCR.
    /// @return mcrPercx100 Total Minimum Capital Requirement percentage of that month of year(multiplied by 100).
    /// @return mcrEtherx100 Total Minimum Capital Requirement in ether.(multiplied by 100)
    /// @return vFull Total Pool fund value in Ether used in the last full daily calculation from the Capital model of that month of year.
    /// @return date_add current timestamp.
    /// @return blockNumber Block Number.
    function getLastMCR() constant returns( uint mcrPercx100,uint mcrEtherx100,uint vFull,uint date_add,uint blockNumber)
    {
        md1 = MCRData(MCRDataAddress);
       (mcrPercx100,mcrEtherx100,vFull,date_add,blockNumber) = md1.getLastMCR();
    }
    /// @dev Gets the details of last added MCR.
    /// @param date Date 
    /// @return mcrPercx100 Total Minimum Capital Requirement percentage of that month of year(multiplied by 100).
    /// @return mcrEtherx100 Total Minimum Capital Requirement in ether.(multiplied by 100)
    /// @return vFull Total Pool fund value in Ether used in the last full daily calculation.
    /// @return date_add Timestamp at which data was notarized.
    /// @return blockNumber Block Number at which data was notarized.
     function getMCRbyDate(uint64 date) constant returns( uint mcrPercx100,uint mcrEtherx100,uint vFull,uint date_add,uint blockNumber)
    {
        md1 = MCRData(MCRDataAddress);
        (mcrPercx100,mcrEtherx100,vFull,date_add,blockNumber) = md1.getMCRbyDate(date);
    }
    /// @dev Gets last Minimum Capital Requirement percentage of Capital Model
    /// @return val MCR% value multiplied by 100.
    function getlastMCRPerc() constant returns(uint val)
    {
        md1 = MCRData(MCRDataAddress);
        val = md1.getlastMCRPerc();
    }
    /// @dev  Gets last Minimum Capital Requirement in Ether.
    /// @return val MCR value in ether multiplied by 100.
    function getLastMCREtherFull()constant returns(uint val)
    {
        md1 = MCRData(MCRDataAddress);
        val = md1.getLastMCREtherFull();
    }
    /// @dev Gets Fund value in Ether used in the last full daily calculation of the Capital model.
    function getLastVfull() constant returns( uint vf)
    {
        md1 = MCRData(MCRDataAddress);
        vf = md1.getLastVfull();
    }
    /// @dev Updates the  3 day average exchange rate against each currency.                               
    function changeAvgRateOfCurr() internal 
    {
        md1 = MCRData(MCRDataAddress);
        p1=pool(poolAddress);
        uint16 i;
        uint j;
        uint32 rate;
        bytes4 currency;
        uint16 len = md1.getCurrLength();
        if(md1.getMCRDataLength()==2)
        {
            
            for(i=0;i<len;i++)
            {
                currency = md1.getCurrency_Index(i);
                md1.updateCurr3DaysAvg( currency, md1.getCurrencyRateByIndex(1,currency));
            }
        }
        else if(md1.getMCRDataLength()==3)
        {
            for(i=0;i<len;i++)
            {
                currency = md1.getCurrency_Index(i);
                rate=0;
                for(j=1;j<=2;j++)
                {
                    rate = SafeMaths.add32(rate,md1.getCurrencyRateByIndex(j,currency));
                }
                rate = SafeMaths.div32(rate,2);
                md1.updateCurr3DaysAvg( currency,rate);
            }
        }
        else if(md1.getMCRDataLength()>=4)
        {
            for(i=0;i<len;i++)
            {
                currency = md1.getCurrency_Index(i);
                rate=0;
                uint k=0;
                for(j=SafeMaths.sub(md1.getMCRDataLength(),1);j>=0;j--)
                {
                    rate = SafeMaths.add32(rate,md1.getCurrencyRateByIndex(j,currency));
                    k++;
                    if(k==3)
                        break;
                }
                rate = SafeMaths.div32(rate,3);
                md1.updateCurr3DaysAvg( currency,rate);
            }
        }
    }
    /// @dev Calculates V(Tp) ,i.e, Pool Fund Value in Ether used for the Token Price Calculation and MCR%(Tp) ,i.e, MCR% used in the Token Price Calculation.
    /// @return Vtp  Pool Fund Value in Ether used for the Token Price Model 
    /// @return MCRtp MCR% used in the Token Price Model.
    function calVtpAndMCRtp() constant returns(uint Vtp , uint MCRtp)
    {
        md1 = MCRData(MCRDataAddress);
        Vtp = 0;
        p1=pool(poolAddress);
        t1 = NXMToken(tokenAddress);
        f1=fiatFaucet(fiatFaucetAddress);
        uint len = md1.getCurrLength();
        for(uint16 i=0;i<len;i++)
        {   
            bytes4 currency = md1.getCurrency_Index(i);
            if(currency!="ETH")
            {

                uint currTokens=f1.getBalance(poolAddress,currency); 
                if(md1.getCurr3DaysAvg(currency)>0)
                Vtp = SafeMaths.add(Vtp,SafeMaths.div(SafeMaths.mul(currTokens , 100), md1.getCurr3DaysAvg(currency)));
            }
            else
                Vtp = SafeMaths.add(Vtp,p1.getEtherPoolBalance());
        }
        uint MCRfullperc;
        uint Vfull;
        (MCRfullperc, ,Vfull, , )=getLastMCR();
        if(Vfull>0)
        {
            MCRtp =SafeMaths.div((SafeMaths.mul(MCRfullperc , Vtp)),(Vfull));
        }
    }
    /// @dev Calculates the Token Price of a currency.
    /// @param curr Currency name.
    /// @return tokenPrice Token price.
    function calculateTokenPrice(bytes4 curr) constant returns (uint tokenPrice)
    {
        md1 = MCRData(MCRDataAddress);
        uint MCRtp;
        (,MCRtp) = calVtpAndMCRtp();                       
        uint TO = SafeMaths.div(t1.totalSupply(),1000000000000000000); 
        uint getSFx100000;
        uint getGrowthStep;
        uint getCurr3DaysAvg;
        (getSFx100000,getGrowthStep,getCurr3DaysAvg)=md1.getTokenPriceDetails(curr);
        if(SafeMaths.div((SafeMaths.mul(MCRtp , MCRtp)),100000000) >=1)
        {
            tokenPrice = SafeMaths.div((SafeMaths.mul(SafeMaths.mul(SafeMaths.mul(SafeMaths.mul(getSFx100000 ,(SafeMaths.add(getGrowthStep,TO))) , MCRtp) , MCRtp) , 100000)),getGrowthStep);  
        }
        else
        {
            tokenPrice = SafeMaths.div(( SafeMaths.mul(SafeMaths.mul(SafeMaths.mul(SafeMaths.mul(getSFx100000, (SafeMaths.add(getGrowthStep,TO))) , 10000) , 10000) , 100000)),getGrowthStep);
        }

        tokenPrice = ( SafeMaths.div(SafeMaths.mul((tokenPrice),getCurr3DaysAvg),100));                         
    }

    
    

    
}
