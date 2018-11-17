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
import "./MCRData.sol";
import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMaths.sol";
import "./imports/0xProject/Exchange.sol";


contract Pool3 is Iupgradable {
    using SafeMaths for uint;

    PoolData pd;
    Pool1 p1;
    Pool2 p2;
    Exchange exchange;
    MCRData md;

    address poolAddress;
    address exchangeContractAddress;
    uint64 private constant DECIMAL1E18 = 1000000000000000000;

    event Liquidity(bytes16 typeOf, bytes16 functionName);
    event CheckLiquidity(bytes16 typeOf, uint balance);

    function changeDependentContractAddress() onlyInternal {
        pd = PoolData(ms.getLatestAddress("PD"));
        md = MCRData(ms.getLatestAddress("MD"));
        p2 = Pool2(ms.getLatestAddress("P2"));
        p1 = Pool1(ms.getLatestAddress("P1"));
    }

    function changeExchangeContractAddress(address _add) onlyInternal {
        exchangeContractAddress = _add; //0x
    }

    function getExchangeContractAddress() constant returns(address _add) {
        return exchangeContractAddress;
    }

    function changeWETHAddress(address _add) onlyOwner {
        pd.changeWETHAddress(_add);
    }

    function getWETHAddress() constant returns(address wETHAddr) {

        return pd.getWETHAddress();
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

    /// @dev Saves a given investment asset details. To be called daily.
    /// @param curr array of Investment asset name.
    /// @param rate array of investment asset exchange rate.
    /// @param date current date in yyyymmdd.
    function saveIADetails(bytes8[] curr, uint64[] rate, uint64 date) checkPause {

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
            if (check == 1) {
                if (caBalance > 0)
                    excessLiquidityTrading(md.getCurrencyByIndex(i), caBalance);
            }
        }
    }

    /// @dev Checks Excess or insufficient liquidity trade conditions for a given currency.
    function checkLiquidity(bytes8 curr) onlyInternal returns(uint8 check, uint caBalance) {
        if (ms.isInternal(msg.sender) == true || md.isnotarise(msg.sender) == true) {
            uint64 baseMin;
            uint64 varMin;
            (, baseMin, varMin) = pd.getCurrencyAssetVarBase(curr);
            caBalance = SafeMaths.div(getCurrencyAssetsBalance(curr), DECIMAL1E18);
            //Excess liquidity trade
            if (caBalance > SafeMaths.mul(2, (SafeMaths.add(baseMin, varMin)))) {
                CheckLiquidity("ELT", caBalance);
                return (1, caBalance);
            }else if (caBalance < (SafeMaths.add(baseMin, varMin))) {   //Insufficient Liquidity trade
                CheckLiquidity("ILT", caBalance);
                return (2, caBalance);
            }
        }
    }

    /// @dev Creates Excess liquidity trading order for a given currency and a given balance.
    function excessLiquidityTrading(bytes8 curr, uint caBalance) onlyInternal {

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
                if (caBalance >= SafeMaths.mul(3, SafeMaths.div(((SafeMaths.add(baseMin, varMin))), 2))) {

                    makerAmt = (SafeMaths.sub(caBalance, SafeMaths.mul(3, SafeMaths.div(((SafeMaths.add(baseMin, varMin))), 2)))); //*10**18;
                    
                    p1.transferAssetToPool2(curr, makerAmt);
                    if (curr != minIACurr) {
                    // amount of asset to buy investment asset
                        if (md.getCurr3DaysAvg(curr) > 0) {
                            uint investmentAssetDecimals = pd.getInvestmentAssetDecimals(minIACurr);
                            takerAmt = SafeMaths.div((SafeMaths.mul(SafeMaths.mul(minIARate, makerAmt),
                            10**investmentAssetDecimals)), (md.getCurr3DaysAvg(curr)));
                       
                        // zeroExOrders(curr, makerAmt, takerAmt, "ELT", 0);
                            p2.createOrder(curr, makerAmt, takerAmt, "ELT", 0);
                            Liquidity("ELT", "0x");
                        }
                    }
                } else {
                    Liquidity("ELT", "Insufficient");
                }
            }
        }
    }

    /// @dev Creates/cancels insufficient liquidity trading order for a given currency and a given balance.
    function insufficientLiquidityTrading(bytes8 curr, uint caBalance, uint8 cancel) onlyInternal {

        uint64 baseMin;
        uint64 varMin;
        bytes8 maxIACurr;
        uint64 maxIARate;
        uint makerAmt;
        uint takerAmt;
        (, baseMin, varMin) = pd.getCurrencyAssetVarBase(curr);
        (maxIACurr, maxIARate, , ) = pd.getIARankDetailsByDate(pd.getLastDate());
        // amount of asset to buy currency asset
        takerAmt = SafeMaths.sub(SafeMaths.mul(3, SafeMaths.div(SafeMaths.add(baseMin, varMin), 2)), caBalance); //*10**18; // multiply with decimals
        // amount of assest to sell investment assest

        if (pd.getLiquidityOrderStatus(curr, "ILT") == 0) {
            
            if (curr != maxIACurr) {
                uint investmentAssetDecimals = pd.getInvestmentAssetDecimals(maxIACurr);
                //  divide by decimals of makerToken;
                makerAmt = SafeMaths.div((SafeMaths.mul(SafeMaths.mul(maxIARate, takerAmt), 10**investmentAssetDecimals)), (md.getCurr3DaysAvg(curr)));
                if (makerAmt <= p2.getBalanceofInvestmentAsset(maxIACurr)) {
                    // zeroExOrders(curr, makerAmt, takerAmt, "ILT", cancel);
                    p2.createOrder(curr, makerAmt, takerAmt, "ILT", cancel);
                    Liquidity("ILT", "0x");
                } else {
                    Liquidity("ILT", "Not0x");
                }
            } 
            p2.transferAssetToPool1(curr, takerAmt);
        }else {
            cancelLastInsufficientTradingOrder(curr, takerAmt);
        }
    
    }

    function rebalancingLiquidityTrading(bytes8 curr, uint caBalance, uint8 cancel) onlyInternal returns(uint16) {

        uint64 baseMin;
        uint64 varMin;
        bytes8 maxIACurr;
        uint64 maxIARate;
        uint makerAmt;
        uint takerAmt;
        uint totalRiskBal=SafeMaths.div((SafeMaths.mul(pd.getTotalRiskPoolBalance(), 100000)), (DECIMAL1E18));
        (, baseMin, varMin) = pd.getCurrencyAssetVarBase(curr);
        (maxIACurr, maxIARate, , ) = pd.getIARankDetailsByDate(pd.getLastDate());
        makerAmt = (SafeMaths.div((SafeMaths.mul(SafeMaths.mul(SafeMaths.mul(2, pd.getVariationPercX100()),
                                totalRiskBal), maxIARate)), (SafeMaths.mul(SafeMaths.mul(100, 100), 100000))));

        if (pd.getLiquidityOrderStatus(curr, "RBT") == 0) {
            
            
            uint investmentAssetDecimals = pd.getInvestmentAssetDecimals(maxIACurr);
            takerAmt = ((SafeMaths.mul(md.getCurr3DaysAvg("ETH"), makerAmt))/maxIARate);
            makerAmt = SafeMaths.div((SafeMaths.mul(makerAmt, 10**investmentAssetDecimals)), 100);
            takerAmt = SafeMaths.div(SafeMaths.mul(takerAmt, DECIMAL1E18), (100));
            
            if (makerAmt <= p2.getBalanceofInvestmentAsset(maxIACurr)) {
                // zeroExOrders(curr, makerAmt, takerAmt, "ILT", cancel);
                p2.createOrder(curr, makerAmt, takerAmt, "RBT", cancel);
                return 1; // rebalancing order generated
                
            } else 
                return 2; // not enough makerAmt;
         
        
        }
    
    }

    /// @dev Cancels insufficient liquidity trading order and creates a new order for a new taker amount for a given currency.
    function cancelLastInsufficientTradingOrder(bytes8 curr, uint newTakerAmt) onlyInternal {

        uint index = SafeMaths.sub(pd.getCurrAllOrderHashLength(curr), 1);
        bytes32 lastCurrHash = pd.getCurrOrderHash(curr, index);
        //get last 0xOrderhash taker amount (currency asset amount)
        uint lastTakerAmt;
        (, , , lastTakerAmt, , , ) = pd.getOrderDetailsByHash(lastCurrHash);
        lastTakerAmt = SafeMaths.div(lastTakerAmt, DECIMAL1E18);
        if (lastTakerAmt < newTakerAmt) {
            // check0xOrderStatus(curr, index); // transfer previous order amount
            // generate new 0x order if it is still insufficient
            uint check;
            uint caBalance;
            (check, caBalance) = checkLiquidity(curr);
            if (check == 1) {
                insufficientLiquidityTrading(curr, caBalance, 1);
            }
            // cancel old order(off chain while signing the new order)

        }
    }

    /// @dev Gets currency asset balance for a given currency name.
    function getCurrencyAssetsBalance(bytes8 curr) constant returns(uint caBalance) {

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
    function getCurrencyAssetDetails(bytes8 curr) constant returns(uint caBalance, uint caRateX100, uint baseMin, uint varMin) {
        caBalance = getCurrencyAssetsBalance(curr);
        (, baseMin, varMin) = pd.getCurrencyAssetVarBase(curr);

        caRateX100 = md.allCurr3DaysAvg(curr);
    }

    /// @dev Checks Excess or insufficient liquidity trade conditions for a given currency.
    function checkLiquidityCreateOrder(bytes4 curr) onlyInternal {

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
    function checkTradeConditions(bytes8 curr, uint64 iaRate) constant returns(int check)
    {
        if (iaRate > 0) {
            uint investmentAssetDecimals=pd.getInvestmentAssetDecimals(curr);
            uint iaBalance=SafeMaths.div(p2.getBalanceofInvestmentAsset(curr), (10**investmentAssetDecimals));
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

    /// @dev Gets the investment asset rank.
    function getIARank(bytes8 curr, uint64 rateX100, uint totalRiskPoolBalance) constant returns(int rhsh, int rhsl) //internal function
    {
        uint currentIAmaxHolding;
        uint currentIAminHolding;

        uint iaBalance = SafeMaths.div(p2.getBalanceofInvestmentAsset(curr), (DECIMAL1E18));
        (currentIAminHolding, currentIAmaxHolding) = pd.getInvestmentAssetHoldingPerc(curr);
        // uint holdingPercDiff = (SafeMaths.sub(SafeMaths.div(currentIAmaxHolding, 100), SafeMaths.div(currentIAminHolding, 100)));
        
        if (rateX100 > 0) {
            uint _rhsh;
            uint _rhsl;
            _rhsh = SafeMaths.div(SafeMaths.mul(SafeMaths.mul(iaBalance, 100), 100000), (rateX100));
            rhsh = int(SafeMaths.sub(SafeMaths.div(_rhsh, totalRiskPoolBalance), currentIAmaxHolding));
            _rhsl = SafeMaths.div(SafeMaths.mul(SafeMaths.mul(iaBalance, 100), 100000), (rateX100));
            rhsl = int(SafeMaths.sub(SafeMaths.div(_rhsl, totalRiskPoolBalance), currentIAminHolding));

        }
    }

    /// @dev Calculates the investment asset rank.
    function calculateIARank(bytes8[] curr, uint64[] rate) constant returns(bytes8 maxCurr, uint64 maxRate, bytes8 minCurr, uint64 minRate) {
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
                } //else if (rhs == max) {//tie for the highest RHSx
                //     if (currentIAmaxHolding > pd.getInvestmentAssetMaxHoldingPerc(maxCurr)) {//Highest MaxIA%
                //         max = rhs;
                //         maxCurr = curr[i];
                //         maxRate = rate[i];
                //     } else if (currentIAmaxHolding == pd.getInvestmentAssetMaxHoldingPerc(maxCurr)) {//tie in MaxIA%
                //         if (currentIAminHolding > pd.getInvestmentAssetMinHoldingPerc(maxCurr)) { //   Highest MinIA%
                //             max = rhs;
                //             maxCurr = curr[i];
                //             maxRate = rate[i];
                //         } else if (currentIAminHolding == pd.getInvestmentAssetMinHoldingPerc(maxCurr)) { //tie in MinIA%
                //             if (strCompare(bytes16ToString(curr[i]), bytes16ToString(maxCurr)) == 1) { //Alphabetical order of ERC20 name.
                //                 max = rhs;
                //                 maxCurr = curr[i];
                //                 maxRate = rate[i];
                //             }
                //         }
                //     }
                // } else if (rhs == min) { //a tie for the lowest RHSx
                //     if (currentIAmaxHolding > pd.getInvestmentAssetMaxHoldingPerc(minCurr)) { //Highest MaxIA%
                //         min = rhs;
                //         minCurr = curr[i];
                //         minRate = rate[i];
                //     } else if (currentIAmaxHolding == pd.getInvestmentAssetMaxHoldingPerc(minCurr)) { //tie
                //         if (currentIAminHolding > pd.getInvestmentAssetMinHoldingPerc(minCurr)) { //   Highest MinIA%
                //             min = rhs;
                //             minCurr = curr[i];
                //             minRate = rate[i];
                //         } else if (currentIAminHolding == pd.getInvestmentAssetMinHoldingPerc(minCurr)) {   //tie
                //             if (strCompare(bytes16ToString(curr[i]), bytes16ToString(minCurr)) == 1) {    //Alphabetical order of ERC20 name.
                //                 min = rhs;
                //                 minCurr = curr[i];
                //                 minRate = rate[i];
                //             }
                //         }
                //     }
                // }
                if (rhsl < min || rhsl == 0 || min == -1) {
                    min = rhsl;
                    minCurr = curr[i];
                    minRate = rate[i];
                }
            }
        }
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

    function setOrderCancelHashValue(bytes8 curr, bytes32 orderHash) internal {
        uint lastIndex = SafeMaths.sub(pd.getCurrAllOrderHashLength(curr), 1);
        bytes32 lastCurrHash = pd.getCurrOrderHash(curr, lastIndex);
        pd.setOrderCancelHashValue(orderHash, lastCurrHash);
    }


    /// @dev Initiates all 0x trading orders.
    // function zeroExOrders(bytes8 curr, uint makerAmt, uint takerAmt, bytes16 _type, uint8 cancel) internal {
    //     bytes8 minIACurr;
    //     uint expirationTimeInMilliSec;
    //     bytes8 maxIACurr;
    //     address takerTokenAddr;
    //     exchange = Exchange(exchangeContractAddress);

    //     bytes32 orderHash;
    //     (maxIACurr, , minIACurr, ) = pd.getIARankDetailsByDate(pd.getLastDate());
    //     address makerTokenAddr;
    //     if (curr == "ETH") {
    //         if (_type == "ELT") {
    //             makerTokenAddr = pd.getWETHAddress();
    //         }else if (_type == "ILT") {
    //             takerTokenAddr = pd.getWETHAddress();
    //         }
    //     } else {
    //         if (_type == "ELT") {
    //             makerTokenAddr = pd.getCurrencyAssetAddress(curr);
    //         }else if (_type == "ILT") {
    //             takerTokenAddr = pd.getCurrencyAssetAddress(curr);
    //         }
    //     }
    //     if (_type == "ELT") {
    //         takerTokenAddr = pd.getInvestmentAssetAddress(minIACurr);
    //         expirationTimeInMilliSec = SafeMaths.add(now, pd.getOrderExpirationTime(_type)); //12 hours in milliseconds
    //         orderHash = exchange.getOrderHash([pd.get0xMakerAddress(), pd.get0xTakerAddress(),
    //             makerTokenAddr, takerTokenAddr, pd.get0xFeeRecipient()],
    //             [SafeMaths.mul(makerAmt, DECIMAL1E18), takerAmt, pd.get0xMakerFee(),
    //             pd.get0xTakerFee(), expirationTimeInMilliSec, pd.getOrderSalt()]);
    //         pd.setCurrOrderHash(curr, orderHash);
    //         pd.updateLiquidityOrderStatus(curr, _type, 1);
    //         pd.pushOrderDetails(orderHash, curr, SafeMaths.mul(makerAmt, DECIMAL1E18),
    //             bytes4(minIACurr), takerAmt, _type, expirationTimeInMilliSec);
    //         //event
    //         ZeroExOrders("Call0x", makerTokenAddr, takerTokenAddr,
    //             SafeMaths.mul(makerAmt, DECIMAL1E18), takerAmt, expirationTimeInMilliSec, orderHash);
    //     } else if (_type == "ILT") {
    //         makerTokenAddr = pd.getInvestmentAssetAddress(maxIACurr);
    //         expirationTimeInMilliSec = SafeMaths.add(now, pd.getOrderExpirationTime(_type));
    //         orderHash = exchange.getOrderHash([pd.get0xMakerAddress(), pd.get0xTakerAddress(),
    //             makerTokenAddr, takerTokenAddr, pd.get0xFeeRecipient()],
    //             [makerAmt, SafeMaths.mul(takerAmt, DECIMAL1E18), pd.get0xMakerFee(),
    //             pd.get0xTakerFee(), expirationTimeInMilliSec, pd.getOrderSalt()]);
    //         pd.setCurrOrderHash(curr, orderHash);
    //         pd.updateLiquidityOrderStatus(curr, _type, 1);
    //         pd.pushOrderDetails(orderHash, bytes4(maxIACurr), makerAmt, curr,
    //             SafeMaths.mul(takerAmt, DECIMAL1E18), _type, expirationTimeInMilliSec);
    //         if (cancel == 1) {
    //             // saving last orderHash
    //             setOrderCancelHashValue(curr, orderHash);
    //         }
    //         //event
    //         ZeroExOrders("Call0x", makerTokenAddr, takerTokenAddr, makerAmt,
    //             SafeMaths.mul(takerAmt, DECIMAL1E18), expirationTimeInMilliSec, orderHash);
    //     }
    // }


    /// @dev Checks the 0x order fill status for a given order id of a given currency.
    // function check0xOrderStatus(bytes8 curr, uint orderid) onlyInternal {
    //     bytes32 orderHash = pd.getCurrOrderHash(curr, orderid);
    //     exchange = Exchange(exchangeContractAddress);
    //     uint filledAmt = exchange.getUnavailableTakerTokenAmount(orderHash); //amount that is filled till now.(TakerToken)
    //     bytes8 makerCurr;
    //     bytes8 takerCurr;
    //     uint makerAmt;
    //     uint takerAmt;
    //     bytes16 orderHashType;
    //     address makerTokenAddr;
    //     address takerTokenAddr;
    //     (makerCurr, makerAmt, takerCurr, takerAmt, orderHashType, , ) = pd.getOrderDetailsByHash(orderHash);
    //     if (orderHashType == "ELT") {
    //         if (makerCurr == "ETH")
    //             makerTokenAddr = getWETHAddress();
    //         else
    //             makerTokenAddr = pd.getCurrencyAssetAddress(makerCurr);
    //         takerTokenAddr = pd.getInvestmentAssetAddress(takerCurr);
    //     } else if (orderHashType == "ILT") {
    //         makerTokenAddr = pd.getInvestmentAssetAddress(makerCurr);
    //         if (takerCurr == "ETH")
    //             takerTokenAddr = getWETHAddress();
    //         else
    //             takerTokenAddr = pd.getCurrencyAssetAddress(takerCurr);
    //     } else if (orderHashType == "RBT") {
    //         makerTokenAddr = pd.getInvestmentAssetAddress(makerCurr);
    //         takerTokenAddr = getWETHAddress();
    //     }
    //     if (filledAmt > 0) {
    //         if (filledAmt == takerAmt) {// order filled completely, transfer only takerAmt from signerAddress to poolAddress
    //             p1.transferToPool(takerTokenAddr, filledAmt);
    //         } else {// order filled partially,transfer takerAmt and calculate remaining makerAmt that needs to take back from signerAddress
    //             p1.transferToPool(takerTokenAddr, filledAmt);
    //             if (takerAmt > filledAmt) {
    //                 makerAmt = SafeMaths.div(SafeMaths.mul(makerAmt, SafeMaths.sub(takerAmt, filledAmt)), takerAmt);
    //                 p1.transferToPool(makerTokenAddr, makerAmt);
    //             }
    //         }
    //     } else {// order is not filled completely,transfer makerAmt as it is from signerAddress to poolAddr
    //         p1.transferToPool(makerTokenAddr, makerAmt);
    //     }
    //     pd.updateLiquidityOrderStatus(curr, orderHashType, 0); //order closed successfully for this currency
    //     if (md.isnotarise(msg.sender) == true) {// called from notarize address
    //         pd.updateZeroExOrderStatus(orderHash, 0); //order is not signed
    //     } else {//called from oraclize api
    //         pd.updateZeroExOrderStatus(orderHash, 2); //order expired successfully
    //     }
    // }

    /// @dev Enables an authorized user to sign 0x Order Hash.
    // function sign0xOrder(uint orderId, bytes32 orderHash) checkPause {

    //     require(msg.sender == pd.get0xMakerAddress() && pd.getZeroExOrderStatus(orderHash) == 0); // not signed already

    //     bytes16 orderType;
    //     address makerTokenAddr;
    //     uint makerAmt;
    //     uint takerAmt;
    //     bytes8 makerToken;
    //     bytes8 takerToken;
    //     uint validTime;
    //     (makerToken, makerAmt, takerToken, takerAmt, orderType, validTime, ) = pd.getOrderDetailsByHash(orderHash);
    //     address makerAddress = pd.get0xMakerAddress();
    //     uint expireTime;
    //     if (validTime > now)
    //         expireTime = SafeMaths.sub(validTime, now);
    //     if (orderType == "ELT") {
    //         makerTokenAddr = pd.getCurrencyAssetAddress(makerToken);
    //         // transfer selling amount to the makerAddress
    //         p1.transferPayout(makerAddress, makerToken, makerAmt);
    //         p1.close0xOrders(bytes4(makerToken), orderId, expireTime);
    //     } else if (orderType == "ILT") {
    //         makerTokenAddr = pd.getInvestmentAssetAddress(makerToken);
    //         // transfer selling amount to the makerAddress from Pool1 contract
    //         p1.transferFromPool(makerAddress, makerTokenAddr, makerAmt);
    //         p1.close0xOrders(bytes4(takerToken), orderId, expireTime); //orderId is the index of Currency Asset at which hash is saved.
    //     } else if (orderType == "RBT") {
    //         makerTokenAddr = pd.getInvestmentAssetAddress(makerToken);
    //         // transfer selling amount to the makerAddress from Pool1 contract
    //         p1.transferFromPool(makerAddress, makerTokenAddr, makerAmt);
    //         p1.close0xOrders(bytes4(makerToken), orderId, expireTime); // orderId is the index of allRebalancingOrderHash.
    //     }
    //     pd.updateZeroExOrderStatus(orderHash, 1);
    // }


}
