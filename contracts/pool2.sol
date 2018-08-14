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

import "./nxmToken.sol";
import "./nxmToken2.sol";
import "./claimsReward.sol";
import "./poolData.sol";
import "./quotation2.sol";
import "./quotationData.sol";
import "./master.sol";
import "./pool.sol";
import "./claims.sol";
import "./mcrData.sol";
import "./mcr.sol";
import "./pool3.sol";
import "./Iupgradable.sol";
import "./imports/0xProject/Exchange.sol";
import "./imports/openzeppelin-solidity/math/SafeMaths.sol";
import "./imports/openzeppelin-solidity/token/ERC20/BasicToken.sol";


contract pool2 is Iupgradable {

    using SafeMaths
    for uint;

    master ms;
    address masterAddress;
    nxmToken tc1;
    nxmToken2 tc2;
    pool p1;
    claims c1;
    Exchange exchange1;
    quotation2 q2;
    mcr m1;
    mcrData md;
    claimsReward cr;
    poolData pd;
    BasicToken btok;
    pool3 p3;
    quotationData qd;

    address poolAddress;
    address exchangeContractAddress;

    uint64 private constant DECIMAL1E18 = 1000000000000000000;

    event Payout(address indexed to, bytes16 eventName, uint coverId, uint tokens);
    event Liquidity(bytes16 typeOf, bytes16 functionName);
    
    event ZeroExOrders(
        bytes16 func, 
        address makerAddr, 
        address takerAddr, 
        uint makerAmt, 
        uint takerAmt, 
        uint expirationTimeInMilliSec, 
        bytes32 orderHash
        );

    event Rebalancing(bytes16 name, uint16 param);

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

    modifier checkPause {
        require(ms.isPause() == false);
        _;
    }

    function changeDependentContractAddress() onlyInternal {
        uint currentVersion = ms.currentVersion();
        m1 = mcr(ms.versionContractAddress(currentVersion, "MCR"));
        tc1 = nxmToken(ms.versionContractAddress(currentVersion, "TOK1"));
        tc2 = nxmToken2(ms.versionContractAddress(currentVersion, "TOK2"));
        pd = poolData(ms.versionContractAddress(currentVersion, "PD"));
        md = mcrData(ms.versionContractAddress(currentVersion, "MD"));
        q2 = quotation2(ms.versionContractAddress(currentVersion, "Q2"));
        p3 = pool3(ms.versionContractAddress(currentVersion, "P3"));
        p1 = pool(ms.versionContractAddress(currentVersion, "P1"));
        c1 = claims(ms.versionContractAddress(currentVersion, "C1"));
        cr = claimsReward(ms.versionContractAddress(currentVersion, "CR"));
        qd = quotationData(ms.versionContractAddress(currentVersion, "QD"));
    }

    function changeExchangeContractAddress(address _add) onlyOwner {
        exchangeContractAddress = _add; //0x

        p3.changeExchangeContractAddress(exchangeContractAddress);
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
                p3.check0xOrderStatus(pd.getCurrOfApiId(myid), pd.getIdOfApiId(myid));
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

    /// @dev Calls the payout event in case of claims payout.
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
            balance = p1.getEtherPoolBalance();
            //Check if pool has enough ETH balance
            if (balance >= sumAssured1e18) {
                succ = p1.transferEtherForPayout(sumAssured1e18, _to);
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
            balance = btok.balanceOf(poolAddress);
            //Check if pool has enough fiat crypto balance
            if (balance >= sumAssured1e18) {
                p1.transferPayout(_to, curr, sumAssured1e18);
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
            tc2.burnStakerLockedToken(coverid, curr, sumAssured);
    }

    /// @dev Gets the investment asset rank.
    function getIARank(bytes8 curr, uint64 rateX100) constant returns(int rhs) //internal function
    {
        uint currentIAmaxHolding;
        uint currentIAminHolding;

        uint iaBalance = SafeMaths.div(p1.getBalanceofInvestmentAsset(curr), (DECIMAL1E18));
        (currentIAminHolding, currentIAmaxHolding) = pd.getInvestmentAssetHoldingPerc(curr);
        uint holdingPercDiff = (SafeMaths.sub(SafeMaths.div(currentIAmaxHolding, 100), SafeMaths.div(currentIAminHolding, 100)));
        if (holdingPercDiff > 0 && rateX100 > 0)
            rhs = int(SafeMaths.div(SafeMaths.mul(SafeMaths.mul(iaBalance, 100), 100000), (SafeMaths.mul(holdingPercDiff, rateX100))));
    }

    /// @dev Gets the equivalent investment asset pool  balance in ether. 
    /// @param iaCurr array of Investment asset name.
    /// @param iaRate array of investment asset exchange rate.
    function totalRiskPoolBalance(bytes8[] iaCurr, uint64[] iaRate) constant returns(uint balance, uint iaBalance) {
        uint currBalance;
        (currBalance, ) = m1.calVtpAndMCRtp();

        for (uint i = 0; i < iaCurr.length; i++) {
            if (iaRate[i] > 0)
                iaBalance = SafeMaths.add(iaBalance, SafeMaths.div(SafeMaths.mul(p1.getBalanceofInvestmentAsset(iaCurr[i]), 100), iaRate[i]));
        }
        balance = SafeMaths.add(currBalance, iaBalance);
    }

    /// @dev Triggers pool rebalancing trading orders.
    function rebalancingTrading0xOrders(bytes8[] iaCurr, uint64[] iaRate, uint64 date)checkPause returns(uint16 result)
    {   
        bytes8 maxIACurr;
        uint64 maxRate;
        (maxIACurr, maxRate, , ) = pd.getIARankDetailsByDate(date);
        if (pd.getLiquidityOrderStatus(maxIACurr, "RBT") == 0) {
            uint totalRiskBal=SafeMaths.div((SafeMaths.mul(pd.getTotalRiskPoolBalance(), 100000)), (DECIMAL1E18));
            if (totalRiskBal > 0 && iaRate.length > 0) { //if v=0 OR there is no IA, don't trade
                for (uint i=0; i < iaRate.length; i++) {
                    if (pd.getInvestmentAssetStatus(iaCurr[i]) == 1) {  // if IA is active 
                        if (checkTradeConditions(iaCurr[i], iaRate[i]) == 1) {  // ORDER 1 (max RHS IA to ETH)   // amount of asset to sell
                            uint makerAmt=(SafeMaths.div((SafeMaths.mul(SafeMaths.mul(SafeMaths.mul(2, pd.getVariationPercX100()), 
                                totalRiskBal), maxRate)), (SafeMaths.mul(SafeMaths.mul(100, 100), 100000)))); //MULTIPLY WITH DECIMALS 
                            uint investmentAssetDecimals=pd.getInvestmentAssetDecimals(maxIACurr); // amount of ETH to buy
                            uint takerAmt=((SafeMaths.mul(md.getCurr3DaysAvg("ETH"), makerAmt))/maxRate); 
                            uint expirationTimeInMilliSec=SafeMaths.add(now, pd.getOrderExpirationTime("RBT"));
                            makerAmt = SafeMaths.div((SafeMaths.mul(makerAmt, 10**investmentAssetDecimals)), 100);
                            takerAmt = SafeMaths.div(SafeMaths.mul(takerAmt, DECIMAL1E18), (100));
                            if (makerAmt <= p1.getBalanceofInvestmentAsset(maxIACurr)) {
                                exchange1 = Exchange(exchangeContractAddress);
                                bytes32 orderHash=exchange1.getOrderHash(
                                    [pd.get0xMakerAddress(), 
                                    pd.get0xTakerAddress(), 
                                    pd.getInvestmentAssetAddress(maxIACurr), 
                                    p3.getWETHAddress(), 
                                    pd.get0xFeeRecipient()], 
                                    [makerAmt, 
                                    takerAmt, 
                                    pd.get0xMakerFee(), 
                                    pd.get0xTakerFee(), 
                                    expirationTimeInMilliSec, 
                                    pd.getOrderSalt()]
                                    );
                                pd.saveRebalancingOrderHash(orderHash);
                                pd.pushOrderDetails(orderHash, bytes4(maxIACurr), makerAmt, "ETH", takerAmt, "RBT", expirationTimeInMilliSec);
                                pd.updateLiquidityOrderStatus(bytes4(maxIACurr), "RBT", 1);
                                pd.setCurrOrderHash(bytes4(maxIACurr), orderHash);  
                                //events
                                ZeroExOrders(
                                    "RBT", 
                                    pd.getInvestmentAssetAddress(maxIACurr), 
                                    p3.getWETHAddress(), 
                                    makerAmt, 
                                    takerAmt, 
                                    expirationTimeInMilliSec, 
                                    orderHash
                                    );
                                Rebalancing("OrderGen", 1);
                                return 1; // rebalancing order generated
                            }else {   //events
                                ZeroExOrders(
                                    "RBT", 
                                    pd.getInvestmentAssetAddress(maxIACurr), 
                                    p3.getWETHAddress(), 
                                    makerAmt, 
                                    takerAmt, 
                                    expirationTimeInMilliSec, 
                                    "insufficient"
                                    );
                                Rebalancing("OrderGen", 2);
                                return 2; // not enough makerAmt;    
                            }                      
                        }
                    }
                }
                Rebalancing("OrderGen", 0);
                return 0; // when V!=0 but rebalancing is not required
            }
        }
        Rebalancing("OrderGen", 3);
        return 4; // when V=0 or no IA is present       
    }

    /// @dev Checks whether trading is required for a given investment asset at a given exchange rate.
    function checkTradeConditions(bytes8 curr, uint64 iaRate) constant returns(int check)
    {
        if (iaRate > 0) { 
            uint investmentAssetDecimals=pd.getInvestmentAssetDecimals(curr);
            uint iaBalance=SafeMaths.div(p1.getBalanceofInvestmentAsset(curr), (10**investmentAssetDecimals));
            uint totalRiskBal=SafeMaths.div(SafeMaths.mul(pd.getTotalRiskPoolBalance(), 100000), (DECIMAL1E18));
            if (iaBalance > 0 && totalRiskBal > 0) {
                uint iaMax;
                uint iaMin;
                uint checkNumber;
                uint z;
                (iaMin, iaMax) = pd.getInvestmentAssetHoldingPerc(curr);
                z = pd.getVariationPercX100();
                checkNumber = SafeMaths.div((SafeMaths.mul(SafeMaths.mul(iaBalance, 100), 100000)), (SafeMaths.mul(iaRate, totalRiskBal)));
                if ((checkNumber > SafeMaths.mul(SafeMaths.div(SafeMaths.mul(SafeMaths.add(iaMax, z), totalRiskBal), 100), 100000)) || 
                    (checkNumber < SafeMaths.mul(SafeMaths.div(SafeMaths.mul(SafeMaths.sub(iaMin, z), totalRiskBal), 100), 100000))) {   
                    //a) # of IAx x fx(IAx) / V > MaxIA%x + z% ;  or b) # of IAx x fx(IAx) / V < MinIA%x - z%
                    return 1;    //eligibleIA
                }else {
                    return -1; //not eligibleIA
                }
            }
            return 0; // balance of IA is 0
        }else {
            return -2;
        }
    }

    /// @dev Calculates the investment asset rank.
    function calculateIARank(bytes8[] curr, uint64[] rate) constant returns(bytes8 maxCurr, uint64 maxRate, bytes8 minCurr, uint64 minRate) {
        uint currentIAmaxHolding;
        uint currentIAminHolding;
        int max = 0;
        int min = -1;
        int rhs;
        for (uint i = 0; i < curr.length; i++) {
            rhs = 0;
            if (pd.getInvestmentAssetStatus(curr[i]) == 1) {
                (currentIAminHolding, currentIAmaxHolding) = pd.getInvestmentAssetHoldingPerc(curr[i]);
                rhs = getIARank(curr[i], rate[i]);
                if (rhs > max) {
                    max = rhs;
                    maxCurr = curr[i];
                    maxRate = rate[i];
                } else if (rhs == max) {//tie for the highest RHSx  
                    if (currentIAmaxHolding > pd.getInvestmentAssetMaxHoldingPerc(maxCurr)) {//Highest MaxIA%
                        max = rhs;
                        maxCurr = curr[i];
                        maxRate = rate[i];
                    } else if (currentIAmaxHolding == pd.getInvestmentAssetMaxHoldingPerc(maxCurr)) {//tie in MaxIA%
                        if (currentIAminHolding > pd.getInvestmentAssetMinHoldingPerc(maxCurr)) { //   Highest MinIA%
                            max = rhs;
                            maxCurr = curr[i];
                            maxRate = rate[i];
                        } else if (currentIAminHolding == pd.getInvestmentAssetMinHoldingPerc(maxCurr)) { //tie in MinIA%
                            if (strCompare(bytes16ToString(curr[i]), bytes16ToString(maxCurr)) == 1) { //Alphabetical order of ERC20 name.
                                max = rhs;
                                maxCurr = curr[i];
                                maxRate = rate[i];
                            }
                        }
                    }
                } else if (rhs == min) { //a tie for the lowest RHSx 
                    if (currentIAmaxHolding > pd.getInvestmentAssetMaxHoldingPerc(minCurr)) { //Highest MaxIA%
                        min = rhs;
                        minCurr = curr[i];
                        minRate = rate[i];
                    } else if (currentIAmaxHolding == pd.getInvestmentAssetMaxHoldingPerc(minCurr)) { //tie
                        if (currentIAminHolding > pd.getInvestmentAssetMinHoldingPerc(minCurr)) { //   Highest MinIA%  
                            min = rhs;
                            minCurr = curr[i];
                            minRate = rate[i];
                        } else if (currentIAminHolding == pd.getInvestmentAssetMinHoldingPerc(minCurr)) {   //tie
                            if (strCompare(bytes16ToString(curr[i]), bytes16ToString(minCurr)) == 1) {    //Alphabetical order of ERC20 name.
                                min = rhs;
                                minCurr = curr[i];
                                minRate = rate[i];
                            }
                        }
                    }
                } else if (rhs < min || rhs == 0 || min == -1) {
                    min = rhs;
                    minCurr = curr[i];
                    minRate = rate[i];
                }
            }
        }
    }

    /// @dev Unwraps ether.
    function convertWETHintoETH(bytes8[] curr, uint64[] rate, uint64 date) checkPause payable {

        btok = BasicToken(pd.getWETHAddress());
        bool success = btok.transfer(msg.sender, msg.value);
        if (success == true)
            p3.saveIADetails(curr, rate, date);
    }

    function bytes16ToString(bytes16 x)  internal constant returns (string) 
    {
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

    function strCompare(string _a, string _b) internal returns(int) {
        bytes memory a = bytes(_a);
        bytes memory b = bytes(_b);
        uint minLength = a.length;
        if (b.length < minLength) minLength = b.length;
        for (uint i = 0; i < minLength; i++)
            if (a[i] < b[i]) {
                return -1;
            }else if (a[i] > b[i]) {
                return 1;
            }
        if (a.length < b.length) {
            return -1;
        }else if (a.length > b.length) {
            return 1;
        }else {
            return 0;
        }
    }

}
