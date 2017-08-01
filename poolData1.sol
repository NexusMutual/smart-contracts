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
contract poolData1{
    master ms1;
    address masterAddress;
    uint faucetCurrMultiplier;
    mapping(bytes16=>string) api_curr;
    bytes16[] allCurrencies;
    mapping(bytes32=>apiId) public allAPIid;
    bytes32[] public allAPIcall;
    struct apiId{
        bytes16 type_of;
        bytes16 currency;
        uint id;
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
    function getFaucetCurrMul() constant returns(uint fcm)
    {
        fcm = faucetCurrMultiplier;
    }
    function changeFaucetCurrMul(uint fcm) onlyOwner
    {
        faucetCurrMultiplier = fcm;
    }
    function addCurrRateApiUrl( bytes16 curr , string url) onlyOwner
    {
        api_curr[curr] = url;
    }
    function getCurrRateApiUrl( bytes16 curr) constant returns(string url)
    {
        url = api_curr[curr];
    }
    function getApiIdTypeOf(bytes32 myid)constant returns(bytes16 _typeof)
    {
        _typeof=allAPIid[myid].type_of;
    }
    function getIdOfApiId(bytes32 myid)constant returns(uint id1)
    {
        id1 = allAPIid[myid].id;
    }

    function addCurrency(bytes16 curr) onlyInternal
    {
        allCurrencies.push(curr);
    }
    function getAllCurrLength() constant returns(uint len)
    {
        len = allCurrencies.length;
    }
    function getCurrency_Index(uint index)constant returns(bytes16 curr)
    {
        curr = allCurrencies[index];
    }
    function getAllCurrencies() constant returns (bytes16[] curr)
    {
        return(allCurrencies);
    }
    function saveApiDetails(bytes32 myid,bytes16 _typeof,uint id) onlyInternal
    {
        allAPIid[myid] = apiId(_typeof,"",id);
    }
    function saveApiDetailsCurr(bytes32 myid,bytes16 _typeof,bytes16 curr) onlyInternal
    {
        allAPIid[myid] = apiId(_typeof,curr,0);
    }

    function addInAllApiCall(bytes32 myid) onlyInternal
    {
        allAPIcall.push(myid);
    }
    function getApiCall_Index(uint index) constant returns(bytes32 myid)
    {
        myid = allAPIcall[index];
    }
    function getApiCallDetails(bytes32 myid)constant returns(bytes16 _typeof,bytes16 curr,uint id)
    {
        return(allAPIid[myid].type_of,allAPIid[myid].currency,allAPIid[myid].id);
    }
   

}
