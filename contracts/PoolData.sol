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


contract PoolData is Iupgradable {
    using SafeMath for uint;

    bytes8[] internal allInvestmentCurrencies;
    bytes8[] internal allCurrencies;
    
    bytes32[] public allAPIcall;

    struct ApiId {
        bytes8 typeOf;
        bytes4 currency;
        uint id;
        uint64 dateAdd;
        uint64 dateUpd;
    }

    mapping(bytes32 => ApiId) public allAPIid;

    struct CurrencyAssets {
        uint64 baseMin;
        uint64 varMin;
    }

    struct InvestmentAssets {
        address currAddress;
        uint8 status; //1 for active,0 for inactive
        uint64 minHoldingPercX100;
        uint64 maxHoldingPercX100;
        uint8 decimals;
    }

    struct IARankDetails {
        bytes8 maxIACurr;
        uint64 maxRate;
        bytes8 minIACurr;
        uint64 minRate;
    }

    constructor() public {
        variationPercX100 = 100; //1%
        // ordersExpirationTime["ELT"] = 12 hours; // Excess liquidity trade order time 12 hours
        // ordersExpirationTime["ILT"] = 6 hours; // Insufficient liquidity trade order time 6 hours
        // ordersExpirationTime["RBT"] = 20 hours; // Rebalancing trade order time 20 hours
        iaRatesTime = 24 hours; //24 hours in seconds
    }

    IARankDetails[] internal allIARankDetails;
    mapping(uint64 => uint) internal datewiseId;
    mapping(bytes16 => uint) internal currencyLastIndex;
    uint64 internal lastDate;
    uint64 public variationPercX100;
    mapping(bytes8 => InvestmentAssets) internal allCurrencyAssets;
    mapping(bytes8 => InvestmentAssets) internal allInvestmentAssets;
    mapping(bytes8 => CurrencyAssets) internal allCurrencyAssetsVarBase;
    uint64 internal iaRatesTime;
    // mapping(bytes16 => uint64) internal ordersExpirationTime;
    mapping(bytes8 => mapping(bytes16 => uint8)) internal liquidityOrderStatus;
    
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
    function saveApiDetails(bytes32 myid, bytes8 _typeof, uint id) external onlyInternal {
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
     * @dev updates liquidity order status.
     * @param orderType Excess Liquidity trade(ELT),
     * Insufficient Liquidity Trade(ILT),Rebalancing Trade(RBT).
     */  
    function updateLiquidityOrderStatus(
        bytes8 curr,
        bytes16 orderType,
        uint8 active
    )
        external
        onlyInternal
    {
        liquidityOrderStatus[curr][orderType] = active;
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
        bytes8 maxIACurr,
        uint64 maxRate,
        bytes8 minIACurr,
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
     * @dev Changes time after which investment asset rates need to be fed.
     */  
    function changeIARatesTime(uint64 _newTime) external onlyInternal {
        iaRatesTime = _newTime;
    }

    /** 
     * @dev Sets Last index for given currency.
     */ 
    function setCurrencyLastIndex(bytes16 curr, uint index) external onlyInternal {
        currencyLastIndex[curr] = index;
    }
    
    /** 
     * @dev Updates Last Date.
     */  
    function updatelastDate(uint64 newDate) external onlyInternal {
        lastDate = newDate;
    }
 
    /** 
     * @dev Saves Rate Id for a given date.
     */  
    function saveRateIdByDate(uint64 date, uint index) external onlyInternal {
        datewiseId[date] = index;
    }
    
    /**
     * @dev Adds investment currency. 
     */  
    function addInvestmentCurrency(bytes8 curr) external onlyInternal {
        allInvestmentCurrencies.push(curr);
    }
    
    /**
     * @dev Changes the variation range percentage.
     */  
    function changeVariationPercX100(uint64 newPercX100) external onlyInternal {
        variationPercX100 = newPercX100;
    }

    /**
     * @dev Adds All currency.
     */  
    function addAllCurrencies(bytes8 curr) external onlyInternal {
        allCurrencies.push(curr);
    }
    
    /**
     * @dev Changes base minimum of a given currency asset.
     */ 
    function changeCurrencyAssetBaseMin(bytes8 _curr, uint64 _baseMin) external onlyInternal {
        allCurrencyAssetsVarBase[_curr].baseMin = _baseMin;
    }

    /**
     * @dev changes variable minimum of a given currency asset.
     */  
    function changeCurrencyAssetVarMin(bytes8 _curr, uint64 _varMin) external onlyInternal {
        allCurrencyAssetsVarBase[_curr].varMin = _varMin;
    }
    
    /**
     * @dev Pushes currency asset details for a given currency.
     */  
    function pushCurrencyAssetsVarBase(bytes8 _curr, uint64 _baseMin) external onlyInternal {
        allCurrencyAssetsVarBase[_curr] = CurrencyAssets(_baseMin, 0);
        // _varMin is 0 initially.
    }

    /**  
     * @dev pushes investment asset details.
     * @param _curr currency name.
     * @param _currAddress currency address.
     * @param _status active/inactive.
     * @param _minHoldingPercX100 minimum holding percentage*100.
     * @param _maxHoldingPercX100 maximum holding percentage*100.
     * @param decimals in ERC20 token.
     */ 
    function pushInvestmentAssetsDetails(
        bytes8 _curr,
        address _currAddress,
        uint8 _status,
        uint64 _minHoldingPercX100,
        uint64 _maxHoldingPercX100,
        uint8 decimals
        )
        external
        onlyInternal
    {
        allInvestmentAssets[_curr] = InvestmentAssets(_currAddress, _status,
            _minHoldingPercX100, _maxHoldingPercX100, decimals);
    }

    /**
     * @dev Updates investment asset decimals.
     */  
    function updateInvestmentAssetDecimals(bytes8 _curr, uint8 _newDecimal) external onlyInternal {
        allInvestmentAssets[_curr].decimals = _newDecimal;
    }

    /** 
     * @dev Changes the investment asset status.
     */ 
    function changeInvestmentAssetStatus(bytes8 _curr, uint8 _status) external onlyInternal {
        require(ms.checkIsAuthToGoverned(msg.sender));
        allInvestmentAssets[_curr].status = _status;
    }

    /** 
     * @dev Changes the investment asset Holding percentage of a given currency.
     */
    function changeInvestmentAssetHoldingPerc(
        bytes8 _curr,
        uint64 _minPercX100,
        uint64 _maxPercX100
    )
        external
    {
        require(ms.checkIsAuthToGoverned(msg.sender));
        allInvestmentAssets[_curr].minHoldingPercX100 = _minPercX100;
        allInvestmentAssets[_curr].maxHoldingPercX100 = _maxPercX100;
    }

    /**
     * @dev Changes Investment asset token address.
     */ 
    function changeInvestmentAssetAddress(bytes8 _curr, address _currAdd) external onlyInternal {
        allInvestmentAssets[_curr].currAddress = _currAdd;
    }

    /**
     * @dev pushes investment asset details.
     * @param _curr currency name.
     * @param _currAddress currency address.
     * @param _status active/inactive.
     * @param _minHoldingPercX100 minimum holding percentage*100.
     * @param _maxHoldingPercX100 maximum holding percentage*100.
     * @param decimals in ERC20 token.
     */  
    function pushCurrencyAssetsDetails(
        bytes8 _curr,
        address _currAddress,
        uint8 _status,
        uint64 _minHoldingPercX100,
        uint64 _maxHoldingPercX100,
        uint8 decimals
    )
        external
        onlyInternal
    {
        allCurrencyAssets[_curr] = InvestmentAssets(_currAddress, _status,
            _minHoldingPercX100, _maxHoldingPercX100, decimals);
    }

    /**
     * @dev Updates Currency asset decimals.
     */  
    function updateCurrencyAssetDecimals(bytes8 _curr, uint8 _newDecimal) external onlyInternal {
        allCurrencyAssets[_curr].decimals = _newDecimal;
    }

    /**
     * @dev Changes the Currency asset status.
     */  
    function changeCurrencyAssetStatus(bytes8 _curr, uint8 _status) external onlyInternal {
        allCurrencyAssets[_curr].status = _status;
    }

    /**
     * @dev Gets Currency asset token address. 
     */  
    function changeCurrencyAssetAddress(bytes8 _curr, address _currAdd) external onlyInternal {
        allCurrencyAssets[_curr].currAddress = _currAdd;
    }
    
    /**
     * @dev Changes the Currency asset Holding percentage of a given currency.
     */  
    function changeCurrencyAssetHoldingPerc(
        bytes8 _curr,
        uint64 _minPercX100,
        uint64 _maxPercX100
    )
        external
        onlyInternal
    {
        allCurrencyAssets[_curr].minHoldingPercX100 = _minPercX100;
        allCurrencyAssets[_curr].maxHoldingPercX100 = _maxPercX100;
    }
        
    /** 
     * @dev Gets investment asset rank details by given index.
     */  
    function getIARankDetailsByIndex(
        uint index
    )
        external
        view
        returns(
            bytes8 maxIACurr,
            uint64 maxRate,
            bytes8 minIACurr,
            uint64 minRate
        )
    {
        return (
            allIARankDetails[index].maxIACurr,
            allIARankDetails[index].maxRate,
            allIARankDetails[index].minIACurr,
            allIARankDetails[index].minRate
        );
    }
    
    /**
     * @dev Gets liquidity order status.
     */ 
    function getLiquidityOrderStatus(bytes8 curr, bytes16 orderType) external view returns(uint8 active) {
        return liquidityOrderStatus[curr][orderType];
    }
    
    /**
     * @dev Gets time after which investment asset rates need to be fed.
     */  
    function getIARatesTime() external view returns(uint64 time) {
        return iaRatesTime;
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
            bytes8 maxIACurr,
            uint64 maxRate,
            bytes8 minIACurr,
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
     * @dev Gets index of investment asset details for a given date.
     */  
    function getIADetailsIndexByDate(uint64 date) external view returns(uint index) {
        return (datewiseId[date]);
    }

    /** 
     * @dev Gets Last index for given currency.
     */ 
    function getCurrencyLastIndex(bytes16 curr) external view returns(uint index) {
        return currencyLastIndex[curr];
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
    function getInvestmentCurrencyByIndex(uint64 index) external view returns(bytes8 currName) {
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
    function getAllInvestmentCurrencies() external view returns(bytes8[] currencies) {
        return allInvestmentCurrencies;
    }

    /**
     * @dev Gets All currency for a given index.
     */  
    function getAllCurrenciesByIndex(uint64 index) external view returns(bytes8 currName) {
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
    function getAllCurrencies() external view returns(bytes8[] currencies) {
        return allCurrencies;
    }

    /**
     * @dev Gets the variation range percentage.
     */  
    function getVariationPercX100() external view returns(uint64 variation) {
        return variationPercX100;
    }

    /**
     * @dev Gets currency asset details for a given currency.
     */  
    function getCurrencyAssetVarBase(
        bytes8 _curr
    )
        external
        view
        returns(
            bytes8 curr,
            uint64 baseMin,
            uint64 varMin
        )
    {
        return (
            _curr,
            allCurrencyAssetsVarBase[_curr].baseMin,
            allCurrencyAssetsVarBase[_curr].varMin
        );
    }

    /**
     * @dev Gets minimum variable value for currency asset.
     */  
    function getCurrencyAssetVarMin(bytes8 _curr) external view returns(uint64 varMin) {
        return allCurrencyAssetsVarBase[_curr].varMin;
    }

    /** 
     * @dev Gets base minimum of  a given currency asset.
     */  
    function getCurrencyAssetBaseMin(bytes8 _curr) external view returns(uint64 baseMin) {
        return allCurrencyAssetsVarBase[_curr].baseMin;
    }

    /** 
     * @dev Gets investment asset maximum and minimum holding percentage of a given currency.
     */  
    function getInvestmentAssetHoldingPerc(
        bytes8 _curr
    )
        external
        view
        returns(
            uint64 minHoldingPercX100,
            uint64 maxHoldingPercX100
        )
    {
        return (
            allInvestmentAssets[_curr].minHoldingPercX100,
            allInvestmentAssets[_curr].maxHoldingPercX100
        );
    }

    /** 
     * @dev Gets investment asset decimals.
     */  
    function getInvestmentAssetDecimals(bytes8 _curr) external view returns(uint8 decimal) {
        return allInvestmentAssets[_curr].decimals;
    }

    /**
     * @dev Gets investment asset maximum holding percentage of a given currency.
     */  
    function getInvestmentAssetMaxHoldingPerc(bytes8 _curr) external view returns(uint64 maxHoldingPercX100) {
        return allInvestmentAssets[_curr].maxHoldingPercX100;
    }

    /**
     * @dev Gets investment asset minimum holding percentage of a given currency.
     */  
    function getInvestmentAssetMinHoldingPerc(bytes8 _curr) external view returns(uint64 minHoldingPercX100) {
        return allInvestmentAssets[_curr].minHoldingPercX100;
    }

    /** 
     * @dev Gets Currency asset decimals.
     */ 
    function getCurrencyAssetDecimals(bytes8 _curr) external view returns(uint8 decimal) {
        return allCurrencyAssets[_curr].decimals;
    }

    /** 
     * @dev Gets investment asset details of a given currency
     */  
    function getInvestmentAssetDetails(
        bytes8 _curr
    )
        external
        view
        returns(
            bytes8 curr,
            address currAddress,
            uint8 status,
            uint64 minHoldingPerc,
            uint64 maxHoldingPerc,
            uint8 decimals
        )
    {
        return (
            _curr,
            allInvestmentAssets[_curr].currAddress,
            allInvestmentAssets[_curr].status,
            allInvestmentAssets[_curr].minHoldingPercX100,
            allInvestmentAssets[_curr].maxHoldingPercX100,
            allInvestmentAssets[_curr].decimals
        );
    }

    /**
     * @dev Gets investment asset token address.
     */  
    function getInvestmentAssetAddress(bytes8 _curr) external view returns(address currAddress) {
        return allInvestmentAssets[_curr].currAddress;
    }

    /**
     * @dev Gets investment asset active Status of a given currency.
     */  
    function getInvestmentAssetStatus(bytes8 _curr) external view returns(uint8 status) {
        return allInvestmentAssets[_curr].status;
    }

    /**
     * @dev Gets Currency asset details of a given currency;
     */  
    function getCurrencyAssetDetails(
        bytes8 _curr
    )
        external
        view
        returns(
            bytes8 curr,
            address currAddress,
            uint8 status,
            uint64 minHoldingPerc,
            uint64 maxHoldingPerc,
            uint8 decimals
        )
    {
        return (
            _curr,
            allCurrencyAssets[_curr].currAddress,
            allCurrencyAssets[_curr].status,
            allCurrencyAssets[_curr].minHoldingPercX100,
            allCurrencyAssets[_curr].maxHoldingPercX100,
            allCurrencyAssets[_curr].decimals
        );
    }

    /**
     * @dev Gets Currency asset token address.
     */  
    function getCurrencyAssetAddress(bytes8 _curr) external view returns(address currAddress) {
        return allCurrencyAssets[_curr].currAddress;
    }

    /**
     * @dev Gets Currency asset active Status of a given currency.
     */  
    function getCurrencyAssetStatus(bytes8 _curr) external view returns(uint8 status) {
        return allCurrencyAssets[_curr].status;
    }

    /**
     * @dev Gets Currency asset maximum and minimum holding percentage of a given currency.
     */  
    function getCurrencyAssetHoldingPerc(
        bytes8 _curr
    )
        external
        view
        returns(
            uint64 minHoldingPercX100,
            uint64 maxHoldingPercX100
        )
    {
        return (
            allCurrencyAssets[_curr].minHoldingPercX100,
            allCurrencyAssets[_curr].maxHoldingPercX100
        );
    }

    /**
     * @dev Gets Currency asset maximum holding percentage of a given currency.
     */  
    function getCurrencyAssetMaxHoldingPerc(bytes8 _curr) external view returns(uint64 maxHoldingPercX100) {
        return allCurrencyAssets[_curr].maxHoldingPercX100;
    }

    /** 
     * @dev Gets Currency asset minimum holding percentage of a given currency.
     */  
    function getCurrencyAssetMinHoldingPerc(bytes8 _curr) external view returns(uint64 minHoldingPercX100) {
        return allCurrencyAssets[_curr].minHoldingPercX100;
    }

    /** 
     * @dev Gets type of oraclize query for a given Oraclize Query ID.
     * @param myid Oraclize Query ID identifying the query for which the result is being received.
     * @return _typeof It could be of type "quote","quotation","cover","claim" etc.
     */  
    function getApiIdTypeOf(bytes32 myid) external view returns(bytes8 _typeof) {
        _typeof = allAPIid[myid].typeOf;
    }

    /** 
     * @dev Gets ID associated to oraclize query for a given Oraclize Query ID.
     * @param myid Oraclize Query ID identifying the query for which the result is being received.
     * @return id1 It could be the ID of "proposal","quotation","cover","claim" etc.
     */  
    function getIdOfApiId(bytes32 myid) external view returns(uint id1) {
        id1 = allAPIid[myid].id;
    }

    /** 
     * @dev Gets the Timestamp of a oracalize call.
     */  
    function getDateAddOfAPI(bytes32 myid) external view returns(uint64 dateAdd) {
        dateAdd = allAPIid[myid].dateAdd;
    }

    /**
     * @dev Gets the Timestamp at which result of oracalize call is received.
     */  
    function getDateUpdOfAPI(bytes32 myid) external view returns(uint64 dateUpd) {
        dateUpd = allAPIid[myid].dateUpd;
    }

    /** 
     * @dev Gets currency by oracalize id. 
     */  
    function getCurrOfApiId(bytes32 myid) external view returns(bytes4 curr) {
        curr = allAPIid[myid].currency;
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
    function getApilCallLength() external view returns(uint len) {
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
            bytes8 _typeof,
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
        
    function changeDependentContractAddress() public onlyInternal {}
}
