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

import "./pool.sol";
import "./NXMToken.sol";
import "./fiatFaucet.sol";
import "./MCRData.sol";
import "./master.sol";
import "./NXMToken2.sol";
import "./NXMTokenData.sol";
pragma solidity ^0.4.8;


contract MCR
{
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
    function changeMinReqMCR(uint minMCR) onlyInternal
    {
        md1.changeMinReqMCR(minMCR);
    }
    function getminMCRReq()constant returns(uint mcrmin)
    {
        md1 = MCRData(MCRDataAddress);
        mcrmin = md1.getMinMCR();
    }
    function checkForMinMCR()constant returns(uint check)
    {
        md1 = MCRData(MCRDataAddress);
        check=0;
        if(getlastMCRPerc() < md1.getMinMCR())
            check=1;
    }
    function changeMCRTime(uint _time) onlyOwner
    {
        md1 = MCRData(MCRDataAddress);
        md1.changeMCRTime(_time);
    }
    function addCurrency(bytes16 curr) 
    {
        ms1=master(masterAddress);
       if( ms1.isInternal(msg.sender) != 1 && ms1.isOwner(msg.sender)!=1) throw;
        md1 = MCRData(MCRDataAddress);
        md1.addCurrency(curr);
        
    }

    function getCurrenciesLength()constant returns(uint len)
    {
        md1 = MCRData(MCRDataAddress);
        len = md1.getCurrLength();
    }
    function getCurrency_Index(uint index) constant returns(uint id ,bytes16 curr)
    {
        md1 = MCRData(MCRDataAddress);
        curr = md1.getCurrency_Index(index);
        id = index;
    }
    function getCurrency3DaysAvg(bytes16 curr)constant returns(uint avg)
    {
        md1 = MCRData(MCRDataAddress);
        avg = md1.getCurr3DaysAvg(curr);
    }

    function changePoolAddress(address _add) onlyInternal
    {
        poolAddress = _add;
    }
    function changeSF(uint val) onlyOwner
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
     function changenotariseAddress(address nadd) onlyOwner
    {
        md1 = MCRData(MCRDataAddress);
        md1.changenotarise(nadd);
    }

    function getGraphData(uint yearMonth) constant returns (uint mcrp ,uint mcre , uint vf , uint dc ,uint yearmonth)
    {
        md1 = MCRData(MCRDataAddress);
        (mcrp,mcre,vf,dc,yearmonth) = md1.getGraphData(yearMonth);
    }

    function addMCRData(uint mcrP , uint mcrE , uint vF ,bytes16[] curr ,uint[] rates , uint onlyDate , uint yearMonth)
    {

        md1 = MCRData(MCRDataAddress);
        if(md1.isnotarise(msg.sender)==0) throw;
        t1=NXMToken(tokenAddress);
        t2=NXMToken2(token2Address);
       
        vF = vF * 1000000000000000000;

        md1.addGraphDataForYearMonth(yearMonth,mcrP,mcrE,vF,md1.getYearMonthDataCount(yearMonth)+1);
        uint len = md1.getMCRDataLength();
        md1.pushMCRData(mcrP,mcrE,vF,now,block.number);
        for(uint i=0;i<curr.length;i++)
        {
            md1.updateCurrRates(len,curr[i],rates[i]);
        }
        md1.updateDateWiseMCR(onlyDate,len);
        changeAvgRateOfCurr();
        callOracliseForMCR();
        
      
             t2.distributeSurplusDistrubution();
        
    }
    function callOracliseForMCR() internal
    {
        md1 = MCRData(MCRDataAddress);
        p1=pool(poolAddress);
        p1.MCROraclise(md1.getMCRTime());
    }

    function getLastMCR() constant returns( uint mcrPercx100,uint mcrEtherx100,uint vFull,uint date_add,uint blockNumber)
    {
        md1 = MCRData(MCRDataAddress);
       (mcrPercx100,mcrEtherx100,vFull,date_add,blockNumber) = md1.getLastMCR();
    }

    function getMCRbyDate(uint date) constant returns( uint mcrPercx100,uint mcrEtherx100,uint vFull,uint date_add,uint blockNumber)
    {
        md1 = MCRData(MCRDataAddress);
        (mcrPercx100,mcrEtherx100,vFull,date_add,blockNumber) = md1.getMCRbyDate(date);
    }

    function getlastMCRPerc() constant returns(uint val)
    {
        md1 = MCRData(MCRDataAddress);
        val = md1.getlastMCRPerc();
    }
    function getLastMCREtherFull()constant returns(uint val)
    {
        md1 = MCRData(MCRDataAddress);
        val = md1.getLastMCREtherFull();
    }
    function getLastVfull() constant returns( uint vf)
    {
        md1 = MCRData(MCRDataAddress);
        vf = md1.getLastVfull();
    }
    
    function changeAvgRateOfCurr() internal
    {
        md1 = MCRData(MCRDataAddress);
        p1=pool(poolAddress);
        uint i;
        uint j;
        uint rate;
        bytes16 currency;
        uint len = md1.getCurrLength();
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
                    rate += md1.getCurrencyRateByIndex(j,currency);
                }
                rate = rate/2;
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
                for(j=md1.getMCRDataLength()-1;j>=0;j--)
                {
                    rate += md1.getCurrencyRateByIndex(j,currency);
                    k++;
                    if(k==3)
                        break;
                }
                rate = rate/3;
                md1.updateCurr3DaysAvg( currency,rate);
            }
        }
    }
    function calVtpAndMCRtp() constant returns(uint Vtp , uint MCRtp)
    {
        md1 = MCRData(MCRDataAddress);
        Vtp = 0;
        p1=pool(poolAddress);
        t1 = NXMToken(tokenAddress);
        uint len = md1.getCurrLength();
        for(uint i=0;i<len;i++)
        {   
            bytes16 currency = md1.getCurrency_Index(i);
            if(currency!="ETH")
            {
                uint currTokens = t1.getPoolFundValue(currency);
                Vtp += (currTokens * 100/ md1.getCurr3DaysAvg(currency));
            }
            else
                Vtp += p1.getEtherPoolBalance();
        }
        uint MCRfullperc = md1.getlastMCRPerc();
        uint Vfull = md1.getLastVfull();
        MCRtp = (MCRfullperc * Vtp)/(Vfull);     
    }
    function calculateTokenPrice(bytes16 curr) constant returns (uint tokenPrice)
    {
        md1 = MCRData(MCRDataAddress);
        uint MCRtp;
        (,MCRtp) = calVtpAndMCRtp();                       
        uint TO = t1.totalSupply()/1000000000000000000;                                
        if((MCRtp * MCRtp)/100000000 >=1)
        {
            tokenPrice = (md1.getSFx100000() *(md1.getGrowthStep()+TO) * MCRtp * MCRtp * 100000)/md1.getGrowthStep();  
        }
        else
        {
            tokenPrice = (md1.getSFx100000() * (md1.getGrowthStep()+TO) * 10000 * 10000 * 100000)/md1.getGrowthStep();
        }

        tokenPrice = ((tokenPrice)*md1.getCurr3DaysAvg(curr)/100);                         
    }

  



    function provideEth() payable 
    {
        
    }
    
    

    
}
