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
//import "./oraclizeAPI.sol";
import "./quotation.sol";
import "./NXMToken.sol";
import "./claims.sol";
import "./fiatFaucet.sol";
import "./governance.sol";
import "./claims_Reward.sol";
import "./poolData1.sol";
import "./quotation2.sol";
import "./master.sol";
import "./pool2.sol";
import "github.com/oraclize/ethereum-api/oraclizeAPI.sol";
contract pool is usingOraclize{
    master ms1;
    address masterAddress;
    address tokenAddress;
    address quoteAddress;
    address claimAddress;
    address fiatFaucetAddress;
    address poolAddress;
    address governanceAddress;
    address claimRewardAddress;
    address poolDataAddress;
    address quotation2Address;
   
    address pool2Address;
    quotation q1;
    quotation2 q2;
    NXMToken t1;
    claims c1;
    claims_Reward cr1;
    fiatFaucet f1;
    governance g1;
    poolData1 pd1;
    address owner;
   
    pool2 p2;
    event apiresult(address indexed sender,string msg,bytes32 myid);
    event Payout(address indexed to, bytes16 eventName , uint coverId ,uint tokens );

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
    function changeClaimRewardAddress(address _to) onlyInternal
    {
        claimRewardAddress=_to;
    }
   
    function changeGovernanceAddress(address _to) onlyInternal
    {
        governanceAddress = _to;
    }
    function changePoolDataAddress(address _add) onlyInternal
    {
        poolDataAddress = _add;
        pd1 = poolData1(poolDataAddress);
    }
    function changePool2Address(address _add) onlyInternal
    {
        pool2Address = _add;
       
    }

    /// @dev Save the details of the Oraclize API.
    /// @param myid Id return by the oraclize query.
    /// @param _typeof type of the query for which oraclize call is made.
    /// @param id ID of the proposal, quote, cover etc. for which oraclize call is made.
    function saveApiDetails(bytes32 myid,bytes16 _typeof,uint id) internal
    {
        pd1 = poolData1(poolDataAddress);
        pd1.saveApiDetails(myid,_typeof,id);
        pd1.addInAllApiCall(myid);

    }
    
    /// @dev Calls the Oraclize Query to close a given Claim after a given period of time.
    /// @param id Claim Id to be closed
    /// @param time Time (in seconds) after which claims assessment voting needs to be closed
    function closeClaimsOraclise(uint id , uint time) onlyInternal
    {
        
        bytes32 myid1 = oraclize_query(time, "URL","http://a1.nexusmutual.io/api/claims/closeClaim",3000000);
         saveApiDetails(myid1,"claim",id);
            
    }
    /// @dev Calls Oraclize Query to close a given Proposal after a given period of time.
    /// @param id Proposal Id to be closed
    /// @param time Time (in seconds) after which proposal voting needs to be closed
    function closeProposalOraclise(uint id , uint time) onlyInternal
    {
       
        bytes32 myid2 = oraclize_query(time, "URL","http://a1.nexusmutual.io/api/claims/closeClaim",4000000);
        saveApiDetails(myid2,"proposal",id);
       
    }
    /// @dev Calls Oraclize Query to expire a given Quotation after a given period of time.
    /// @param id Quote Id to be expired
    /// @param time Time (in seconds) after which the quote should be expired
    function closeQuotationOraclise(uint id , uint time) onlyInternal
    {
      
        bytes32 myid3 = oraclize_query(time, "URL","http://a1.nexusmutual.io/api/claims/closeClaim",1500000);
        saveApiDetails(myid3,"quotation",id);
        
    }
    /// @dev Calls Oraclize Query to expire a given Cover after a given period of time.
    /// @param id Cover Id to be expired
    /// @param time Time (in seconds) after which the cover should be expired
    function closeCoverOraclise(uint id , uint time) onlyInternal
    {
        
        bytes32 myid4 = oraclize_query(time, "URL","http://a1.nexusmutual.io/api/claims/closeClaim",1500000);
        saveApiDetails(myid4,"cover",id);
      
    }
    /// @dev Calls the Oraclize Query to update the version of the contracts.    
    function versionOraclise(uint version) onlyInternal
    {
        bytes32 myid5 = oraclize_query("URL","http://a1.nexusmutual.io/api/mcr/setlatest/P");
        saveApiDetails(myid5,"version",version);
    }
    /// @dev Calls the Oraclize Query to initiate MCR calculation.
    /// @param time Time (in seconds) after which the next MCR calculation should be initiated
    function MCROraclise(uint time) onlyInternal
    {
        
        bytes32 myid4 = oraclize_query(time, "URL","http://a2.nexusmutual.io");
        saveApiDetails(myid4,"MCR",0);
       
    }

      function MCROracliseFail(uint id,uint time) onlyInternal
    {
        
        bytes32 myid4 = oraclize_query(time, "URL","http://a2.nexusmutual.io");
        saveApiDetails(myid4,"MCRFailed",id);
       
    }
    /// @dev Handles callback of external oracle query. 
    function __callback(bytes32 myid, string res) {
          ms1=master(masterAddress);
      
         if(msg.sender != oraclize_cbAddress() && ms1.isOwner(msg.sender)!=1) throw;
         p2=pool2(pool2Address);
         p2.delegateCallBack(myid,res);     
    }

    function changeFiatFaucetAddress(address _to) onlyInternal
    {
        fiatFaucetAddress = _to;
    }

    function changePoolAddress(address _to) onlyInternal
    {
        poolAddress = _to;
    }
    function changeTokenAddress(address _to) onlyInternal
    {
        tokenAddress = _to;
    }
    function changeQuotation2Address(address _add) onlyInternal
    {
        quotation2Address = _add;
    }
    function changeQuoteAddress(address _to) onlyInternal
    {
        quoteAddress = _to;
    }
    function changeClaimAddress(address _to) onlyInternal
    {
        claimAddress = _to;
    }

    /// @dev Begins the funding of the Quotations.
    /// @param fundAmt fund amounts for each selected quotation.
    /// @param quoteId multiple quotations ID that will get funded.
    function fundQuoteBegin(uint[] fundAmt , uint[] quoteId ) payable {

        q1=quotation(quoteAddress);
        q1.fundQuote(fundAmt ,quoteId , msg.sender);
    }


    /// @dev User can buy the NXMToken equivalent to the amount paid by the user.
    function buyTokenBegin() payable {

        t1=NXMToken(tokenAddress);
        uint amount= msg.value;
        t1.buyToken(amount , msg.sender);
    }
    function callPayoutEvent(address _add,bytes16 type1,uint id,uint sa)
    {
        Payout(_add,type1,id,sa);
    }

    /// @dev Sends a given Ether amount to a given address.
    /// @param amount amount (in wei) to send.
    /// @param _add Receiver's address.
    /// @return succ True if transfer is a success, otherwise False.
    function transferEther(uint amount , address _add) onlyInternal constant returns(bool succ)
    {
        succ = _add.send(amount);
    }

    /// @dev Converts byte16 data type into string type. 
    function bytes16ToString(bytes16 x)  constant returns (string) {
        bytes memory bytesString = new bytes(32);
        uint charCount = 0;
        for (uint j = 0; j < 32; j++) {
            byte char = byte(bytes16(uint(x) * 2 ** (8 * j)));
            if (char != 0) {
                bytesString[charCount] = char;
                charCount++;
            }
        }
        bytes memory bytesStringTrimmed = new bytes(charCount);
        for (j = 0; j < charCount; j++) {
            bytesStringTrimmed[j] = bytesString[j];
        }
        return string(bytesStringTrimmed);
    }
    /// @dev Payable method for allocating some amount to the Pool. 
    function takeEthersOnly() payable
    {
        t1=NXMToken(tokenAddress);
        uint amount = msg.value * 1000000000000000000;
        t1.addToPoolFund("ETH",amount);
    }

    /// @dev Oraclize call to an external oracle for fetching the risk cost for a given latitude and longitude
    /// @param  lat Latitude of quotation
    /// @param  long Longitude of quotation
    /// @param  quoteid Quotation Id for which risk cost needs to be fetched
    function callQuotationOracalise(bytes16 lat , bytes16 long , uint quoteid) onlyInternal
    {
        bytes32 apiid = oraclize_query("URL",strConcat("http://a1.nexusmutual.io/api/pricing/getEarthquakeRisk/",bytes16ToString(lat),"/",bytes16ToString(long),""),1500000); 
        saveApiDetails(apiid,"quote",quoteid);
    }
    /// @dev Allocates currency tokens to the pool fund.
    /// @param valueWEI  Purchasing Amount(in wei). 
    /// @param curr Currency's Name.
    function getCurrencyTokensFromFaucet(uint valueWEI , bytes16 curr) onlyInternal
    {
        f1=fiatFaucet(fiatFaucetAddress);
        f1.transferToken.value(valueWEI)(curr);
    }
    /// @dev Gets the Balance of the Pool in wei.
    function getEtherPoolBalance()constant returns(uint bal)
    {
        bal = this.balance;
    }
    /// @dev Sends the amount requested by a given proposal to an address, after the Proposal gets passed.
    /// @dev Used for proposals categorized under Engage in external services   
    /// @param _to Receiver's address.
    /// @param amount Sending amount.
    /// @param id Proposal Id.
    function proposalExtServicesPayout(address _to , uint amount , uint id) onlyInternal
    {
        g1 = governance(governanceAddress);
        if(msg.sender == governanceAddress)
        {
           if(this.balance < amount)
           {
                g1.changeStatusFromPool(id);
           }
           else
           {
                bool succ = _to.send(amount);                
                if(succ == true)
                {   
                    Payout(_to,"PayoutAB",id,amount);
                    t1.removeFromPoolFund("ETH",amount);
                }
           }
        }
    }
    /// @dev Sends a surplus distribution amount to an address.
    /// @param amount Amount to be sent.
    /// @param _add receiver's address.
    /// @return success true if payout is successful, false otherwise.
    function SDPayout(uint amount , address _add) onlyInternal  returns(bool success)
    {
        success = _add.send(amount);
        Payout(_add,"PayoutSD",0,amount);
    }

}
