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

import "./Claims.sol";
import "./Pool1.sol";
import "./ClaimsReward.sol";
import "./ClaimsData.sol";
import "./MCR.sol";
import "./QuotationData.sol";
import "./PoolData.sol";
import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMath.sol";


contract NXMaster2 is Iupgradable {
    using SafeMath for uint;

    Claims internal c1;
    Pool1 internal p1;
    ClaimsData internal cd;
    ClaimsReward internal cr;
    QuotationData internal qd;
    PoolData internal pd;
    MCR internal m1;

    modifier onlyOwner {
        require(ms.isOwner(msg.sender) == true);
        _;
    }

    function changeDependentContractAddress() public onlyInternal {
        cd = ClaimsData(ms.getLatestAddress("CD"));
        p1 = Pool1(ms.getLatestAddress("P1"));
        c1 = Claims(ms.getLatestAddress("CL"));
        m1 = MCR(ms.getLatestAddress("MC"));
        cr = ClaimsReward(ms.getLatestAddress("CR"));
        qd = QuotationData(ms.getLatestAddress("QD"));
        pd = PoolData(ms.getLatestAddress("PD"));

    }

    /// @dev Initializes asset data required by Pool1 module.
    function callPoolDataMethods() public onlyOwner {
        addAllCurrencies();
        addCurrencyAssetsDetails();
        addCurrencyAssetsVarBase();
        addInvestmentCurrencies();
        addInvestmentAssetsDetails();
    }

    /// @dev Adds all the claim status names into array.
    function addStatusInClaims() public onlyOwner {
        c1.pushStatus("Pending-Claim Assessor Vote", 0, 0); //0
        c1.pushStatus("Pending-Claim Assessor Vote Denied, Pending Member Vote", 0, 0); //1
        c1.pushStatus("Pending-CA Vote Threshold not Reached Accept, Pending Member Vote", 0, 0); //2
        c1.pushStatus("Pending-CA Vote Threshold not Reached Deny, Pending Member Vote", 0, 0); //3
        c1.pushStatus("Pending-CA Consensus not reached Accept, Pending Member Vote", 0, 0); //4
        c1.pushStatus("Pending-CA Consensus not reached Deny, Pending Member Vote", 0, 0); //5
        c1.pushStatus("Final-Claim Assessor Vote Denied", 100, 0); //6
        c1.pushStatus("Final-Claim Assessor Vote Accepted", 100, 0); //7
        c1.pushStatus("Final-Claim Assessor Vote Denied, MV Accepted", 0, 100); //8
        c1.pushStatus("Final-Claim Assessor Vote Denied, MV Denied", 0, 100); //9
        c1.pushStatus("Final-Claim Assessor Vote Accept, MV Nodecision", 0, 0); //10
        c1.pushStatus("Final-Claim Assessor Vote Denied, MV Nodecision", 0, 0); //11
        c1.pushStatus("Claim Accepted Payout Pending", 0, 0); //12
        c1.pushStatus("Claim Accepted No Payout ", 0, 0); //13
        c1.pushStatus("Claim Accepted Payout Done", 0, 0); //14
    }

    /// @dev Adds currency NXMaster
    function addMCRCurr() public onlyOwner {
        m1.addCurrency("ETH");
        m1.addCurrency("DAI");

    }

    /// @dev Adds investment asset details to Pool1.
    function addCurrencyAssetsDetails() internal {
        pd.pushCurrencyAssetsDetails("ETH", address(0), 1, 50, 400, 18);
        pd.pushCurrencyAssetsDetails("DAI", 0xF7c3E9e4A7bB8cA2c1C640f03d76d1AC12887BCE, 1, 50, 300, 18);
    }

    /// @dev Adds investment asset names to Pool1 module.
    function addAllCurrencies() internal {
        pd.addAllCurrencies("ETH");
        pd.addAllCurrencies("DAI");
    }

    /// @dev Adds investment assets names to Pool1 module.
    function addInvestmentCurrencies() internal {
        pd.addInvestmentCurrency("ETH");
        pd.addInvestmentCurrency("DAI");
    }

    /// @dev Adds currency asset data to Pool1 module.
    function addCurrencyAssetsVarBase() internal {
        pd.pushCurrencyAssetsVarBase("ETH", 6); //original 64 baseMin
        pd.pushCurrencyAssetsVarBase("DAI", 7);
    }

    /// @dev Adds investment asset details to Pool1.
    function addInvestmentAssetsDetails() internal {
        pd.pushInvestmentAssetsDetails("ETH", address(0), 1, 500, 5000, 18);
        pd.pushInvestmentAssetsDetails("DAI", 0xF7c3E9e4A7bB8cA2c1C640f03d76d1AC12887BCE, 1, 500, 5000, 18);
    }
}
