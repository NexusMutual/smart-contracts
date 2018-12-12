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

import "./MCR.sol";
import "./MCRData.sol";
import "./Pool1.sol";
import "./Quotation.sol";
import "./ClaimsReward.sol";
import "./PoolData.sol";
import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMath.sol";
import "./imports/openzeppelin-solidity/token/ERC20/ERC20.sol";


contract Pool2 is Iupgradable {
    using SafeMath for uint;

    MCR internal m1;
    MCRData internal md;
    Pool1 internal p1;
    PoolData internal pd;
    Quotation internal q2;

    address internal poolAddress;
    uint internal constant DECIMAL1E18 = uint(10) ** 18;

    event Liquidity(bytes16 typeOf, bytes16 functionName);

    event Rebalancing(bytes16 name, uint16 param);

    event CheckLiquidity(bytes16 typeOf, uint balance);

    modifier checkPause {
        require(ms.isPause() == false);
        _;
    }

    modifier isMember {
        require(ms.isMember(msg.sender));
        _;
    }

    function () public payable {} //solhint-disable-line

    /**
     * @dev On upgrade transfer all investment assets and ether to new Investment Pool
     * @param newPoolAddress New Investment Assest Pool address
     */
    function upgradeInvestmentPool(address newPoolAddress) external onlyInternal {
        for (uint64 i = 1; i < pd.getAllCurrenciesLen(); i++) {
            bytes8 iaName = pd.getAllCurrenciesByIndex(i);
            _upgradeInvestmentPool(iaName, newPoolAddress);
        }

        if (address(this).balance > 0)
            newPoolAddress.transfer(address(this).balance);
    }

    /**
     * @dev Handles the Callback of the Oraclize Query.
     * @param myid Oraclize Query ID identifying the query for which the result is being received
     */ 
    function delegateCallBack(bytes32 myid) external onlyInternal {
        if (ms.isPause() == false) { // system is not in emergency pause
            // If callback is of type "cover", then cover id associated with the myid is checked for expiry.
            if (pd.getApiIdTypeOf(myid) == "COV") {
                pd.updateDateUpdOfAPI(myid);
                q2.expireCover(pd.getIdOfApiId(myid));
            } else if (pd.getApiIdTypeOf(myid) == "CLA") {
                // If callback is of type "claim", then claim id associated with the myid is checked for vote closure.
                pd.updateDateUpdOfAPI(myid);
                ClaimsReward cr = ClaimsReward(ms.getLatestAddress("CR"));
                cr.changeClaimStatus(pd.getIdOfApiId(myid));
            } else if (pd.getApiIdTypeOf(myid) == "MCR") {
                pd.updateDateUpdOfAPI(myid);
            } else if (pd.getApiIdTypeOf(myid) == "MCRF") {
                pd.updateDateUpdOfAPI(myid);
                m1.addLastMCRData(uint64(pd.getIdOfApiId(myid)));
            } else if (pd.getApiIdTypeOf(myid) == "SUB") {
                pd.updateDateUpdOfAPI(myid);
            }
        } else if (pd.getApiIdTypeOf(myid) == "Pause") {
            pd.updateDateUpdOfAPI(myid);
            bytes4 by;
            (, , by) = ms.getLastEmergencyPause();
            if (by == "AB")
                ms.addEmergencyPause(false, "AUT"); //set pause to false
        }
    }

    /**
     * @dev Internal Swap of assets between Capital 
     * and Investment Sub pool for excess or insufficient  
     * liquidity conditions of a given currency.
     */ 
    function internalLiquiditySwap(bytes4 curr) external onlyInternal {
        uint caBalance;
        uint64 baseMin;
        uint64 varMin;
        (, baseMin, varMin) = pd.getCurrencyAssetVarBase(curr);
        caBalance = _getCurrencyAssetsBalance(curr).div(DECIMAL1E18);

        if (caBalance > uint(baseMin).add(varMin).mul(2)) {
            excessLiquiditySwap(curr, caBalance);
        } else if (caBalance < uint(baseMin).add(varMin)) {
            insufficientLiquiditySwap(curr, caBalance);
        }
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
        external
        isMember
        checkPause
    {
        ERC20 erc20 = ERC20(pd.getCurrencyAssetAddress(coverCurr));
        require(erc20.transferFrom(msg.sender, address(p1), coverDetails[1]), "Transfer failed");
        q2.verifyCoverDetails(msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
    }

    /**
     * @dev Saves a given investment asset details. To be called daily.
     * @param curr array of Investment asset name.
     * @param rate array of investment asset exchange rate.
     * @param date current date in yyyymmdd.
     */ 
    function saveIADetails(bytes8[] curr, uint64[] rate, uint64 date) external checkPause {
        bytes8 maxCurr;
        bytes8 minCurr;
        uint64 maxRate;
        uint64 minRate;
        //ONLY NOTARZIE ADDRESS CAN POST
        require(md.isnotarise(msg.sender));
        (maxCurr, maxRate, minCurr, minRate) = calculateIARank(curr, rate);
        pd.saveIARankDetails(maxCurr, maxRate, minCurr, minRate, date);
        pd.updatelastDate(date);
        // rebalancingLiquidityTrading(curr, rate, date);
        p1.saveIADetailsOracalise(pd.getIARatesTime());
        // uint8 check;
        // uint caBalance;
        // //Excess Liquidity Trade : atleast once per day
        // for (uint16 i = 0; i < md.getCurrLength(); i++) {
        //     (check, caBalance) = checkLiquidity(md.getCurrencyByIndex(i));
        //     if (check == 1 && caBalance > 0)
        //         excessLiquidityTrading(md.getCurrencyByIndex(i), caBalance);
        // }
    }

    /**
     * @dev Gets currency asset details for a given currency name.
     * @return caBalance currency asset balance
     * @return caRateX100 currency asset balance*100.
     * @return baseMin minimum base amount required in Capital Pool.
     * @return varMin  minimum variable amount required in Capital Pool.
     */ 
    function getCurrencyAssetDetails(
        bytes8 curr
    )
        external
        view
        returns(
            uint caBalance,
            uint caRateX100,
            uint baseMin,
            uint varMin
        )
    {
        caBalance = _getCurrencyAssetsBalance(curr);
        (, baseMin, varMin) = pd.getCurrencyAssetVarBase(curr);

        caRateX100 = md.allCurr3DaysAvg(curr);
    }

    function changeDependentContractAddress() public onlyInternal {
        m1 = MCR(ms.getLatestAddress("MC"));
        pd = PoolData(ms.getLatestAddress("PD"));
        md = MCRData(ms.getLatestAddress("MD"));
        p1 = Pool1(ms.getLatestAddress("P1"));
        q2 = Quotation(ms.getLatestAddress("QT")); 
    }

    function rebalancingLiquidityTrading(
        bytes8 curr,
        uint caBalance,
        uint8 cancel
    ) 
        internal
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
        uint totalRiskBal = md.getLastVfull();
        totalRiskBal = (totalRiskBal.mul(100000)).div(DECIMAL1E18);
        (, baseMin, varMin) = pd.getCurrencyAssetVarBase(curr);
        (maxIACurr, maxIARate, , ) = pd.getIARankDetailsByDate(pd.getLastDate());
        makerAmt = ((totalRiskBal.mul(2).mul(maxIARate)).mul(pd.getVariationPercX100())).div(100 * 100 * 100000);

        // if (pd.getLiquidityOrderStatus(curr, "RBT") == 0) {

        uint investmentAssetDecimals = pd.getInvestmentAssetDecimals(maxIACurr);
        takerAmt = (makerAmt.mul(md.getCurr3DaysAvg("ETH"))).div(maxIARate);
        makerAmt = (makerAmt.mul(10**investmentAssetDecimals)).div(100);
        takerAmt = (takerAmt.mul(DECIMAL1E18)).div(100);
        
        if (makerAmt <= _getInvestmentAssetBalance(maxIACurr)) {
            // zeroExOrders(curr, makerAmt, takerAmt, "ILT", cancel);
            // p2.createOrder(curr, makerAmt, takerAmt, "RBT", cancel);
            // change visibility modifier after implementing order functions
            return 1; // rebalancing order generated
        } else 
            return 2; // not enough makerAmt;
        // }
    }

    /**
     * @dev Checks whether trading is required for a given investment asset at a given exchange rate.
     */ 
    function checkTradeConditions(bytes8 curr, uint64 iaRate) internal view returns(int check) {
        if (iaRate > 0) {
            uint investmentAssetDecimals=pd.getInvestmentAssetDecimals(curr);
            uint iaBalance = _getInvestmentAssetBalance(curr).div(10**investmentAssetDecimals);
            uint totalRiskBal = md.getLastVfull();
            totalRiskBal = (totalRiskBal.mul(100000)).div(DECIMAL1E18);
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
    
    /** 
     * @dev Gets the investment asset rank.
     */ 
    function getIARank(
        bytes8 curr,
        uint64 rateX100,
        uint totalRiskPoolBalance
    ) 
        internal
        view
        returns (int rhsh, int rhsl) //internal function
    {
        uint currentIAmaxHolding;
        uint currentIAminHolding;
        uint iaBalance = _getInvestmentAssetBalance(curr);
        (currentIAminHolding, currentIAmaxHolding) = pd.getInvestmentAssetHoldingPerc(curr);
        
        if (rateX100 > 0) {
            uint rhsf;
            rhsf = (iaBalance.mul(1000000)).div(totalRiskPoolBalance.mul(rateX100));
            rhsh = int(rhsf - currentIAmaxHolding);
            rhsl = int(rhsf - currentIAminHolding);
        }
    }

    /** 
     * @dev Calculates the investment asset rank.
     */  
    function calculateIARank(
        bytes8[] curr,
        uint64[] rate
    )
        internal
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
        (totalRiskPoolBalance, ) = _totalRiskPoolBalance(curr, rate);
        for (uint i = 0; i < curr.length; i++) {
            rhsl = 0;
            rhsh = 0;
            if (pd.getInvestmentAssetStatus(curr[i])) {
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

    /**
     * @dev Gets the equivalent investment asset Pool2 balance in ether.
     * @param iaCurr array of Investment asset name.
     * @param iaRate array of investment asset exchange rate. 
     */ 
    function _totalRiskPoolBalance(
        bytes8[] iaCurr,
        uint64[] iaRate
    ) 
        internal
        view
        returns(uint balance, uint iaBalance)
    {
        uint capitalPoolBalance;
        (capitalPoolBalance, ) = m1.calVtpAndMCRtp(ms.getLatestAddress("P1").balance);
        for (uint i = 0; i < iaCurr.length; i++) {
            if (iaRate[i] > 0) {
                iaBalance = (iaBalance.add(_getInvestmentAssetBalance(
                iaCurr[i])).mul(100)).div(iaRate[i]);
            }
        }
        balance = capitalPoolBalance.add(iaBalance);
    }

    /** 
     * @dev Gets currency asset balance for a given currency name.
     */   
    function _getCurrencyAssetsBalance(bytes8 _curr) internal view returns(uint caBalance) {
        if (_curr == "ETH") {
            caBalance = address(p1).balance;
        } else {
            ERC20 erc20 = ERC20(pd.getCurrencyAssetAddress(_curr));
            caBalance = erc20.balanceOf(address(p1));
        }
    }

    function _getInvestmentAssetBalance(bytes8 _curr) internal view returns (uint balance) {
        if (_curr == "ETH") {
            balance = address(this).balance;
        } else {
            ERC20 erc20 = ERC20(pd.getInvestmentAssetAddress(_curr));
            balance = erc20.balanceOf(address(this));
        }
    }

    /**
     * @dev Creates Excess liquidity trading order for a given currency and a given balance.
     */  
    function excessLiquiditySwap(bytes8 curr, uint caBalance) internal {
        require(ms.isInternal(msg.sender) || md.isnotarise(msg.sender));
        bytes8 minIACurr;
        uint amount;
        uint64 baseMin;
        uint64 varMin;
        uint64 minIARate;
        
        (, , minIACurr, minIARate) = pd.getIARankDetailsByDate(pd.getLastDate());
        if (curr == minIACurr) {
            (, baseMin, varMin) = pd.getCurrencyAssetVarBase(curr);
            amount = caBalance.sub(((uint(baseMin).add(varMin)).mul(3)).div(2)); //*10**18;
            p1.transferCurrencyAsset(curr, address(this), amount);
        } 
    }

    /** 
     * @dev insufficient liquidity swap  
     * for a given currency and a given balance.
     */ 
    function insufficientLiquiditySwap(
        bytes8 curr,
        uint caBalance
    ) 
        internal
    {
        bytes8 maxIACurr;
        uint amount;
        uint64 baseMin;
        uint64 varMin;
        uint64 maxIARate;
        
        (maxIACurr, maxIARate, , ) = pd.getIARankDetailsByDate(pd.getLastDate());
        if (curr == maxIACurr) {
            (, baseMin, varMin) = pd.getCurrencyAssetVarBase(curr);
            amount = (((uint(baseMin).add(varMin)).mul(3)).div(2)).sub(caBalance);
            _transferInvestmentAsset(curr, ms.getLatestAddress("P1"), amount);
        } 
    }

    /** 
     * @dev Transfers ERC20 investment asset from this Pool to another Pool.
     */ 
    function _transferInvestmentAsset(
        bytes8 _curr,
        address _transferTo,
        uint _amount
    ) 
        internal
    {
        if (_curr == "ETH") {
            _transferTo.transfer(_amount);
        } else {
            ERC20 erc20 = ERC20(pd.getInvestmentAssetAddress(_curr));
            erc20.transfer(_transferTo, _amount);
        }
    }

    /** 
     * @dev Transfers ERC20 investment asset from this Pool to another Pool.
     */ 
    function _upgradeInvestmentPool(
        bytes8 _curr,
        address _newPoolAddress
    ) 
        internal
    {
        ERC20 erc20 = ERC20(pd.getInvestmentAssetAddress(_curr));
        if(erc20.balanceOf(address(this)) > 0)
            erc20.transfer(_newPoolAddress, erc20.balanceOf(address(this)));
    }
}