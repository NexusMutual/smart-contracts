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

pragma solidity 0.4.24;

import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMath.sol";


contract DSValue {
    function peek() public view returns (bytes32, bool);
    function read() public view returns (bytes32);
}


contract PoolData is Iupgradable {
    using SafeMath for uint;

    struct ApiId {
        bytes4 typeOf;
        bytes4 currency;
        uint id;
        uint64 dateAdd;
        uint64 dateUpd;
    }

    struct CurrencyAssets {
        address currAddress;
        uint baseMin;
        uint varMin;
    }

    struct InvestmentAssets {
        address currAddress;
        bool status;
        uint64 minHoldingPercX100;
        uint64 maxHoldingPercX100;
        uint8 decimals;
    }

    struct IARankDetails {
        bytes4 maxIACurr;
        uint64 maxRate;
        bytes4 minIACurr;
        uint64 minRate;
    }

    struct McrData {
        uint mcrPercx100;
        uint mcrEther;
        uint vFull; //Pool funds
        uint64 date;
    }

    IARankDetails[] internal allIARankDetails;
    McrData[] public allMCRData;

    bytes4[] internal allInvestmentCurrencies;
    bytes4[] internal allCurrencies;
    bytes32[] public allAPIcall;
    mapping(bytes32 => ApiId) public allAPIid;
    mapping(uint64 => uint) internal datewiseId;
    mapping(bytes16 => uint) internal currencyLastIndex;
    mapping(bytes4 => CurrencyAssets) internal allCurrencyAssets;
    mapping(bytes4 => InvestmentAssets) internal allInvestmentAssets;
    mapping(bytes4 => uint) internal caAvgRate;
    mapping(bytes4 => uint) internal iaAvgRate;

    address public notariseMCR;
    address public daiFeedAddress;
    uint private constant DECIMAL1E18 = uint(10) ** 18;
    uint public uniswapDeadline;
    uint public liquidityTradeCallbackTime;
    uint public lastLiquidityTradeTrigger;
    uint64 internal lastDate;
    uint public variationPercX100;
    uint public iaRatesTime;
    uint public minCap;
    uint public mcrTime;
    uint public a;
    uint public shockParameter;
    uint public c;
    uint public mcrFailTime; 
    uint public ethVolumeLimit;
    uint public capReached;
    uint public capacityLimit;
    
    constructor(address _notariseAdd, address _daiFeedAdd, address _daiAdd) public {
        notariseMCR = _notariseAdd;
        daiFeedAddress = _daiFeedAdd;
        c = 5203349;
        a = 1948;
        mcrTime = 24 hours;
        mcrFailTime = 6 hours;
        allMCRData.push(McrData(0, 0, 0, 0));
        minCap = DECIMAL1E18;
        shockParameter = 50;
        variationPercX100 = 100; //1%
        iaRatesTime = 24 hours; //24 hours in seconds
        uniswapDeadline = 20 minutes;
        liquidityTradeCallbackTime = 4 hours;
        ethVolumeLimit = 4;
        capacityLimit = 10;
        allCurrencies.push("ETH");
        allCurrencyAssets["ETH"] = CurrencyAssets(address(0), 6 * DECIMAL1E18, 0);
        allCurrencies.push("DAI");
        allCurrencyAssets["DAI"] = CurrencyAssets(_daiAdd, 7 * DECIMAL1E18, 0);
        allInvestmentCurrencies.push("ETH");
        allInvestmentAssets["ETH"] = InvestmentAssets(address(0), true, 500, 5000, 18);
        allInvestmentCurrencies.push("DAI");
        allInvestmentAssets["DAI"] = InvestmentAssets(_daiAdd, true, 500, 5000, 18);
    }

    /**
     * @dev to set the maximum cap allowed 
     * @param val is the new value
     */
    function setCapReached(uint val) external onlyInternal {
        capReached = val;
    }
    
    /// @dev Updates the 3 day average rate of a IA currency.
    /// To be replaced by MakerDao's on chain rates
    /// @param curr IA Currency Name.
    /// @param rate Average exchange rate X 100 (of last 3 days).
    function updateIAAvgRate(bytes4 curr, uint rate) external onlyInternal {
        iaAvgRate[curr] = rate;
    }

    /// @dev Updates the 3 day average rate of a CA currency.
    /// To be replaced by MakerDao's on chain rates
    /// @param curr Currency Name.
    /// @param rate Average exchange rate X 100 (of last 3 days).
    function updateCAAvgRate(bytes4 curr, uint rate) external onlyInternal {
        caAvgRate[curr] = rate;
    }

    /// @dev Adds details of (Minimum Capital Requirement)MCR.
    /// @param mcrp Minimum Capital Requirement percentage (MCR% * 100 ,Ex:for 54.56% ,given 5456)
    /// @param vf Pool fund value in Ether used in the last full daily calculation from the Capital model.
    function pushMCRData(uint mcrp, uint mcre, uint vf, uint64 time) external onlyInternal {
        allMCRData.push(McrData(mcrp, mcre, vf, time));
    }

    /** 
     * @dev Updates the Timestamp at which result of oracalize call is received.
     */  
    function updateDateUpdOfAPI(bytes32 myid) external onlyInternal {
        allAPIid[myid].dateUpd = uint64(now);
    }

    /** 
     * @dev Saves the details of the Oraclize API.
     * @param myid Id return by the oraclize query.
     * @param _typeof type of the query for which oraclize call is made.
     * @param id ID of the proposal,quote,cover etc. for which oraclize call is made 
     */  
    function saveApiDetails(bytes32 myid, bytes4 _typeof, uint id) external onlyInternal {
        allAPIid[myid] = ApiId(_typeof, "", id, uint64(now), uint64(now));
    }

    /** 
     * @dev Stores the id return by the oraclize query. 
     * Maintains record of all the Ids return by oraclize query.
     * @param myid Id return by the oraclize query.
     */  
    function addInAllApiCall(bytes32 myid) external onlyInternal {
        allAPIcall.push(myid);
    }
    
    /**
     * @dev Saves investment asset rank details.
     * @param maxIACurr Maximum ranked investment asset currency.
     * @param maxRate Maximum ranked investment asset rate.
     * @param minIACurr Minimum ranked investment asset currency.
     * @param minRate Minimum ranked investment asset rate.
     * @param date in yyyymmdd.
     */  
    function saveIARankDetails(
        bytes4 maxIACurr,
        uint64 maxRate,
        bytes4 minIACurr,
        uint64 minRate,
        uint64 date
    )
        external
        onlyInternal
    {
        allIARankDetails.push(IARankDetails(maxIACurr, maxRate, minIACurr, minRate));
        datewiseId[date] = allIARankDetails.length.sub(1);
    }

    /**
     * @dev to get the time for the laste liquidity trade trigger
     */
    function setLastLiquidityTradeTrigger() external onlyInternal {
        lastLiquidityTradeTrigger = now;
    }

    /** 
     * @dev Updates Last Date.
     */  
    function updatelastDate(uint64 newDate) external onlyInternal {
        lastDate = newDate;
    }

    /**
     * @dev Adds currency asset currency. 
     * @param curr currency of the asset
     * @param currAddress address of the currency
     * @param baseMin base minimum in 10^18. 
     */  
    function addCurrencyAssetCurrency(
        bytes4 curr,
        address currAddress,
        uint baseMin
    ) 
        external
    {
        require(ms.checkIsAuthToGoverned(msg.sender));
        allCurrencies.push(curr);
        allCurrencyAssets[curr] = CurrencyAssets(currAddress, baseMin, 0);
    }
    
    /**
     * @dev Adds investment asset. 
     */  
    function addInvestmentAssetCurrency(
        bytes4 curr,
        address currAddress,
        bool status,
        uint64 minHoldingPercX100,
        uint64 maxHoldingPercX100,
        uint8 decimals
    ) 
        external
    {
        require(ms.checkIsAuthToGoverned(msg.sender));
        allInvestmentCurrencies.push(curr);
        allInvestmentAssets[curr] = InvestmentAssets(currAddress, status,
            minHoldingPercX100, maxHoldingPercX100, decimals);
    }

    /**
     * @dev Changes base minimum of a given currency asset.
     */ 
    function changeCurrencyAssetBaseMin(bytes4 curr, uint baseMin) external {
        require(ms.checkIsAuthToGoverned(msg.sender));
        allCurrencyAssets[curr].baseMin = baseMin;
    }

    /**
     * @dev changes variable minimum of a given currency asset.
     */  
    function changeCurrencyAssetVarMin(bytes4 curr, uint varMin) external onlyInternal {
        allCurrencyAssets[curr].varMin = varMin;
    }

    /** 
     * @dev Changes the investment asset status.
     */ 
    function changeInvestmentAssetStatus(bytes4 curr, bool status) external {
        require(ms.checkIsAuthToGoverned(msg.sender));
        allInvestmentAssets[curr].status = status;
    }

    /** 
     * @dev Changes the investment asset Holding percentage of a given currency.
     */
    function changeInvestmentAssetHoldingPerc(
        bytes4 curr,
        uint64 minPercX100,
        uint64 maxPercX100
    )
        external
    {
        require(ms.checkIsAuthToGoverned(msg.sender));
        allInvestmentAssets[curr].minHoldingPercX100 = minPercX100;
        allInvestmentAssets[curr].maxHoldingPercX100 = maxPercX100;
    }

    /**
     * @dev Gets Currency asset token address. 
     */  
    function changeCurrencyAssetAddress(bytes4 curr, address currAdd) external {
        require(ms.checkIsAuthToGoverned(msg.sender));
        allCurrencyAssets[curr].currAddress = currAdd;
    }

    /**
     * @dev Changes Investment asset token address.
     */ 
    function changeInvestmentAssetAddressAndDecimal(
        bytes4 curr,
        address currAdd,
        uint8 newDecimal
    )
        external
    {
        require(ms.checkIsAuthToGoverned(msg.sender));
        allInvestmentAssets[curr].currAddress = currAdd;
        allInvestmentAssets[curr].decimals = newDecimal;
    }

    /// @dev Changes address allowed to post MCR.
    function changeNotariseAddress(address _add) external onlyInternal {
        notariseMCR = _add;
    }

    /// @dev updates daiFeedAddress address.
    /// @param _add address of DAI feed.
    function changeDAIfeedAddress(address _add) external onlyInternal {
        daiFeedAddress = _add;
    }

    /**
     * @dev Gets Uint Parameters of a code
     * @param code whose details we want
     * @return string value of the code
     * @return associated amount (time or perc or value) to the code
     */
    function getUintParameters(bytes8 code) external view returns(bytes8 codeVal, uint val) {
        codeVal = code;
        if (code == "MCRTIM") {
            val = mcrTime / (1 hours);

        } else if (code == "MCRFTIM") {

            val = mcrFailTime / (1 hours);

        } else if (code == "MCRMIN") {

            val = minCap;

        } else if (code == "MCRSHOCK") {

            val = shockParameter;

        } else if (code == "MCRCAPL") {

            val = capacityLimit;

        } else if (code == "IMZ") {

            val = variationPercX100;

        } else if (code == "IMRATET") {

            val = iaRatesTime / (1 hours);

        } else if (code == "IMUNIDL") {

            val = uniswapDeadline / (1 minutes);

        } else if (code == "IMLIQT") {

            val = liquidityTradeCallbackTime / (1 hours);

        } else if (code == "IMETHVL") {

            val = ethVolumeLimit;

        } else if (code == "C") {
            val = c;

        } else if (code == "A") {

            val = a;

        }
            
    }
 
    /// @dev Checks whether a given address can notaise MCR data or not.
    /// @param _add Address.
    /// @return res Returns 0 if address is not authorized, else 1.
    function isnotarise(address _add) external view returns(bool res) {
        res = false;
        if (_add == notariseMCR)
            res = true;
    }

    /// @dev Gets the details of last added MCR.
    /// @return mcrPercx100 Total Minimum Capital Requirement percentage of that month of year(multiplied by 100).
    /// @return vFull Total Pool fund value in Ether used in the last full daily calculation.
    function getLastMCR() external view returns(uint mcrPercx100, uint mcrEtherx100, uint vFull, uint64 date) {
        uint index = allMCRData.length.sub(1);
        return (
            allMCRData[index].mcrPercx100,
            allMCRData[index].mcrEther,
            allMCRData[index].vFull,
            allMCRData[index].date
        );
    }

    /// @dev Gets last Minimum Capital Requirement percentage of Capital Model
    /// @return val MCR% value,multiplied by 100.
    function getLastMCRPerc() external view returns(uint) {
        return allMCRData[allMCRData.length.sub(1)].mcrPercx100;
    }

    /// @dev Gets last Ether price of Capital Model
    /// @return val ether value,multiplied by 100.
    function getLastMCREther() external view returns(uint) {
        return allMCRData[allMCRData.length.sub(1)].mcrEther;
    }

    /// @dev Gets Pool fund value in Ether used in the last full daily calculation from the Capital model.
    function getLastVfull() external view returns(uint) {
        return allMCRData[allMCRData.length.sub(1)].vFull;
    }

    /// @dev Gets last Minimum Capital Requirement in Ether.
    /// @return date of MCR.
    function getLastMCRDate() external view returns(uint64 date) {
        date = allMCRData[allMCRData.length.sub(1)].date;
    }

    /// @dev Gets details for token price calculation.
    function getTokenPriceDetails(bytes4 curr) external view returns(uint _a, uint _c, uint rate) {
        _a = a;
        _c = c;
        rate = _getAvgRate(curr, false);
    }
    
    /// @dev Gets the total number of times MCR calculation has been made.
    function getMCRDataLength() external view returns(uint len) {
        len = allMCRData.length;
    }
 
    /**
     * @dev Gets investment asset rank details by given date.
     */  
    function getIARankDetailsByDate(
        uint64 date
    )
        external
        view
        returns(
            bytes4 maxIACurr,
            uint64 maxRate,
            bytes4 minIACurr,
            uint64 minRate
        )
    {
        uint index = datewiseId[date];
        return (
            allIARankDetails[index].maxIACurr,
            allIARankDetails[index].maxRate,
            allIARankDetails[index].minIACurr,
            allIARankDetails[index].minRate
        );
    }

    /** 
     * @dev Gets Last Date.
     */ 
    function getLastDate() external view returns(uint64 date) {
        return lastDate;
    }

    /**
     * @dev Gets investment currency for a given index.
     */  
    function getInvestmentCurrencyByIndex(uint index) external view returns(bytes4 currName) {
        return allInvestmentCurrencies[index];
    }

    /**
     * @dev Gets count of investment currency.
     */  
    function getInvestmentCurrencyLen() external view returns(uint len) {
        return allInvestmentCurrencies.length;
    }

    /**
     * @dev Gets all the investment currencies.
     */ 
    function getAllInvestmentCurrencies() external view returns(bytes4[] currencies) {
        return allInvestmentCurrencies;
    }

    /**
     * @dev Gets All currency for a given index.
     */  
    function getCurrenciesByIndex(uint index) external view returns(bytes4 currName) {
        return allCurrencies[index];
    }

    /** 
     * @dev Gets count of All currency.
     */  
    function getAllCurrenciesLen() external view returns(uint len) {
        return allCurrencies.length;
    }

    /**
     * @dev Gets all currencies 
     */  
    function getAllCurrencies() external view returns(bytes4[] currencies) {
        return allCurrencies;
    }

    /**
     * @dev Gets currency asset details for a given currency.
     */  
    function getCurrencyAssetVarBase(
        bytes4 curr
    )
        external
        view
        returns(
            bytes4 currency,
            uint baseMin,
            uint varMin
        )
    {
        return (
            curr,
            allCurrencyAssets[curr].baseMin,
            allCurrencyAssets[curr].varMin
        );
    }

    /**
     * @dev Gets minimum variable value for currency asset.
     */  
    function getCurrencyAssetVarMin(bytes4 curr) external view returns(uint varMin) {
        return allCurrencyAssets[curr].varMin;
    }

    /** 
     * @dev Gets base minimum of  a given currency asset.
     */  
    function getCurrencyAssetBaseMin(bytes4 curr) external view returns(uint baseMin) {
        return allCurrencyAssets[curr].baseMin;
    }

    /** 
     * @dev Gets investment asset maximum and minimum holding percentage of a given currency.
     */  
    function getInvestmentAssetHoldingPerc(
        bytes4 curr
    )
        external
        view
        returns(
            uint64 minHoldingPercX100,
            uint64 maxHoldingPercX100
        )
    {
        return (
            allInvestmentAssets[curr].minHoldingPercX100,
            allInvestmentAssets[curr].maxHoldingPercX100
        );
    }

    /** 
     * @dev Gets investment asset decimals.
     */  
    function getInvestmentAssetDecimals(bytes4 curr) external view returns(uint8 decimal) {
        return allInvestmentAssets[curr].decimals;
    }

    /**
     * @dev Gets investment asset maximum holding percentage of a given currency.
     */  
    function getInvestmentAssetMaxHoldingPerc(bytes4 curr) external view returns(uint64 maxHoldingPercX100) {
        return allInvestmentAssets[curr].maxHoldingPercX100;
    }

    /**
     * @dev Gets investment asset minimum holding percentage of a given currency.
     */  
    function getInvestmentAssetMinHoldingPerc(bytes4 curr) external view returns(uint64 minHoldingPercX100) {
        return allInvestmentAssets[curr].minHoldingPercX100;
    }

    /** 
     * @dev Gets investment asset details of a given currency
     */  
    function getInvestmentAssetDetails(
        bytes4 curr
    )
        external
        view
        returns(
            bytes4 currency,
            address currAddress,
            bool status,
            uint64 minHoldingPerc,
            uint64 maxHoldingPerc,
            uint8 decimals
        )
    {
        return (
            curr,
            allInvestmentAssets[curr].currAddress,
            allInvestmentAssets[curr].status,
            allInvestmentAssets[curr].minHoldingPercX100,
            allInvestmentAssets[curr].maxHoldingPercX100,
            allInvestmentAssets[curr].decimals
        );
    }

    /**
     * @dev Gets Currency asset token address.
     */  
    function getCurrencyAssetAddress(bytes4 curr) external view returns(address) {
        return allCurrencyAssets[curr].currAddress;
    }

    /**
     * @dev Gets investment asset token address.
     */  
    function getInvestmentAssetAddress(bytes4 curr) external view returns(address) {
        return allInvestmentAssets[curr].currAddress;
    }

    /**
     * @dev Gets investment asset active Status of a given currency.
     */  
    function getInvestmentAssetStatus(bytes4 curr) external view returns(bool status) {
        return allInvestmentAssets[curr].status;
    }

    /** 
     * @dev Gets type of oraclize query for a given Oraclize Query ID.
     * @param myid Oraclize Query ID identifying the query for which the result is being received.
     * @return _typeof It could be of type "quote","quotation","cover","claim" etc.
     */  
    function getApiIdTypeOf(bytes32 myid) external view returns(bytes4) {
        return allAPIid[myid].typeOf;
    }

    /** 
     * @dev Gets ID associated to oraclize query for a given Oraclize Query ID.
     * @param myid Oraclize Query ID identifying the query for which the result is being received.
     * @return id1 It could be the ID of "proposal","quotation","cover","claim" etc.
     */  
    function getIdOfApiId(bytes32 myid) external view returns(uint) {
        return allAPIid[myid].id;
    }

    /** 
     * @dev Gets the Timestamp of a oracalize call.
     */  
    function getDateAddOfAPI(bytes32 myid) external view returns(uint64) {
        return allAPIid[myid].dateAdd;
    }

    /**
     * @dev Gets the Timestamp at which result of oracalize call is received.
     */  
    function getDateUpdOfAPI(bytes32 myid) external view returns(uint64) {
        return allAPIid[myid].dateUpd;
    }

    /** 
     * @dev Gets currency by oracalize id. 
     */  
    function getCurrOfApiId(bytes32 myid) external view returns(bytes4) {
        return allAPIid[myid].currency;
    }

    /**
     * @dev Gets ID return by the oraclize query of a given index.
     * @param index Index.
     * @return myid ID return by the oraclize query.
     */  
    function getApiCallIndex(uint index) external view returns(bytes32 myid) {
        myid = allAPIcall[index];
    }

    /**
     * @dev Gets Length of API call. 
     */  
    function getApilCallLength() external view returns(uint) {
        return allAPIcall.length;
    }
    
    /**
     * @dev Get Details of Oraclize API when given Oraclize Id.
     * @param myid ID return by the oraclize query.
     * @return _typeof ype of the query for which oraclize 
     * call is made.("proposal","quote","quotation" etc.) 
     */  
    function getApiCallDetails(
        bytes32 myid
    )
        external
        view
        returns(
            bytes4 _typeof,
            bytes4 curr,
            uint id,
            uint64 dateAdd,
            uint64 dateUpd
        )
    {
        return (
            allAPIid[myid].typeOf,
            allAPIid[myid].currency,
            allAPIid[myid].id,
            allAPIid[myid].dateAdd,
            allAPIid[myid].dateUpd
        );
    }

    /**
     * @dev Updates Uint Parameters of a code
     * @param code whose details we want to update
     * @param val value to set
     */
    function updateUintParameters(bytes8 code, uint val) public {
        require(ms.checkIsAuthToGoverned(msg.sender));
        if (code == "MCRTIM") {
            _changeMCRTime(val * 1 hours);

        } else if (code == "MCRFTIM") {

            _changeMCRFailTime(val * 1 hours);

        } else if (code == "MCRMIN") {

            _changeMinCap(val);

        } else if (code == "MCRSHOCK") {

            _changeShockParameter(val);

        } else if (code == "MCRCAPL") {

            _changeCapacityLimit(val);

        } else if (code == "IMZ") {

            _changeVariationPercX100(val);

        } else if (code == "IMRATET") {

            _changeIARatesTime(val * 1 hours);

        } else if (code == "IMUNIDL") {

            _changeUniswapDeadlineTime(val * 1 minutes);

        } else if (code == "IMLIQT") {

            _changeliquidityTradeCallbackTime(val * 1 hours);

        } else if (code == "IMETHVL") {

            _setEthVolumeLimit(val);

        } else if (code == "C") {
            _changeC(val);

        } else if (code == "A") {

            _changeA(val);

        } else {
            revert("Invalid param code");
        }
            
    }

    /**
     * @dev to get the average rate of currency rate 
     * @param curr is the currency in concern
     * @return required rate
     */
    function getCAAvgRate(bytes4 curr) public view returns(uint rate) {
        return _getAvgRate(curr, false);
    }

    /**
     * @dev to get the average rate of investment rate 
     * @param curr is the investment in concern
     * @return required rate
     */
    function getIAAvgRate(bytes4 curr) public view returns(uint rate) {
        return _getAvgRate(curr, true);
    }

    function changeDependentContractAddress() public onlyInternal {}

    /// @dev Gets the average rate of a CA currency.
    /// @param curr Currency Name.
    /// @return rate Average rate X 100(of last 3 days).
    function _getAvgRate(bytes4 curr, bool isIA) internal view returns(uint rate) {
        if (curr == "DAI") {
            DSValue ds = DSValue(daiFeedAddress);
            rate = uint(ds.read()).div(uint(10) ** 16);
        } else if (isIA) {
            rate = iaAvgRate[curr];
        } else {
            rate = caAvgRate[curr];
        }
    }

    /**
     * @dev to set the ethereum volume limit 
     * @param val is the new limit value
     */
    function _setEthVolumeLimit(uint val) internal {
        ethVolumeLimit = val;
    }

    /// @dev Sets minimum Cap.
    function _changeMinCap(uint newCap) internal {
        minCap = newCap;
    }

    /// @dev Sets Shock Parameter.
    function _changeShockParameter(uint newParam) internal {
        shockParameter = newParam;
    }
    
    /// @dev Changes time period for obtaining new MCR data from external oracle query.
    function _changeMCRTime(uint _time) internal {
        mcrTime = _time;
    }

    /// @dev Sets MCR Fail time.
    function _changeMCRFailTime(uint _time) internal {
        mcrFailTime = _time;
    }

    /**
     * @dev to change the uniswap deadline time 
     * @param newDeadline is the value
     */
    function _changeUniswapDeadlineTime(uint newDeadline) internal {
        uniswapDeadline = newDeadline;
    }

    /**
     * @dev to change the liquidity trade call back time 
     * @param newTime is the new value to be set
     */
    function _changeliquidityTradeCallbackTime(uint newTime) internal {
        liquidityTradeCallbackTime = newTime;
    }

    /**
     * @dev Changes time after which investment asset rates need to be fed.
     */  
    function _changeIARatesTime(uint _newTime) internal {
        iaRatesTime = _newTime;
    }
    
    /**
     * @dev Changes the variation range percentage.
     */  
    function _changeVariationPercX100(uint newPercX100) internal {
        variationPercX100 = newPercX100;
    }

    /// @dev Changes Growth Step
    function _changeC(uint newC) internal {
        c = newC;
    }

    /// @dev Changes scaling factor.
    function _changeA(uint val) internal {
        a = val;
    }
    
    /**
     * @dev to change the capacity limit 
     * @param val is the new value
     */
    function _changeCapacityLimit(uint val) internal {
        capacityLimit = val;
    }    
}
