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
import "./Pool1.sol";
import "./Pool2.sol";
import "./ClaimsReward.sol";
import "./Quotation.sol";
import "./MCRData.sol";
import "./MCR.sol";
import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMath.sol";


contract Pool3 is Iupgradable {
    using SafeMath for uint;

    PoolData internal pd;
    Pool1 internal p1;
    Pool2 internal p2;
    ClaimsReward public cr;
    // Exchange internal exchange;
    Quotation internal q2;
    MCR internal m1;
    MCRData internal md;

    address internal poolAddress;
    address internal exchangeContractAddress;
    
    uint internal constant DECIMAL1E18 = uint(10) ** 18;

    event Liquidity(bytes16 typeOf, bytes16 functionName);
    event CheckLiquidity(bytes16 typeOf, uint balance);

    modifier onlyOwner {

        require(ms.isOwner(msg.sender) == true);
        _;
    }

    modifier checkPause {

        require(ms.isPause() == false);
        _;
    }

    /// @dev Handles the Callback of the Oraclize Query.
    /// @param myid Oraclize Query ID identifying the query for which the result is being received
    function delegateCallBack(bytes32 myid) external onlyInternal {
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

    function changeDependentContractAddress() public onlyInternal {
        pd = PoolData(ms.getLatestAddress("PD"));
        md = MCRData(ms.getLatestAddress("MD"));
        m1 = MCR(ms.getLatestAddress("MC"));
        p2 = Pool2(ms.getLatestAddress("P2"));
        p1 = Pool1(ms.getLatestAddress("P1"));
        cr = ClaimsReward(ms.getLatestAddress("CR"));
        q2 = Quotation(ms.getLatestAddress("QT")); 
    }

    function changeExchangeContractAddress(address _add) public onlyInternal {
        exchangeContractAddress = _add; //0x
    }

    /// @dev Saves a given investment asset details. To be called daily.
    /// @param curr array of Investment asset name.
    /// @param rate array of investment asset exchange rate.
    /// @param date current date in yyyymmdd.
    function saveIADetails(bytes8[] curr, uint64[] rate, uint64 date) public checkPause {
        bytes8 maxCurr;
        bytes8 minCurr;
        uint64 maxRate;
        uint64 minRate;
        uint totalRiskPoolBal;
        uint iaBalance;
        //ONLY NOTARZIE ADDRESS CAN POST
        require(md.isnotarise(msg.sender) != false);
        (totalRiskPoolBal, iaBalance) = p2.totalRiskPoolBalance(curr, rate);
        pd.setTotalBalance(totalRiskPoolBal, iaBalance);
        (maxCurr, maxRate, minCurr, minRate) = calculateIARank(curr, rate);
        pd.saveIARankDetails(maxCurr, maxRate, minCurr, minRate, date);
        pd.updatelastDate(date);
        //Rebalancing Trade : only once per day
        // rebalancingLiquidityTrading(curr, rate, date);
        p1.saveIADetailsOracalise(pd.getIARatesTime());
        uint8 check;
        uint caBalance;
        //Excess Liquidity Trade : atleast once per day
        for (uint16 i = 0; i < md.getCurrLength(); i++) {
            (check, caBalance) = checkLiquidity(md.getCurrencyByIndex(i));
            if (check == 1 && caBalance > 0)
                excessLiquidityTrading(md.getCurrencyByIndex(i), caBalance);
        }
    }

    /// @dev Checks Excess or insufficient liquidity trade conditions for a given currency.
    function checkLiquidity(bytes8 curr) public returns(uint8 check, uint caBalance) {
        if (ms.isInternal(msg.sender) || md.isnotarise(msg.sender)) {
            uint64 baseMin;
            uint64 varMin;
            (, baseMin, varMin) = pd.getCurrencyAssetVarBase(curr);
            caBalance = getCurrencyAssetsBalance(curr).div(DECIMAL1E18);
            //Excess liquidity trade
            if (caBalance > uint(baseMin).add(varMin).mul(2)) {
                emit CheckLiquidity("ELT", caBalance);
                return (1, caBalance);
            }else if (caBalance < uint(baseMin).add(varMin)) {   //Insufficient Liquidity trade
                emit CheckLiquidity("ILT", caBalance);
                return (2, caBalance);
            }
        }
    }

    /// @dev Creates Excess liquidity trading order for a given currency and a given balance.
    function excessLiquidityTrading(bytes8 curr, uint caBalance) public {

        if (ms.isInternal(msg.sender) == true || md.isnotarise(msg.sender) == true) {
            if (pd.getLiquidityOrderStatus(curr, "ELT") == 0) {
                uint64 baseMin;
                uint64 varMin;
                bytes8 minIACurr;
                uint64 minIARate;
                uint makerAmt;
                uint takerAmt;
                (, baseMin, varMin) = pd.getCurrencyAssetVarBase(curr);
                (, , minIACurr, minIARate) = pd.getIARankDetailsByDate(pd.getLastDate());
                //  amount of assest to sell currency asset
                if (caBalance >= ((uint(baseMin).add(varMin)).mul(3)).div(2)) {

                    makerAmt = caBalance.sub(((uint(baseMin).add(varMin)).mul(3)).div(2)); //*10**18;
                    
                    p1.transferAssetToPool2(curr, makerAmt); // check if pool2 have enough balance
                    if (curr != minIACurr) {
                    // amount of asset to buy investment asset
                        if (md.getCurr3DaysAvg(curr) > 0) {
                            uint investmentAssetDecimals = pd.getInvestmentAssetDecimals(minIACurr);
                            takerAmt = (makerAmt.mul(minIARate).mul(10**investmentAssetDecimals)).
                                div(md.getCurr3DaysAvg(curr));
                            // zeroExOrders(curr, makerAmt, takerAmt, "ELT", 0);
                            // p2.createOrder(curr, makerAmt, takerAmt, "ELT", 0);
                            emit Liquidity("ELT", "0x");
                        }
                    }
                } else {
                    emit Liquidity("ELT", "Insufficient");
                }
            }
        }
    }

    /// @dev Creates/cancels insufficient liquidity trading order for a given currency and a given balance.
    function insufficientLiquidityTrading(
        bytes8 curr,
        uint caBalance,
        uint8 cancel
    ) 
        public
        onlyInternal
    {
        uint64 baseMin;
        uint64 varMin;
        bytes8 maxIACurr;
        uint64 maxIARate;
        uint makerAmt;
        uint takerAmt;
        cancel = 0; //only to silence compiler warning
        (, baseMin, varMin) = pd.getCurrencyAssetVarBase(curr);
        (maxIACurr, maxIARate, , ) = pd.getIARankDetailsByDate(pd.getLastDate());
        // amount of asset to buy currency asset
        takerAmt = (((uint(baseMin).add(varMin)).mul(3)).div(2)).sub(caBalance); //*10**18; // multiply with decimals
        // amount of assest to sell investment assest

        if (pd.getLiquidityOrderStatus(curr, "ILT") == 0) {
            
            if (curr != maxIACurr) {
                uint investmentAssetDecimals = pd.getInvestmentAssetDecimals(maxIACurr);
                //  divide by decimals of makerToken;
                makerAmt = ((takerAmt.mul(maxIARate)).mul(10**investmentAssetDecimals)).
                    div(md.getCurr3DaysAvg(curr));
                if (makerAmt <= p2.getBalanceofInvestmentAsset(maxIACurr)) {
                    // zeroExOrders(curr, makerAmt, takerAmt, "ILT", cancel);
                    // p2.createOrder(curr, makerAmt, takerAmt, "ILT", cancel);
                    emit Liquidity("ILT", "0x");
                } else {
                    emit Liquidity("ILT", "Not0x");
                }
            } 
            p2.transferAssetToPool1(curr, takerAmt);
        } else {
            cancelLastInsufficientTradingOrder(curr, takerAmt);
        }
    
    }
    
    function getExchangeContractAddress() public view returns(address _add) {
        return exchangeContractAddress;
    }

    function rebalancingLiquidityTrading(
        bytes8 curr,
        uint caBalance,
        uint8 cancel
    ) 
        public
        view        
        onlyInternal
        returns(uint16)
    {
        uint64 baseMin;
        uint64 varMin;
        bytes8 maxIACurr;
        uint64 maxIARate;
        uint makerAmt;
        uint takerAmt;
        caBalance = 0; //only to silence compiler warning
        cancel = uint8(0); //only to silence compiler warning
        uint totalRiskBal = (pd.getTotalRiskPoolBalance().mul(100000)).div(DECIMAL1E18);
        (, baseMin, varMin) = pd.getCurrencyAssetVarBase(curr);
        (maxIACurr, maxIARate, , ) = pd.getIARankDetailsByDate(pd.getLastDate());
        makerAmt = ((totalRiskBal.mul(2).mul(maxIARate)).mul(pd.getVariationPercX100())).div(100 * 100 * 100000);

        if (pd.getLiquidityOrderStatus(curr, "RBT") == 0) {

            uint investmentAssetDecimals = pd.getInvestmentAssetDecimals(maxIACurr);
            takerAmt = (makerAmt.mul(md.getCurr3DaysAvg("ETH"))).div(maxIARate);
            makerAmt = (makerAmt.mul(10**investmentAssetDecimals)).div(100);
            takerAmt = (takerAmt.mul(DECIMAL1E18)).div(100);
            
            if (makerAmt <= p2.getBalanceofInvestmentAsset(maxIACurr)) {
                // zeroExOrders(curr, makerAmt, takerAmt, "ILT", cancel);
                // p2.createOrder(curr, makerAmt, takerAmt, "RBT", cancel);
                // change visibility modifier after implementing order functions
                return 1; // rebalancing order generated
            } else 
                return 2; // not enough makerAmt;
        }
    }

    /// @dev Cancels insufficient liquidity trading order and creates a new order
    /// for a new taker amount for a given currency.
    function cancelLastInsufficientTradingOrder(bytes8 curr, uint newTakerAmt) public view onlyInternal {
        curr; // to silence compiler warning
        newTakerAmt; // to silence compiler warning
        // uint index = pd.getCurrAllOrderHashLength(curr).sub(1);
        // bytes32 lastCurrHash = pd.getCurrOrderHash(curr, index);
        //get last 0xOrderhash taker amount (currency asset amount)
        // uint lastTakerAmt;
        // (, , , lastTakerAmt, , , ) = pd.getOrderDetailsByHash(lastCurrHash);
        // lastTakerAmt = lastTakerAmt.div(DECIMAL1E18);
        // if (lastTakerAmt < newTakerAmt) {
        //     // check0xOrderStatus(curr, index); // transfer previous order amount
        //     // generate new 0x order if it is still insufficient
        //     uint check;
        //     uint caBalance;
        //     (check, caBalance) = checkLiquidity(curr);
        //     if (check == 1) {
        //         insufficientLiquidityTrading(curr, caBalance, 1);
        //     }
        //     // cancel old order(off chain while signing the new order)
        // }
    }

    /// @dev Gets currency asset balance for a given currency name.
    function getCurrencyAssetsBalance(bytes8 curr) public returns(uint caBalance) {

        if (curr == "ETH") {
            caBalance = p1.getEtherPoolBalance();
        } else {
            caBalance = p1.getBalanceOfCurrencyAsset(curr);
        }
    }

    /// @dev Gets currency asset details for a given currency name.
    /// @return caBalance currency asset balance
    /// @return caRateX100 currency asset balance*100.
    /// @return baseMin minimum base amount required in Pool1.
    /// @return varMin  minimum variable amount required in Pool1.
    function getCurrencyAssetDetails(
        bytes8 curr
    )
        public
        returns(
            uint caBalance,
            uint caRateX100,
            uint baseMin,
            uint varMin
        )
    {
        caBalance = getCurrencyAssetsBalance(curr);
        (, baseMin, varMin) = pd.getCurrencyAssetVarBase(curr);

        caRateX100 = md.allCurr3DaysAvg(curr);
    }

    /// @dev Checks Excess or insufficient liquidity trade conditions for a given currency.
    function checkLiquidityCreateOrder(bytes4 curr) public onlyInternal {
        uint8 check;
        uint caBalance;
        (check, caBalance) = checkLiquidity(curr);
        if (check == 1) {
            excessLiquidityTrading(curr, caBalance);
        } else if (check == 2) {
            insufficientLiquidityTrading(curr, caBalance, 0);
        }
    }

    /// @dev Checks whether trading is required for a given investment asset at a given exchange rate.
    function checkTradeConditions(bytes8 curr, uint64 iaRate) public view returns(int check) {
        if (iaRate > 0) {
            uint investmentAssetDecimals=pd.getInvestmentAssetDecimals(curr);
            uint iaBalance = p2.getBalanceofInvestmentAsset(curr).div(10**investmentAssetDecimals);
            uint totalRiskBal = (pd.getTotalRiskPoolBalance().mul(100000)).div(DECIMAL1E18);
            if (iaBalance > 0 && totalRiskBal > 0) {
                uint iaMax;
                uint iaMin;
                uint checkNumber;
                uint z;
                (iaMin, iaMax) = pd.getInvestmentAssetHoldingPerc(curr);
                z = pd.getVariationPercX100();
                checkNumber = (iaBalance.mul(100 * 100000)).div(totalRiskBal.mul(iaRate));
                if ((checkNumber > ((totalRiskBal.mul(iaMax.add(z))).div(100)).mul(100000)) ||
                    (checkNumber < ((totalRiskBal.mul(iaMin.sub(z))).div(100)).mul(100000))) {
                    //a) # of IAx x fx(IAx) / V > MaxIA%x + z% ;  or b) # of IAx x fx(IAx) / V < MinIA%x - z%
                    return 1;    //eligibleIA
                } else {
                    return -1; //not eligibleIA
                }
            }
            return 0; // balance of IA is 0
        } else {
            return -2;
        }
    }

    /// @dev Gets the investment asset rank.
    function getIARank(
        bytes8 curr,
        uint64 rateX100,
        uint totalRiskPoolBalance
    ) 
        public
        view
        returns (int rhsh, int rhsl) //internal function
    {
        uint currentIAmaxHolding;
        uint currentIAminHolding;
        uint iaBalance = p2.getBalanceofInvestmentAsset(curr).div(DECIMAL1E18);
        (currentIAminHolding, currentIAmaxHolding) = pd.getInvestmentAssetHoldingPerc(curr);
        
        if (rateX100 > 0) {
            uint rhsf;
            rhsf = ((iaBalance.mul(10000000)).div(rateX100)).div(totalRiskPoolBalance);
            
            rhsh = int(rhsf - currentIAmaxHolding);
            rhsl = int(rhsf - currentIAminHolding);
        }
    }

    /// @dev Calculates the investment asset rank.
    function calculateIARank(
        bytes8[] curr,
        uint64[] rate
    )
        public
        view
        returns(
            bytes8 maxCurr,
            uint64 maxRate,
            bytes8 minCurr,
            uint64 minRate
        )  
    {
        uint currentIAmaxHolding;
        uint currentIAminHolding;
        int max = 0;
        int min = -1;
        int rhsh;
        int rhsl;
        uint totalRiskPoolBalance;
        (totalRiskPoolBalance, ) = p2.totalRiskPoolBalance(curr, rate);
        for (uint i = 0; i < curr.length; i++) {
            rhsl = 0;
            rhsh = 0;
            if (pd.getInvestmentAssetStatus(curr[i]) == 1) {
                (currentIAminHolding, currentIAmaxHolding) = pd.getInvestmentAssetHoldingPerc(curr[i]);
                (rhsh, rhsl) = getIARank(curr[i], rate[i], totalRiskPoolBalance);
                if (rhsh > max) {
                    max = rhsh;
                    maxCurr = curr[i];
                    maxRate = rate[i];
                } else if (rhsl < min || rhsl == 0 || min == -1) {
                    min = rhsl;
                    minCurr = curr[i];
                    minRate = rate[i];
                }
            }
        }
    }

    function setOrderCancelHashValue(bytes8 curr, bytes32 orderHash) internal pure {
        curr; // to silence compiler warning
        orderHash; // to silence compiler warning
        // uint lastIndex = pd.getCurrAllOrderHashLength(curr).sub(1);
        // bytes32 lastCurrHash = pd.getCurrOrderHash(curr, lastIndex);
        // pd.setOrderCancelHashValue(orderHash, lastCurrHash);
    }
}
