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

import "./NXMaster.sol";
import "./Claims.sol";
import "./Pool1.sol";
import "./ClaimsReward.sol";
import "./ClaimsData.sol";
import "./MCR.sol";
import "./QuotationData.sol";
import "./PoolData.sol";
import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMaths.sol";


contract NXMaster2 is Iupgradable {
    using SafeMaths
    for uint;

    Claims c1;
    Pool1 p1;
    ClaimsData cd;
    ClaimsReward cr;
    QuotationData qd;
    PoolData pd;
    MCR m1;

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

    /// @dev Adds quotation status.
    function addCoverStatus() public onlyOwner {

        qd.pushCoverStatus("Active");
        qd.pushCoverStatus("Claim Accepted");
        qd.pushCoverStatus("Claim Denied");
        qd.pushCoverStatus("Cover Expired");
        qd.pushCoverStatus("Claim Submitted");
        qd.pushCoverStatus("Requested");
    }



    /// @dev Adds investment asset details to Pool1.
    function addCurrencyAssetsDetails() internal {

        pd.pushCurrencyAssetsDetails("ETH", 0x00, 1, 50, 400, 18);
        pd.pushCurrencyAssetsDetails("DAI", 0xf7c3e9e4a7bb8ca2c1c640f03d76d1ac12887bce, 1, 50, 300, 18);

    }

    /// @dev Adds investment asset names to Pool1 module.
    function addAllCurrencies() internal {
        pd.addAllCurrencies("ETH");
        pd.addAllCurrencies("DAI");
    }

    /// @dev Adds investment assets names to Pool1 module.
    function addInvestmentCurrencies() internal {

        pd.addInvestmentCurrency("DGD");
        pd.addInvestmentCurrency("ICN");
        pd.addInvestmentCurrency("ZRX");
        pd.addInvestmentCurrency("MKR");
        pd.addInvestmentCurrency("GNT");
        pd.addInvestmentCurrency("MLN");
    }

    /// @dev Adds currency asset data to Pool1 module.
    function addCurrencyAssetsVarBase() internal {

        pd.pushCurrencyAssetsVarBase("ETH", 6); //original 64 baseMin
        pd.pushCurrencyAssetsVarBase("DAI", 7);

    }

    /// @dev Adds investment asset details to Pool1.
    function addInvestmentAssetsDetails() internal {

        //DGD
        // tok=SupplyToken(0xeee3870657e4716670f185df08652dd848fe8f7e);
        // decimals=tok.decimals();
        pd.pushInvestmentAssetsDetails("DGD", 0xeee3870657e4716670f185df08652dd848fe8f7e, 1, 500, 4000, 18);
        //ICN
        // tok=SupplyToken(0x21e6b27b23241a35d216f8641c72cfed33085fe9);
        // decimals=tok.decimals();
        pd.pushInvestmentAssetsDetails("ICN", 0x21e6b27b23241a35d216f8641c72cfed33085fe9, 1, 1000, 3000, 18);
        //ZRX
        // tok=SupplyToken(0x6ff6c0ff1d68b964901f986d4c9fa3ac68346570);
        // decimals=tok.decimals();
        pd.pushInvestmentAssetsDetails("ZRX", 0x6ff6c0ff1d68b964901f986d4c9fa3ac68346570, 1, 500, 2500, 18);
        //MKR
        // tok=SupplyToken(0x1dad4783cf3fe3085c1426157ab175a6119a04ba);
        // decimals=tok.decimals();
        pd.pushInvestmentAssetsDetails("MKR", 0x1dad4783cf3fe3085c1426157ab175a6119a04ba, 1, 500, 2000, 18);
        //GNT
        // tok=SupplyToken(0xef7fff64389b814a946f3e92105513705ca6b990);
        // decimals=tok.decimals();
        pd.pushInvestmentAssetsDetails("GNT", 0xef7fff64389b814a946f3e92105513705ca6b990, 1, 500, 2000, 18);
        //MLN
        // tok=SupplyToken(0x323b5d4c32345ced77393b3530b1eed0f346429d);
        // decimals=tok.decimals();
        pd.pushInvestmentAssetsDetails("MLN", 0x323b5d4c32345ced77393b3530b1eed0f346429d, 1, 500, 2000, 18);
    }

}
