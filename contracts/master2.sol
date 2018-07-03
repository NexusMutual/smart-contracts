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

pragma solidity ^0.4.11;

import "./claims.sol";
import "./governance.sol";
import "./master.sol";
import "./pool.sol";
import "./claimsReward.sol";
import "./claimsData.sol";
import "./mcr.sol";
import "./quotationData.sol";
import "./poolData.sol";
import "./SafeMaths.sol";
import "./Iupgradable.sol";


contract masters2 is Iupgradable {
    using SafeMaths
    for uint;

    address masterAddress;

    governance g1;
    claims c1;
    master ms;
    pool p1;
    claimsData cd;
    claimsReward cr;
    quotationData qd;
    poolData pd;
    mcr m1;

    function changeMasterAddress(address _add) {
        if (masterAddress == 0x000) {
            masterAddress = _add;
            ms = master(masterAddress);
        } else {
            ms = master(masterAddress);
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
        cd = claimsData(ms.versionContractAddress(currentVersion, "CD"));
        p1 = pool(ms.versionContractAddress(currentVersion, "P1"));
        c1 = claims(ms.versionContractAddress(currentVersion, "C1"));
        m1 = mcr(ms.versionContractAddress(currentVersion, "MCR"));
        g1 = governance(ms.versionContractAddress(currentVersion, "GOV1"));
        cr = claimsReward(ms.versionContractAddress(currentVersion, "CR"));
        qd = quotationData(ms.versionContractAddress(currentVersion, "QD"));
        pd = poolData(ms.versionContractAddress(currentVersion, "PD"));

    }

    /// @dev Adds all the status names into array.
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

    /// @dev Adds  statuses and categories master for a proposal.
    function changeStatusAndCAtegory() onlyOwner {

        //0
        g1.addCategory("Uncategorised", 0, 0);
        //1
        g1.addCategory("Implement run-off and close new business", 1, 80);
        //2
        g1.addCategory("Burn fraudulent claim assessor tokens", 0, 80);
        //3
        g1.addCategory("Pause Claim Assessors ability to assess claims for 3 days.Can only be done once a month", 0, 60);
        //4
        g1.addCategory("Changes to Capital Model", 1, 60);
        //5
        g1.addCategory("Changes to Pricing", 1, 60);
        //6
        g1.addCategory("Engage in external services up to the greater of $50,000USD or 2% of MCR", 0, 80);
        //7
        g1.addCategory("Engage in external services over the greater of $50,000USD or 2% of MCR", 1, 60);
        //8
        g1.addCategory("Changes to remuneration and/or membership of Advisory Board", 1, 60);
        //9
        g1.addCategory("Filter member proposals as necessary(which are put to a member vote)", 0, 60);
        //10
        g1.addCategory("Release new smart contract code as necessary to fix bugs/weaknesses or deliver enhancements/new products", 1, 60);
        //11
        g1.addCategory("Any change to authorities", 1, 80);
        //12
        g1.addCategory("Start/Stop Emergency Pause", 1, 80);
        //13
        g1.addCategory("Changes to Investment Model", 1, 60);
        //14
        g1.addCategory("Change 0x Relayer Address", 1, 60);
        //15
        g1.addCategory("Any other item specifically described", 1, 80);

        g1.addStatus("Draft for discussion, multiple versions.");
        g1.addStatus("Pending-Advisory Board Vote");
        g1.addStatus("Pending-Advisory Board Vote Accepted, pending Member Vote");
        g1.addStatus("Final-Advisory Board Vote Declined");
        g1.addStatus("Final-Advisory Board Vote Accepted, Member Vote not required");
        g1.addStatus("Final-Advisory Board Vote Accepted, Member Vote Accepted");
        g1.addStatus("Final-Advisory Board Vote Accepted, Member Vote Declined");
        g1.addStatus("Final-Advisory Board Vote Accepted, Member Vote Quorum not Achieved");
        g1.addStatus("Proposal Accepted, Insufficient Funds");
    }

    /// @dev Changes the  minimum,maximum claims assessment voting,escalation,payout retry times 
    /// @param _mintime Minimum time(in milliseconds) for which claim assessment voting is open
    /// @param _maxtime Maximum time(in milliseconds) for which claim assessment voting is open
    /// @param escaltime Time(in milliseconds) in which, after a denial by claims assessor, a person can escalate claim for member voting
    /// @param payouttime Time(in milliseconds) after which a payout is retried(in case a claim is accepted and payout fails)
    function changeTimes(uint32 _mintime, uint32 _maxtime, uint32 escaltime, uint32 payouttime) onlyOwner {
        uint64 timeLeft;

        c1.setTimes(_mintime, _maxtime, escaltime, payouttime);

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

    /// @dev Adds currency master 
    function addMCRCurr() onlyOwner {
        m1.addCurrency("ETH");
        m1.addCurrency("DAI");

    }

    /// @dev Add quotation and cover status.
    function addCoverStatus() onlyOwner {

        qd.pushCoverStatus("Active");
        qd.pushCoverStatus("Claim Accepted");
        qd.pushCoverStatus("Claim Denied");
        qd.pushCoverStatus("Cover Expired");
        qd.pushCoverStatus("Claim Submitted");
        qd.pushCoverStatus("Requested");
    }

    /// @dev Initialize asset data required by pool.
    function callPoolDataMethods() onlyOwner {
        addCurrencyAssetsVarBase();
        addInvestmentAssetsDetails();
        addInvestmentCurrencies();

        addAllCurrencies();
    }

    /// @dev Add investment asset details to pool.
    function addCurrencyAssetsDetails() internal {

        pd.pushCurrencyAssetsDetails("ETH", 0x00, 1, 50, 400, 18);
        pd.pushCurrencyAssetsDetails("DAI", 0xf7c3e9e4a7bb8ca2c1c640f03d76d1ac12887bce, 1, 50, 300, 18);

    }

    /// @dev Add investment assets names to pool.
    function addAllCurrencies() internal {
        pd.addAllCurrencies("ETH");
        pd.addAllCurrencies("DAI");
    }

    /// @dev Add investment assets names to pool.
    function addInvestmentCurrencies() internal {

        pd.addInvestmentCurrency("DGD");
        pd.addInvestmentCurrency("ICN");
        pd.addInvestmentCurrency("ZRX");
        pd.addInvestmentCurrency("MKR");
        pd.addInvestmentCurrency("GNT");
        pd.addInvestmentCurrency("MLN");
    }

    /// @dev Add currency asset data to pool. 
    function addCurrencyAssetsVarBase() internal {

        pd.pushCurrencyAssetsVarBase("ETH", 6); //original 64 baseMin
        pd.pushCurrencyAssetsVarBase("DAI", 7);

    }

    /// @dev Add investment asset details to pool.
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