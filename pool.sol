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
import "./nxmToken.sol";
// import "./claims.sol";
// import "./fiatFaucet.sol";
import "./governance.sol";
// import "./claims_Reward.sol";
import "./poolData.sol";
import "./quotation2.sol";
import "./master.sol";
import "./pool2.sol";
// import "./usd.sol";
import "./mcr.sol";
import "./mcrData.sol";
import "./StandardToken.sol";
import "./BasicToken.sol";
import "./SafeMaths.sol";
// import "./memberRoles.sol";
// import "./oraclize.sol";
import "github.com/oraclize/ethereum-api/oraclizeAPI_0.4.sol";
contract pool is usingOraclize{
    using SafeMaths for uint;
    master ms;
    address masterAddress;
    // address nxmtokenAddress;
    // // address claimAddress;
    // address fiatFaucetAddress;
    address poolAddress;
    address governanceAddress;
    // // address claimRewardAddress;
    // address poolDataAddress;
    // address quotation2Address; 
    address mcrAddress;
    address mcrDataAddress;
    
    // address pool2Address;
    // address memberRolesAddress;
    
    uint64 private constant _DECIMAL_1e18 = 1000000000000000000;
    uint40 private constant _DECIMAL_1e10 = 10000000000;
    
    quotation2 q2;
    nxmToken tc1;
    // claims c1;
    // claims_Reward cr;
    // fiatFaucet f1;
    governance g1;
    poolData pd;
    pool2 p2;
    // memberRoles mr;
    // address owner;
    mcr m1;
    mcrData md;
    StandardToken stok;
    BasicToken btok;

    event apiresult(address indexed sender,string msg,bytes32 myid);

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
    modifier isMemberAndcheckPause {
        // ms=master(masterAddress);
        require(ms.isPause()==false && ms.isMember(msg.sender)==true);
        _;
    }
    
    // function changeMemberRolesAddress(address memberRolesAddress) onlyInternal
    // {
    //     // memberRolesAddress = _add;
    //     mr=memberRoles(memberRolesAddress);
    // }
    
    // function changeClaimRewardAddress(address _to) onlyInternal
    // {
    //     claimRewardAddress=_to;
    // }
   
    function changeGovernanceAddress(address _add) onlyInternal
    {
        governanceAddress = _add;
        g1=governance(governanceAddress);
    }
    function changePoolDataAddress(address poolDataAddress) onlyInternal
    {
        // poolDataAddress = _add;
        pd=poolData(poolDataAddress);
    }
    // function changeFiatFaucetAddress(address fiatFaucetAddress) onlyInternal
    // {
    //     // fiatFaucetAddress = _add;
    //     f1=fiatFaucet(fiatFaucetAddress);
    // }

    function changePoolAddress(address _add) onlyInternal
    {
        poolAddress = _add;
    }
    function changeTokenAddress(address nxmTokenAddress) onlyInternal
    {
        // nxmTokenAddress = _add;
        tc1=nxmToken(nxmTokenAddress);
    }
    function changeMCRAddress(address mcrAddress) onlyInternal
    {
        // mcrAddress = _add;
        m1=mcr(mcrAddress);
    }
    function changeMCRDataAddress(address mcrDataAddress) onlyInternal
    {
        // mcrAddress = _add;
        md=mcrData(mcrDataAddress);
    }
    function changeQuotation2Address(address quotation2Address) onlyInternal
    {
        // quotation2Address = _add;
        q2=quotation2(quotation2Address);
    }
    // function changeClaimAddress(address _to) onlyInternal
    // {
    //     claimAddress = _to;
    // }
    function changePool2Address(address pool2Address)onlyInternal
    {
        // pool2Address=_add;
        p2=pool2(pool2Address);
    }
    /// @dev Save the details of the Oraclize API.
    /// @param myid Id return by the oraclize query.
    /// @param _typeof type of the query for which oraclize call is made.
    /// @param id ID of the proposal, quote, cover etc. for which oraclize call is made.
    function saveApiDetails(bytes32 myid,bytes8 _typeof,uint id) internal
    {
        // pd = poolData1(poolDataAddress);
        pd.saveApiDetails(myid,_typeof,id);
        pd.addInAllApiCall(myid);

    }
    /// @dev Save the details of the Oraclize API.
    /// @param myid Id return by the oraclize query.
    /// @param _typeof type of the query for which oraclize call is made.
    /// @param curr currencyfor which api call has been made.
    /// @param id ID of the proposal, quote, cover etc. for which oraclize call is made.
    function saveApiDetailsCurr(bytes32 myid,bytes8 _typeof,bytes4 curr,uint id) internal
    {
        // pd=poolData1(poolDataAddress);
        pd.saveApiDetailsCurr(myid,_typeof,curr,id);
        pd.addInAllApiCall(myid);
    }
    /// @dev Calls the Oraclize Query to close a given Claim after a given period of time.
    /// @param id Claim Id to be closed
    /// @param time Time (in milliseconds) after which claims assessment voting needs to be closed
    function closeClaimsOraclise(uint id , uint64 time) onlyInternal
    {
        bytes32 myid = oraclize_query(time, "URL","http://a1.nexusmutual.io/api/claims/closeClaim",3000000);
        saveApiDetails(myid,"CLA",id);
    }
    /// @dev Calls Oraclize Query to close a given Proposal after a given period of time.
    /// @param id Proposal Id to be closed
    /// @param time Time (in milliseconds) after which proposal voting needs to be closed
    function closeProposalOraclise(uint id , uint64 time) onlyInternal
    {
        bytes32 myid = oraclize_query(time, "URL","http://a1.nexusmutual.io/api/claims/closeClaim",4000000);
        saveApiDetails(myid,"PRO",id);
    }

    /// @dev Calls Oraclize Query to expire a given Cover after a given period of time.
    /// @param id Quote Id to be expired
    /// @param time Time (in milliseconds) after which the cover should be expired
    function closeCoverOraclise(uint id , uint64 time) onlyInternal
    {
        bytes32 myid = oraclize_query(time, "URL",strConcat("http://a1.nexusmutual.io/api/claims/closeClaim_hash/",uint2str(id)),1000000);
        saveApiDetails(myid,"COV",id);
    }
    /// @dev Calls the Oraclize Query to update the version of the contracts.    
    function versionOraclise(uint version) onlyInternal
    {
        bytes32 myid = oraclize_query("URL","http://a1.nexusmutual.io/api/mcr/setlatest/T");
        saveApiDetails(myid,"VER",version);
    }
    /// @dev Calls the Oraclize Query to initiate MCR calculation.
    /// @param time Time (in milliseconds) after which the next MCR calculation should be initiated
    function MCROraclise(uint64 time) onlyInternal
    {
        bytes32 myid = oraclize_query(time, "URL","http://a3.nexusmutual.io");
        saveApiDetails(myid,"MCR",0);
    }
    /// @dev Calls the Oraclize Query incase MCR calculation fails.
    /// @param time Time (in milliseconds) after which the next MCR calculation should be initiated
    function MCROracliseFail(uint id,uint64 time) onlyInternal
    {
        bytes32 myid = oraclize_query(time, "URL","",1000000);
        saveApiDetails(myid,"MCRF",id);
    }
    
    // /// @dev Oraclize call to Subtract CSA for a given quote id.
    // function subtractQuotationOracalise(uint id) onlyInternal
    // {
    //     bytes32 myid = oraclize_query("URL",strConcat("http://a1.nexusmutual.io/api/claims/subtractQuoteSA_hash/",uint2str(id)),50000);
    //     saveApiDetails(myid,"SUB",id);     
    // }
    /// @dev Oraclize call to update investment asset rates.
    function saveIADetailsOracalise(uint64 time) onlyInternal
    {
        bytes32 myid = oraclize_query(time, "URL","http://a3.nexusmutual.io");
        saveApiDetails(myid,"0X",0);     
    }
    ///@dev Oraclize call to close 0x order for a given currency.
    function close0xOrders(bytes4 curr,uint id,uint time) onlyInternal
    {
        bytes32 myid= oraclize_query(time,"URL","http://a3.nexusmutual.io",300000);
        saveApiDetailsCurr(myid,"Close0x",curr,id);
    }
    ///@dev Oraclize call to close emergency pause.
    function closeEmergencyPause(uint time) onlyInternal
    {
        bytes32 myid= oraclize_query(time,"URL","",300000);
        saveApiDetails(myid,"Pause",0);
    }
    /// @dev Handles callback of external oracle query. 
    function __callback(bytes32 myid, string res)
    {
        // ms=master(masterAddress);
        // p2=pool2(pool2Address);
        if(msg.sender != oraclize_cbAddress() && ms.isOwner(msg.sender)!=true) throw;
        p2.delegateCallBack(myid,res);     
    }

    /// @dev Begins making cover.
    /// @param smartCAdd Smart Contract Address
   function makeCoverBegin(uint8 prodId, address smartCAdd,bytes4 coverCurr,uint[] coverDetails, uint16 coverPeriod, uint8 _v, bytes32 _r, bytes32 _s)isMemberAndcheckPause payable
    {
        // q2=quotation2(quotation2Address);
        if(msg.value==coverDetails[1])
             q2.verifyCoverDetails(prodId,msg.sender,smartCAdd,coverCurr,coverDetails,coverPeriod,_v,_r,_s);
        else
            throw;
    }

    /// @dev User can buy the nxmToken equivalent to the amount paid by the user.
    function buyTokenBegin()isMemberAndcheckPause payable 
    {
        // tc1=nxmToken(tokenAddress);
        uint amount= msg.value;
        tc1.buyToken(amount,msg.sender);
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
    function bytes16ToString(bytes16 x) internal constant returns (string) 
    {
        bytes memory bytesString = new bytes(32);
        uint charCount = 0;
        for (uint j = 0; j < 32; j++) {
            byte char = byte(bytes16(uint(x) * 2 ** (8 * j)));//Check for overflow and underflow conditions using SafeMaths
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
    function takeEthersOnly() payable onlyOwner
    {
        // tc1=nxmToken(tokenAddress);
        // uint amount = msg.value;
        // tc1.addToPoolFund("ETH",amount);
    }

    // /// @dev Allocates currency tokens to the pool fund.
    // /// @param valueWEI  Purchasing Amount(in wei). 
    // /// @param curr Currency's Name.
    // function getCurrencyTokensFromFaucet(uint valueWEI , bytes4 curr) onlyInternal
    // {
    //     // f1=fiatFaucet(fiatFaucetAddress);
    //     f1.transferToken.value(valueWEI)(curr);
    // }
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
        // p2=pool2(pool2Address);
        // g1 = governance(governanceAddress);
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
                    // tc1.removeFromPoolFund("ETH",amount);
                }
           }
        }
    }
    
    
    /// @dev Transfers back the given amount to the owner.
    function transferBackEther(uint256 amount) onlyOwner  
    {
        amount = SafeMaths.mul(amount, _DECIMAL_1e10);  
        bool succ = transferEther(amount, msg.sender);   
        if(succ==true)
        {
            // tc1=nxmToken(tokenAddress);
            // Subtracts the transferred amount from the Pool Fund.
            // tc1.removeFromPoolFund("ETH",amount);  
        }
    }
    /// @dev Allocates the Equivalent Currency Tokens for a given amount of Ethers.
    /// @param valueETH  Tokens Purchasing Amount in ETH. 
    /// @param curr Currency Name.
    function getCurrTokensFromFaucet(uint valueETH , bytes4 curr) onlyOwner
    {
        // g1 = governance(governanceAddress);
        uint valueWEI =SafeMaths.mul(valueETH,_DECIMAL_1e18);
        if(g1.isAB(msg.sender) != true || (valueWEI > this.balance)) throw;
        // tc1.removeFromPoolFund("ETH",valueWEI);
        
        
        transferPayout(msg.sender,curr,valueWEI);
        // Review this
        // getCurrencyTokensFromFaucet(valueWEI,curr);
    }

    
    ///@dev Gets pool balance of a given investmentasset.
    function getBalanceofInvestmentAsset(bytes8 _curr) constant returns(uint balance)
    {
        // pd = poolData1(poolDataAddress);
        address currAddress=pd.getInvestmentAssetAddress(_curr);
        btok=BasicToken(currAddress);
        return btok.balanceOf(poolAddress);
    }
    
    function transferIAFromPool(address _newPoolAddr) onlyOwner
    {
        // pd = poolData1(poolDataAddress);
        for(uint64 i=0;i<pd.getInvestmentCurrencyLen();i++)
        {
            bytes8 curr_name=pd.getInvestmentCurrencyByIndex(i);
            address curr_addr=pd.getInvestmentAssetAddress(curr_name);
            transferIAFromPool(_newPoolAddr,curr_addr);
        }   
    }
    ///@dev Transfers investment asset from current pool address to the new pool address.
    function transferIAFromPool(address _newPoolAddr,address curr_addr) onlyInternal
    {
        btok=BasicToken(curr_addr);
        if(btok.balanceOf(this)>0)
        {
            btok.transfer(_newPoolAddr,btok.balanceOf(this));
        }           
    }
    ///@dev Gets pool balance of a given investmentasset.
    function getBalanceOfCurrencyAsset(bytes8 _curr) constant returns(uint balance)
    {
        // pd = poolData1(poolDataAddress);
        btok=BasicToken(pd.getCurrencyAssetAddress(_curr));
        return btok.balanceOf(poolAddress);
    }
    function transferCurrencyFromPool(address _newPoolAddr) onlyOwner
    {
        // pd = poolData1(poolDataAddress);
        for(uint64 i=0;i<pd.getAllCurrenciesLen();i++)
        {
            bytes8 curr_name=pd.getAllCurrenciesByIndex(i);
            address curr_addr=pd.getCurrencyAssetAddress(curr_name);
            transferCurrencyFromPool(_newPoolAddr,curr_addr);
        }   
    }
    ///@dev Transfers investment asset from current pool address to the new pool address.
    function transferCurrencyFromPool(address _newPoolAddr,address curr_addr) onlyInternal
    {
        btok=BasicToken(curr_addr);
        if(btok.balanceOf(this)>0)
        {
            btok.transfer(_newPoolAddr,btok.balanceOf(this));
        }           
    }
    function transferPayout(address _to, bytes8 _curr, uint _value) onlyInternal
    {
        btok=BasicToken(pd.getCurrencyAssetAddress(_curr));
        if(btok.balanceOf(this)>_value)
            btok.transfer(_to, _value);
    }
    ///@dev Transfers currency asset from current pool address to the new pool address.
    function transferFromPool(address _to,address _curr_addr,uint _amount) onlyInternal
    {
        btok=BasicToken(_curr_addr);
        if(btok.balanceOf(this)>=_amount)
            btok.transfer(_to,_amount);
    }

    function transferToPool(address currAddr,uint amount) onlyInternal returns (bool success)
    {
        stok=StandardToken(currAddr);
        // pd = poolData1(poolDataAddress);
        success=stok.transferFrom(pd.get0xMakerAddress(),poolAddress,amount);
    }
    ///@dev Get 0x wrapped ether pool balance.
    function getWETHPoolBalance() constant returns(uint WETH)
    {
        // pd = poolData1(poolDataAddress);
        btok=BasicToken(pd.getWETHAddress());
        return btok.balanceOf(poolAddress);
    }
    ///@dev Get 0x order details by hash.
    function getOrderDetailsByHash(bytes16 orderType,bytes8 makerCurr,bytes8 takerCurr) constant returns(address makerCurrAddr,address takerCurrAddr,uint salt,address feeRecipient,address takerAddress,uint makerFee,uint takerFee)
    {
        // pd=poolData1(poolDataAddress);
        // f1=fiatFaucet(fiatFaucetAddress);
        if(orderType=="ELT")
        {
            if(makerCurr=="ETH")
                makerCurrAddr=pd.getWETHAddress();
            else
                makerCurrAddr=pd.getCurrencyAssetAddress(makerCurr);
            takerCurrAddr=pd.getInvestmentAssetAddress(takerCurr);
        }
        else if(orderType=="ILT")
        {
            makerCurrAddr=pd.getInvestmentAssetAddress(makerCurr);
            if(takerCurr=="ETH")
                takerCurrAddr=pd.getWETHAddress();
            else
                takerCurrAddr=pd.getCurrencyAssetAddress(takerCurr);
        }
        else if(orderType=="RBT")
        {
            makerCurrAddr=pd.getInvestmentAssetAddress(makerCurr);
            takerCurrAddr=pd.getWETHAddress();
        }
        salt=pd.getOrderSalt();
        feeRecipient=pd.get0xFeeRecipient();
        takerAddress=pd.get0xTakerAddress();
        makerFee=pd.get0xMakerFee();
        takerFee=pd.get0xTakerFee();
    }
    function makeCoverUsingCA(uint8 prodId, address smartCAdd,bytes4 coverCurr,uint[] coverDetails,uint16 coverPeriod, uint8 _v, bytes32 _r, bytes32 _s) isMemberAndcheckPause
    {
        stok=StandardToken(pd.getCurrencyAssetAddress(coverCurr));
        stok.transferFrom(msg.sender,this,coverDetails[1]);
        q2.verifyCoverDetails(prodId,msg.sender,smartCAdd,coverCurr,coverDetails,coverPeriod,_v,_r,_s);
    }
    function sellNXMTokens(uint sellTokens)isMemberAndcheckPause{
        uint sellingPrice= SafeMaths.div(SafeMaths.mul(SafeMaths.mul(m1.calculateTokenPrice("ETH"),sellTokens),975),1000);
        uint sellTokensx10e18=SafeMaths.mul(sellTokens,_DECIMAL_1e18);
        require(sellTokensx10e18<=getMaxSellTokens());
        tc1.burnTokenForFunding(sellTokensx10e18,msg.sender,"ForTokenSell",0);
        bool succ = msg.sender.send(sellingPrice);
        if(succ==false)throw;
    }
  
  function getMaxSellTokens()constant returns(uint maxTokens){
        uint maxTokensAccPoolBal=SafeMaths.sub(getEtherPoolBalance(),SafeMaths.mul(SafeMaths.div(SafeMaths.mul(50,pd.getCurrencyAssetBaseMin("ETH")),100),_DECIMAL_1e18));
        maxTokensAccPoolBal = SafeMaths.mul(SafeMaths.div(maxTokensAccPoolBal,m1.calculateTokenPrice("ETH")),_DECIMAL_1e18);
        maxTokens = SafeMaths.mul(SafeMaths.div(SafeMaths.mul(SafeMaths.sub(md.getLastMCRPerc(),10000),2000),10000),_DECIMAL_1e18);
        if(maxTokens>maxTokensAccPoolBal)
            maxTokens=maxTokensAccPoolBal;
    }
}
