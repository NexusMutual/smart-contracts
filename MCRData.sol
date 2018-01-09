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

contract MCRData
{
    master ms1;
    address masterAddress;
    uint32 public minMCRReq;
    uint32 public SFx100000;
    uint32 public growthStep;
    uint16 public minCap;
    uint64 public MCRFailTime;
    uint16 public shockParameter;
    uint64 MCRTime;
    bytes4[] allCurrencies;
    struct mcrData
    { 
        uint32 mcrPercx100;
        uint mcrEtherx100;
        uint64 vFull;    //pool funds
        uint date_add;
        uint blockNumber;
        mapping(bytes4=>uint32) allCurrRates;
    }
    mcrData[] public allMCRData;
    mapping(bytes4=>uint32) public allCurr3DaysAvg;
    mapping(uint64 => uint) public dateWiseMCR;
    mapping(uint=>uint64) public indexWiseDate; 
    address notariseMCR;

    function MCRData()
    {
        growthStep = 1500000;
        SFx100000 = 140;
        MCRTime = 24*60*60;
        MCRFailTime=5*60;
        minMCRReq = 0;
        allMCRData.push(mcrData(0,0,0,0,0));
        minCap=1;
        shockParameter=50;
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
    /// @dev Changes address of Notary.
    function changenotarise(address nadd) onlyInternal
    {
        notariseMCR=nadd;
    }
    /// @dev Checks whether a given address can notaise MCR data or not.
    /// @param nadd Address.
    /// @return res Returns 0 if address is not authorized, else 1.
    function isnotarise(address nadd) constant returns(uint res)
    {
        res=0;
        if(nadd==notariseMCR)
        res=1;
    }
    function changeMinCap(uint16 newCap) onlyOwner
    {
        minCap=newCap;
    }
    function changeShockParameter(uint16 newParam) onlyOwner
    {
        shockParameter=newParam;
    }
    /// @dev Changes Growth Step
    function changeGrowthStep(uint32 newGS) onlyOwner
    {
        growthStep = newGS;
    }
    /// @dev Gets Scaling Factor.
    function getSFx100000() constant returns(uint32 sf)
    {
        sf = SFx100000;
    }
    /// @dev Gets Growth Step
    function getGrowthStep() constant returns(uint32 gs)
    {
        gs = growthStep;
    }
    function getMinCap() constant returns(uint16 _MinCap)
    {
        _MinCap=minCap;
    }
    function getShockParameter() constant returns(uint16 _shock)
    {
        _shock=shockParameter;
    }
    /// @dev Changes time period for obtaining new MCR data from external oracle query.
    function changeMCRTime(uint64 _time) onlyInternal
    {
        MCRTime = _time;
    }
    function changeMCRFailTime(uint64 _time) onlyInternal
    {
        MCRFailTime=_time;
    }
    /// @dev Gets time interval after which MCR calculation is initiated.
    function getMCRTime()constant returns(uint64 _time)
    {
        _time = MCRTime;
    }
    function getMCRFailTime() constant returns(uint64 _time)
    {
        _time=MCRFailTime;
    }
    /// @dev Changes minimum value of MCR required for the system to be working.
    function changeMinReqMCR(uint32 minMCR) onlyInternal
    {
        minMCRReq = minMCR;
    }
    /// @dev Gets minimum  value of MCR required.
    function getMinMCR()constant returns(uint32 mcr)
    {
        mcr = minMCRReq;
    }
    /// @dev Stores name of currency accepted in the system.
    /// @param curr Currency Name.
    function addCurrency(bytes4 curr) onlyInternal
    {
        allCurrencies.push(curr);
    }
    /// @dev Gets name of all the currencies accepted in the system.
    /// @return curr Array of currency's name.
    function getAllCurrencies() constant returns(bytes4[] curr)
    {
        return allCurrencies;
    }
    /// @dev Changes scaling factor.
    function changeSF(uint32 val) onlyInternal
    {
        SFx100000 = val;
    }
    /// @dev Gets the total number of times MCR calculation has been made.
    function getMCRDataLength()constant returns(uint len)
    {
        len = allMCRData.length;
    }
   
    /// @dev Adds details of (Minimum Capital Requirement)MCR.
    /// @param mcrp Minimum Capital Requirement percentage (MCR% * 100 ,Ex:for 54.56% ,given 5456)
    /// @param mcre Minimum Capital Requirement in Ether (*100)
    /// @param vf Pool fund value in Ether used in the last full daily calculation from the Capital model.
    /// @param time Current timestamp at which MCR details are getting added.
    /// @param block Block Number on which calculations have been made.
    function pushMCRData(uint32 mcrp,uint mcre,uint64 vf,uint time,uint block) onlyInternal
    {
        allMCRData.push(mcrData(mcrp,mcre,vf,time,block));
    }
    /// @dev Updates the currency exchange rate of a given currency.
    /// @param id index value
    /// @param curr Currency Name
    /// @param rate rate of currency X 100.
    function updateCurrRates(uint id,bytes4 curr,uint32 rate) onlyInternal
    {
        allMCRData[id].allCurrRates[curr] = rate;
    }
    /// @dev Gets number of currencies that the system accepts.
    function getCurrLength()constant returns(uint16 len)
    {
        len = uint16(allCurrencies.length);
    }
    /// @dev Gets name of currency at a given index.
    function getCurrency_Index(uint16 index)constant returns(bytes4 curr)
    {
        curr = allCurrencies[index];
    }
    /// @dev Gets exchange rate of a currency w.r.t ETH.
    /// @param index index value
    /// @param curr Currency Name
    /// @return rate rate of currency X 100.
    function getCurrencyRateByIndex(uint index,bytes4 curr) constant returns(uint32 rate)
    {
        rate = allMCRData[index].allCurrRates[curr];
    }
    /// @dev Updates the 3 day average rate of a currency.
    /// @param curr Currency Name.
    /// @param rate Average exchange rate X 100 (of last 3 days).
    function updateCurr3DaysAvg(bytes4 curr , uint32 rate) onlyInternal
    {
        allCurr3DaysAvg[curr] = rate;
    }
    /// @dev Gets the average rate of a currency.
    /// @param curr Currency Name.
    /// @return rate Average rate X 100(of last 3 days).
    function getCurr3DaysAvg(bytes4 curr) constant returns(uint32 rate)
    {
        rate = allCurr3DaysAvg[curr];
    }
    /// @dev Stores the MCR to the date on which it is calculated. 
    /// @param _date date at which new MCR details are added (yyyyMMdd).
    /// @param id MCR id.
    function updateDateWiseMCR(uint64 _date , uint id) onlyInternal
    {
        dateWiseMCR[_date] = id;
        indexWiseDate[id]=_date;
    }
    function getIndexWiseDate(uint id) constant returns(uint64 date)
    {
        date= indexWiseDate[id];
    }
    
     /// @dev Gets the details of last added MCR.
    /// @return mcrPercx100 Total Minimum Capital Requirement percentage of that month of year(multiplied by 100).
    /// @return mcrEtherx100 Total Minimum Capital Requirement in ether.(multiplied by 100)
    /// @return vFull Total Pool fund value in Ether used in the last full daily calculation.
    /// @return date_add Timestamp at which data was notarized.
    /// @return blockNumber Block Number at which data was notarized.
    function getLastMCR() constant returns( uint32 mcrPercx100,uint mcrEtherx100,uint64 vFull,uint date_add,uint blockNumber)
    {
       
        return (allMCRData[allMCRData.length-1].mcrPercx100,allMCRData[allMCRData.length-1].mcrEtherx100,allMCRData[allMCRData.length-1].vFull,allMCRData[allMCRData.length-1].date_add,allMCRData[allMCRData.length-1].blockNumber);
    }
    /// @dev Gets the details of MCR of a given date.
    /// @param date Date in yyyymmdd format
    /// @return mcrPercx100 Total Minimum Capital Requirement percentage * 100.
    /// @return mcrEtherx100 Total Minimum Capital Requirement in ether * 100.
    /// @return vFull Pool Fund value in Ether used in calculation for the given date.
    /// @return date_add Timestamp at which data was notarized.
    function getMCRbyDate(uint64 date) constant returns( uint32 mcrPercx100,uint mcrEtherx100,uint64 vFull,uint date_add,uint blockNumber)
    {
        uint index = dateWiseMCR[date];
        return (allMCRData[index].mcrPercx100,allMCRData[index].mcrEtherx100,allMCRData[index].vFull,allMCRData[index].date_add,allMCRData[index].blockNumber);
    }
    function getMCRIndexByDate(uint64 date)constant returns(uint index)
    {
        index = dateWiseMCR[date];
    }

    /// @dev Gets last Minimum Capital Requirement percentage of Capital Model
    /// @return val MCR% value,multiplied by 100.
    function getlastMCRPerc() constant returns(uint32 val)
    {
        val = allMCRData[allMCRData.length-1].mcrPercx100;
    }
    /// @dev Gets Pool fund value in Ether used in the last full daily calculation from the Capital model.
    function getLastVfull()constant returns(uint64 vf)
    {
        vf = allMCRData[allMCRData.length-1].vFull;
    }
    /// @dev Gets last Minimum Capital Requirement in Ether.
    /// @return val MCR in ETH,multiplied by 100.
    function getLastMCREtherFull()constant returns(uint val)
    {
        val = allMCRData[allMCRData.length-1].mcrEtherx100;
    }
    
    function getTokenPriceDetails(bytes4 curr) constant returns(uint32 SF,uint32 gs,uint32 rate)
    {
        SF = SFx100000;
        gs = growthStep;
        rate = allCurr3DaysAvg[curr];
    }
}
