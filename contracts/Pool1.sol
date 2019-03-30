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

import "./PoolData.sol";
import "./imports/oraclize/ethereum-api/usingOraclize.sol";
import "./Claims.sol";
import "./Quotation.sol";
import "./Pool2.sol";
import "./MCR.sol";


contract Pool1 is usingOraclize, Iupgradable {
    using SafeMath for uint;

    Quotation internal q2;
    NXMToken internal tk;
    TokenController internal tc;
    TokenFunctions internal tf;
    Pool2 internal p2;
    PoolData internal pd;
    MCR internal m1;
    Claims public c1;
    TokenData internal td;
    bool internal locked;

    uint internal constant DECIMAL1E18 = uint(10) ** 18;
    // uint internal constant PRICE_STEP = uint(1000) * DECIMAL1E18;

    event Apiresult(address indexed sender, string msg, bytes32 myid);
    event Payout(address indexed to, uint coverId, uint tokens);

    modifier noReentrancy() {
        require(!locked, "Reentrant call.");
        locked = true;
        _;
        locked = false;
    }

    function () public payable {} //solhint-disable-line

    /**
     * @dev Pays out the sum assured in case a claim is accepted
     * @param coverid Cover Id.
     * @param claimid Claim Id.
     * @return succ true if payout is successful, false otherwise. 
     */ 
    function sendClaimPayout(
        uint coverid,
        uint claimid,
        uint sumAssured,
        address coverHolder,
        bytes4 coverCurr
    )
        external
        onlyInternal
        noReentrancy
        returns(bool succ)
    {
        
        uint sa = sumAssured.div(DECIMAL1E18);
        bool check;
        IERC20 erc20 = IERC20(pd.getCurrencyAssetAddress(coverCurr));

        //Payout
        if (coverCurr == "ETH" && address(this).balance >= sumAssured) {
            check = _transferCurrencyAsset(coverCurr, coverHolder, sumAssured);
        } else if (coverCurr == "DAI" && erc20.balanceOf(address(this)) >= sumAssured) {
            
            check = _transferCurrencyAsset(coverCurr, coverHolder, sumAssured);
        }
        
        if (check == true) {
            q2.removeSAFromCSA(coverid, sa);
            pd.changeCurrencyAssetVarMin(coverCurr, 
                pd.getCurrencyAssetVarMin(coverCurr).sub(sumAssured));
            emit Payout(coverHolder, coverid, sumAssured);
            succ = true;
        } else {
            c1.setClaimStatus(claimid, 12);
        }
        _triggerExternalLiquidityTrade();
        // p2.internalLiquiditySwap(coverCurr);

        tf.burnStakerLockedToken(coverid, coverCurr, sumAssured);
    }

    /**
     * @dev to trigger external liquidity trade
     */
    function triggerExternalLiquidityTrade() external onlyInternal {
        _triggerExternalLiquidityTrade();
    }

    ///@dev Oraclize call to close emergency pause.
    function closeEmergencyPause(uint time) external onlyInternal {
        bytes32 myid = _oraclizeQuery(4, time, "URL", "", 300000);
        _saveApiDetails(myid, "EP", 0);
    }

    /// @dev Calls the Oraclize Query to close a given Claim after a given period of time.
    /// @param id Claim Id to be closed
    /// @param time Time (in seconds) after which Claims assessment voting needs to be closed
    function closeClaimsOraclise(uint id, uint time) external onlyInternal {
        bytes32 myid = _oraclizeQuery(4, time, "URL", "", 3000000);
        _saveApiDetails(myid, "CLA", id);
    }

    /// @dev Calls Oraclize Query to expire a given Cover after a given period of time.
    /// @param id Quote Id to be expired
    /// @param time Time (in seconds) after which the cover should be expired
    function closeCoverOraclise(uint id, uint64 time) external onlyInternal {
        bytes32 myid = _oraclizeQuery(4, time, "URL", strConcat(
            "http://a1.nexusmutual.io/api/Claims/closeClaim_hash/", uint2str(id)), 1000000);
        _saveApiDetails(myid, "COV", id);
    }

    /// @dev Calls the Oraclize Query to initiate MCR calculation.
    /// @param time Time (in milliseconds) after which the next MCR calculation should be initiated
    function mcrOraclise(uint time) external onlyInternal {
        bytes32 myid = _oraclizeQuery(3, time, "URL", "https://a2.nexusmutual.io/nxmmcr.js/postMCR/LT", 0);
        _saveApiDetails(myid, "MCR", 0);
    }

    /// @dev Calls the Oraclize Query in case MCR calculation fails.
    /// @param time Time (in seconds) after which the next MCR calculation should be initiated
    function mcrOracliseFail(uint id, uint time) external onlyInternal {
        bytes32 myid = _oraclizeQuery(4, time, "URL", "", 1000000);
        _saveApiDetails(myid, "MCRF", id);
    }

    /// @dev Oraclize call to update investment asset rates.
    function saveIADetailsOracalise(uint time) external onlyInternal {
        bytes32 myid = _oraclizeQuery(3, time, "URL", "http://a3.nexusmutual.io", 0);
        _saveApiDetails(myid, "IARB", 0);
    }
    
    /**
     * @dev Transfers all assest (i.e ETH balance, Currency Assest) from old Pool to new Pool
     * @param newPoolAddress Address of the new Pool
     */
    function upgradeCapitalPool(address newPoolAddress) external noReentrancy onlyInternal {
        for (uint64 i = 1; i < pd.getAllCurrenciesLen(); i++) {
            bytes4 caName = pd.getCurrenciesByIndex(i);
            _upgradeCapitalPool(caName, newPoolAddress);
        }
        if (address(this).balance > 0)
            newPoolAddress.transfer(address(this).balance); //solhint-disable-line
    }

    /**
     * @dev Iupgradable Interface to update dependent contract address
     */
    function changeDependentContractAddress() public {
        m1 = MCR(ms.getLatestAddress("MC"));
        tk = NXMToken(ms.tokenAddress());
        tf = TokenFunctions(ms.getLatestAddress("TF"));
        tc = TokenController(ms.getLatestAddress("TC"));
        pd = PoolData(ms.getLatestAddress("PD"));
        q2 = Quotation(ms.getLatestAddress("QT"));
        p2 = Pool2(ms.getLatestAddress("P2"));
        c1 = Claims(ms.getLatestAddress("CL"));
        td = TokenData(ms.getLatestAddress("TD"));
    }

    /**
     * @dev transfers currency asset to an address
     * @param curr is the currency of currency asset to transfer
     * @param transferTo is address to transfer currency asset to
     * @param amount is amount of currency asset to transfer
     * @return boolean to represent success or failure
     */
    function transferCurrencyAsset(
        bytes4 curr,
        address transferTo,
        uint amount
    )
        public
        onlyInternal
        noReentrancy
        returns(bool)
    {
    
        return _transferCurrencyAsset(curr, transferTo, amount);
    } 

    /// @dev Handles callback of external oracle query.
    function __callback(bytes32 myid, string result) public {
        result; //silence compiler warning
        // owner will be removed from production build
        ms.delegateCallBack(myid);
    }

    /// @dev Enables user to purchase cover with funding in ETH.
    /// @param smartCAdd Smart Contract Address
    function makeCoverBegin(
        address smartCAdd,
        bytes4 coverCurr,
        uint[] coverDetails,
        uint16 coverPeriod,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        public
        isMember
        checkPause
        payable
    {
        require(msg.value == coverDetails[1]);
        q2.verifyCoverDetails(msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
    }

    /**
     * @dev Enables user to purchase cover via currency asset eg DAI
     */ 
    function makeCoverUsingCA(
        address smartCAdd,
        bytes4 coverCurr,
        uint[] coverDetails,
        uint16 coverPeriod,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) 
        public
        isMember
        checkPause
    {
        IERC20 erc20 = IERC20(pd.getCurrencyAssetAddress(coverCurr));
        require(erc20.transferFrom(msg.sender, address(this), coverDetails[1]), "Transfer failed");
        q2.verifyCoverDetails(msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
    }

    /// @dev Enables user to purchase NXM at the current token price.
    function buyToken() public payable isMember checkPause returns(bool success) {
        require(msg.value > 0);
        uint tokenPurchased = _getToken(address(this).balance, msg.value);
        tc.mint(msg.sender, tokenPurchased);
        success = true;
    }

    /// @dev Sends a given amount of Ether to a given address.
    /// @param amount amount (in wei) to send.
    /// @param _add Receiver's address.
    /// @return succ True if transfer is a success, otherwise False.
    function transferEther(uint amount, address _add) public noReentrancy checkPause returns(bool succ) {
        require(ms.checkIsAuthToGoverned(msg.sender), "Not authorized to Govern");
        succ = _add.send(amount);
    }

    /**
     * @dev Allows selling of NXM for ether.
     * Seller first needs to give this contract allowance to
     * transfer/burn tokens in the NXMToken contract
     * @param  _amount Amount of NXM to sell
     * @return success returns true on successfull sale
     */
    function sellNXMTokens(uint _amount) public isMember noReentrancy checkPause returns(bool success) {
        require(tk.balanceOf(msg.sender) >= _amount, "Not enough balance");
        require(!tf.isLockedForMemberVote(msg.sender), "Member voted");
        require(_amount <= m1.getMaxSellTokens(), "exceeds maximum token sell limit");
        uint sellingPrice = _getWei(_amount);
        tc.burnFrom(msg.sender, _amount);
        msg.sender.transfer(sellingPrice);
        success = true;
    }

    /**
     * @dev gives the investment asset balance
     * @return investment asset balance
     */
    function getInvestmentAssetBalance() public view returns (uint balance) {
        IERC20 erc20;
        uint currTokens;
        for (uint i = 1; i < pd.getInvestmentCurrencyLen(); i++) {
            bytes4 currency = pd.getInvestmentCurrencyByIndex(i);
            erc20 = IERC20(pd.getInvestmentAssetAddress(currency));
            currTokens = erc20.balanceOf(address(p2));
            if (pd.getIAAvgRate(currency) > 0)
                balance = balance.add((currTokens.mul(100)).div(pd.getIAAvgRate(currency)));
        }

        balance = balance.add(address(p2).balance);
    }

    /**
     * @dev Returns the amount of wei a seller will get for selling NXM
     * @param amount Amount of NXM to sell
     * @return weiToPay Amount of wei the seller will get
     */
    function getWei(uint amount) public view returns(uint weiToPay) {
        return _getWei(amount);
    }

    /**
     * @dev Returns the amount of token a buyer will get for corresponding wei
     * @param weiPaid Amount of wei 
     * @return tokenToGet Amount of tokens the buyer will get
     */
    function getToken(uint weiPaid) public view returns(uint tokenToGet) {
        return _getToken((address(this).balance).add(weiPaid), weiPaid);
    }

    /**
     * @dev to trigger external liquidity trade
     */
    function _triggerExternalLiquidityTrade() internal {
        if (now > pd.lastLiquidityTradeTrigger().add(pd.liquidityTradeCallbackTime())) {
            pd.setLastLiquidityTradeTrigger();
            bytes32 myid = _oraclizeQuery(4, pd.liquidityTradeCallbackTime(), "URL", "", 300000);
            _saveApiDetails(myid, "ULT", 0);
        }
    }

    /**
     * @dev Returns the amount of wei a seller will get for selling NXM
     * @param _amount Amount of NXM to sell
     * @return weiToPay Amount of wei the seller will get
     */
    function _getWei(uint _amount) internal view returns(uint weiToPay) {
        uint tokenPrice;
        uint weiPaid;
        uint tokenSupply = tk.totalSupply();
        uint vtp;
        uint mcrFullperc;
        uint vFull;
        uint mcrtp;
        (mcrFullperc, , vFull, ) = pd.getLastMCR();
        (vtp, ) = m1.calVtpAndMCRtp();

        while (_amount > 0) {
            mcrtp = (mcrFullperc.mul(vtp)).div(vFull);
            tokenPrice = m1.calculateStepTokenPrice("ETH", mcrtp);
            tokenPrice = (tokenPrice.mul(975)).div(1000); //97.5%
            if (_amount <= td.priceStep().mul(DECIMAL1E18)) {
                weiToPay = weiToPay.add((tokenPrice.mul(_amount)).div(DECIMAL1E18));
                break;
            } else {
                _amount = _amount.sub(td.priceStep().mul(DECIMAL1E18));
                tokenSupply = tokenSupply.sub(td.priceStep().mul(DECIMAL1E18));
                weiPaid = (tokenPrice.mul(td.priceStep().mul(DECIMAL1E18))).div(DECIMAL1E18);
                vtp = vtp.sub(weiPaid);
                weiToPay = weiToPay.add(weiPaid);
            }
        }
    }

    /**
     * @dev gives the token
     * @param _poolBalance is the pool balance
     * @param _weiPaid is the amount paid in wei
     * @return the token to get
     */
    function _getToken(uint _poolBalance, uint _weiPaid) internal view returns(uint tokenToGet) {
        uint tokenPrice;
        uint superWeiLeft = (_weiPaid).mul(DECIMAL1E18);
        uint tempTokens;
        uint superWeiSpent;
        uint tokenSupply = tk.totalSupply();
        uint vtp;
        uint mcrFullperc;   
        uint vFull;
        uint mcrtp;
        (mcrFullperc, , vFull, ) = pd.getLastMCR();
        (vtp, ) = m1.calculateVtpAndMCRtp((_poolBalance).sub(_weiPaid));

        require(m1.calculateTokenPrice("ETH") > 0, "Token price can not be zero");
        while (superWeiLeft > 0) {
            mcrtp = (mcrFullperc.mul(vtp)).div(vFull);
            tokenPrice = m1.calculateStepTokenPrice("ETH", mcrtp);            
            tempTokens = superWeiLeft.div(tokenPrice);
            if (tempTokens <= td.priceStep().mul(DECIMAL1E18)) {
                tokenToGet = tokenToGet.add(tempTokens);
                break;
            } else {
                tokenToGet = tokenToGet.add(td.priceStep().mul(DECIMAL1E18));
                tokenSupply = tokenSupply.add(td.priceStep().mul(DECIMAL1E18));
                superWeiSpent = td.priceStep().mul(DECIMAL1E18).mul(tokenPrice);
                superWeiLeft = superWeiLeft.sub(superWeiSpent);
                vtp = vtp.add((td.priceStep().mul(DECIMAL1E18).mul(tokenPrice)).div(DECIMAL1E18));
            }
        }
    }

    /** 
     * @dev Save the details of the Oraclize API.
     * @param myid Id return by the oraclize query.
     * @param _typeof type of the query for which oraclize call is made.
     * @param id ID of the proposal, quote, cover etc. for which oraclize call is made.
     */ 
    function _saveApiDetails(bytes32 myid, bytes4 _typeof, uint id) internal {
        pd.saveApiDetails(myid, _typeof, id);
        pd.addInAllApiCall(myid);
    }

    /**
     * @dev transfers currency asset
     * @param _curr is currency of asset to transfer
     * @param _transferTo address that recieves currency assets
     * @param _amount is the amount to be transferred
     * @return boolean representing the success of transfer
     */
    function _transferCurrencyAsset(bytes4 _curr, address _transferTo, uint _amount) internal returns(bool succ) {
        if (_curr == "ETH") {
            if (address(this).balance < _amount)
                _amount = address(this).balance;
            _transferTo.transfer(_amount);
            succ = true;
        } else {
            IERC20 erc20 = IERC20(pd.getCurrencyAssetAddress(_curr)); //solhint-disable-line
            if (erc20.balanceOf(address(this)) < _amount) 
                _amount = erc20.balanceOf(address(this));
            erc20.transfer(_transferTo, _amount); 
            succ = true;
            
        }
    } 

    /** 
     * @dev Transfers ERC20 Currency asset from this Pool to another Pool on upgrade.
     */ 
    function _upgradeCapitalPool(
        bytes4 _curr,
        address _newPoolAddress
    ) 
        internal
    {
        IERC20 erc20 = IERC20(pd.getCurrencyAssetAddress(_curr));
        if (erc20.balanceOf(address(this)) > 0)
            erc20.transfer(_newPoolAddress, erc20.balanceOf(address(this)));
    }

    /**
     * @dev oraclize query
     * @param paramCount is number of paramters passed
     * @param timestamp is the current timestamp
     * @param datasource in concern
     * @param arg in concern
     * @param gasLimit required for query
     * @return id of oraclize query
     */
    function _oraclizeQuery(
        uint paramCount,
        uint timestamp,
        string datasource,
        string arg,
        uint gasLimit
    ) 
        internal
        returns (bytes32 id)
    {
        if (paramCount == 4) {
            id = oraclize_query(timestamp, datasource, arg, gasLimit);   
        } else if (paramCount == 3) {
            id = oraclize_query(timestamp, datasource, arg);   
        } else {
            id = oraclize_query(datasource, arg);
        }
    }
}
