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
import "./master.sol";
import "./SafeMaths.sol";

contract poolData
{
    using SafeMaths for uint;
    master ms;
    address masterAddress;
    // uint32 faucetCurrMultiplier;
   
    mapping(bytes4=>string) api_curr;
    // struct allCurrencies
    // {
    //     bytes16 curr_name;
    //     address curr_add;
    // };
    // allCurrencies[] curr_asset;
    bytes8[] allInvestmentCurrencies;
    bytes8[] allCurrencies;
    mapping(bytes32=>apiId) public allAPIid;
    bytes32[] public allAPIcall;
    // bytes4[] allCurrencies;
    
    struct apiId
    {
        bytes8 type_of;
        bytes4 currency;
        uint id;
        uint64 dateAdd;
        uint64 dateUpd;
    }
    struct currencyAssets
    {
        uint64 baseMin;
        uint64 varMin;
    }
    struct investmentAssets
    {
        address currAddress;
        uint8 status;             //1 for active,0 for inactive
        uint64 minHoldingPercX100;
        uint64 maxHoldingPercX100; 
        uint8 decimals;   
    }
  
    struct IARankDetails
    {
        bytes8 MAXIACurr;
        uint64 MAXRate;
        bytes8 MINIACurr;
        uint64 MINRate;
    }
    // allCurrencies CURR;
    function poolData()
    {
        variationPercX100=100; //1%
        orderSalt=99033804502856343259430181946001007533635816863503102978577997033734866165564;
        NULL_ADDRESS= 0x0000000000000000000000000000000000000000;  
        ordersExpirationTime["ELT"]=SafeMaths.mul64(3600,12); // Excess liquidity trade order time 12 hours
        ordersExpirationTime["ILT"]=SafeMaths.mul64(3600,6);  // Insufficient liquidity trade order time 6 hours
        ordersExpirationTime["RBT"]=SafeMaths.mul64(3600,20); // Rebalancing trade order time 20 hours
        makerFee=0;
        takerFee=0;
        feeRecipient=0x0000000000000000000000000000000000000000;
        taker=0x0000000000000000000000000000000000000000;
        IARatesTime=SafeMaths.mul64(SafeMaths.mul64(24,60),60); //24 hours in seconds
    }
    IARankDetails[] allIARankDetails;
    mapping(uint64=>uint) datewiseId;
    mapping(bytes16=>uint) currencyLastIndex;
    uint64 lastDate;  
    uint orderSalt; 
    address public NULL_ADDRESS;
    address maker;
    address taker;
    address feeRecipient;
    uint makerFee;
    uint takerFee;
    uint64 public variationPercX100;
    mapping(bytes8=>investmentAssets) public allCurrencyAssets;
    mapping(bytes8=>investmentAssets) public allInvestmentAssets;
    mapping(bytes8=>currencyAssets) public allCurrencyAssetsVarBase;
    mapping(bytes8=>bytes32[]) allCurrOrderHash;
    bytes32[] allRebalancingOrderHash;
    uint totalRiskPoolBalance;
    uint totalIAPoolBalance;
    uint64 IARatesTime;
    mapping(bytes16=>uint64) public ordersExpirationTime;
    mapping(bytes32=>Order) allOrders;
    mapping(bytes8=>mapping(bytes16=>uint8)) liquidityOrderStatus;
    mapping(bytes32=>uint8) zeroExOrderStatus;
    address WETHAddress;
    
    struct Order
    {
        bytes8 makerCurr;
        uint makerAmt; // in 10^decimal
        bytes8 takerCurr;
        uint takerAmt;
        bytes16 orderHashType;
        uint orderExpireTime;
        bytes32 cancelOrderHash;
    }
    
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
    function changeWETHAddress(address _add) onlyInternal
    {
        WETHAddress=_add;
    }
    function getWETHAddress() constant returns(address WETHAddr)
    {
        return WETHAddress;
    }
    // @dev updates 0x order status.
    // 0: unsigned order
    // 1:signed order and amount is transferred
    // 2: expired successfully
    function updateZeroExOrderStatus(bytes32 orderHash,uint8 status) onlyInternal
    {
        zeroExOrderStatus[orderHash]=status;
    } 
  
    // @dev Gets 0x order status.
    // 0: unsigned order
    // 1:signed order and amount is transferred
    // 2: expired successfully
    function getZeroExOrderStatus(bytes32 orderHash) constant returns(uint8 status)
    {
        return zeroExOrderStatus[orderHash];
    }
    /// @dev updates liquidity order status.
    /// @param orderType Excess Liquidity trade(ELT),Insufficient Liquidity Trade(ILT),Rebalancing Trade(RBT).

    function updateLiquidityOrderStatus(bytes8 curr,bytes16 orderType,uint8 active) onlyInternal
    {
        liquidityOrderStatus[curr][orderType]=active;
    }
    // @dev Gets liquidity order status.
    function getLiquidityOrderStatus(bytes8 curr, bytes16 orderType) constant returns(uint8 active)
    {
        return liquidityOrderStatus[curr][orderType];
    }
    /// @dev Push 0x order details.
    /// @param orderHash hash for order.
    /// @param makerCurr maker currency.
    /// @param makerAmt maker amount.
    /// @param takerCurr taker currency.
    /// @param takerAmt taker amount.
    /// @param orderHashType type of order hash.
    /// @param orderExpireTime expire time for order.
    function pushOrderDetails(bytes32 orderHash,bytes8 makerCurr,uint makerAmt,bytes8 takerCurr,uint  takerAmt
        ,bytes16 orderHashType,uint orderExpireTime) onlyInternal
    {
        allOrders[orderHash]=Order(makerCurr,makerAmt,takerCurr,takerAmt,orderHashType,orderExpireTime,"");
    }     
    /// @dev Gets 0x order details for a given hash.
    function getOrderDetailsByHash(bytes32 orderHash) constant returns(bytes8 makerCurr,uint makerAmt,bytes8 takerCurr,uint takerAmt,bytes16 orderHashType,uint orderExpireTime,bytes32 cancelOrderHash)
    {
        return (allOrders[orderHash].makerCurr,allOrders[orderHash].makerAmt,allOrders[orderHash].takerCurr,allOrders[orderHash].takerAmt,allOrders[orderHash].orderHashType,allOrders[orderHash].orderExpireTime,allOrders[orderHash].cancelOrderHash);
    }
    /// @dev Sets 0x order details for a given hash.
    function setOrderCancelHashValue(bytes32 orderHash,bytes32 cancelOrderHash) onlyInternal
    {
        allOrders[orderHash].cancelOrderHash=cancelOrderHash;
    }
    /// @dev Changes time after which investment asset rate.
    function changeIARatesTime(uint64 _newTime) onlyInternal
    {
        IARatesTime=_newTime;
    } 
    /// @dev Gets time after which investment asset rate.
    function getIARatesTime() constant returns(uint64 time)
    {
        return IARatesTime;
    }
    /// @dev Changes address of maker of 0x order.
    function change0xMakerAddress(address _maker) onlyInternal
    {
        maker=_maker;
    }
    /// @dev Gets address of maker of 0x order.
    function get0xMakerAddress() constant returns(address _maker)
    {
        return maker;
    }
    /// @dev Changes address of taker of 0x order.
    function change0xTakerAddress(address _taker) onlyInternal
    {
        taker=_taker;
    }
    /// @dev Gets address of taker of 0x order.
    function get0xTakerAddress() constant returns(address _taker)
    {
        return taker;
    }
    /// @dev Changes address of relayer of 0x order.
    function change0xFeeRecipient(address _feeRecipient) onlyInternal
    {
        feeRecipient=_feeRecipient;
    }
    /// @dev Gets address of relayer of 0x order.
    function get0xFeeRecipient() constant returns(address _feeRecipient)
    {
        return feeRecipient;
    }
    /// @dev Changes Fee of maker of 0x order.
    function change0xMakerFee(uint _makerFee) onlyOwner
    {
        makerFee=_makerFee;
    } 
    /// @dev Gets Fee of maker of 0x order.
    function get0xMakerFee() constant returns(uint _makerFee)
    {
        return makerFee;
    }
    /// @dev Changes Fee of taker of 0x order.
    function change0xTakerFee(uint _takerFee) onlyOwner
    {
        takerFee=_takerFee;
    } 
    /// @dev Gets Fee of taker of 0x order.
    function get0xTakerFee() constant returns(uint _takerFee)
    {
        return takerFee;
    }
    /// @dev Sets total risk balance and total investment asset balance to pool.
    function setTotalBalance(uint _balance,uint _balanceIA) onlyInternal
    {
        totalRiskPoolBalance=_balance;        
        totalIAPoolBalance=_balanceIA;
    }
    //Currency assets+ investmentAssets in ETH
    function setTotalRiskPoolBalance(uint _balance) onlyInternal
    {
        totalRiskPoolBalance=_balance;        
    }
    // investmentAssets balance in ETH
    function setTotalIAPoolBalance(uint _balanceIA) onlyInternal
    {
        totalIAPoolBalance=_balanceIA;
    }
    /// @dev Gets total investment asset balance in pool.
    function getTotalIAPoolBalance() public constant returns(uint IABalance)
    {
        return totalIAPoolBalance;
    }
    /// @dev Gets total Risk balance in pool.
    function getTotalRiskPoolBalance() public constant returns(uint balance)
    {
        return totalRiskPoolBalance;
    }
    /// @dev Saves investment asset rank details.
    /// @param MAXIACurr Maximum ranked investment asset currency.
    /// @param MAXRate Maximum ranked investment asset rate.
    /// @param MINIACurr Minimum ranked investment asset currency.
    /// @param MINRate Minimum ranked investment asset rate.
    /// @param date in yyyymmdd.
    function saveIARankDetails(bytes8 MAXIACurr,uint64 MAXRate,bytes8 MINIACurr,uint64 MINRate,uint64 date) onlyInternal
    {
        allIARankDetails.push(IARankDetails(MAXIACurr,MAXRate,MINIACurr,MINRate));
        datewiseId[date]=SafeMaths.sub(allIARankDetails.length,1);
    }
    /// @dev Gets investment asset rank details by given index.
    function getIARankDetailsByIndex(uint index) constant returns(bytes8 MAXIACurr,uint64 MAXRate,bytes8 MINIACurr,uint64 MINRate)
    {
        return (allIARankDetails[index].MAXIACurr,allIARankDetails[index].MAXRate,allIARankDetails[index].MINIACurr,allIARankDetails[index].MINRate);
    }
    /// @dev Gets investment asset rank details by given date.
    function getIARankDetailsByDate(uint64 date) constant returns(bytes8 MAXIACurr,uint64 MAXRate,bytes8 MINIACurr,uint64 MINRate)
    {
        uint index=datewiseId[date];
        return (allIARankDetails[index].MAXIACurr,allIARankDetails[index].MAXRate,allIARankDetails[index].MINIACurr,allIARankDetails[index].MINRate);
    }
    /// @dev Sets the 0x order Expiration Time in seconds.
    function setOrderExpirationTime(bytes16 _typeof,uint64 time) onlyInternal
    {
        ordersExpirationTime[_typeof]=time; //time in seconds
    }
    /// @dev Gets the 0x order Expiration Time in seconds.
    function getOrderExpirationTime(bytes16 _typeof) constant returns(uint64 time)
    {
        return ordersExpirationTime[_typeof];
    }
    /// @dev Saves Rebalancing 0x order hash.
    function saveRebalancingOrderHash(bytes32 hash) onlyInternal
    {
        allRebalancingOrderHash.push(hash);
    }
    /// @dev Gets the Rebalancing order hash of given index.
    function getRebalancingOrderHashByIndex(uint index) constant returns(bytes32 hash)
    {
        return allRebalancingOrderHash[index];
    }
    /// @dev Gets count of Rebalancing order hash.
    function getRebalancingOrderHashLength() constant returns(uint length)
    {
        return allRebalancingOrderHash.length;
    }
    /// @dev Gets Hashes of all the Rebalancing orders.
    function getAllRebalancingOrder() constant returns(bytes32[] hash)
    {
        return allRebalancingOrderHash;
    }
    /// @dev Sets the order hash for given currency.
    function setCurrOrderHash(bytes8 curr,bytes32 orderHash) onlyInternal
    {
        allCurrOrderHash[curr].push(orderHash);
    }
    /// @dev Gets order hash for given currency and index.
    function getCurrOrderHash(bytes8 curr,uint index) constant returns(bytes32 hash)
    {
        return allCurrOrderHash[curr][index];
    }
    /// @dev Gets all order hashes for a given currency.
    function getCurrAllOrderHash(bytes8 curr) constant returns(bytes32[] hash)
    {
        return allCurrOrderHash[curr];
    }
    /// @dev Gets count of order hash for a given currency.
    function getCurrAllOrderHashLength(bytes8 curr) constant returns(uint len)
    {
        return allCurrOrderHash[curr].length;
    }
    /// @dev Gets 0x order salt.
    function getOrderSalt() constant returns(uint salt)
    {
        return orderSalt;
    }
    /// @dev Sets 0x order salt.
    function setOrderSalt(uint salt) onlyInternal
    {
        orderSalt=salt;
    }
    /// @dev Sets Last index for given currency.
    function setCurrencyLastIndex(bytes16 curr,uint index) onlyInternal
    {
        currencyLastIndex[curr]=index;
    }
    /// @dev Gets Last index for given currency. 
    function getCurrencyLastIndex(bytes16 curr) constant returns(uint index)
    {
        return currencyLastIndex[curr];
    }
    /// @dev Saves Rate Id for a given date.
    function saveRateIdByDate(uint64 date,uint index) onlyInternal
    {
        datewiseId[date]=index;
    }
    /// @dev Gets index of investment asset details for a given date.  
    function getIADetailsIndexByDate(uint64 date) constant returns(uint index)
    {
        return (datewiseId[date]);
    }
    /// @dev Updates Last Date.
    function updatelastDate(uint64 newDate) onlyInternal
    {
        lastDate=newDate;
    }
    /// @dev Gets Last Date.
    function getLastDate() constant returns(uint64 date)
    {
        return lastDate;
    }  
    /// @dev Adds investment currency.
    function addInvestmentCurrency(bytes8 curr) onlyInternal
    {
        allInvestmentCurrencies.push(curr);   
    }
    /// @dev Gets investment currency for a given index. 
    function getInvestmentCurrencyByIndex(uint64 index) constant returns(bytes8 currName)
    {
        return allInvestmentCurrencies[index];
    }
    /// @dev Gets count of investment currency.
    function getInvestmentCurrencyLen() constant returns(uint len)
    {
        return allInvestmentCurrencies.length;
    }
    /// @dev Gets all the investment currencies.
    function getAllInvestmentCurrencies() constant returns(bytes8[] currencies)
    {
        return allInvestmentCurrencies;
    }

    /// @dev Adds All currency.
    function addAllCurrencies(bytes8 curr) onlyInternal
    {
        allCurrencies.push(curr);   
    }
    /// @dev Gets All currency for a given index. 
    function getAllCurrenciesByIndex(uint64 index) constant returns(bytes8 currName)
    {
        return allCurrencies[index];
    }
    /// @dev Gets count of All currency.
    function getAllCurrenciesLen() constant returns(uint len)
    {
        return allCurrencies.length;
    }
    /// @dev Gets all the All currencies.
    function getAllCurrencies() constant returns(bytes8[] currencies)
    {
        return allCurrencies;
    }
    /// @dev Changes the variation range percentage.
    function changeVariationPercX100(uint64 newPercX100) onlyInternal
    {
        variationPercX100=newPercX100;
    }
    /// @dev Gets the variation range percentage.
    function getVariationPercX100() constant returns(uint64 variation)
    {
        return variationPercX100;
    }
    /// @dev Pushes currency asset details for a given currency.
    function pushCurrencyAssetsVarBase(bytes8 _curr,uint64 _baseMin) onlyInternal
    {
        allCurrencyAssetsVarBase[_curr]=currencyAssets(_baseMin,0);
        // _varMin is 0 initially.
    }
    /// @dev Gets currency asset details for a given currency.
    function getCurrencyAssetVarBase(bytes8 _curr) constant returns(bytes8 curr,uint64 baseMin,uint64 varMin)
    {
        return(_curr,allCurrencyAssetsVarBase[_curr].baseMin,allCurrencyAssetsVarBase[_curr].varMin);
    }
    /// @dev Gets minimum variable value for currency asset.
    function getCurrencyAssetVarMin(bytes8 _curr) constant returns(uint64 varMin)
    {
        return allCurrencyAssetsVarBase[_curr].varMin;
    }
    /// @dev Gets  base minimum of  a given currency asset.
    function getCurrencyAssetBaseMin(bytes8 _curr) constant returns(uint64 baseMin)
    {
        return allCurrencyAssetsVarBase[_curr].baseMin;
    }
    /// @dev changes base minimum of a given currency asset.
    function changeCurrencyAssetBaseMin(bytes8 _curr,uint64 _baseMin) onlyInternal
    {
        allCurrencyAssetsVarBase[_curr].baseMin=_baseMin;
    }
    /// @dev changes variable minimum of a given currency asset.
    function changeCurrencyAssetVarMin(bytes8 _curr,uint64 _varMin) onlyInternal
    {
        allCurrencyAssetsVarBase[_curr].varMin=_varMin;
    }
    /// @dev pushes investment asset details.
    /// @param _curr currency name.
    /// @param _currAddress currency address.
    /// @param _status active/inactive.
    /// @param _minHoldingPercX100 minimum holding percentage*100.
    /// @param _maxHoldingPercX100 maximum holding percentage*100.
    /// @param decimals in ERC20 token.
    function pushInvestmentAssetsDetails(bytes8 _curr,address _currAddress,uint8 _status,uint64 _minHoldingPercX100,uint64 _maxHoldingPercX100,uint8 decimals) onlyInternal
    {
        allInvestmentAssets[_curr]=investmentAssets(_currAddress,_status,_minHoldingPercX100,_maxHoldingPercX100,decimals);
    }
    /// @dev Updates investment asset decimals.
    function updateInvestmentAssetDecimals(bytes8 _curr,uint8 _newDecimal) onlyInternal
    {
        allInvestmentAssets[_curr].decimals=_newDecimal;
    }
    /// @dev Gets investment asset decimals.
    function getInvestmentAssetDecimals(bytes8 _curr) constant returns(uint8 decimal)
    {
        return allInvestmentAssets[_curr].decimals;
    }
    /// @dev Changes the investment asset status.
    function changeInvestmentAssetStatus(bytes8 _curr,uint8 _status) onlyInternal
    {
        allInvestmentAssets[_curr].status=_status;
    }
    /// @dev Changes the investment asset Holding percentage of a given currency.
    function changeInvestmentAssetHoldingPerc(bytes8 _curr,uint64 _minPercX100,uint64 _maxPercX100) onlyInternal
    {
        allInvestmentAssets[_curr].minHoldingPercX100=_minPercX100;
        allInvestmentAssets[_curr].maxHoldingPercX100=_maxPercX100;
    }   
    /// @dev Gets investment asset details of a given currency;
    function getInvestmentAssetDetails(bytes8 _curr) constant returns(bytes8 curr,address currAddress,uint8 status,uint64 minHoldingPerc,uint64 maxHoldingPerc,uint8 decimals)
    {
        return(_curr,allInvestmentAssets[_curr].currAddress,allInvestmentAssets[_curr].status,allInvestmentAssets[_curr].minHoldingPercX100,allInvestmentAssets[_curr].maxHoldingPercX100,allInvestmentAssets[_curr].decimals);
    }
    /// @dev Gets investment asset token address.
    function getInvestmentAssetAddress(bytes8 _curr)constant returns(address currAddress)
    {
        return allInvestmentAssets[_curr].currAddress;
    }
    /// @dev Gets investment asset active Status of a given currency.
    function getInvestmentAssetStatus(bytes8 _curr)constant returns(uint8 status)
    {
        return allInvestmentAssets[_curr].status;
    }
    /// @dev Gets investment asset maximum and minimum holding percentage of a given currency.
    function getInvestmentAssetHoldingPerc(bytes8 _curr)constant returns(uint64 minHoldingPercX100,uint64 maxHoldingPercX100)
    {
        return (allInvestmentAssets[_curr].minHoldingPercX100,allInvestmentAssets[_curr].maxHoldingPercX100);
    }
    /// @dev Gets investment asset maximum holding percentage of a given currency.
    function getInvestmentAssetMaxHoldingPerc(bytes8 _curr) constant returns(uint64 maxHoldingPercX100)
    {
        return allInvestmentAssets[_curr].maxHoldingPercX100;
    }
    /// @dev Gets investment asset minimum holding percentage of a given currency.
    function getInvestmentAssetMinHoldingPerc(bytes8 _curr) constant returns(uint64 minHoldingPercX100)
    {
        return allInvestmentAssets[_curr].minHoldingPercX100;
    }
    
    /// @dev pushes investment asset details.
    /// @param _curr currency name.
    /// @param _currAddress currency address.
    /// @param _status active/inactive.
    /// @param _minHoldingPercX100 minimum holding percentage*100.
    /// @param _maxHoldingPercX100 maximum holding percentage*100.
    /// @param decimals in ERC20 token.
    function pushCurrencyAssetsDetails(bytes8 _curr,address _currAddress,uint8 _status,uint64 _minHoldingPercX100,uint64 _maxHoldingPercX100,uint8 decimals) onlyInternal
    {
        allCurrencyAssets[_curr]=investmentAssets(_currAddress,_status,_minHoldingPercX100,_maxHoldingPercX100,decimals);
    }
    /// @dev Updates Currency asset decimals.
    function updateCurrencyAssetDecimals(bytes8 _curr,uint8 _newDecimal) onlyInternal
    {
        allCurrencyAssets[_curr].decimals=_newDecimal;
    }
    /// @dev Gets Currency asset decimals.
    function getCurrencyAssetDecimals(bytes8 _curr) constant returns(uint8 decimal)
    {
        return allCurrencyAssets[_curr].decimals;
    }
    /// @dev Changes the Currency asset status.
    function changeCurrencyAssetStatus(bytes8 _curr,uint8 _status) onlyInternal
    {
        allCurrencyAssets[_curr].status=_status;
    }
    /// @dev Gets Currency asset token address.
    function changeCurrencyAssetAddress(bytes8 _curr,address _currAdd) onlyInternal
    {
        allCurrencyAssets[_curr].currAddress = _currAdd;
    }
    /// @dev Changes the Currency asset Holding percentage of a given currency.
    function changeCurrencyAssetHoldingPerc(bytes8 _curr,uint64 _minPercX100,uint64 _maxPercX100) onlyInternal
    {
        allCurrencyAssets[_curr].minHoldingPercX100=_minPercX100;
        allCurrencyAssets[_curr].maxHoldingPercX100=_maxPercX100;
    }   
    /// @dev Gets Currency asset details of a given currency;
    function getCurrencyAssetDetails(bytes8 _curr) constant returns(bytes8 curr,address currAddress,uint8 status,uint64 minHoldingPerc,uint64 maxHoldingPerc,uint8 decimals)
    {
        return(_curr,allCurrencyAssets[_curr].currAddress,allCurrencyAssets[_curr].status,allCurrencyAssets[_curr].minHoldingPercX100,allCurrencyAssets[_curr].maxHoldingPercX100,allCurrencyAssets[_curr].decimals);
    }
    /// @dev Gets Currency asset token address.
    function getCurrencyAssetAddress(bytes8 _curr)constant returns(address currAddress)
    {
        return allCurrencyAssets[_curr].currAddress;
    }
    /// @dev Gets Currency asset active Status of a given currency.
    function getCurrencyAssetStatus(bytes8 _curr)constant returns(uint8 status)
    {
        return allCurrencyAssets[_curr].status;
    }
    /// @dev Gets Currency asset maximum and minimum holding percentage of a given currency.
    function getCurrencyAssetHoldingPerc(bytes8 _curr)constant returns(uint64 minHoldingPercX100,uint64 maxHoldingPercX100)
    {
        return (allCurrencyAssets[_curr].minHoldingPercX100,allCurrencyAssets[_curr].maxHoldingPercX100);
    }
    /// @dev Gets Currency asset maximum holding percentage of a given currency.
    function getCurrencyAssetMaxHoldingPerc(bytes8 _curr) constant returns(uint64 maxHoldingPercX100)
    {
        return allCurrencyAssets[_curr].maxHoldingPercX100;
    }
    /// @dev Gets Currency asset minimum holding percentage of a given currency.
    function getCurrencyAssetMinHoldingPerc(bytes8 _curr) constant returns(uint64 minHoldingPercX100)
    {
        return allCurrencyAssets[_curr].minHoldingPercX100;
    }

    // /// @dev Gets Faucet Multiplier
    // function getFaucetCurrMul() constant returns(uint32 fcm)
    // {
    //     fcm = faucetCurrMultiplier;
    // }
    // /// @dev Changes Faucet Multiplier
    // /// @param fcm New Faucet Multiplier
    // function changeFaucetCurrMul(uint32 fcm) onlyOwner
    // {
    //     faucetCurrMultiplier = fcm;
    // }
    /// @dev Stores Currency exchange URL of a given currency.
    /// @param curr Currency Name.
    /// @param url Currency exchange URL 
    function addCurrRateApiUrl(bytes4 curr , string url) onlyOwner
    {
        api_curr[curr] = url;
    }
    /// @dev Gets Currency exchange URL of a given currency.
    /// @param curr Currency Name.
    /// @return url Currency exchange URL 
    function getCurrRateApiUrl( bytes4 curr) constant returns(string url)
    {
        url = api_curr[curr];
    }
    /// @dev Gets type of oraclize query for a given Oraclize Query ID.
    /// @param myid Oraclize Query ID identifying the query for which the result is being received.
    /// @return _typeof It could be of type "quote","quotation","cover","claim" etc.
    function getApiIdTypeOf(bytes32 myid)constant returns(bytes8 _typeof)
    {
        _typeof=allAPIid[myid].type_of;
    }
    /// @dev Gets ID associated to oraclize query for a given Oraclize Query ID.
    /// @param myid Oraclize Query ID identifying the query for which the result is being received.
    /// @return id1 It could be the ID of "proposal","quotation","cover","claim" etc.
    function getIdOfApiId(bytes32 myid)constant returns(uint id1)
    {
        id1 = allAPIid[myid].id;
    }
    /// @dev Gets the Timestamp of a oracalize call. 
    function getDateAddOfAPI(bytes32 myid) constant returns(uint64 dateAdd)
    {
        dateAdd=allAPIid[myid].dateAdd;
    }
    /// @dev Gets the Timestamp at which result of oracalize call is received.
    function getDateUpdOfAPI(bytes32 myid)constant returns(uint64 dateUpd)
    {
        dateUpd=allAPIid[myid].dateUpd;
    }
    /// @dev Gets currency by oracalize id.
    function getCurrOfApiId(bytes32 myid) constant returns(bytes4 curr)
    {
        curr=allAPIid[myid].currency;
    }
    /// @dev Updates the Timestamp at which result of oracalize call is received.
    function updateDateUpdOfAPI(bytes32 myid) onlyInternal
    {
        allAPIid[myid].dateUpd=uint64(now);
    }

    /// @dev Saves the details of the Oraclize API.
    /// @param myid Id return by the oraclize query.
    /// @param _typeof type of the query for which oraclize call is made.
    /// @param id ID of the proposal,quote,cover etc. for which oraclize call is made
    function saveApiDetails(bytes32 myid,bytes8 _typeof,uint id) onlyInternal
    {
        allAPIid[myid] = apiId(_typeof,"",id,uint64(now),uint64(now));
    }
    //change2
    /// @dev Saves the details of the Oraclize API.
    /// @param myid Id return by the oraclize query.
    /// @param _typeof type of the query for which oraclize call is made.
    /// @param curr Name of currency (ETH,GBP, etc.)
    function saveApiDetailsCurr(bytes32 myid,bytes8 _typeof,bytes4 curr,uint id) onlyInternal
    {
        allAPIid[myid] = apiId(_typeof,curr,id,uint64(now),uint64(now));
    }
    /// @dev Stores the id return by the oraclize query. Maintains record of all the Ids return by oraclize query.
    /// @param myid Id return by the oraclize query.
    function addInAllApiCall(bytes32 myid) onlyInternal
    {
        allAPIcall.push(myid);
    }
    /// @dev Gets ID return by the oraclize query of a given index.
    /// @param index Index.
    /// @return myid ID return by the oraclize query.
    function getApiCall_Index(uint index) constant returns(bytes32 myid)
    {
        myid = allAPIcall[index];
    }
    /// @dev Gets Length of API call.
    function getApilCall_length() constant returns(uint len)
    {
        return allAPIcall.length;
    }
    /// @dev Get Details of Oraclize API when given Oraclize Id.
    /// @param myid ID return by the oraclize query.
    /// @return _typeof ype of the query for which oraclize call is made.("proposal","quote","quotation" etc.)
    function getApiCallDetails(bytes32 myid)constant returns(bytes8 _typeof,bytes4 curr,uint id,uint64 dateAdd,uint64 dateUpd)
    {
        return(allAPIid[myid].type_of,allAPIid[myid].currency,allAPIid[myid].id,allAPIid[myid].dateAdd,allAPIid[myid].dateUpd);
    }
}
