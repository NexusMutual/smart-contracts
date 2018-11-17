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

import "./NXMToken.sol";
import "./Claims.sol";
import "./ClaimsReward.sol";
import "./TokenFunctions.sol";
import "./TokenController.sol";
import "./PoolData.sol";
import "./Quotation.sol";
import "./Pool2.sol";
import "./Pool3.sol";
import "./MCR.sol";
import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMaths.sol";
import "./imports/openzeppelin-solidity/token/ERC20/BasicToken.sol";
import "./imports/openzeppelin-solidity/token/ERC20/StandardToken.sol";
import "./imports/oraclize/ethereum-api/usingOraclize.sol";
import "./QuotationData.sol";
// import "./imports/govblocks-protocol/Governed.sol";


contract Pool1 is usingOraclize, Iupgradable {
    using SafeMaths for uint;

    Quotation public q2;
    NXMToken public tk;
    TokenController public tc;
    TokenFunctions public tf;
    PoolData public pd;
    Pool2 public p2;
    Pool3 public p3;
    MCR public m1;
    StandardToken public stok;
    Claims public c1;
    ClaimsReward public cr;
    QuotationData public qd;
    BasicToken btok;

    uint public constant DECIMAL1E18 = uint(10) ** 18;
    uint public constant PRICE_STEP = 1000 * DECIMAL1E18;

    event Apiresult(address indexed sender, string msg, bytes32 myid);
    event Payout(address indexed to, bytes16 eventName, uint coverId, uint tokens);

    function () public payable {} //solhint-disable-line

    modifier checkPause {
        require(ms.isPause() == false);
        _;
    }

    modifier isMemberAndcheckPause {
        require(ms.isPause() == false && ms.isMember(msg.sender) == true);
        _;
    }

    modifier onlyOwner {
        require(ms.isOwner(msg.sender) == true);
        _;
    }

    ///@dev Oraclize call to close emergency pause.
    function closeEmergencyPause(uint time) external onlyInternal {
        bytes32 myid = oraclize_query(time, "URL", "", 300000);
        saveApiDetails(myid, "Pause", 0);
    }

    /// @dev Calls the Oraclize Query to close a given Claim after a given period of time.
    /// @param id Claim Id to be closed
    /// @param time Time (in seconds) after which Claims assessment voting needs to be closed
    function closeClaimsOraclise(uint id, uint64 time) external onlyInternal {
        bytes32 myid = oraclize_query(time, "URL", "", 3000000);
        saveApiDetails(myid, "CLA", id);
    }

    /// @dev Calls Oraclize Query to expire a given Cover after a given period of time.
    /// @param id Quote Id to be expired
    /// @param time Time (in seconds) after which the cover should be expired
    function closeCoverOraclise(uint id, uint64 time) external onlyInternal {
        bytes32 myid = oraclize_query(time, "URL", 
            strConcat("http://a1.nexusmutual.io/api/Claims/closeClaim_hash/", uint2str(id)), 1000000);
        saveApiDetails(myid, "COV", id);
    }

    /// @dev Calls the Oraclize Query to initiate MCR calculation.
    /// @param time Time (in milliseconds) after which the next MCR calculation should be initiated
    function mcrOraclise(uint64 time) external onlyInternal {
        bytes32 myid = oraclize_query(time, "URL", "https://a2.nexusmutual.io/nxmmcr.js/");
        saveApiDetails(myid, "MCR", 0);
    }

    /// @dev Calls the Oraclize Query in case MCR calculation fails.
    /// @param time Time (in seconds) after which the next MCR calculation should be initiated
    function mcrOracliseFail(uint id, uint64 time) external onlyInternal {
        bytes32 myid = oraclize_query(time, "URL", "", 1000000);
        saveApiDetails(myid, "MCRF", id);
    }

    /// @dev Oraclize call to update investment asset rates.
    function saveIADetailsOracalise(uint64 time) external onlyInternal {
        bytes32 myid = oraclize_query(time, "URL", "http://a3.nexusmutual.io");
        saveApiDetails(myid, "0X", 0);
    }
    
    /**
     * @dev Transfers all assest (i.e ETH balance, Currency Assest and Investment Assest) from
     * old Pool to new Pool
     * @param newPoolAddress Address of the operator that can mint new tokens
     */
    function transferALLCurrencyAssestFromPool(address newPoolAddress) external onlyInternal returns(bool success) {
        
        for (uint64 i = 1; i < pd.getAllCurrenciesLen(); i++) {
            bytes8 caName = pd.getAllCurrenciesByIndex(i);
            address caAddress = pd.getCurrencyAssetAddress(caName);
            require(_transferCurrencyAssetFromPool(newPoolAddress, caAddress));
        }
        if (address(this).balance > 0)
            require(newPoolAddress.send(address(this).balance)); //solhint-disable-line
        success = true;
    }

    /// @dev Sends a given Ether amount to a given address for Claims payout.
    /// @param amount amount (in wei) to send.
    /// @param _add Receiver's address.
    /// @return succ True if transfer is a success, otherwise False.
    function transferEtherForPayout(uint amount, address _add) external onlyInternal returns(bool succ) {
        succ = _add.send(amount); //solhint-disable-line

    }

    /// @dev Transfers Amount to user when claim gets accepted.
    function transferPayout(address _to, bytes8 _curr, uint _value) external onlyInternal {
        stok = StandardToken(pd.getCurrencyAssetAddress(_curr));
        if (stok.balanceOf(this) > _value)
            stok.transfer(_to, _value);
    }

    /// @dev Transfers specific currency asset from current Pool address to the new Pool address.
    function transferFromPool(address _to, address _currAddr, uint _amount) external onlyInternal {
        stok = StandardToken(_currAddr);
        if (stok.balanceOf(this) >= _amount)
            stok.transfer(_to, _amount);
    }

    /// @dev Calls the Oraclize Query to update the version of the contracts.
    function versionOraclise(uint version) external onlyInternal {
        bytes32 myid = oraclize_query("URL", "http://a1.nexusmutual.io/api/MCR/setlatest/T");
        saveApiDetails(myid, "VER", version);
    }

    /// @dev Gets the Balance of the Pool in wei.
    function getEtherPoolBalance() external view returns (uint bal) {
        bal = this.balance;
    }

    ///@dev Gets 0x wrapped ether Pool balance.
    function getWETHPoolBalance() external view returns(uint wETH) {
        stok = StandardToken(pd.getWETHAddress());
        return stok.balanceOf(address(this));
    }

    function changeDependentContractAddress() public {
        m1 = MCR(ms.getLatestAddress("MC"));
        tk = NXMToken(ms.tokenAddress());
        tf = TokenFunctions(ms.getLatestAddress("TF"));
        tc = TokenController(ms.getLatestAddress("TC"));
        pd = PoolData(ms.getLatestAddress("PD"));
        q2 = Quotation(ms.getLatestAddress("Q2"));
        p2 = Pool2(ms.getLatestAddress("P2"));
        p3 = Pool3(ms.getLatestAddress("P3"));
        c1 = Claims(ms.getLatestAddress("CL"));
        cr = ClaimsReward(ms.getLatestAddress("CR"));
        qd = QuotationData(ms.getLatestAddress("QD"));
    }

    /// @dev Handles callback of external oracle query.
    function __callback(bytes32 myid, string result) public { //solhint-disable-line
        require(msg.sender == oraclize_cbAddress() || ms.isOwner(msg.sender) == true);
        delegateCallBack(myid);
    }

    /// @dev Enables user to purchase cover with funding in ETH.
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
    )
        public
        isMemberAndcheckPause
        payable
    {
        require(msg.value == coverDetails[1]);
        q2.verifyCoverDetails(prodId, msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
    }

    /// @dev Enables user to purchase NXM at the current token price.
    function buyToken() public payable isMemberAndcheckPause returns(bool success) {
        require(msg.value > 0);
        uint tokenPrice;
        uint superWeiLeft = (msg.value).mul(DECIMAL1E18);
        uint tempTokens;
        uint superWeiSpent;
        uint tokenPurchased;
        uint tokenSupply = tk.totalSupply();
        require(m1.calculateTokenPrice("ETH", tokenSupply) > 0);
        while (superWeiLeft > 0) {
            tokenPrice = m1.calculateTokenPrice("ETH", tokenSupply);
            tempTokens = superWeiLeft.div(tokenPrice);
            if (tempTokens <= PRICE_STEP) {
                tokenPurchased = tokenPurchased.add(tempTokens);
                break;
            } else {
                tokenPurchased = tokenPurchased.add(PRICE_STEP);
                tokenSupply = tokenSupply.add(PRICE_STEP);
                superWeiSpent = PRICE_STEP.mul(tokenPrice);
                superWeiLeft = superWeiLeft.sub(superWeiSpent);
            }
        }
        tc.mint(msg.sender, tokenPurchased);
        success = true;
    }

    /// @dev Sends a given amount of Ether to a given address.
    /// @param amount amount (in wei) to send.
    /// @param _add Receiver's address.
    /// @return succ True if transfer is a success, otherwise False.
    function transferEther(uint amount, address _add) public checkPause returns(bool succ) {

        require(ms.checkIsAuthToGoverned(msg.sender));
        
        succ = _add.send(amount); //solhint-disable-line

    }

    ///@dev Gets Pool1 balance of a given investmentasset.
    function getBalanceOfCurrencyAsset(bytes8 _curr) public view returns(uint balance) {
        stok = StandardToken(pd.getCurrencyAssetAddress(_curr));
        return stok.balanceOf(address(this));
    }

    /// @dev Enables user to purchase cover via currency asset eg DAI
    function makeCoverUsingCA(
        uint8 prodId,
        address smartCAdd,
        bytes4 coverCurr,
        uint[] coverDetails,
        uint16 coverPeriod,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) 
        public
        isMemberAndcheckPause
    {
        stok = StandardToken(pd.getCurrencyAssetAddress(coverCurr));
        bool succ = stok.transferFrom(msg.sender, this, coverDetails[1]);
        require(succ);
        q2.verifyCoverDetails(prodId, msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
    }

    /**
     * @dev Allows selling of NXM for ether.
     *      Seller first needs to give this contract allowance to
     *      transfer/burn tokens in the NXMToken contract
     * @param  _amount Amount of NXM to sell
     * @return success returns true on successfull sale
     */
    function sellNXMTokens(uint _amount) public isMemberAndcheckPause returns(bool success) {
        require(tk.balanceOf(msg.sender) >= _amount); // Check if the sender has enough
        require(!tf.voted(msg.sender));
        require(_amount <= m1.getMaxSellTokens());
        uint sellingPrice = _getWei(_amount, tk.totalSupply());
        require(tc.burnFrom(msg.sender, _amount));
        require((msg.sender).send(sellingPrice)); //solhint-disable-line
        success = true;
    }

    /**
     * @dev Returns the amount of wei a seller will get for selling NXM
     * @param _amount Amount of NXM to sell
     * @return weiToPay Amount of wei the seller will get
     */
    function getWei(uint _amount) public view returns(uint weiToPay) {
        return _getWei(_amount, tk.totalSupply());
    }

    /// @dev Handles the Callback of the Oraclize Query.
    /// @param myid Oraclize Query ID identifying the query for which the result is being received
    function delegateCallBack(bytes32 myid) onlyInternal {

        if (ms.isPause() == false) { // system is not in emergency pause

            // If callback is of type "cover", then cover id associated with the myid is checked for expiry.
            if (pd.getApiIdTypeOf(myid) == "COV") {
                pd.updateDateUpdOfAPI(myid);
                q2.expireCover(pd.getIdOfApiId(myid));
            }else if (pd.getApiIdTypeOf(myid) == "CLA") {
                // If callback is of type "claim", then claim id associated with the myid is checked for vote closure.
                pd.updateDateUpdOfAPI(myid);
                cr.changeClaimStatus(pd.getIdOfApiId(myid));
            } else if (pd.getApiIdTypeOf(myid) == "MCR") {
                pd.updateDateUpdOfAPI(myid);
            } else if (pd.getApiIdTypeOf(myid) == "MCRF") {
                pd.updateDateUpdOfAPI(myid);
                m1.addLastMCRData(uint64(pd.getIdOfApiId(myid)));
            } else if (pd.getApiIdTypeOf(myid) == "SUB") {
                pd.updateDateUpdOfAPI(myid);
            } else if (pd.getApiIdTypeOf(myid) == "0X") {
                pd.updateDateUpdOfAPI(myid);
            } else if (pd.getApiIdTypeOf(myid) == "Close0x") {
                pd.updateDateUpdOfAPI(myid);
                // p3.check0xOrderStatus(pd.getCurrOfApiId(myid), pd.getIdOfApiId(myid));
            }
        }
        if (pd.getApiIdTypeOf(myid) == "Pause") {
            pd.updateDateUpdOfAPI(myid);
            bytes4 by;
            (, , by) = ms.getLastEmergencyPause();
            if (by == "AB")
                ms.addEmergencyPause(false, "AUT"); //set pause to false
        }
    }

    /// @dev Calls the payout event in case of Claims payout.
    function callPayoutEvent(address _add, bytes16 type1, uint id, uint sa) onlyInternal {
        Payout(_add, type1, id, sa);
    }

    /// @dev Pays out the sum assured in case a claim is accepted
    /// @param coverid Cover Id.
    /// @param claimid Claim Id.
    /// @return succ true if payout is successful, false otherwise.
    function sendClaimPayout(uint coverid, uint claimid) onlyInternal returns(bool succ) {

        address _to = qd.getCoverMemberAddress(coverid);
        uint sumAssured = qd.getCoverSumAssured(coverid);
        uint sumAssured1e18 = SafeMaths.mul(sumAssured, DECIMAL1E18);
        bytes4 curr = qd.getCurrencyOfCover(coverid);
        uint balance;

        //Payout in Ethers in case currency of quotation is ETH
        if (curr == "ETH") {
            balance = this.getEtherPoolBalance();
            //Check if Pool1 has enough ETH balance
            if (balance >= sumAssured1e18) {
                succ = this.transferEtherForPayout(sumAssured1e18, _to);
                if (succ == true) {
                    q2.removeSAFromCSA(coverid, sumAssured);
                    pd.changeCurrencyAssetVarMin(curr, uint64(SafeMaths.sub(pd.getCurrencyAssetVarMin(curr), sumAssured)));
                    p3.checkLiquidityCreateOrder(curr);
                    callPayoutEvent(_to, "Payout", coverid, sumAssured1e18);
                } else {
                    c1.setClaimStatus(claimid, 12);
                }
            } else {
                c1.setClaimStatus(claimid, 12);
                succ = false;
            }
        }else {
          //Payout from the corresponding fiat faucet, in case currency of quotation is in fiat crypto
            btok = BasicToken(pd.getCurrencyAssetAddress(curr));
            balance = btok.balanceOf(address(this));
            //Check if Pool1 has enough fiat crypto balance
            if (balance >= sumAssured1e18) {
                this.transferPayout(_to, curr, sumAssured1e18);
                q2.removeSAFromCSA(coverid, sumAssured);
                pd.changeCurrencyAssetVarMin(curr, uint64(SafeMaths.sub(pd.getCurrencyAssetVarMin(curr), sumAssured)));
                p3.checkLiquidityCreateOrder(curr);
                callPayoutEvent(_to, "Payout", coverid, sumAssured1e18);
                succ = true;
            } else {
                c1.setClaimStatus(claimid, 12);
                succ = false;
            }
        }
        if (qd.getProductNameOfCover(coverid) == "SCC")
            tf.burnStakerLockedToken(coverid, curr, sumAssured);
    }

    // update currency asset base min and var min
    function updateCurrencyAssetDetails(bytes8 _curr, uint64 _baseMin) onlyInternal {

        pd.changeCurrencyAssetBaseMin(_curr, _baseMin);
    }

    function transferAssetToPool2(bytes8 curr, uint amount) onlyInternal {
        address pool2Add = ms.getLatestAddress("P2");
        if (curr == "ETH") {
            pool2Add.send(amount);
        } else {
            address caAddress = pd.getCurrencyAssetAddress(curr);
            stok = StandardToken(caAddress);
            stok.transfer(pool2Add, amount);
        }
    }

    /**
     * @dev Returns the amount of wei a seller will get for selling NXM
     * @param _amount Amount of NXM to sell
     * @param _totalSupply total supply of tokens
     * @return weiToPay Amount of wei the seller will get
     */
    function _getWei(uint _amount, uint _totalSupply)
        internal view returns(uint weiToPay)
    {
        uint tokenPrice;
        uint weiPaid;
        uint tokenSupply = _totalSupply;
        while (_amount > 0) {
            tokenPrice = m1.calculateTokenPrice("ETH", tokenSupply);
            tokenPrice = (tokenPrice.mul(975)).div(1000); //97.5%
            if (_amount <= PRICE_STEP) {
                weiToPay = weiToPay.add((tokenPrice.mul(_amount)).div(DECIMAL1E18));
                break;
            } else {
                _amount = _amount.sub(PRICE_STEP);
                tokenSupply = tokenSupply.sub(PRICE_STEP);
                weiPaid = (tokenPrice.mul(PRICE_STEP)).div(DECIMAL1E18);
                weiToPay = weiToPay.add(weiPaid);
            }
        }
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

    ///@dev Transfers investment asset from current Pool address to the new Pool address.
    function _transferCurrencyAssetFromPool(
        address _newPoolAddress,
        address _caAddress
    )  
        internal
        returns (bool success)
    {
        stok = StandardToken(_caAddress);
        if (stok.balanceOf(this) > 0) {
            stok.transfer(_newPoolAddress, stok.balanceOf(this));
        }
        success = true;
    }
}
