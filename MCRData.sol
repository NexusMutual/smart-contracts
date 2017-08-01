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
    function changenotarise(address nadd) onlyInternal
    {
        notariseMCR=nadd;
    }
  function isnotarise(address nadd) constant returns(uint res)
  {
      res=0;
      if(nadd==notariseMCR)
      res=1;
  }
    function changeGrowthStep(uint newGS) onlyOwner
    {
        growthStep = newGS;
    }
    function getSFx100000() constant returns(uint sf)
    {
        sf = SFx100000;
    }
    function getGrowthStep() constant returns(uint gs)
    {
        gs = growthStep;
    }
    function changeMCRTime(uint _time) onlyInternal
    {
        MCRTime = _time;
    }
    function getMCRTime()constant returns(uint _time)
    {
        _time = MCRTime;
    }
    function changeMinReqMCR(uint minMCR) onlyInternal
    {
        minMCRReq = minMCR;
    }
    function getMinMCR()constant returns(uint mcr)
    {
        mcr = minMCRReq;
    }
    function addCurrency(bytes16 curr) onlyInternal
    {
        allCurrencies.push(curr);
    }
    function getAllCurrencies() constant returns(bytes16[] curr)
    {
        return allCurrencies;
    }
    function changeSF(uint val) onlyInternal
    {
        SFx100000 = val;
    }
    function getMCRDataLength()constant returns(uint len)
    {
        len = allMCRData.length;
    }
    function getYearMonthDataCount(uint yearMonth)constant returns(uint dc)
    {
        dc = graphData[yearMonth].dataCount;
    }
    function addGraphDataForYearMonth(uint yearMonth,uint mcrp,uint mcre,uint vf,uint dc) onlyInternal
    {
        graphData[yearMonth].MCRPercx100 += mcrp;
        graphData[yearMonth].mcrEtherx100 += mcre;
        graphData[yearMonth].vFull += vf;
        graphData[yearMonth].dataCount = dc;
    }
    function pushMCRData(uint mcrp,uint mcre,uint vf,uint time,uint block) onlyInternal
    {
        allMCRData.push(mcrData(mcrp,mcre,vf,time,block));
    }
    function updateCurrRates(uint id,bytes16 curr , uint rate) onlyInternal
    {
        allMCRData[id].allCurrRates[curr] = rate;
    }
    function getCurrLength()constant returns(uint len)
    {
        len = allCurrencies.length;
    }
    function getCurrency_Index(uint index)constant returns(bytes16 curr)
    {
        curr = allCurrencies[index];
    }
    function getCurrencyRateByIndex(uint index,bytes16 curr) constant returns(uint rate)
    {
        rate = allMCRData[index].allCurrRates[curr];
    }
    function updateCurr3DaysAvg(bytes16 curr , uint rate) onlyInternal
    {
        allCurr3DaysAvg[curr] = rate;
    }
    function getCurr3DaysAvg(bytes16 curr) constant returns(uint rate)
    {
        rate = allCurr3DaysAvg[curr];
    }
    function updateDateWiseMCR(uint _date , uint id) onlyInternal
    {
        dateWiseMCR[_date] = id;
    }

    function getGraphData(uint yearMonth) constant returns (uint mcrp ,uint mcre , uint vf , uint dc ,uint yearmonth) 
    {
        mcrp = graphData[yearMonth].MCRPercx100;
        mcre = graphData[yearMonth].mcrEtherx100;
        vf =  graphData[yearMonth].vFull;
        dc = graphData[yearMonth].dataCount;
        yearmonth = yearMonth;
    }

    function getLastMCR() constant returns( uint mcrPercx100,uint mcrEtherx100,uint vFull,uint date_add,uint blockNumber)
    {
       
        return (allMCRData[allMCRData.length-1].mcrPercx100,allMCRData[allMCRData.length-1].mcrEtherx100,allMCRData[allMCRData.length-1].vFull,allMCRData[allMCRData.length-1].date_add,allMCRData[allMCRData.length-1].blockNumber);
    }

    function getMCRbyDate(uint date) constant returns( uint mcrPercx100,uint mcrEtherx100,uint vFull,uint date_add,uint blockNumber)
    {
        uint index = dateWiseMCR[date];
        return (allMCRData[index].mcrPercx100,allMCRData[index].mcrEtherx100,allMCRData[index].vFull,allMCRData[index].date_add,allMCRData[index].blockNumber);
    }

    function getlastMCRPerc() constant returns(uint val)
    {
        val = allMCRData[allMCRData.length-1].mcrPercx100;
    }
    function getLastVfull()constant returns(uint vf)
    {
        vf = allMCRData[allMCRData.length-1].vFull;
    }
    function getLastMCREtherFull()constant returns(uint val)
    {
        val = allMCRData[allMCRData.length-1].mcrEtherx100;
    }
    

    
}
