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
contract poolData1
{
    master ms1;
    address masterAddress;
    uint32 faucetCurrMultiplier;
    mapping(bytes4=>string) api_curr;
    bytes4[] allCurrencies;
    bytes16[] allInvestmentCurrencies;
    mapping(bytes32=>apiId) public allAPIid;
    bytes32[] public allAPIcall;
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
        uint64 decimals;   
    }
  
    struct IARankDetails
    {
        bytes16 MAXIACurr;
        uint64 MAXRate;
        bytes16 MINIACurr;
        uint64 MINRate;
    }
    
    function poolData1()
    {
        variationPercX100=100; //1%
        orderSalt=99033804502856343259430181946001007533635816863503102978577997033734866165564;
        NULL_ADDRESS= 0x0000000000000000000000000000000000000000;  
        ordersExpirationTime["ELT"]=3600*12; // Excess liquidity trade order time 12 hours
        ordersExpirationTime["ILT"]=3600*6; // Insufficient liquidity trade order time 6 hours
        ordersExpirationTime["RBT"]=3600*20; // Rebalancing trade order time 20 hours
        makerFee=0;
        takerFee=0;
        feeRecipient=0x0000000000000000000000000000000000000000;
        taker=0x0000000000000000000000000000000000000000;
        IARatesTime=24*60*60; //24 hours in seconds
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
    mapping(bytes4=>currencyAssets) public allCurrencyAssets;
    mapping(bytes16=>investmentAssets) public allInvestmentAssets;
    mapping(bytes4=>bytes32[]) allCurrOrderHash;
    bytes32[] allRebalancingOrderHash;
    uint totalRiskPoolBalance;
    uint totalIAPoolBalance;
    uint64 IARatesTime;
    mapping(bytes16=>uint64) public ordersExpirationTime;
    mapping(bytes32=>Order) allOrders;
    struct Order
    {
        bytes4 makerCurr;
        uint makerAmt; // in 10^decimal
        bytes4 takerCurr;
        uint takerAmt;
        bytes16 orderHashType;
        uint orderExpireTime;
        bytes32 cancelOrderHash;
      //  uint64 IArateX100; // of investmentAsset (could be makerToken or takerToken)
    }
    mapping(bytes4=>mapping(bytes16=>uint8)) liquidityOrderStatus;
    mapping(bytes32=>uint8) zeroExOrderStatus;
    address WETHAddress;
    function changeWETHAddress(address _add) onlyInternal
    {
        WETHAddress=_add;
    }
    function getWETHAddress() constant returns(address WETHAddr)
    {
        return WETHAddress;
    }
    function updateZeroExOrderStatus(bytes32 orderHash,uint8 status) onlyInternal
    {
        zeroExOrderStatus[orderHash]=status;
    } 
    // 0: unsigned order
    // 1:signed order and amount is transferred
    // 2: expired successfully
    function getZeroExOrderStatus(bytes32 orderHash) constant returns(uint8 status)
    {
        return zeroExOrderStatus[orderHash];
    }

    function updateLiquidityOrderStatus(bytes4 curr,bytes16 orderType,uint8 active) onlyInternal
    {
        liquidityOrderStatus[curr][orderType]=active;
    }
    function getLiquidityOrderStatus(bytes4 curr, bytes16 orderType) constant returns(uint8 active)
    {
        return liquidityOrderStatus[curr][orderType];
    }
    function pushOrderDetails(bytes32 orderHash,bytes4 makerCurr,uint makerAmt,bytes4 takerCurr,uint takerAmt,bytes16 orderHashType,uint orderExpireTime) onlyInternal
    {
        allOrders[orderHash]=Order(makerCurr,makerAmt,takerCurr,takerAmt,orderHashType,orderExpireTime);
    }     
    function getOrderDetailsByHash(bytes32 orderHash) constant returns(bytes4 makerCurr,uint makerAmt,bytes4 takerCurr,uint takerAmt,bytes16 orderHashType,uint orderExpireTime,bytes32 cancelOrderHash)
    {
        return (allOrders[orderHash].makerCurr,allOrders[orderHash].makerAmt,allOrders[orderHash].takerCurr,allOrders[orderHash].takerAmt,allOrders[orderHash].orderHashType,allOrders[orderHash].orderExpireTime.allOrders[orderHash].cancelOrderHash);
    }
    function setOrderCancelHashValue(bytes32 orderHash,bytes32 cancelOrderHash) onlyInternal
    {
        allOrders[orderHash].cancelOrderHash=cancelOrderHash;
    }
    function changeIARatesTime(uint64 _newTime) onlyInternal
    {
        IARatesTime=_newTime;
    } 
    function getIARatesTime() constant returns(uint64 time)
    {
        return IARatesTime;
    }
    function change0xMakerAddress(address _maker) onlyOwner //later onlyInternal
    {
        maker=_maker;
    }
    function get0xMakerAddress() constant returns(address _maker)
    {
        return maker;
    }
      function change0xTakerAddress(address _taker) onlyOwner //later onlyInternal
    {
        taker=_taker;
    }
    function get0xTakerAddress() constant returns(address _taker)
    {
        return taker;
    }
    function change0xFeeRecipient(address _feeRecipient) onlyOwner //later onlyInternal
    {
        feeRecipient=_feeRecipient;
    }
    function get0xFeeRecipient() constant returns(address _feeRecipient)
    {
        return feeRecipient;
    }
    function change0xMakerFee(uint _makerFee) onlyOwner
    {
        makerFee=_makerFee;
    } 
    function get0xMakerFee() constant returns(uint _makerFee)
    {
        return makerFee;
    }
    function change0xTakerFee(uint _takerFee) onlyOwner
    {
        takerFee=_takerFee;
    } 
    function get0xTakerFee() constant returns(uint _takerFee)
    {
        return takerFee;
    }
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
    function getTotalIAPoolBalance() public constant returns(uint IABalance)
    {
        return totalIAPoolBalance;
    }
    function getTotalRiskPoolBalance() public constant returns(uint balance)
    {
        return totalRiskPoolBalance;
    }
    function saveIARankDetails(bytes16 MAXIACurr,uint64 MAXRate,bytes16 MINIACurr,uint64 MINRate,uint64 date) onlyInternal
    {
        allIARankDetails.push(IARankDetails(MAXIACurr,MAXRate,MINIACurr,MINRate));
        datewiseId[date]=allIARankDetails.length-1;
    }
    function getIARankDetailsByIndex(uint index) constant returns(bytes16 MAXIACurr,uint64 MAXRate,bytes16 MINIACurr,uint64 MINRate)
    {
        return (allIARankDetails[index].MAXIACurr,allIARankDetails[index].MAXRate,allIARankDetails[index].MINIACurr,allIARankDetails[index].MINRate);
    }
    function getIARankDetailsByDate(uint64 date) constant returns(bytes16 MAXIACurr,uint64 MAXRate,bytes16 MINIACurr,uint64 MINRate)
    {
        uint index=datewiseId[date];
        return (allIARankDetails[index].MAXIACurr,allIARankDetails[index].MAXRate,allIARankDetails[index].MINIACurr,allIARankDetails[index].MINRate);
    }
    function setOrderExpirationTime(bytes16 _typeof,uint64 time) onlyInternal
    {
        ordersExpirationTime[_typeof]=time; //time in seconds
    }
    function getOrderExpirationTime(bytes16 _typeof) constant returns(uint64 time)
    {
        return ordersExpirationTime[_typeof];
    }
    function saveRebalancingOrderHash(bytes32 hash) onlyInternal
    {
        allRebalancingOrderHash.push(hash);
    }
    function getRebalancingOrderHashByIndex(uint index) constant returns(bytes32 hash)
    {
        return allRebalancingOrderHash[index];
    }
    function getRebalancingOrderHashLength() constant returns(uint length)
    {
        return allRebalancingOrderHash.length;
    }
    function getAllRebalancingOrder() constant returns(bytes32[] hash)
    {
        return allRebalancingOrderHash;
    }
    function setCurrOrderHash(bytes4 curr,bytes32 orderHash) onlyInternal
    {
        allCurrOrderHash[curr].push(orderHash);
    }
    function getCurrOrderHash(bytes4 curr,uint index) constant returns(bytes32 hash)
    {
        return allCurrOrderHash[curr][index];
    }
    function getCurrAllOrderHash(bytes4 curr) constant returns(bytes32[] hash)
    {
        return allCurrOrderHash[curr];
    }
    function getCurrAllOrderHashLength(bytes4 curr) constant returns(uint len)
    {
        return allCurrOrderHash[curr].length;
    }
    function getOrderSalt() constant returns(uint salt)
    {
        return orderSalt;
    }
    function setOrderSalt(uint salt) onlyInternal
    {
        orderSalt=salt;
    }
    function setCurrencyLastIndex(bytes16 curr,uint index) onlyInternal
    {
        currencyLastIndex[curr]=index;
    }
    function getCurrencyLastIndex(bytes16 curr) constant returns(uint index)
    {
        return currencyLastIndex[curr];
    }

    function saveRateIdByDate(uint64 date,uint index) onlyInternal
    {
        datewiseId[date]=index;
    }
   
    function getIADetailsIndexByDate(uint64 date) constant returns(uint index)
    {
        return (datewiseId[date]);
    }

    function updatelastDate(uint64 newDate) onlyInternal
    {
        lastDate=newDate;
    }
    function getLastDate() constant returns(uint64 date)
    {
        return lastDate;
    }  
    function addInvestmentCurrency(bytes16 curr) onlyInternal
    {
       allInvestmentCurrencies.push(curr);   
    }
    function getInvestmentCurrencyByIndex(uint64 index) constant returns(bytes16 currName)
    {
        return allInvestmentCurrencies[index];
    }
    function getInvestmentCurrencyLen() constant returns(uint len)
    {
        return allInvestmentCurrencies.length;
    }
    function getAllInvestmentCurrencies() constant returns(bytes16[] currencies)
    {
        return allInvestmentCurrencies;
    }
    function changeVariationPercX100(uint64 newPercX100) onlyInternal
    {
        variationPercX100=newPercX100;
    }
    function getVariationPercX100() constant returns(uint64 variation)
    {
        return variationPercX100;
    }
    function pushCurrencyAssetsDetails(bytes4 _curr,uint64 _baseMin) onlyInternal
    {
        allCurrencyAssets[_curr]=currencyAssets(_baseMin,0);
        // _varMin is 0 initially.
    }
     function getCurrencyAssetDetails(bytes4 _curr) constant returns(bytes4 curr,uint64 baseMin,uint64 varMin)
    {
        return(_curr,allCurrencyAssets[_curr].baseMin,allCurrencyAssets[_curr].varMin);
    }
    function getCurrencyAssetVarMin(bytes4 _curr) constant returns(uint64 varMin)
    {
        return allCurrencyAssets[_curr].varMin;
    }
    function getCurrencyAssetBaseMin(bytes4 _curr) constant returns(uint64 baseMin)
    {
        return allCurrencyAssets[_curr].baseMin;
    }
    function changeCurrencyAssetBaseMin(bytes4 _curr,uint64 _baseMin) onlyInternal
    {
        allCurrencyAssets[_curr].baseMin=_baseMin;
    }
    function changeCurrencyAssetVarMin(bytes4 _curr,uint64 _varMin) onlyInternal
    {
        allCurrencyAssets[_curr].varMin=_varMin;
    }
    function pushInvestmentAssetsDetails(bytes16 _curr,address _currAddress,uint8 _status,uint64 _minHoldingPercX100,uint64 _maxHoldingPercX100,uint64 decimals) onlyInternal
    {
        allInvestmentAssets[_curr]=investmentAssets(_currAddress,_status,_minHoldingPercX100,_maxHoldingPercX100,decimals);
    }
    function updateInvestmentAssetDecimals(bytes16 _curr,uint64 _newDecimal)  onlyInternal
    {
        allInvestmentAssets[_curr].decimals=_newDecimal;
    }
    function getInvestmentAssetDecimals(bytes16 _curr) constant returns(uint64 decimal)
    {
        return allInvestmentAssets[_curr].decimals;
    }
    function changeInvestmentAssetStatus(bytes16 _curr,uint8 _status) onlyInternal
    {
        allInvestmentAssets[_curr].status=_status;
    }
    function changeInvestmentAssetHoldingPerc(bytes16 _curr,uint64 _minPercX100,uint64 _maxPercX100) onlyInternal
    {
        allInvestmentAssets[_curr].minHoldingPercX100=_minPercX100;
        allInvestmentAssets[_curr].maxHoldingPercX100=_maxPercX100;
    }   
    function getInvestmentAssetDetails(bytes16 _curr) constant returns(bytes16 curr,address currAddress,uint8 status,uint64 minHoldingPerc,uint64 maxHoldingPerc,uint64 decimals)
    {
        return(_curr,allInvestmentAssets[_curr].currAddress,allInvestmentAssets[_curr].status,allInvestmentAssets[_curr].minHoldingPercX100,allInvestmentAssets[_curr].maxHoldingPercX100,allInvestmentAssets[_curr].decimals);
    }
    function getInvestmentAssetAddress(bytes16 _curr)constant returns(address currAddress)
    {
        return allInvestmentAssets[_curr].currAddress;
    }
    function getInvestmentAssetStatus(bytes16 _curr)constant returns(uint8 status)
    {
        return allInvestmentAssets[_curr].status;
    }
    function getInvestmentAssetHoldingPerc(bytes16 _curr)constant returns(uint64 minHoldingPercX100,uint64 maxHoldingPercX100)
    {
        return (allInvestmentAssets[_curr].minHoldingPercX100,allInvestmentAssets[_curr].maxHoldingPercX100);
    }
    function getInvestmentAssetMaxHoldingPerc(bytes16 _curr) constant returns(uint64 maxHoldingPercX100)
    {
        return allInvestmentAssets[_curr].maxHoldingPercX100;
    }
    function getInvestmentAssetMinHoldingPerc(bytes16 _curr) constant returns(uint64 minHoldingPercX100)
    {
        return allInvestmentAssets[_curr].minHoldingPercX100;
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
    /// @dev Gets Faucet Multiplier
    function getFaucetCurrMul() constant returns(uint32 fcm)
    {
        fcm = faucetCurrMultiplier;
    }
    /// @dev Changes Faucet Multiplier
    /// @param fcm New Faucet Multiplier
    function changeFaucetCurrMul(uint32 fcm) onlyOwner
    {
        faucetCurrMultiplier = fcm;
    }
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
    function getDateAddOfAPI(bytes32 myid) constant returns(uint64 dateAdd)
    {
        dateAdd=allAPIid[myid].dateAdd;
    }
    function getDateUpdOfAPI(bytes32 myid)constant returns(uint64 dateUpd)
    {
        dateUpd=allAPIid[myid].dateUpd;
    }
    //change1
    function getCurrOfApiId(bytes32 myid) constant returns(bytes4 curr)
    {
        curr=allAPIid[myid].currency;
    }
    function updateDateUpdOfAPI(bytes32 myid)
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
