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

    event ZeroExOrders(
        bytes16 func,
        address makerAddr,
        address takerAddr,
        uint makerAmt,
        uint takerAmt,
        uint expirationTimeInMilliSec,
        bytes32 orderHash
        );

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
        (maxCurr, maxRate, minCurr, minRate) = p2.calculateIARank(curr, rate);
        pd.saveIARankDetails(maxCurr, maxRate, minCurr, minRate, date);
        pd.updatelastDate(date);
        //Rebalancing Trade : only once per day
        p2.rebalancingTrading0xOrders(curr, rate, date);
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

    /// @dev Checks the 0x order fill status for a given order id of a given currency.
    function check0xOrderStatus(bytes8 curr, uint orderid) onlyInternal {
        bytes32 orderHash = pd.getCurrOrderHash(curr, orderid);
        exchange = Exchange(exchangeContractAddress);
        uint filledAmt = exchange.getUnavailableTakerTokenAmount(orderHash); //amount that is filled till now.(TakerToken)
        bytes8 makerCurr;
        bytes8 takerCurr;
        uint makerAmt;
        uint takerAmt;
        bytes16 orderHashType;
        address makerTokenAddr;
        address takerTokenAddr;
        (makerCurr, makerAmt, takerCurr, takerAmt, orderHashType, , ) = pd.getOrderDetailsByHash(orderHash);
        if (orderHashType == "ELT") {
            if (makerCurr == "ETH")
                makerTokenAddr = getWETHAddress();
            else
                makerTokenAddr = pd.getCurrencyAssetAddress(makerCurr);
            takerTokenAddr = pd.getInvestmentAssetAddress(takerCurr);
        } else if (orderHashType == "ILT") {
            makerTokenAddr = pd.getInvestmentAssetAddress(makerCurr);
            if (takerCurr == "ETH")
                takerTokenAddr = getWETHAddress();
            else
                takerTokenAddr = pd.getCurrencyAssetAddress(takerCurr);
        } else if (orderHashType == "RBT") {
            makerTokenAddr = pd.getInvestmentAssetAddress(makerCurr);
            takerTokenAddr = getWETHAddress();
        }
        if (filledAmt > 0) {
            if (filledAmt == takerAmt) {// order filled completely, transfer only takerAmt from signerAddress to poolAddress
                p1.transferToPool(takerTokenAddr, filledAmt);
            } else {// order filled partially,transfer takerAmt and calculate remaining makerAmt that needs to take back from signerAddress
                p1.transferToPool(takerTokenAddr, filledAmt);
                if (takerAmt > filledAmt) {
                    makerAmt = SafeMaths.div(SafeMaths.mul(makerAmt, SafeMaths.sub(takerAmt, filledAmt)), takerAmt);
                    p1.transferToPool(makerTokenAddr, makerAmt);
                }
            }
        } else {// order is not filled completely,transfer makerAmt as it is from signerAddress to poolAddr
            p1.transferToPool(makerTokenAddr, makerAmt);
        }
        pd.updateLiquidityOrderStatus(curr, orderHashType, 0); //order closed successfully for this currency
        if (md.isnotarise(msg.sender) == true) {// called from notarize address
            pd.updateZeroExOrderStatus(orderHash, 0); //order is not signed
        } else {//called from oraclize api
            pd.updateZeroExOrderStatus(orderHash, 2); //order expired successfully
        }
    }

    /// @dev Enables an authorized user to sign 0x Order Hash.
    function sign0xOrder(uint orderId, bytes32 orderHash) checkPause {

        require(msg.sender == pd.get0xMakerAddress() && pd.getZeroExOrderStatus(orderHash) == 0); // not signed already

        bytes16 orderType;
        address makerTokenAddr;
        uint makerAmt;
        uint takerAmt;
        bytes8 makerToken;
        bytes8 takerToken;
        uint validTime;
        (makerToken, makerAmt, takerToken, takerAmt, orderType, validTime, ) = pd.getOrderDetailsByHash(orderHash);
        address makerAddress = pd.get0xMakerAddress();
        uint expireTime;
        if (validTime > now)
            expireTime = SafeMaths.sub(validTime, now);
        if (orderType == "ELT") {
            makerTokenAddr = pd.getCurrencyAssetAddress(makerToken);
            // transfer selling amount to the makerAddress
            p1.transferPayout(makerAddress, makerToken, makerAmt);
            p1.close0xOrders(bytes4(makerToken), orderId, expireTime);
        } else if (orderType == "ILT") {
            makerTokenAddr = pd.getInvestmentAssetAddress(makerToken);
            // transfer selling amount to the makerAddress from Pool1 contract
            p1.transferFromPool(makerAddress, makerTokenAddr, makerAmt);
            p1.close0xOrders(bytes4(takerToken), orderId, expireTime); //orderId is the index of Currency Asset at which hash is saved.
        } else if (orderType == "RBT") {
            makerTokenAddr = pd.getInvestmentAssetAddress(makerToken);
            // transfer selling amount to the makerAddress from Pool1 contract
            p1.transferFromPool(makerAddress, makerTokenAddr, makerAmt);
            p1.close0xOrders(bytes4(makerToken), orderId, expireTime); // orderId is the index of allRebalancingOrderHash.
        }
        pd.updateZeroExOrderStatus(orderHash, 1);
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
                    // amount of asset to buy investment asset
                    if (md.getCurr3DaysAvg(curr) > 0) {
                        uint investmentAssetDecimals = pd.getInvestmentAssetDecimals(minIACurr);
                        takerAmt = SafeMaths.div((SafeMaths.mul(SafeMaths.mul(minIARate, makerAmt),
                            10**investmentAssetDecimals)), (md.getCurr3DaysAvg(curr)));
                        zeroExOrders(curr, makerAmt, takerAmt, "ELT", 0);
                        Liquidity("ELT", "0x");
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

            uint investmentAssetDecimals = pd.getInvestmentAssetDecimals(maxIACurr);
            //  divide by decimals of makerToken;
            makerAmt = SafeMaths.div((SafeMaths.mul(SafeMaths.mul(maxIARate, takerAmt), 10**investmentAssetDecimals)), (md.getCurr3DaysAvg(curr)));
            if (makerAmt <= p1.getBalanceofInvestmentAsset(maxIACurr)) {
                zeroExOrders(curr, makerAmt, takerAmt, "ILT", cancel);
                Liquidity("ILT", "0x");
            } else {
                Liquidity("ILT", "Not0x");
            }
        } else {
            cancelLastInsufficientTradingOrder(curr, takerAmt);
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
            check0xOrderStatus(curr, index); // transfer previous order amount
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

    /// @dev Get Investment asset balance and active status for a given asset name.
    function getInvestmentAssetBalAndStatus(bytes8 currName)
    constant
    returns(
        bytes16 curr,
        uint balance,
        uint8 status,
        uint64 _minHoldingPercX100,
        uint64 _maxHoldingPercX100,
        uint64 decimals
        ) {

        balance = p1.getBalanceofInvestmentAsset(currName);
        (curr, , status, _minHoldingPercX100, _maxHoldingPercX100, decimals) = pd.getInvestmentAssetDetails(currName);
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

    // update currency asset base min and var min
    function updateCurrencyAssetDetails(bytes8 _curr, uint64 _baseMin) onlyInternal {

        pd.changeCurrencyAssetBaseMin(_curr, _baseMin);
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

    /// @dev Initiates all 0x trading orders.
    function zeroExOrders(bytes8 curr, uint makerAmt, uint takerAmt, bytes16 _type, uint8 cancel) internal {
        bytes8 minIACurr;
        uint expirationTimeInMilliSec;
        bytes8 maxIACurr;
        address takerTokenAddr;
        exchange = Exchange(exchangeContractAddress);

        bytes32 orderHash;
        (maxIACurr, , minIACurr, ) = pd.getIARankDetailsByDate(pd.getLastDate());
        address makerTokenAddr;
        if (curr == "ETH") {
            if (_type == "ELT") {
                makerTokenAddr = pd.getWETHAddress();
            }else if (_type == "ILT") {
                takerTokenAddr = pd.getWETHAddress();
            }
        } else {
            if (_type == "ELT") {
                makerTokenAddr = pd.getCurrencyAssetAddress(curr);
            }else if (_type == "ILT") {
                takerTokenAddr = pd.getCurrencyAssetAddress(curr);
            }
        }
        if (_type == "ELT") {
            takerTokenAddr = pd.getInvestmentAssetAddress(minIACurr);
            expirationTimeInMilliSec = SafeMaths.add(now, pd.getOrderExpirationTime(_type)); //12 hours in milliseconds
            orderHash = exchange.getOrderHash([pd.get0xMakerAddress(), pd.get0xTakerAddress(),
                makerTokenAddr, takerTokenAddr, pd.get0xFeeRecipient()],
                [SafeMaths.mul(makerAmt, DECIMAL1E18), takerAmt, pd.get0xMakerFee(),
                pd.get0xTakerFee(), expirationTimeInMilliSec, pd.getOrderSalt()]);
            pd.setCurrOrderHash(curr, orderHash);
            pd.updateLiquidityOrderStatus(curr, _type, 1);
            pd.pushOrderDetails(orderHash, curr, SafeMaths.mul(makerAmt, DECIMAL1E18),
                bytes4(minIACurr), takerAmt, _type, expirationTimeInMilliSec);
            //event
            ZeroExOrders("Call0x", makerTokenAddr, takerTokenAddr,
                SafeMaths.mul(makerAmt, DECIMAL1E18), takerAmt, expirationTimeInMilliSec, orderHash);
        } else if (_type == "ILT") {
            makerTokenAddr = pd.getInvestmentAssetAddress(maxIACurr);
            expirationTimeInMilliSec = SafeMaths.add(now, pd.getOrderExpirationTime(_type));
            orderHash = exchange.getOrderHash([pd.get0xMakerAddress(), pd.get0xTakerAddress(),
                makerTokenAddr, takerTokenAddr, pd.get0xFeeRecipient()],
                [makerAmt, SafeMaths.mul(takerAmt, DECIMAL1E18), pd.get0xMakerFee(),
                pd.get0xTakerFee(), expirationTimeInMilliSec, pd.getOrderSalt()]);
            pd.setCurrOrderHash(curr, orderHash);
            pd.updateLiquidityOrderStatus(curr, _type, 1);
            pd.pushOrderDetails(orderHash, bytes4(maxIACurr), makerAmt, curr,
                SafeMaths.mul(takerAmt, DECIMAL1E18), _type, expirationTimeInMilliSec);
            if (cancel == 1) {
                // saving last orderHash
                setOrderCancelHashValue(curr, orderHash);
            }
            //event
            ZeroExOrders("Call0x", makerTokenAddr, takerTokenAddr, makerAmt,
                SafeMaths.mul(takerAmt, DECIMAL1E18), expirationTimeInMilliSec, orderHash);
        }
    }

    function setOrderCancelHashValue(bytes8 curr, bytes32 orderHash) internal {
        uint lastIndex = SafeMaths.sub(pd.getCurrAllOrderHashLength(curr), 1);
        bytes32 lastCurrHash = pd.getCurrOrderHash(curr, lastIndex);
        pd.setOrderCancelHashValue(orderHash, lastCurrHash);
    }

}
