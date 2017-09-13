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
    /// @dev Gets Faucet Multiplier
    function getFaucetCurrMul() constant returns(uint fcm)
    {
        fcm = faucetCurrMultiplier;
    }
    /// @dev Changes Faucet Multiplier
    /// @param fcm New Faucet Multiplier
    function changeFaucetCurrMul(uint fcm) onlyOwner
    {
        faucetCurrMultiplier = fcm;
    }
    /// @dev Stores Currency exchange URL of a given currency.
    /// @param curr Currency Name.
    /// @param url Currency exchange URL 
    function addCurrRateApiUrl( bytes16 curr , string url) onlyOwner
    {
        api_curr[curr] = url;
    }
    /// @dev Gets Currency exchange URL of a given currency.
    /// @param curr Currency Name.
    /// @return url Currency exchange URL 
    function getCurrRateApiUrl( bytes16 curr) constant returns(string url)
    {
        url = api_curr[curr];
    }
    /// @dev Gets type of oraclize query for a given Oraclize Query ID.
    /// @param myid Oraclize Query ID identifying the query for which the result is being received.
    /// @return _typeof It could be of type "quote","quotation","cover","claim" etc.
    function getApiIdTypeOf(bytes32 myid)constant returns(bytes16 _typeof)
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
    /// @dev Stores Currency Name.
    /// @param curr Currency Name.
    function addCurrency(bytes16 curr) onlyInternal
    {
        allCurrencies.push(curr);
    }
    /// @dev Gets number of currencies that have been added till date.
    /// @param len Number of currencies added
    function getAllCurrLength() constant returns(uint len)
    {
        len = allCurrencies.length;
    }
    /// @dev Gets name of currency of a given index.
    /// @param index Index position.
    /// @return curr Currency Name.
    function getCurrency_Index(uint index)constant returns(bytes16 curr)
    {
        curr = allCurrencies[index];
    }
    /// @dev Gets name of all the currencies that have been added till now.
    /// @return curr Array of currency's name.
    function getAllCurrencies() constant returns (bytes16[] curr)
    {
        return(allCurrencies);
    }
    /// @dev Saves the details of the Oraclize API.
    /// @param myid Id return by the oraclize query.
    /// @param _typeof type of the query for which oraclize call is made.
    /// @param id ID of the proposal, quote, cover etc. for which oraclize call is made
    function saveApiDetails(bytes32 myid,bytes16 _typeof,uint id) onlyInternal
    {
        allAPIid[myid] = apiId(_typeof,"",id);
    }
    /// @dev Saves the details of the Oraclize API.
    /// @param myid Id return by the oraclize query.
    /// @param _typeof type of the query for which oraclize call is made.
    /// @param curr Name of currency (ETH,GBP, etc.)
    function saveApiDetailsCurr(bytes32 myid,bytes16 _typeof,bytes16 curr) onlyInternal
    {
        allAPIid[myid] = apiId(_typeof,curr,0);
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
    /// @dev Get Details of Oraclize API when given Oraclize Id.
    /// @param myid ID return by the oraclize query.
    /// @return _typeof type of the query for which oraclize call is made.("proposal","quote","quotation" etc.)
    function getApiCallDetails(bytes32 myid)constant returns(bytes16 _typeof,bytes16 curr,uint id)
    {
        return(allAPIid[myid].type_of,allAPIid[myid].currency,allAPIid[myid].id);
    }
   

}
