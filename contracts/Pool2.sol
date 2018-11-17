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

import "./TokenFunctions.sol";
import "./ClaimsReward.sol";
import "./PoolData.sol";
import "./Quotation.sol";
import "./QuotationData.sol";
import "./Pool1.sol";
import "./Claims.sol";
import "./MCRData.sol";
import "./MCR.sol";
import "./Pool3.sol";
import "./Iupgradable.sol";
import "./imports/0xProject/Exchange.sol";
import "./imports/openzeppelin-solidity/math/SafeMaths.sol";
import "./imports/openzeppelin-solidity/token/ERC20/BasicToken.sol";
import "./imports/openzeppelin-solidity/token/ERC20/StandardToken.sol";


contract Pool2 is Iupgradable {
    using SafeMaths for uint;

    TokenFunctions tf;
    Pool1 p1;
    Claims c1;
    Exchange exchange1;
    Quotation q2;
    MCR m1;
    MCRData md;
    ClaimsReward cr;
    PoolData pd;
    BasicToken btok;
    Pool3 p3;
    QuotationData qd;
    StandardToken public stok;

    address poolAddress;
    address exchangeContractAddress;

    uint64 private constant DECIMAL1E18 = 1000000000000000000;

    event Liquidity(bytes16 typeOf, bytes16 functionName);

    // event ZeroExOrders(
    //     bytes16 func,
    //     address makerAddr,
    //     address takerAddr,
    //     uint makerAmt,
    //     uint takerAmt,
    //     uint expirationTimeInMilliSec,
    //     bytes32 orderHash
    //     );

    event Rebalancing(bytes16 name, uint16 param);

    modifier onlyOwner {
        require(ms.isOwner(msg.sender) == true);
        _;
    }

    modifier checkPause {
        require(ms.isPause() == false);
        _;
    }

    function changeDependentContractAddress() onlyInternal {
        m1 = MCR(ms.getLatestAddress("MC"));
        tf = TokenFunctions(ms.getLatestAddress("TF"));
        pd = PoolData(ms.getLatestAddress("PD"));
        md = MCRData(ms.getLatestAddress("MD"));
        q2 = Quotation(ms.getLatestAddress("Q2"));
        p3 = Pool3(ms.getLatestAddress("P3"));
        p1 = Pool1(ms.getLatestAddress("P1"));
        c1 = Claims(ms.getLatestAddress("CL"));
        cr = ClaimsReward(ms.getLatestAddress("CR"));
        qd = QuotationData(ms.getLatestAddress("QD"));
    }

    function changeExchangeContractAddress(address _add) onlyOwner {
        exchangeContractAddress = _add; //0x

        p3.changeExchangeContractAddress(exchangeContractAddress);
    }

    /// @dev Gets the equivalent investment asset Pool1  balance in ether.
    /// @param iaCurr array of Investment asset name.
    /// @param iaRate array of investment asset exchange rate.
    function totalRiskPoolBalance(bytes8[] iaCurr, uint64[] iaRate) constant returns(uint balance, uint iaBalance) {
        uint currBalance;
        (currBalance, ) = m1.calVtpAndMCRtp();

        for (uint i = 0; i < iaCurr.length; i++) {
            if (iaRate[i] > 0)
                iaBalance = SafeMaths.add(iaBalance, SafeMaths.div(SafeMaths.mul(getBalanceofInvestmentAsset(iaCurr[i]), 100), iaRate[i]));
        }
        balance = SafeMaths.add(currBalance, iaBalance);
    }

    /// @dev Unwraps ether.
    function convertWETHintoETH(bytes8[] curr, uint64[] rate, uint64 date) checkPause payable {

        btok = BasicToken(pd.getWETHAddress());
        bool success = btok.transfer(msg.sender, msg.value);
        if (success == true)
            p3.saveIADetails(curr, rate, date);
    }

    function createOrder(bytes8 curr, uint makerAmt, uint takerAmt, bytes16 _type, uint8 cancel) onlyInternal
    {


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

        balance = getBalanceofInvestmentAsset(currName);
        (curr, , status, _minHoldingPercX100, _maxHoldingPercX100, decimals) = pd.getInvestmentAssetDetails(currName);
    }

    ///@dev Gets Pool balance of a given Investment Asset.
    function getBalanceofInvestmentAsset(bytes8 _curr) public view returns(uint balance) {
        address currAddress = pd.getInvestmentAssetAddress(_curr);
        stok = StandardToken(currAddress);
        return stok.balanceOf(address(this));
    }

    ///@dev Gets Pool1 balance of a given investmentasset.
    function getBalanceOfCurrencyAsset(bytes8 _curr) public view returns(uint balance) {
        stok = StandardToken(pd.getCurrencyAssetAddress(_curr));
        return stok.balanceOf(address(this));
    }

    function _transferALLInvestmentAssetFromPool(address _newPoolAddress)
    {
        for (uint64 i = 1; i < pd.getAllCurrenciesLen(); i++) {
            bytes8 caName = pd.getAllCurrenciesByIndex(i);
            address caAddress = pd.getCurrencyAssetAddress(caName);
            require(_transferCurrencyAssetFromPool(_newPoolAddress, caAddress));
        }
        if (address(this).balance > 0)
            require(_newPoolAddress.send(address(this).balance));
    }

    /// @dev Sets a given investment asset as active or inactive for trading.
    function changeInvestmentAssetStatus(bytes8 curr, uint8 status) public {

        require(ms.checkIsAuthToGoverned(msg.sender));
        pd.changeInvestmentAssetStatus(curr, status);
    }

    // add new investment asset currency.
    function addInvestmentAssetsDetails(
        bytes8 currName,
        address curr,
        uint64 _minHoldingPercX100,
        uint64 _maxHoldingPercX100
    )   
        public
    {
        require(ms.checkIsAuthToGoverned(msg.sender));
        pd.addInvestmentCurrency(currName);
        pd.pushInvestmentAssetsDetails(currName, curr, 1, _minHoldingPercX100, _maxHoldingPercX100, 18);
    }

    // @dev Updates investment asset min and max holding percentages.
    function updateInvestmentAssetHoldingPerc(
        bytes8 _curr,
        uint64 _minPercX100,
        uint64 _maxPercX100
    ) 
        public
    {
        require(ms.checkIsAuthToGoverned(msg.sender));
        pd.changeInvestmentAssetHoldingPerc(_curr, _minPercX100, _maxPercX100);
    }

    function transferAssetToPool1(bytes8 curr, uint amount) onlyInternal {
        address pool1Add = ms.getLatestAddress("P1");
        if (curr == "ETH") {
            pool1Add.send(amount);
        } else {
            address caAddress = pd.getCurrencyAssetAddress(curr);
            stok = StandardToken(caAddress);
            stok.transfer(pool1Add, amount);
        }
    }

    ///@dev Transfers investment asset from current Pool address to the new Pool address.
    function _transferInvestmentAssetFromPool(
        address _newPoolAddress,
        address _iaAddress
    ) 
        internal
        returns (bool success)
    {
        // TODO: To be automated by version control in NXMaster
        stok = StandardToken(_iaAddress);
        if (stok.balanceOf(this) > 0) {
            stok.transfer(_newPoolAddress, stok.balanceOf(this));
        }
        success = true;
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



    /// @dev Triggers Pool1 rebalancing trading orders.
    // function rebalancingTrading0xOrders(bytes8[] iaCurr, uint64[] iaRate, uint64 date)checkPause returns(uint16 result)
    // {
    //     bytes8 maxIACurr;
    //     uint64 maxRate;
    //     (maxIACurr, maxRate, , ) = pd.getIARankDetailsByDate(date);
    //     if (pd.getLiquidityOrderStatus(maxIACurr, "RBT") == 0) {
    //         uint totalRiskBal=SafeMaths.div((SafeMaths.mul(pd.getTotalRiskPoolBalance(), 100000)), (DECIMAL1E18));
    //         if (totalRiskBal > 0 && iaRate.length > 0) { //if v=0 OR there is no IA, don't trade
    //             for (uint i=0; i < iaRate.length; i++) {
    //                 if (pd.getInvestmentAssetStatus(iaCurr[i]) == 1) {  // if IA is active
    //                     if (p3.checkTradeConditions(iaCurr[i], iaRate[i]) == 1) {  // ORDER 1 (max RHS IA to ETH)   // amount of asset to sell
    //                         uint makerAmt=(SafeMaths.div((SafeMaths.mul(SafeMaths.mul(SafeMaths.mul(2, pd.getVariationPercX100()),
    //                             totalRiskBal), maxRate)), (SafeMaths.mul(SafeMaths.mul(100, 100), 100000)))); //MULTIPLY WITH DECIMALS
    //                         uint investmentAssetDecimals=pd.getInvestmentAssetDecimals(maxIACurr); // amount of ETH to buy
    //                         uint takerAmt=((SafeMaths.mul(md.getCurr3DaysAvg("ETH"), makerAmt))/maxRate);
    //                         uint expirationTimeInMilliSec=SafeMaths.add(now, pd.getOrderExpirationTime("RBT"));
    //                         makerAmt = SafeMaths.div((SafeMaths.mul(makerAmt, 10**investmentAssetDecimals)), 100);
    //                         takerAmt = SafeMaths.div(SafeMaths.mul(takerAmt, DECIMAL1E18), (100));
    //                         if (makerAmt <= p1.getBalanceofInvestmentAsset(maxIACurr)) {
    //                             exchange1 = Exchange(exchangeContractAddress);
    //                             bytes32 orderHash=exchange1.getOrderHash(
    //                                 [pd.get0xMakerAddress(),
    //                                 pd.get0xTakerAddress(),
    //                                 pd.getInvestmentAssetAddress(maxIACurr),
    //                                 p3.getWETHAddress(),
    //                                 pd.get0xFeeRecipient()],
    //                                 [makerAmt,
    //                                 takerAmt,
    //                                 pd.get0xMakerFee(),
    //                                 pd.get0xTakerFee(),
    //                                 expirationTimeInMilliSec,
    //                                 pd.getOrderSalt()]
    //                                 );
    //                             pd.saveRebalancingOrderHash(orderHash);
    //                             pd.pushOrderDetails(orderHash, bytes4(maxIACurr), makerAmt, "ETH", takerAmt, "RBT", expirationTimeInMilliSec);
    //                             pd.updateLiquidityOrderStatus(bytes4(maxIACurr), "RBT", 1);
    //                             pd.setCurrOrderHash(bytes4(maxIACurr), orderHash);
    //                             //events
    //                             // ZeroExOrders(
    //                             //     "RBT",
    //                             //     pd.getInvestmentAssetAddress(maxIACurr),
    //                             //     p3.getWETHAddress(),
    //                             //     makerAmt,
    //                             //     takerAmt,
    //                             //     expirationTimeInMilliSec,
    //                             //     orderHash
    //                             //     );
    //                             Rebalancing("OrderGen", 1);
    //                             return 1; // rebalancing order generated
    //                         }else {   //events
    //                             // ZeroExOrders(
    //                             //     "RBT",
    //                             //     pd.getInvestmentAssetAddress(maxIACurr),
    //                             //     p3.getWETHAddress(),
    //                             //     makerAmt,
    //                             //     takerAmt,
    //                             //     expirationTimeInMilliSec,
    //                             //     "insufficient"
    //                             //     );
    //                             Rebalancing("OrderGen", 2);
    //                             return 2; // not enough makerAmt;
    //                         }
    //                     }
    //                 }
    //             }
    //             Rebalancing("OrderGen", 0);
    //             return 0; // when V!=0 but rebalancing is not required
    //         }
    //     }
    //     Rebalancing("OrderGen", 3);
    //     return 4; // when V=0 or no IA is present
    // }

    ///@dev Gets 0x order details by hash.
    // function getOrderDetailsByHash(bytes16 orderType, bytes8 makerCurr, bytes8 takerCurr)
    // constant
    // returns(
    //     address makerCurrAddr,
    //     address takerCurrAddr,
    //     uint salt,
    //     address feeRecipient,
    //     address takerAddress,
    //     uint makerFee,
    //     uint takerFee
    //     ) {

    //     if (orderType == "ELT") {
    //         if (makerCurr == "ETH")
    //             makerCurrAddr = pd.getWETHAddress();
    //         else
    //             makerCurrAddr = pd.getCurrencyAssetAddress(makerCurr);
    //         takerCurrAddr = pd.getInvestmentAssetAddress(takerCurr);
    //     } else if (orderType == "ILT") {
    //         makerCurrAddr = pd.getInvestmentAssetAddress(makerCurr);
    //         if (takerCurr == "ETH")
    //             takerCurrAddr = pd.getWETHAddress();
    //         else
    //             takerCurrAddr = pd.getCurrencyAssetAddress(takerCurr);
    //     } else if (orderType == "RBT") {
    //         makerCurrAddr = pd.getInvestmentAssetAddress(makerCurr);
    //         takerCurrAddr = pd.getWETHAddress();
    //     }
    //     salt = pd.getOrderSalt();
    //     feeRecipient = pd.get0xFeeRecipient();
    //     takerAddress = pd.get0xTakerAddress();
    //     makerFee = pd.get0xMakerFee();
    //     takerFee = pd.get0xTakerFee();
    // }


    
    
    

}
