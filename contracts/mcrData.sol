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

pragma solidity ^0.4.24;

import "./NXMaster.sol";
import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMaths.sol";


contract MCRData is Iupgradable {

    using SafeMaths
    for uint;

    NXMaster ms;
    address masterAddress;
    uint32 public minMCRReq;
    uint32 public sfX100000;
    uint32 public growthStep;
    uint16 public minCap;
    uint64 public mcrFailTime;
    uint16 public shockParameter;
    uint64 mcrTime;
    bytes4[] allCurrencies;

    struct mcr_Data {
        uint32 mcrPercx100;
        uint32 mcrEtherx100;
        uint64 vFull; //Pool1 funds
        uint64 date;
    }

    mcr_Data[] public allMCRData;
    mapping(bytes8 => uint32) public allCurr3DaysAvg;
    address notariseMCR;

    function MCRData() {
        growthStep = 1500000;
        sfX100000 = 140;
        mcrTime = SafeMaths.mul64(SafeMaths.mul64(24, 60), 60);
        mcrFailTime = SafeMaths.mul64(6, 3600);
        minMCRReq = 0;
        allMCRData.push(mcr_Data(0, 0, 0, 0));
        minCap = 1;
        shockParameter = 50;
    }

    function changeMasterAddress(address _add) {
        if (masterAddress == 0x000) {
            masterAddress = _add;
            ms = NXMaster(masterAddress);
        } else {
            ms = NXMaster(masterAddress);
            require(ms.isInternal(msg.sender) == true);
            masterAddress = _add;
        }
    }

    function changeDependentContractAddress() onlyInternal {

    }

    modifier onlyInternal {

        require(ms.isInternal(msg.sender) == true);
        _;
    }

    modifier onlyOwner {

        require(ms.isOwner(msg.sender) == true);
        _;
    }

    /// @dev Changes address allowed to post MCR.
    function changeNotariseAdd(address _add) onlyInternal {
        notariseMCR = _add;
    }

    /// @dev Checks whether a given address can notaise MCR data or not.
    /// @param _add Address.
    /// @return res Returns 0 if address is not authorized, else 1.
    function isnotarise(address _add) constant returns(bool res) {
        res = false;
        if (_add == notariseMCR)
            res = true;
    }

    /// @dev Sets minimum Cap.
    function changeMinCap(uint16 newCap) onlyOwner {
        minCap = newCap;
    }

    /// @dev Sets Shock Parameter.
    function changeShockParameter(uint16 newParam) onlyOwner {
        shockParameter = newParam;
    }

    /// @dev Changes Growth Step
    function changeGrowthStep(uint32 newGS) onlyOwner {
        growthStep = newGS;
    }

    /// @dev Gets Scaling Factor.
    function getSFx100000() constant returns(uint32 sf) {
        sf = sfX100000;
    }

    /// @dev Gets Growth Step
    function getGrowthStep() constant returns(uint32 gs) {
        gs = growthStep;
    }

    /// @dev Gets minimum Cap.
    function getMinCap() constant returns(uint16 _minCap) {
        _minCap = minCap;
    }

    /// @dev Gets Shock Parameter.
    function getShockParameter() constant returns(uint16 _shock) {
        _shock = shockParameter;
    }

    /// @dev Changes time period for obtaining new MCR data from external oracle query.
    function changeMCRTime(uint64 _time) onlyInternal {
        mcrTime = _time;
    }

    /// @dev Sets MCR Fail time.
    function changeMCRFailTime(uint64 _time) onlyInternal {
        mcrFailTime = _time;
    }

    /// @dev Gets time interval after which MCR calculation is initiated.
    function getMCRTime() constant returns(uint64 _time) {
        _time = mcrTime;
    }

    /// @dev Gets MCR Fail time.
    function getMCRFailTime() constant returns(uint64 _time) {
        _time = mcrFailTime;
    }

    /// @dev Changes minimum value of MCR required for the system to be working.
    function changeMinReqMCR(uint32 minMCR) onlyInternal {
        minMCRReq = minMCR;
    }

    /// @dev Gets minimum  value of MCR required.
    function getMinMCR() constant returns(uint32 MCR) {
        MCR = minMCRReq;
    }

    /// @dev Stores name of currency accepted in the system.
    /// @param curr Currency Name.
    function addCurrency(bytes4 curr) onlyInternal {
        allCurrencies.push(curr);
    }

    /// @dev Gets name of all the currencies accepted in the system.
    /// @return curr Array of currency's name.
    function getAllCurrencies() constant returns(bytes4[] curr) {
        return allCurrencies;
    }

    /// @dev Changes scaling factor.
    function changeSF(uint32 val) onlyInternal {
        sfX100000 = val;
    }

    /// @dev Gets the total number of times MCR calculation has been made.
    function getMCRDataLength() constant returns(uint len) {
        len = allMCRData.length;
    }

    /// @dev Adds details of (Minimum Capital Requirement)MCR.
    /// @param mcrp Minimum Capital Requirement percentage (MCR% * 100 ,Ex:for 54.56% ,given 5456)
    /// @param vf Pool1 fund value in Ether used in the last full daily calculation from the Capital model.
    function pushMCRData(uint32 mcrp, uint32 mcre, uint64 vf, uint64 time) onlyInternal {
        allMCRData.push(mcr_Data(mcrp, mcre, vf, time));
    }

    /// @dev Gets number of currencies that the system accepts.
    function getCurrLength() constant returns(uint16 len) {
        len = uint16(allCurrencies.length);
    }

    /// @dev Gets name of currency at a given index.
    function getCurrencyByIndex(uint16 index) constant returns(bytes4 curr) {
        curr = allCurrencies[index];
    }

    /// @dev Updates the 3 day average rate of a currency.
    ///      To be replaced by MakeDaos on chain rates
    /// @param curr Currency Name.
    /// @param rate Average exchange rate X 100 (of last 3 days).
    function updateCurr3DaysAvg(bytes4 curr, uint32 rate) onlyInternal {
        allCurr3DaysAvg[curr] = rate;
    }

    /// @dev Gets the average rate of a currency.
    /// @param curr Currency Name.
    /// @return rate Average rate X 100(of last 3 days).
    function getCurr3DaysAvg(bytes8 curr) constant returns(uint32 rate) {
        rate = allCurr3DaysAvg[curr];
    }

    /// @dev Gets the details of last added MCR.
    /// @return mcrPercx100 Total Minimum Capital Requirement percentage of that month of year(multiplied by 100).
    /// @return vFull Total Pool1 fund value in Ether used in the last full daily calculation.
    function getLastMCR() constant returns(uint32 mcrPercx100, uint32 mcrEtherx100, uint64 vFull, uint64 date) {
        return (
            allMCRData[SafeMaths.sub(allMCRData.length, 1)].mcrPercx100,
            allMCRData[SafeMaths.sub(allMCRData.length, 1)].mcrEtherx100,
            allMCRData[SafeMaths.sub(allMCRData.length, 1)].vFull,
            allMCRData[SafeMaths.sub(allMCRData.length, 1)].date
            );
    }

    /// @dev Gets last Minimum Capital Requirement percentage of Capital Model
    /// @return val MCR% value,multiplied by 100.
    function getLastMCRPerc() constant returns(uint32 val) {
        val = allMCRData[SafeMaths.sub(allMCRData.length, 1)].mcrPercx100;
    }

    /// @dev Gets last Ether price of Capital Model
    /// @return val ether value,multiplied by 100.
    function getLastMCREther() constant returns(uint32 val) {
        val = allMCRData[SafeMaths.sub(allMCRData.length, 1)].mcrEtherx100;
    }

    /// @dev Gets Pool1 fund value in Ether used in the last full daily calculation from the Capital model.
    function getLastVfull() constant returns(uint64 vf) {
        vf = allMCRData[SafeMaths.sub(allMCRData.length, 1)].vFull;
    }

    /// @dev Gets last Minimum Capital Requirement in Ether.
    /// @return date of MCR.
    function getLastMCRDate() constant returns(uint64 date) {
        date = allMCRData[SafeMaths.sub(allMCRData.length, 1)].date;
    }

    /// @dev Gets details for token price calculation.
    function getTokenPriceDetails(bytes4 curr) constant returns(uint32 sf, uint32 gs, uint32 rate) {
        sf = sfX100000;
        gs = growthStep;
        rate = allCurr3DaysAvg[curr];
    }
}
