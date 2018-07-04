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
import "./governance.sol";
import "./poolData.sol";
import "./quotation2.sol";
import "./master.sol";
import "./pool2.sol";
import "./mcr.sol";
import "./mcrData.sol";
import "./StandardToken.sol";
import "./BasicToken.sol";
import "./SafeMaths.sol";
import "./oraclizeAPI_0.4.sol";
import "./Iupgradable.sol";


contract pool is usingOraclize, Iupgradable {
    using SafeMaths
    for uint;

    master ms;
    address masterAddress;
    address poolAddress;
    address governanceAddress;
    address mcrAddress;
    address mcrDataAddress;

    uint64 private constant DECIMAL1E18 = 1000000000000000000;
    uint40 private constant DECIMAL1E10 = 10000000000;

    quotation2 q2;
    nxmToken tc1;
    governance g1;
    poolData pd;
    pool2 p2;
    mcr m1;
    mcrData md;
    StandardToken stok;
    BasicToken btok;

    event Apiresult(address indexed sender, string msg, bytes32 myid);

    function changeMasterAddress(address _add) {
        if (masterAddress == 0x000) {
            masterAddress = _add;
            ms = master(masterAddress);
        } else {
            ms = master(masterAddress);
            require(ms.isInternal(msg.sender) == true);
            masterAddress = _add;
            
        }

    }

    modifier onlyInternal {

        require(ms.isInternal(msg.sender) == true);
        _;
    }

    modifier onlyOwner {

        require(ms.isOwner(msg.sender) == true);
        _;
    }

    modifier isMemberAndcheckPause {

        require(ms.isPause() == false && ms.isMember(msg.sender) == true);
        _;
    }

    function changeDependentContractAddress() onlyInternal {
        uint currentVersion = ms.currentVersion();
        m1 = mcr(ms.versionContractAddress(currentVersion, "MCR"));
        tc1 = nxmToken(ms.versionContractAddress(currentVersion, "TOK1"));
        pd = poolData(ms.versionContractAddress(currentVersion, "PD"));
        md = mcrData(ms.versionContractAddress(currentVersion, "MD"));
        g1 = governance(ms.versionContractAddress(currentVersion, "GOV1"));
        q2 = quotation2(ms.versionContractAddress(currentVersion, "Q2"));
        p2 = pool2(ms.versionContractAddress(currentVersion, "P2"));
    }
    
    /// @dev Changes pool address.
    function changePoolAddress(address _add) onlyInternal {
        poolAddress = _add;
    }

    /// @dev Calls the Oraclize Query to close a given Claim after a given period of time.
    /// @param id Claim Id to be closed
    /// @param time Time (in milliseconds) after which claims assessment voting needs to be closed
    function closeClaimsOraclise(uint id, uint64 time) onlyInternal {
        bytes32 myid = oraclize_query(time, "URL", "http://a1.nexusmutual.io/api/claims/closeClaim", 3000000);
        saveApiDetails(myid, "CLA", id);
    }

    /// @dev Calls Oraclize Query to close a given Proposal after a given period of time.
    /// @param id Proposal Id to be closed
    /// @param time Time (in milliseconds) after which proposal voting needs to be closed
    function closeProposalOraclise(uint id, uint64 time) onlyInternal {
        bytes32 myid = oraclize_query(time, "URL", "http://a1.nexusmutual.io/api/claims/closeClaim", 4000000);
        saveApiDetails(myid, "PRO", id);
    }

    /// @dev Calls Oraclize Query to expire a given Cover after a given period of time.
    /// @param id Quote Id to be expired
    /// @param time Time (in milliseconds) after which the cover should be expired
    function closeCoverOraclise(uint id, uint64 time) onlyInternal {
        bytes32 myid = oraclize_query(time, "URL", strConcat("http://a1.nexusmutual.io/api/claims/closeClaim_hash/", uint2str(id)), 1000000);
        saveApiDetails(myid, "COV", id);
    }

    /// @dev Calls the Oraclize Query to update the version of the contracts.    
    function versionOraclise(uint version) onlyInternal {
        bytes32 myid = oraclize_query("URL", "http://a1.nexusmutual.io/api/mcr/setlatest/T");
        saveApiDetails(myid, "VER", version);
    }

    /// @dev Calls the Oraclize Query to initiate MCR calculation.
    /// @param time Time (in milliseconds) after which the next MCR calculation should be initiated
    function mcrOraclise(uint64 time) onlyInternal {
        bytes32 myid = oraclize_query(time, "URL", "http://a3.nexusmutual.io");
        saveApiDetails(myid, "MCR", 0);
    }

    /// @dev Calls the Oraclize Query incase MCR calculation fails.
    /// @param time Time (in milliseconds) after which the next MCR calculation should be initiated
    function mcrOracliseFail(uint id, uint64 time) onlyInternal {
        bytes32 myid = oraclize_query(time, "URL", "", 1000000);
        saveApiDetails(myid, "MCRF", id);
    }

    /// @dev Oraclize call to update investment asset rates.
    function saveIADetailsOracalise(uint64 time) onlyInternal {
        bytes32 myid = oraclize_query(time, "URL", "http://a3.nexusmutual.io");
        saveApiDetails(myid, "0X", 0);
    }

    ///@dev Oraclize call to close 0x order for a given currency.
    function close0xOrders(bytes4 curr, uint id, uint time) onlyInternal {
        bytes32 myid = oraclize_query(time, "URL", "http://a3.nexusmutual.io", 300000);
        saveApiDetailsCurr(myid, "Close0x", curr, id);
    }

    ///@dev Oraclize call to close emergency pause.
    function closeEmergencyPause(uint time) onlyInternal {
        bytes32 myid = oraclize_query(time, "URL", "", 300000);
        saveApiDetails(myid, "Pause", 0);
    }

    /// @dev Handles callback of external oracle query. 
    function __callback(bytes32 myid) {

        require(msg.sender == oraclize_cbAddress() || ms.isOwner(msg.sender) == true);
        p2.delegateCallBack(myid);
    }

    /// @dev Begins making cover.
    /// @param smartCAdd Smart Contract Address
    function makeCoverBegin(
        uint8 prodId, 
        address smartCAdd, 
        bytes4 coverCurr, 
        uint[] coverDetails, 
        uint16 coverPeriod, 
        uint8 _v, 
        bytes32 _r, 
        bytes32 _s
        ) isMemberAndcheckPause payable {

        require(msg.value == coverDetails[1]);
        q2.verifyCoverDetails(prodId, msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
        
    }

    /// @dev User can buy the nxmToken equivalent to the amount paid by the user.
    function buyTokenBegin() isMemberAndcheckPause payable {

        uint amount = msg.value;
        tc1.buyToken(amount, msg.sender);
    }

    /// @dev Sends a given Ether amount to a given address.
    /// @param amount amount (in wei) to send.
    /// @param _add Receiver's address.
    /// @return succ True if transfer is a success, otherwise False.
    function transferEther(uint amount, address _add) onlyInternal constant returns(bool succ) {
        succ = _add.send(amount);      
    }

    /// @dev Payable method for allocating some amount to the Pool. 
    function takeEthersOnly() payable onlyOwner {

    }

    /// @dev Gets the Balance of the Pool in wei.
    function getEtherPoolBalance() constant returns(uint bal) {
        bal = this.balance;
    }

    /// @dev Sends the amount requested by a given proposal to an address, after the Proposal gets passed.
    /// @dev Used for proposals categorized under Engage in external services   
    /// @param _to Receiver's address.
    /// @param amount Sending amount.
    /// @param id Proposal Id.
    function proposalExtServicesPayout(address _to, uint amount, uint id) onlyInternal {

        if (msg.sender == governanceAddress) {
            if (this.balance < amount) {
                g1.changeStatusFromPool(id);
            } else {
                bool succ = _to.send(amount);
                if (succ == true) {
                    p2.callPayoutEvent(_to, "PayoutAB", id, amount);

                }
            }
        }
    }

    /// @dev Transfers back the given amount to the owner.
    function transferBackEther(uint256 amount) onlyOwner {
        amount = SafeMaths.mul(amount, DECIMAL1E10);
        bool succ = transferEther(amount, msg.sender);
        if (succ == true) {}
    }

    /// @dev Allocates the Equivalent Currency Tokens for a given amount of Ethers.
    /// @param valueETH  Tokens Purchasing Amount in ETH. 
    /// @param curr Currency Name.
    function getCurrTokensFromFaucet(uint valueETH, bytes4 curr) onlyOwner {

        uint valueWEI = SafeMaths.mul(valueETH, DECIMAL1E18);
        require(g1.isAB(msg.sender) == true && (valueWEI <= this.balance));

        transferPayout(msg.sender, curr, valueWEI);

    }

    ///@dev Gets pool balance of a given investmentasset.
    function getBalanceofInvestmentAsset(bytes8 _curr) constant returns(uint balance) {
        address currAddress = pd.getInvestmentAssetAddress(_curr);
        btok = BasicToken(currAddress);
        return btok.balanceOf(poolAddress);
    }

    /// @dev transfers investment assets from old pool to new pool address.
    function transferIAFromPool(address _newPoolAddr) onlyOwner {

        for (uint64 i = 0; i < pd.getInvestmentCurrencyLen(); i++) {
            bytes8 currName = pd.getInvestmentCurrencyByIndex(i);
            address currAddr = pd.getInvestmentAssetAddress(currName);
            transferIAFromPool(_newPoolAddr, currAddr);
        }
    }

    ///@dev Transfers investment asset from current pool address to the new pool address.
    function transferIAFromPool(address _newPoolAddr, address currAddr) onlyInternal {
        btok = BasicToken(currAddr);
        if (btok.balanceOf(this) > 0) {
            btok.transfer(_newPoolAddr, btok.balanceOf(this));
        }
    }

    ///@dev Gets pool balance of a given investmentasset.
    function getBalanceOfCurrencyAsset(bytes8 _curr) constant returns(uint balance) {

        btok = BasicToken(pd.getCurrencyAssetAddress(_curr));
        return btok.balanceOf(poolAddress);
    }

    ///@dev Transfers currency from current pool address to the new pool address.
    function transferCurrencyFromPool(address _newPoolAddr) onlyOwner {

        for (uint64 i = 0; i < pd.getAllCurrenciesLen(); i++) {
            bytes8 currName = pd.getAllCurrenciesByIndex(i);
            address currAddr = pd.getCurrencyAssetAddress(currName);
            transferCurrencyFromPool(_newPoolAddr, currAddr);
        }
    }

    ///@dev Transfers investment asset from current pool address to the new pool address.
    function transferCurrencyFromPool(address _newPoolAddr, address currAddr) onlyInternal {
        btok = BasicToken(currAddr);
        if (btok.balanceOf(this) > 0) {
            btok.transfer(_newPoolAddr, btok.balanceOf(this));
        }
    }

    /// @dev Transfers Amount to user when claim get accepted.
    function transferPayout(address _to, bytes8 _curr, uint _value) onlyInternal {
        btok = BasicToken(pd.getCurrencyAssetAddress(_curr));
        if (btok.balanceOf(this) > _value)
            btok.transfer(_to, _value);
    }

    /// @dev Transfers currency asset from current pool address to the new pool address.
    function transferFromPool(address _to, address _currAddr, uint _amount) onlyInternal {
        btok = BasicToken(_currAddr);
        if (btok.balanceOf(this) >= _amount)
            btok.transfer(_to, _amount);
    }

    /// @dev Transfers amount to pool from maker.
    function transferToPool(address currAddr, uint amount) onlyInternal returns(bool success) {
        stok = StandardToken(currAddr);
        success = stok.transferFrom(pd.get0xMakerAddress(), poolAddress, amount);
    }

    ///@dev Get 0x wrapped ether pool balance.
    function getWETHPoolBalance() constant returns(uint wETH) {
        btok = BasicToken(pd.getWETHAddress());
        return btok.balanceOf(poolAddress);
    }

    ///@dev Get 0x order details by hash.
    function getOrderDetailsByHash(bytes16 orderType, bytes8 makerCurr, bytes8 takerCurr) 
    constant 
    returns(
        address makerCurrAddr, 
        address takerCurrAddr, 
        uint salt, 
        address feeRecipient, 
        address takerAddress, 
        uint makerFee, 
        uint takerFee
        ) {

        if (orderType == "ELT") {
            if (makerCurr == "ETH")
                makerCurrAddr = pd.getWETHAddress();
            else
                makerCurrAddr = pd.getCurrencyAssetAddress(makerCurr);
            takerCurrAddr = pd.getInvestmentAssetAddress(takerCurr);
        } else if (orderType == "ILT") {
            makerCurrAddr = pd.getInvestmentAssetAddress(makerCurr);
            if (takerCurr == "ETH")
                takerCurrAddr = pd.getWETHAddress();
            else
                takerCurrAddr = pd.getCurrencyAssetAddress(takerCurr);
        } else if (orderType == "RBT") {
            makerCurrAddr = pd.getInvestmentAssetAddress(makerCurr);
            takerCurrAddr = pd.getWETHAddress();
        }
        salt = pd.getOrderSalt();
        feeRecipient = pd.get0xFeeRecipient();
        takerAddress = pd.get0xTakerAddress();
        makerFee = pd.get0xMakerFee();
        takerFee = pd.get0xTakerFee();
    }

    /// @dev make cover currency.
    function makeCoverUsingCA(
        uint8 prodId, 
        address smartCAdd, 
        bytes4 coverCurr, 
        uint[] coverDetails, 
        uint16 coverPeriod, 
        uint8 _v, 
        bytes32 _r, 
        bytes32 _s
        ) isMemberAndcheckPause {
        stok = StandardToken(pd.getCurrencyAssetAddress(coverCurr));
        stok.transferFrom(msg.sender, this, coverDetails[1]);
        q2.verifyCoverDetails(prodId, msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
    }

    /// @dev selling NXM tokens.
    function sellNXMTokens(uint sellTokens) isMemberAndcheckPause {
        require(tc1.balanceOf(msg.sender) >= sellTokens); // Check if the sender has enough
        uint sellingPrice = SafeMaths.div(SafeMaths.mul(SafeMaths.mul(m1.calculateTokenPrice("ETH"), sellTokens), 975), 1000);
        uint sellTokensx10e18 = SafeMaths.mul(sellTokens, DECIMAL1E18);
        require(sellTokensx10e18 <= getMaxSellTokens());
        tc1.burnTokenForFunding(sellTokensx10e18, msg.sender, "ForTokenSell", 0);
        bool succ = msg.sender.send(sellingPrice);
        require(succ != false);
    }

    /// @dev Max numbers of tokens can be sold.
    function getMaxSellTokens() constant returns(uint maxTokens) {
        uint maxTokensAccPoolBal = SafeMaths.sub(getEtherPoolBalance(), SafeMaths.mul(
            SafeMaths.div(SafeMaths.mul(50, pd.getCurrencyAssetBaseMin("ETH")), 100), DECIMAL1E18));
        maxTokensAccPoolBal = SafeMaths.mul(SafeMaths.div(maxTokensAccPoolBal, m1.calculateTokenPrice("ETH")), DECIMAL1E18);
        maxTokens = SafeMaths.mul(SafeMaths.div(SafeMaths.mul(SafeMaths.sub(md.getLastMCRPerc(), 10000), 2000), 10000), DECIMAL1E18);
        if (maxTokens > maxTokensAccPoolBal)
            maxTokens = maxTokensAccPoolBal;
    }

    /// @dev Save the details of the Oraclize API.
    /// @param myid Id return by the oraclize query.
    /// @param _typeof type of the query for which oraclize call is made.
    /// @param id ID of the proposal, quote, cover etc. for which oraclize call is made.
    function saveApiDetails(bytes32 myid, bytes8 _typeof, uint id) internal {

        pd.saveApiDetails(myid, _typeof, id);
        pd.addInAllApiCall(myid);

    }

    /// @dev Save the details of the Oraclize API.
    /// @param myid Id return by the oraclize query.
    /// @param _typeof type of the query for which oraclize call is made.
    /// @param curr currencyfor which api call has been made.
    /// @param id ID of the proposal, quote, cover etc. for which oraclize call is made.
    function saveApiDetailsCurr(bytes32 myid, bytes8 _typeof, bytes4 curr, uint id) internal {

        pd.saveApiDetailsCurr(myid, _typeof, curr, id);
        pd.addInAllApiCall(myid);
    }

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

}