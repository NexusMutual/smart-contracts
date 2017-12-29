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
import "./NXMToken.sol";
import "./claims.sol";
import "./fiatFaucet.sol";
import "./governance.sol";
import "./claims_Reward.sol";
import "./poolData1.sol";
import "./quotation2.sol";
import "./master.sol";
import "./pool2.sol";
import "./USD.sol";
import "./MCR.sol";
import "github.com/oraclize/ethereum-api/oraclizeAPI_0.4.sol";

contract pool is usingOraclize{
  //  using SafeMaths for uint;
    master ms1;
    address masterAddress;
    address tokenAddress;
    address claimAddress;
    address fiatFaucetAddress;
    address poolAddress;
    address governanceAddress;
    address claimRewardAddress;
    address poolDataAddress;
    address quotation2Address; 
    address MCRAddress;
    address pool2Address;
    quotation2 q2;
    NXMToken t1;
    claims c1;
    claims_Reward cr1;
    fiatFaucet f1;
    governance g1;
    poolData1 pd1;
    pool2 p2;

    address owner;
    MCR m1;
    SupplyToken tok;

    event apiresult(address indexed sender,string msg,bytes32 myid);

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
     function changeMCRAddress(address _add) onlyInternal
    {
        MCRAddress = _add;   
    }
    function changeQuotation2Address(address _add) onlyInternal
    {
        quotation2Address = _add;
    }
    function changeClaimAddress(address _to) onlyInternal
    {
        claimAddress = _to;
    }
    function changePool2Address(address _to)onlyInternal
    {
        pool2Address=_to;
    }
    /// @dev Save the details of the Oraclize API.
    /// @param myid Id return by the oraclize query.
    /// @param _typeof type of the query for which oraclize call is made.
    /// @param id ID of the proposal, quote, cover etc. for which oraclize call is made.
    function saveApiDetails(bytes32 myid,bytes8 _typeof,uint id) internal
    {
        pd1 = poolData1(poolDataAddress);
        pd1.saveApiDetails(myid,_typeof,id);
        pd1.addInAllApiCall(myid);

    }
    function saveApiDetailsCurr(bytes32 myid,bytes8 _typeof,bytes4 curr,uint id) internal
    {
        pd1=poolData1(poolDataAddress);
        pd1.saveApiDetailsCurr(myid,_typeof,curr,id);
        pd1.addInAllApiCall(myid);
    }
    /// @dev Calls the Oraclize Query to close a given Claim after a given period of time.
    /// @param id Claim Id to be closed
    /// @param time Time (in milliseconds) after which claims assessment voting needs to be closed
    function closeClaimsOraclise(uint id , uint64 time) onlyInternal
    {
        
        bytes32 myid1 = oraclize_query(time, "URL","http://a1.nexusmutual.io/api/claims/closeClaim",3000000);
         saveApiDetails(myid1,"CLA",id);
            
    }
    /// @dev Calls Oraclize Query to close a given Proposal after a given period of time.
    /// @param id Proposal Id to be closed
    /// @param time Time (in milliseconds) after which proposal voting needs to be closed
    function closeProposalOraclise(uint id , uint64 time) onlyInternal
    {
       
        bytes32 myid2 = oraclize_query(time, "URL","http://a1.nexusmutual.io/api/claims/closeClaim",4000000);
        saveApiDetails(myid2,"PRO",id);
       
    }
    /// @dev Calls Oraclize Query to expire a given Quotation after a given period of time.
    /// @param id Quote Id to be expired
    /// @param time Time (in milliseconds) after which the quote should be expired
    function closeQuotationOraclise(uint id , uint64 time) onlyInternal
    {
      
        bytes32 myid3 = oraclize_query(time, "URL",strConcat("http://a1.nexusmutual.io/api/claims/closeClaim_hash/",uint2str(id)),500000);
        saveApiDetails(myid3,"QUO",id);
        
    }
    /// @dev Calls Oraclize Query to expire a given Cover after a given period of time.
    /// @param id Quote Id to be expired
    /// @param time Time (in milliseconds) after which the cover should be expired
    function closeCoverOraclise(uint id , uint64 time) onlyInternal
    {
        bytes32 myid4 = oraclize_query(time, "URL",strConcat("http://a1.nexusmutual.io/api/claims/closeClaim_hash/",uint2str(id)),1000000);
        saveApiDetails(myid4,"COV",id);
      
    }
    /// @dev Calls the Oraclize Query to update the version of the contracts.    
    function versionOraclise(uint version) onlyInternal
    {
        bytes32 myid5 = oraclize_query("URL","http://a1.nexusmutual.io/api/mcr/setlatest/T");
        saveApiDetails(myid5,"VER",version);
    }
    /// @dev Calls the Oraclize Query to initiate MCR calculation.
    /// @param time Time (in milliseconds) after which the next MCR calculation should be initiated
    function MCROraclise(uint64 time) onlyInternal
    {
        bytes32 myid4 = oraclize_query(time, "URL","http://a3.nexusmutual.io");
        saveApiDetails(myid4,"MCR",0);
    }

    function MCROracliseFail(uint id,uint64 time) onlyInternal
    {
        bytes32 myid4 = oraclize_query(time, "URL","http://a3.nexusmutual.io",1000000);
        saveApiDetails(myid4,"MCRF",id);
    }
    
    /// @dev Oraclize call to an external oracle for fetching the risk cost for a given latitude and longitude
    /// @param  lat Latitude of quotation
    /// @param  long Longitude of quotation
    /// @param  quoteid Quotation Id for which risk cost needs to be fetched
    function callQuotationOracalise(bytes16 lat , bytes16 long , uint quoteid) onlyInternal
    {
        bytes32 apiid = oraclize_query("URL",strConcat("http://a1.nexusmutual.io/api/pricing/getEarthquakeRisk_hash/",strConcat(bytes16ToString(lat),"/","","",""),bytes16ToString(long),"/",uint2str(quoteid)),300000); 
        saveApiDetails(apiid,"PRE",quoteid);
    }

    function subtractQuotationOracalise(uint id) onlyInternal
    {
        bytes32 myid6 = oraclize_query("URL",strConcat("http://a1.nexusmutual.io/api/claims/subtractQuoteSA_hash/",uint2str(id)),50000);
        saveApiDetails(myid6,"SUB",id);     
    }

    function saveIADetailsOracalise(uint64 time) onlyInternal
    {
         bytes32 myid6 = oraclize_query(time, "URL","http://a3.nexusmutual.io");
         saveApiDetails(myid6,"0X",0);     
    }
    //change1
    function close0xOrders(bytes4 curr,uint id,uint time) onlyInternal
    {
        bytes32 myid= oraclize_query(time,"URL","http://a3.nexusmutual.io",300000);
        saveApiDetailsCurr(myid,"Close0x",curr,id);
    }
    /// @dev Handles callback of external oracle query. 
    function __callback(bytes32 myid, string res)
    {
        ms1=master(masterAddress);
        p2=pool2(pool2Address);
        if(msg.sender != oraclize_cbAddress() && ms1.isOwner(msg.sender)!=1) throw;
        p2.delegateCallBack(myid,res);     
    }

    /// @dev Begins the funding of the Quotations.
    /// @param fundAmt fund amounts for each selected quotation.
    /// @param quoteId multiple quotations ID that will get funded.
    function fundQuoteBegin(uint[] fundAmt , uint[] quoteId ) payable 
    {
        q2=quotation2(quotation2Address);
        uint sum=0;
        for(uint i=0;i<fundAmt.length;i++)
        {
            sum+=fundAmt[i];
        }
        if(msg.value==sum)
        {
            q2.fundQuote(fundAmt ,quoteId , msg.sender);
        }
        else
        {
            throw;
        }
    }


    /// @dev User can buy the NXMToken equivalent to the amount paid by the user.
    function buyTokenBegin() payable {

        t1=NXMToken(tokenAddress);
        uint amount= msg.value;
        t1.buyToken(amount,msg.sender);
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
    function bytes16ToString(bytes16 x) internal constant returns (string) {
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
        uint amount = msg.value;
        t1.addToPoolFund("ETH",amount);
    }

    
    /// @dev Allocates currency tokens to the pool fund.
    /// @param valueWEI  Purchasing Amount(in wei). 
    /// @param curr Currency's Name.
    function getCurrencyTokensFromFaucet(uint valueWEI , bytes4 curr) onlyInternal
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
        p2=pool2(pool2Address);
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
                    p2.callPayoutEvent(_to,"PayoutAB",id,amount);
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
        p2=pool2(pool2Address);
        success = _add.send(amount);
        p2.callPayoutEvent(_add,"PayoutSD",0,amount);
    }

    /// @dev Transfers back the given amount to the owner.
    function transferBackEther(uint256 amount) onlyOwner  
    {
        amount = amount * 10000000000;  
        //address own=msg.sender;
        bool succ = transferEther(amount , msg.sender);   
        t1=NXMToken(tokenAddress);
        // Subtracts the transferred amount from the Pool Fund.
        t1.removeFromPoolFund("ETH",amount);   
    }
    /// @dev Allocates the Equivalent Currency Tokens for a given amount of Ethers.
    /// @param valueETH  Tokens Purchasing Amount in ETH. 
    /// @param curr Currency Name.
    function getCurrTokensFromFaucet(uint valueETH , bytes4 curr) 
    {
        g1 = governance(governanceAddress);
        uint valueWEI = valueETH*1000000000000000000;
        if(g1.isAB(msg.sender) != 1 || (valueWEI > this.balance)) throw;
        t1.removeFromPoolFund("ETH",valueWEI);
        getCurrencyTokensFromFaucet(valueWEI,curr);
    }

     // Date:10/11/2017 
    function transferIAFromPool(address _newPoolAddr,address curr_addr) onlyInternal
    {
            tok=SupplyToken(curr_addr);
            if(tok.balanceOf(this)>0)
            {
                tok.transfer(_newPoolAddr,tok.balanceOf(this));
            }           
    }
    
    function transferFromPool(address to,address curr_addr,uint amount) onlyInternal
    {
        tok=SupplyToken(curr_addr);
        if(tok.balanceOf(this)>=amount)
        {
            tok.transfer(to,amount);
        }
    }
    function transferToPool(address currAddr,uint amount) onlyInternal returns (bool success)
    {
        tok=SupplyToken(currAddr);
        pd1 = poolData1(poolDataAddress);
        success=tok.transferFrom(pd1.get0xMakerAddress(),poolAddress,amount);
    }
   // 20/12/2017
    function getWETHPoolBalance() constant returns(uint WETH)
    {
        pd1 = poolData1(poolDataAddress);
        tok=SupplyToken(pd1.getWETHAddress());
        return tok.balanceOf(poolAddress);
    }
    function convertWETHintoETH(bytes16[] curr,uint64[] rate,uint64 date) payable
    {
        pd1 = poolData1(poolDataAddress);
        p2=pool2(pool2Address);
        tok=SupplyToken(pd1.getWETHAddress());
        bool success= tok.transfer(msg.sender,msg.value);
        p2.saveIADetails(curr,rate,date);
    
    }
    

}
