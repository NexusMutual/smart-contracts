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

pragma solidity ^0.4.24;

import "./Claims.sol";
import "./NXMaster.sol";
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

    address public masterAddress;

    Claims c1;
    NXMaster ms;
    Pool1 p1;
    ClaimsData cd;
    ClaimsReward cr;
    QuotationData qd;
    PoolData pd;
    MCR m1;

    function changeMasterAddress(address _add) {
        if (masterAddress == 0x000) {
            masterAddress = _add;
            ms = NXMaster(masterAddress);
        } else {
            ms = NXMaster(masterAddress);
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

    function changeDependentContractAddress() onlyInternal {
        uint currentVersion = ms.currentVersion();
        cd = ClaimsData(ms.versionContractAddress(currentVersion, "CD"));
        p1 = Pool1(ms.versionContractAddress(currentVersion, "P1"));
        c1 = Claims(ms.versionContractAddress(currentVersion, "C1"));
        m1 = MCR(ms.versionContractAddress(currentVersion, "MCR"));
        cr = ClaimsReward(ms.versionContractAddress(currentVersion, "CR"));
        qd = QuotationData(ms.versionContractAddress(currentVersion, "QD"));
        pd = PoolData(ms.versionContractAddress(currentVersion, "PD"));

    }

    /// @dev Adds all the claim status names into array.
    function addStatusInClaims() onlyOwner {

        c1.pushStatus("Pending-Claim Assessor Vote", 0, 0); //0
        c1.pushStatus("Pending-Claim Assessor Vote Denied, Pending Member Vote", 0, 0); //2
        c1.pushStatus("Pending-CA Vote Threshold not Reached Accept, Pending Member Vote", 0, 0); //3
        c1.pushStatus("Pending-CA Vote Threshold not Reached Deny, Pending Member Vote", 0, 0); //4
        c1.pushStatus("Pending-CA Consensus not reached Accept, Pending Member Vote", 0, 0); //5
        c1.pushStatus("Pending-CA Consensus not reached Deny, Pending Member Vote", 0, 0); //6
        c1.pushStatus("Final-Claim Assessor Vote Denied", 100, 0); //7
        c1.pushStatus("Final-Claim Assessor Vote Accepted", 100, 0); //8
        c1.pushStatus("Final-Claim Assessor Vote Denied, MV Accepted", 0, 100); //12
        c1.pushStatus("Final-Claim Assessor Vote Denied, MV Denied", 0, 100); //13
        c1.pushStatus("Final-Claim Assessor Vote Accept, MV Nodecision", 0, 0); //14
        c1.pushStatus("Final-Claim Assessor Vote Denied, MV Nodecision", 0, 0); //15
        c1.pushStatus("Claim Accepted Payout Pending", 0, 0); //16
        c1.pushStatus("Claim Accepted No Payout ", 0, 0); //17
        c1.pushStatus("Claim Accepted Payout Done", 0, 0); //18
    }

    /// @dev Changes the  minimum,maximum Claims assessment voting,escalation,payout retry times
    /// @param _mintime Minimum time(in seconds) for which claim assessment voting is open
    /// @param _maxtime Maximum time(in seconds) for which claim assessment voting is open
    /// @param escaltime Time(in seconds) in which, after a denial by Claims assessor, a person can escalate claim for member voting
    /// @param payouttime Time(in seconds) after which a payout is retried(in case a claim is accepted and payout fails)
    function changeTimes(uint32 _mintime, uint32 _maxtime, uint32 escaltime, uint32 payouttime) onlyOwner {
        uint64 timeLeft;

        cd.setTimes(_mintime, _maxtime, escaltime, payouttime);

        uint nowTime = now;
        uint pendingClaimStart = cd.pendingClaimStart();
        uint actualClaimLength = cd.actualClaimLength();
        for (uint i = pendingClaimStart; i < actualClaimLength; i++) {
            uint stat;
            (, stat) = cd.getClaimStatusNumber(i);
            uint dateUpd = cd.getClaimDateUpd(i);
            if (stat == 1 && (SafeMaths.add(dateUpd, escaltime) <= nowTime)) {
                cr.changeClaimStatus(i);
            } else if (stat == 1 && (SafeMaths.add(dateUpd, escaltime) > nowTime)) {
                timeLeft = uint64(SafeMaths.sub(SafeMaths.add(dateUpd, escaltime), nowTime));
                p1.closeClaimsOraclise(i, timeLeft);
            }

            if ((stat == 0 || (stat >= 2 && stat <= 6)) && (SafeMaths.add(dateUpd, _mintime) <= nowTime)) {
                cr.changeClaimStatus(i);
            } else if ((stat == 0 || (stat >= 2 && stat <= 6)) && (SafeMaths.add(dateUpd, _mintime) > nowTime)) {
                timeLeft = uint64(SafeMaths.sub(SafeMaths.add(dateUpd, _mintime), nowTime));
                p1.closeClaimsOraclise(i, timeLeft);
            }

            if ((stat == 0 || (stat >= 2 && stat <= 6)) && (SafeMaths.add(dateUpd, _maxtime) <= nowTime)) {
                cr.changeClaimStatus(i);
            } else if ((stat == 0 || (stat >= 2 && stat <= 6)) && (SafeMaths.add(dateUpd, _maxtime) > nowTime)) {
                timeLeft = uint64(SafeMaths.sub(SafeMaths.add(dateUpd, _maxtime), nowTime));
                p1.closeClaimsOraclise(i, timeLeft);
            }

            if (stat == 16 && (SafeMaths.add(dateUpd, payouttime) <= nowTime)) {
                cr.changeClaimStatus(i);
            } else if (stat == 16 && (SafeMaths.add(dateUpd, payouttime) > nowTime)) {
                timeLeft = uint64(SafeMaths.sub(SafeMaths.add(dateUpd, payouttime), nowTime));
                p1.closeClaimsOraclise(i, timeLeft);
            }
        }
    }

    /// @dev Adds currency NXMaster
    function addMCRCurr() onlyOwner {
        m1.addCurrency("ETH");
        m1.addCurrency("DAI");

    }

    /// @dev Adds quotation status.
    function addCoverStatus() onlyOwner {

        qd.pushCoverStatus("Active");
        qd.pushCoverStatus("Claim Accepted");
        qd.pushCoverStatus("Claim Denied");
        qd.pushCoverStatus("Cover Expired");
        qd.pushCoverStatus("Claim Submitted");
        qd.pushCoverStatus("Requested");
    }

    /// @dev Initializes asset data required by Pool1 module.
    function callPoolDataMethods() onlyOwner {
        addCurrencyAssetsVarBase();
        addInvestmentAssetsDetails();
        addInvestmentCurrencies();
        addAllCurrencies();
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
