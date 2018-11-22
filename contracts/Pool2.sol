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
import "./imports/openzeppelin-solidity/math/SafeMath.sol";
import "./imports/openzeppelin-solidity/token/ERC20/ERC20.sol";


contract Pool2 is Iupgradable {
    using SafeMath for uint;

    TokenFunctions internal tf;
    Pool1 internal p1;
    Claims internal c1;
    // Exchange public exchange1;
    Quotation internal q2;
    MCR internal m1;
    MCRData internal md;
    ClaimsReward internal cr;
    PoolData internal pd;
    Pool3 internal p3;
    QuotationData internal qd;

    address internal poolAddress;
    address internal exchangeContractAddress;

    uint internal constant DECIMAL1E18 = uint(10) ** 18;

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

    function changeDependentContractAddress() public onlyInternal {
        m1 = MCR(ms.getLatestAddress("MC"));
        tf = TokenFunctions(ms.getLatestAddress("TF"));
        pd = PoolData(ms.getLatestAddress("PD"));
        md = MCRData(ms.getLatestAddress("MD"));
        q2 = Quotation(ms.getLatestAddress("QT"));
        p3 = Pool3(ms.getLatestAddress("P3"));
        p1 = Pool1(ms.getLatestAddress("P1"));
        c1 = Claims(ms.getLatestAddress("CL"));
        cr = ClaimsReward(ms.getLatestAddress("CR"));
        qd = QuotationData(ms.getLatestAddress("QD"));
    }

    function () public payable {} //solhint-disable-line
    
    function changeExchangeContractAddress(address _add) public onlyOwner {
        exchangeContractAddress = _add; //0x
        p3.changeExchangeContractAddress(exchangeContractAddress);
    }

    /// @dev Gets the equivalent investment asset Pool2 balance in ether.
    /// @param iaCurr array of Investment asset name.
    /// @param iaRate array of investment asset exchange rate.
    function totalRiskPoolBalance(bytes8[] iaCurr, uint64[] iaRate) public view returns(uint balance, uint iaBalance) {
        uint currBalance;
        (currBalance, ) = m1.calVtpAndMCRtp();

        for (uint i = 0; i < iaCurr.length; i++) {
            if (iaRate[i] > 0)
                iaBalance = iaBalance.add((getBalanceofInvestmentAsset(iaCurr[i]).mul(100)).div(iaRate[i]));
        }
        balance = currBalance.add(iaBalance);
    }
    // function createOrder(
    //     bytes8 curr,
    //     uint makerAmt,
    //     uint takerAmt,
    //     bytes16 _type,
    //     uint8 cancel
    // ) 
    //     public
    //     onlyInternal
    // {

    // }
    /// @dev Get Investment asset balance and active status for a given asset name.
    function getInvestmentAssetBalAndStatus(
        bytes8 currName
    )
        public
        view
        returns (
            bytes16 curr,
            uint balance,
            uint8 status,
            uint64 _minHoldingPercX100,
            uint64 _maxHoldingPercX100,
            uint64 decimals
        )
    {
        balance = getBalanceofInvestmentAsset(currName);
        (curr, , status, _minHoldingPercX100, _maxHoldingPercX100, decimals) = pd.getInvestmentAssetDetails(currName);
    }

    ///@dev Gets Pool balance of a given Investment Asset.
    function getBalanceofInvestmentAsset(bytes8 _curr) public view returns(uint balance) {
        address currAddress = pd.getInvestmentAssetAddress(_curr);
        ERC20 erc20 = ERC20(currAddress);
        return erc20.balanceOf(address(this));
    }

    ///@dev Gets Pool1 balance of a given investmentasset.
    function getBalanceOfCurrencyAsset(bytes8 _curr) public view returns(uint balance) {
        ERC20 erc20 = ERC20(pd.getCurrencyAssetAddress(_curr));
        return erc20.balanceOf(address(this));
    }

    function _transferALLInvestmentAssetFromPool(address _newPoolAddress) public onlyInternal {
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

    function transferAssetToPool1(bytes8 curr, uint amount) public onlyInternal {
        address pool1Add = ms.getLatestAddress("P1");
        if (curr == "ETH") {
            require(pool1Add.send(amount));
        } else {
            address caAddress = pd.getCurrencyAssetAddress(curr);
            ERC20 erc20 = ERC20(caAddress);
            erc20.transfer(pool1Add, amount);
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
        ERC20 erc20 = ERC20(_iaAddress);
        if (erc20.balanceOf(this) > 0) {
            erc20.transfer(_newPoolAddress, erc20.balanceOf(this));
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
        ERC20 erc20 = ERC20(_caAddress);
        if (erc20.balanceOf(this) > 0) {
            erc20.transfer(_newPoolAddress, erc20.balanceOf(this));
        }
        success = true;
    } 
}
