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

contract MCRData
{
    master ms1;
    address masterAddress;
    struct currRates{
        bytes16 currName;
        uint ratex100;
    }
    uint public minMCRReq;
    uint public SFx100000;
    uint public growthStep;
    uint MCRTime;
    bytes16[] allCurrencies;
    struct avg3Days{
        bytes16 curr;
        uint avgRateX100;
    }

    struct monthlyAvg{
        uint MCRPercx100;
        uint mcrEtherx100;
        uint vFull;
        uint dataCount;
    }
    struct mcrData
    { 
        uint mcrPercx100;
        uint mcrEtherx100;
        uint vFull;    //pool funds
        uint date_add;
        uint blockNumber;
        mapping(bytes16=>uint) allCurrRates;
    }
    mcrData[] public allMCRData;
    mapping(bytes16=>uint) public allCurr3DaysAvg;
    mapping( uint => uint) public dateWiseMCR; 
    mapping(uint=>monthlyAvg) graphData;
    address notariseMCR;

    function MCRData()
    {
        growthStep = 1500000;
        SFx100000 = 140;
        MCRTime = 24*60*60;
        minMCRReq = 0;
        allMCRData.push(mcrData(0,0,0,0,0));
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
    /// @dev Changes Growth Step
    function changeGrowthStep(uint newGS) onlyOwner
    {
        growthStep = newGS;
    }
    /// @dev Gets Scaling Factor.
    function getSFx100000() constant returns(uint sf)
    {
        sf = SFx100000;
    }
    /// @dev Gets Growth Step
    function getGrowthStep() constant returns(uint gs)
    {
        gs = growthStep;
    }
    /// @dev Changes time period for obtaining new MCR data from external oracle query.
    function changeMCRTime(uint _time) onlyInternal
    {
        MCRTime = _time;
    }
    /// @dev Gets time interval after which MCR calculation is initiated.
    function getMCRTime()constant returns(uint _time)
    {
        _time = MCRTime;
    }
    /// @dev Changes minimum value of MCR required for the system to be working.
    function changeMinReqMCR(uint minMCR) onlyInternal
    {
        minMCRReq = minMCR;
    }
    /// @dev Gets minimum  value of MCR required.
    function getMinMCR()constant returns(uint mcr)
    {
        mcr = minMCRReq;
    }
    /// @dev Stores name of currency accepted in the system.
    /// @param curr Currency Name.
    function addCurrency(bytes16 curr) onlyInternal
    {
        allCurrencies.push(curr);
    }
    /// @dev Gets name of all the currencies accepted in the system.
    /// @return curr Array of currency's name.
    function getAllCurrencies() constant returns(bytes16[] curr)
    {
        return allCurrencies;
    }
    /// @dev Changes scaling factor.
    function changeSF(uint val) onlyInternal
    {
        SFx100000 = val;
    }
    /// @dev Gets the total number of times MCR calculation has been made.
    function getMCRDataLength()constant returns(uint len)
    {
        len = allMCRData.length;
    }
    /// @dev Gets number of times MCR data has been posted in a given month of a year.
    /// @param yearMonth yyyymm.
    /// @return dc Number of times MCR data has been added.
    function getYearMonthDataCount(uint yearMonth)constant returns(uint dc)
    {
        dc = graphData[yearMonth].dataCount;
    }
    /// @dev Stores MCR data for a month of a year.
    /// @param yearMonth Year and month number (format:yyyymm).
    /// @param mcrp Minimum Capital Requirement percentage.(MCR% * 100 ,Ex:for 54.56% ,given 5456)
    /// @param mcre Minimum Capital Requirement in Ether (*100)
    /// @param vf Pool fund value in Ether used in the last full daily calculation from the Capital model.
    /// @param dc Counter variable used to count the number of times data has been posted in a month of a year.
    function addGraphDataForYearMonth(uint yearMonth,uint mcrp,uint mcre,uint vf,uint dc) onlyInternal
    {
        graphData[yearMonth].MCRPercx100 += mcrp;
        graphData[yearMonth].mcrEtherx100 += mcre;
        graphData[yearMonth].vFull += vf;
        graphData[yearMonth].dataCount = dc;
    }
    /// @dev Adds details of (Minimum Capital Requirement)MCR.
    /// @param mcrp Minimum Capital Requirement percentage (MCR% * 100 ,Ex:for 54.56% ,given 5456)
    /// @param mcre Minimum Capital Requirement in Ether (*100)
    /// @param vf Pool fund value in Ether used in the last full daily calculation from the Capital model.
    /// @param time Current timestamp at which MCR details are getting added.
    /// @param block Block Number on which calculations have been made.
    function pushMCRData(uint mcrp,uint mcre,uint vf,uint time,uint block) onlyInternal
    {
        allMCRData.push(mcrData(mcrp,mcre,vf,time,block));
    }
    /// @dev Updates the currency exchange rate of a given currency.
    /// @param id index value
    /// @param curr Currency Name
    /// @param rate rate of currency X 100.
    function updateCurrRates(uint id,bytes16 curr , uint rate) onlyInternal
    {
        allMCRData[id].allCurrRates[curr] = rate;
    }
    /// @dev Gets number of currencies that the system accepts.
    function getCurrLength()constant returns(uint len)
    {
        len = allCurrencies.length;
    }
    /// @dev Gets name of currency at a given index.
    function getCurrency_Index(uint index)constant returns(bytes16 curr)
    {
        curr = allCurrencies[index];
    }
    /// @dev Gets exchange rate of a currency w.r.t ETH.
    /// @param index index value
    /// @param curr Currency Name
    /// @return rate rate of currency X 100.
    function getCurrencyRateByIndex(uint index,bytes16 curr) constant returns(uint rate)
    {
        rate = allMCRData[index].allCurrRates[curr];
    }
    /// @dev Updates the 3 day average rate of a currency.
    /// @param curr Currency Name.
    /// @param rate Average exchange rate X 100 (of last 3 days).
    function updateCurr3DaysAvg(bytes16 curr , uint rate) onlyInternal
    {
        allCurr3DaysAvg[curr] = rate;
    }
    /// @dev Gets the average rate of a currency.
    /// @param curr Currency Name.
    /// @return rate Average rate X 100(of last 3 days).
    function getCurr3DaysAvg(bytes16 curr) constant returns(uint rate)
    {
        rate = allCurr3DaysAvg[curr];
    }
    /// @dev Stores the MCR to the date on which it is calculated. 
    /// @param _date date at which new MCR details are added (yyyyMMdd).
    /// @param id MCR id.
    function updateDateWiseMCR(uint _date , uint id) onlyInternal
    {
        dateWiseMCR[_date] = id;
    }
    /// @dev Gets MCR data for a year and month.
    /// @param yearMonth Year and month number (yyyymm).
    /// @return mcrp Minimum Capital Requirement MCR percentage.
    /// @return mcre Minimum Capital Requirement MCR in ether.
    /// @return vf Total Pool fund value in Ether.
    /// @return dc Number of times MCR data has been added for the given year and month.
    /// @return yearmonth Year and Month (in yyyymm) of MCR data.
    function getGraphData(uint yearMonth) constant returns (uint mcrp ,uint mcre , uint vf , uint dc ,uint yearmonth) 
    {
        mcrp = graphData[yearMonth].MCRPercx100;
        mcre = graphData[yearMonth].mcrEtherx100;
        vf =  graphData[yearMonth].vFull;
        dc = graphData[yearMonth].dataCount;
        yearmonth = yearMonth;
    }
     /// @dev Gets the details of last added MCR.
    /// @return mcrPercx100 Total Minimum Capital Requirement percentage of that month of year(multiplied by 100).
    /// @return mcrEtherx100 Total Minimum Capital Requirement in ether.(multiplied by 100)
    /// @return vFull Total Pool fund value in Ether used in the last full daily calculation.
    /// @return date_add Timestamp at which data was notarized.
    /// @return blockNumber Block Number at which data was notarized.
    function getLastMCR() constant returns( uint mcrPercx100,uint mcrEtherx100,uint vFull,uint date_add,uint blockNumber)
    {
       
        return (allMCRData[allMCRData.length-1].mcrPercx100,allMCRData[allMCRData.length-1].mcrEtherx100,allMCRData[allMCRData.length-1].vFull,allMCRData[allMCRData.length-1].date_add,allMCRData[allMCRData.length-1].blockNumber);
    }
    /// @dev Gets the details of MCR of a given date.
    /// @param date Date in yyyymmdd format
    /// @return mcrPercx100 Total Minimum Capital Requirement percentage * 100.
    /// @return mcrEtherx100 Total Minimum Capital Requirement in ether * 100.
    /// @return vFull Pool Fund value in Ether used in calculation for the given date.
    /// @return date_add Timestamp at which data was notarized.
    function getMCRbyDate(uint date) constant returns( uint mcrPercx100,uint mcrEtherx100,uint vFull,uint date_add,uint blockNumber)
    {
        uint index = dateWiseMCR[date];
        return (allMCRData[index].mcrPercx100,allMCRData[index].mcrEtherx100,allMCRData[index].vFull,allMCRData[index].date_add,allMCRData[index].blockNumber);
    }

    /// @dev Gets last Minimum Capital Requirement percentage of Capital Model
    /// @return val MCR% value,multiplied by 100.
    function getlastMCRPerc() constant returns(uint val)
    {
        val = allMCRData[allMCRData.length-1].mcrPercx100;
    }
    /// @dev Gets Pool fund value in Ether used in the last full daily calculation from the Capital model.
    function getLastVfull()constant returns(uint vf)
    {
        vf = allMCRData[allMCRData.length-1].vFull;
    }
    /// @dev Gets last Minimum Capital Requirement in Ether.
    /// @return val MCR in ETH,multiplied by 100.
    function getLastMCREtherFull()constant returns(uint val)
    {
        val = allMCRData[allMCRData.length-1].mcrEtherx100;
    }
    

    
}
