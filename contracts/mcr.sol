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
import "./pool.sol";
import "./poolData.sol";
import "./BasicToken.sol";
// import "./fiatFaucet.sol";
import "./mcrData.sol";
import "./master.sol";
import "./nxmToken.sol";
import "./SafeMaths.sol";
import "./quotationData.sol";
contract mcr
{
    using SafeMaths for uint;
    
    pool p1;
    poolData pd;
    // fiatFaucet f1;
    nxmToken tc1;
    mcrData md;
    master ms;
    quotationData qd;
    BasicToken btok;
    // address MCRDataAddress;
    address poolAddress;
    // address fiatFaucetAddress;
    // address nxmtokenAddress;
    address masterAddress;
    // address quotationDataAddress;
    
    uint64 private constant _DECIMAL_1e18 = 1000000000000000000;
    uint32 private constant _DECIMAL_1e08 = 100000000;
    
    event apiresult(address indexed sender,string msg);
    event MCR(uint indexed date,uint blockNumber,bytes4[] allCurr,uint32[] allCurrRates,uint mcrEtherx100,uint32 mcrPercx100,uint64 vFull);
    
    function changeMasterAddress(address _add)
    {
        if(masterAddress == 0x000){
            masterAddress = _add;
            ms=master(masterAddress);
        }
        else
        {
            ms=master(masterAddress);
            if(ms.isInternal(msg.sender) == true)
                masterAddress = _add;
            else
                throw;
        }
    }
    modifier onlyInternal {
        // ms=master(masterAddress);
        require(ms.isInternal(msg.sender) == true);
        _; 
    }
     modifier onlyOwner{
        // ms=master(masterAddress);
        require(ms.isOwner(msg.sender) == true);
        _; 
    }
    modifier checkPause
    {
        // ms=master(masterAddress);
        require(ms.isPause()==false);
        _;
    }
    function changeMCRDataAddress(address MCRDataAddress) onlyInternal
    {
        // MCRDataAddress = _add;
        md=mcrData(MCRDataAddress);
    }
    function changeQuotationDataAddress(address quotationDataAddress) onlyInternal
    {
        // quotationDataAddress=_add;
        qd=quotationData(quotationDataAddress);
    }
    function changePoolAddress(address _add) onlyInternal
    {
        poolAddress = _add;
        p1=pool(poolAddress);
    }
    function changePoolDataAddress(address _poolDataAddress) onlyInternal
    {
        pd=poolData(_poolDataAddress);
    }
    function changeTokenAddress(address nxmTokenAddress) onlyInternal
    {
        // nxmtokenAddress = _add;
        tc1= nxmToken(nxmTokenAddress);
    }
    // function changeFiatFaucetAddress(address fiatFaucetAddress) onlyInternal
    // {
    //     // fiatFaucetAddress = _add;
    //     f1=fiatFaucet(fiatFaucetAddress);
    // }
    /// @dev Changes minimum Capital Requirement for system to sustain.
    function changeMinReqMCR(uint32 minMCR) onlyInternal
    {
        md.changeMinReqMCR(minMCR);
    }
    // /// @dev Gets minimum value of Capital Requirement.
    // function getminMCRReq()constant returns(uint32 mcrmin)
    // {
    //     md = MCRData(MCRDataAddress);
    //     mcrmin = md.getMinMCR();
    // }
    /// @dev Checks if last notarised Minimum Capital Requirement(MCR) percentage is less than minimum capital required or not.
    /// @return check 1 if last added MCR%<Minimum MCR value
    function checkForMinMCR()constant returns(uint8 check)
    {
        // md = MCRData(MCRDataAddress);
        check=0;
        if(md.getLastMCRPerc() < md.getMinMCR())
            check=1;
    }
     /// @dev Changes time period for obtaining new MCR data from external oracle query.
    function changeMCRTime(uint64 _time) onlyOwner
    {
        // md = MCRData(MCRDataAddress);
        md.changeMCRTime(_time);
    }
      /// @dev Stores name of currencies accepted by the system.
      /// @param curr Currency Name.
    function addCurrency(bytes4 curr) checkPause
    {
        // ms=master(masterAddress);
        if( ms.isInternal(msg.sender) != true && ms.isOwner(msg.sender)!=true) throw;
        // md = MCRData(MCRDataAddress);
        md.addCurrency(curr);
    }
    // /// @dev Gets number of currencies accepted by the system.
    // function getCurrenciesLength()constant returns(uint len)
    // {
    //     md = MCRData(MCRDataAddress);
    //     len = md.getCurrLength();
    // }
    /// @dev Gets name of currency at a given index.
    function getCurrencyByIndex(uint16 index) constant returns(uint16 id ,bytes4 curr)
    {
        // md = MCRData(MCRDataAddress);
        curr = md.getCurrencyByIndex(index);
        id = index;
    }
    // /// @dev Gets the 3 day average exchange rate of a currency.
    // /// @param curr Currency Name.
    // /// @return rate Average exchange rate (of last 3 days) against ETH.
    // function getCurrency3DaysAvg(bytes4 curr)constant returns(uint avg)
    // {
    //     md = MCRData(MCRDataAddress);
    //     avg = md.getCurr3DaysAvg(curr);
    // }

    /// @dev Changes scaling factor.
    function changeSF(uint32 val) onlyOwner
    {
        // md = MCRData(MCRDataAddress);
        md.changeSF(val);
    }
    /// @dev Changes address which can notise MCR
    function changenotariseAddress(address add) onlyOwner
    {
        // md = MCRData(MCRDataAddress);
        md.changeNotariseAdd(add);
    }

    /// @dev Adds new MCR data and calls for Surplus distribution.
    /// @param mcrP  Minimum Capital Requirement in percentage.
    /// @param vF Pool fund value in Ether used in the last full daily calculation of the Capital model.
    /// @param onlyDate  Date(yyyymmdd) at which MCR details are getting added.
    function addMCRData(uint32 mcrP, uint32 mcrE, uint64 vF, bytes4[] curr, uint32[] _3dayAvg, uint64 onlyDate) checkPause
    {
        // md = MCRData(MCRDataAddress);
        if(md.isnotarise(msg.sender)==false) throw;
        vF = SafeMaths.mul64(vF , _DECIMAL_1e18);
        uint len = md.getMCRDataLength();
        
       addMCRData_Extended(len,onlyDate,curr,mcrE,mcrP,vF,_3dayAvg);
    }
    
    function addMCRData_Extended(uint len,uint64 newMCRDate,bytes4[] curr,uint32 mcrE,uint32 mcrP,uint64 vF,uint32[] _3dayAvg) internal
    {
        // md = MCRData(MCRDataAddress);
        uint VTP=0;
        uint lower=0;
        uint lowerThreshold=0;
        uint upperThreshold=0;
        if(len>1)
        {
            (VTP, )=calVtpAndMCRtp();
             
            if(VTP>=vF)
            {
                upperThreshold=SafeMaths.div(VTP,(SafeMaths.mul(md.getMinCap(),_DECIMAL_1e18)));
                upperThreshold=SafeMaths.mul(upperThreshold,100);
            }
            else
            {
                upperThreshold=SafeMaths.div(vF,(SafeMaths.mul(md.getMinCap(),_DECIMAL_1e18)));
                upperThreshold=SafeMaths.mul(upperThreshold,100);
            }
            if(VTP>0)
            {
                lower=SafeMaths.div((SafeMaths.mul(getAllSumAssurance(),100)),md.getShockParameter());
                lower=SafeMaths.mul(lower,_DECIMAL_1e18);
            }
            if(lower>0)
            {
                lowerThreshold=SafeMaths.div(VTP,lower);
            }
        }    
        if(len==1 || ((SafeMaths.div(mcrP,100))>=lowerThreshold && (SafeMaths.div(mcrP,100))<=upperThreshold))
        {            
            md.pushMCRData(mcrP,mcrE,vF,newMCRDate);
            for(uint i=0;i<curr.length;i++)
            {
                md.updateCurr3DaysAvg(curr[i],_3dayAvg[i]);
            }
          
            MCR(newMCRDate,block.number,curr,_3dayAvg,mcrE,mcrP,vF);
            // Oraclize call for next MCR calculation
            if(md.getLastMCRDate()<newMCRDate)
            {
                callOracliseForMCR();
            }
        }
        else
        {
            // callOracliseForMCRFail(newMCRDate);
            // p1=pool(poolAddress);
            p1.MCROracliseFail(newMCRDate,md.getMCRFailTime());
        }   
    }
    
    function addLastMCRData(uint64 Date) checkPause
    {
        // md = MCRData(MCRDataAddress);
        uint64 lastdate=md.getLastMCRDate();
        uint64 failedDate=uint64(Date);
        if(failedDate>=lastdate)
        {
            uint32 mcrP;uint32 mcrE;uint64 vF;
            (mcrP,mcrE,vF, )=md.getLastMCR();
            uint16 len=md.getCurrLength();
            md.pushMCRData(mcrP,mcrE,vF,Date);
            for(uint16 j=0;j<len;j++)
            {
                bytes4 curr_name=md.getCurrencyByIndex(j);
                md.updateCurr3DaysAvg(curr_name,md.getCurr3DaysAvg(curr_name));
            }
            
            MCR(Date,block.number,new bytes4[](0),new uint32[](0),mcrE,mcrP,vF);
            // Oraclize call for next MCR calculation
            callOracliseForMCR();
        }
    }

    function getAllSumAssurance() constant returns(uint amount)
    {
        // md = MCRData(MCRDataAddress);
        // qd=quotationData(quotationDataAddress);
        uint len=md.getCurrLength();
        
        for(uint16 i=0;i<len;i++)
        {
            bytes4 curr_name=md.getCurrencyByIndex(i);
            if(curr_name=="ETH")
            {
                amount=SafeMaths.add(amount,qd.getTotalSumAssured(curr_name));
            }
            else
            {   if(md.getCurr3DaysAvg(curr_name)>0)
                amount=SafeMaths.add(amount,SafeMaths.div((SafeMaths.mul(qd.getTotalSumAssured(curr_name),100)),md.getCurr3DaysAvg(curr_name)));
            }
        }
        
    }

    /// @dev Calls oraclize query to calculate MCR details after 24 hours.
    function callOracliseForMCR() internal
    {
        // md = MCRData(MCRDataAddress);
        // p1=pool(poolAddress);
        p1.MCROraclise(md.getMCRTime());
    }

    // function callOracliseForMCRFail(uint64 failedDate) internal
    // {
    //     md = MCRData(MCRDataAddress);
    //     p1=pool(poolAddress);
    //     p1.MCROracliseFail(failedDate,md.getMCRFailTime());
    // }
     
    // /// @dev Gets the details of last added MCR.
    // /// @return mcrPercx100 Total Minimum Capital Requirement percentage of that month of year(multiplied by 100).
    // /// @return mcrEtherx100 Total Minimum Capital Requirement in ether.(multiplied by 100)
    // /// @return vFull Total Pool fund value in Ether used in the last full daily calculation from the Capital model of that month of year.
    // /// @return date_add current timestamp.
    // /// @return blockNumber Block Number.
    // function getLastMCR() constant returns(uint mcrPercx100,uint vFull, uint64 date)
    // {
    //     // md = MCRData(MCRDataAddress);
    //   (mcrPercx100,vFull,date) = md.getLastMCR();
    // }

    // /// @dev Gets last Minimum Capital Requirement percentage of Capital Model
    // /// @return val MCR% value multiplied by 100.
    // function getlastMCRPerc() constant returns(uint val)
    // {
    //     md = MCRData(MCRDataAddress);
    //     val = md.getlastMCRPerc();
    // }

    // /// @dev Gets Fund value in Ether used in the last full daily calculation of the Capital model.
    // function getLastVfull() constant returns( uint vf)
    // {
    //     md = MCRData(MCRDataAddress);
    //     vf = md.getLastVfull();
    // }
    
    /// @dev Calculates V(Tp) ,i.e, Pool Fund Value in Ether used for the Token Price Calculation and MCR%(Tp) ,i.e, MCR% used in the Token Price Calculation.
    /// @return Vtp  Pool Fund Value in Ether used for the Token Price Model 
    /// @return MCRtp MCR% used in the Token Price Model.
    function calVtpAndMCRtp() constant returns(uint Vtp , uint MCRtp)
    {
        // md = MCRData(MCRDataAddress);
        Vtp = 0;
        // p1=pool(poolAddress);
        // f1=fiatFaucet(fiatFaucetAddress);
        uint len = md.getCurrLength();
        for(uint16 i=0;i<len;i++)
        {
            bytes4 currency = md.getCurrencyByIndex(i);
            if(currency!="ETH")
            {
                btok=BasicToken(pd.getCurrencyAssetAddress(currency));
                uint currTokens=btok.balanceOf(poolAddress); //f1.getBalance(poolAddress,currency); 
                if(md.getCurr3DaysAvg(currency)>0)
                Vtp = SafeMaths.add(Vtp,SafeMaths.div(SafeMaths.mul(currTokens, 100), md.getCurr3DaysAvg(currency)));
            }
            else
                Vtp = SafeMaths.add(Vtp,p1.getEtherPoolBalance());
        }
        uint MCRfullperc;
        uint Vfull;
        (MCRfullperc,,Vfull,)=md.getLastMCR();
        if(Vfull>0)
        {
            MCRtp =SafeMaths.div((SafeMaths.mul(MCRfullperc, Vtp)),(Vfull));
        }
    }
    /// @dev Calculates the Token Price of a currency.
    /// @param curr Currency name.
    /// @return tokenPrice Token price.
    function calculateTokenPrice(bytes4 curr) constant returns (uint tokenPrice)
    {
        // md = MCRData(MCRDataAddress);
        // tc1= NXMToken(tokenAddress);
        uint MCRtp;
        (,MCRtp) = calVtpAndMCRtp();                       
        uint TO = SafeMaths.div(tc1.totalSupply(),_DECIMAL_1e18); 
        uint getSFx100000;
        uint getGrowthStep;
        uint getCurr3DaysAvg;
        (getSFx100000,getGrowthStep,getCurr3DaysAvg)=md.getTokenPriceDetails(curr);
        if(SafeMaths.div((SafeMaths.mul(MCRtp , MCRtp)),_DECIMAL_1e08) >=1)
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
