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
     * @dev add new investment asset currency.
     */ 
    function addInvestmentAssetsDetails(
        bytes8 currName,
        address curr,
        uint64 _minHoldingPercX100,
        uint64 _maxHoldingPercX100
    )   
        external
    {
        require(ms.checkIsAuthToGoverned(msg.sender));
        pd.addInvestmentCurrency(currName);
        pd.pushInvestmentAssetsDetails(currName, curr, 1,
            _minHoldingPercX100, _maxHoldingPercX100, 18);
    }

    function transferAssetToCapitalPool(bytes8 curr, uint amount) external onlyInternal {
        if (curr == "ETH") {
            _transferInvestmentEtherFromPool(ms.getLatestAddress("P1"), amount);
        } else {
            _transferInvestmentAssetFromPool(
                ms.getLatestAddress("P1"), pd.getInvestmentAssetAddress(curr));
        }
    }

    /**
     * @dev On upgrade transfer all investment assets and ether to new Investment Pool
     * @param _newPoolAddress New Investment Assest Pool address
     */
    function transferAllInvestmentAssetFromPool(address _newPoolAddress) external onlyInternal {
        for (uint64 i = 1; i < pd.getAllCurrenciesLen(); i++) {
            bytes8 iaName = pd.getAllCurrenciesByIndex(i);
            address iaAddress = pd.getCurrencyAssetAddress(iaName);
            _transferInvestmentAssetFromPool(_newPoolAddress, iaAddress);
        }
        if (address(this).balance > 0)
            _newPoolAddress.transfer(address(this).balance);
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
     * @dev Checks Excess or insufficient liquidity trade conditions for a given currency.
     */ 
    function checkLiquidityCreateOrder(bytes4 curr) external onlyInternal {
        uint8 check;
        uint caBalance;
        (check, caBalance) = checkLiquidity(curr);
        if (check == 1) {
            excessLiquidityTrading(curr, caBalance);
        } else if (check == 2) {
            insufficientLiquidityTrading(curr, caBalance, 0);
        }
    }

    /**
     * @dev Enables user to purchase cover via currency asset eg DAI
     */ 
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
        external
        isMember
        checkPause
    {
        ERC20 erc20 = ERC20(pd.getCurrencyAssetAddress(coverCurr));
        require(erc20.transferFrom(msg.sender, address(p1), coverDetails[1]), "Transfer failed");
        q2.verifyCoverDetails(prodId, msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
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
    
    /**
     * @dev Checks Excess or insufficient liquidity trade conditions for a given currency.
     */ 
    function checkLiquidity(bytes8 curr) public returns(uint8 check, uint caBalance) {
        require(ms.isInternal(msg.sender) || md.isnotarise(msg.sender));
        uint64 baseMin;
        uint64 varMin;
        (, baseMin, varMin) = pd.getCurrencyAssetVarBase(curr);
        caBalance = _getCurrencyAssetsBalance(curr).div(DECIMAL1E18);
        //Excess liquidity trade
        if (caBalance > uint(baseMin).add(varMin).mul(2)) {
            emit CheckLiquidity("ELT", caBalance);
            return (1, caBalance);
        } else if (caBalance < uint(baseMin).add(varMin)) {   //Insufficient Liquidity trade
            emit CheckLiquidity("ILT", caBalance);
            return (2, caBalance);
        }
    }

    /** 
     * @dev Creates/cancels insufficient liquidity trading  
     * order for a given currency and a given balance.
     */ 
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
                if (makerAmt <= _getInvestmentAssetBalance(maxIACurr)) {
                    // zeroExOrders(curr, makerAmt, takerAmt, "ILT", cancel);
                    // p2.createOrder(curr, makerAmt, takerAmt, "ILT", cancel);
                    emit Liquidity("ILT", "0x");
                } else {
                    emit Liquidity("ILT", "Not0x");
                }
            } 
            // p2.transferAssetToPool(curr, takerAmt);
        } 
        // else {
        //     cancelLastInsufficientTradingOrder(curr, takerAmt);
        // }
    
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

        if (pd.getLiquidityOrderStatus(curr, "RBT") == 0) {

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
        }
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
        uint iaBalance = _getInvestmentAssetBalance(curr).div(DECIMAL1E18);
        (currentIAminHolding, currentIAmaxHolding) = pd.getInvestmentAssetHoldingPerc(curr);
        
        if (rateX100 > 0) {
            uint rhsf;
            rhsf = ((iaBalance.mul(10000000)).div(rateX100)).mul(DECIMAL1E18).div(totalRiskPoolBalance);
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
            ERC20 erc20 = ERC20(pd.getInvestmentAssetAddress(_curr));
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
    function excessLiquidityTrading(bytes8 curr, uint caBalance) internal {
        require(ms.isInternal(msg.sender) || md.isnotarise(msg.sender));
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
                
                p1.transferAssetToInvestmentPool(curr, makerAmt); // check if pool2 have enough balance
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

    /** 
     * @dev Transfers Ether from this Pool address to another Pool address.
     */
    function _transferInvestmentEtherFromPool(address _poolAddress, uint _amount) internal {
        _poolAddress.transfer(_amount);
    }  

    /** 
     * @dev Transfers investment asset from this Pool address to another Pool address.
     */ 
    function _transferInvestmentAssetFromPool(
        address _poolAddress,
        address _iaAddress
    ) 
        internal
    {
        ERC20 erc20 = ERC20(_iaAddress);
        if (erc20.balanceOf(address(this)) > 0) {
            erc20.transfer(_poolAddress, erc20.balanceOf(address(this)));
        }
    }
    


}