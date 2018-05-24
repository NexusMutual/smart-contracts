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
// import "./usd.sol";
import "./SafeMaths.sol";
contract masters2 {
    using SafeMaths for uint;
    
    // address claimsAddress;
    // address governanceAddress;
    // address claimsRewardAddress;
    // address poolAddress;
    // address quotationDataAddress;
    // address poolDataAddress;
    address masterAddress;
    // address claimsDataAddress;
    // address MCRAddress;
    
    governance g1;
    claims c1;
    master ms;
    pool p1;
    claimsData cd;
    claimsReward cr;
    quotationData qd;
    poolData pd;
    mcr m1;
    // SupplyToken tok;

    function changeMasterAddress(address _add)
    {
        if(masterAddress == 0x000){
            masterAddress = _add;
            ms=master(masterAddress);
        }
        else {
            ms=master(masterAddress);
            if(ms.isInternal(msg.sender) == true)
                masterAddress = _add;
            else
                throw;
        }
    }
    modifier onlyInternal {
        // ms=master(masterAddress);
        require(ms.isInternal(msg.sender) == true);
        _; 
    }
     modifier onlyOwner{
        // ms=master(masterAddress);
        require(ms.isOwner(msg.sender) == true);
        _; 
    }
    function changeClaimDataAddress(address claimsDataAddress) onlyInternal
    {
        // claimsDataAddress = _add;
        cd=claimsData(claimsDataAddress);
    }

    function changePoolAddress(address poolAddress) onlyInternal
    {
        // poolAddress = _add;
        p1=pool(poolAddress);
    }
     function changeClaimsAddress(address claimsAddress) onlyInternal
    {
        // claimsAddress = _add;
        c1=claims(claimsAddress);
    }
    function changeMCRAddress(address mcrAddress) onlyInternal
    {
        // mcrAddress = _add;
        m1=mcr(mcrAddress);
    }
    function changeGovernanceAddress(address governanceAddress) onlyInternal
    {
        // governanceAddress = _add;
        g1=governance(governanceAddress);
    }

    function changeClaimRewardAddress(address claimsRewardAddress) onlyInternal
    {
        // claimsRewardAddress = _add;
        cr=claimsReward(claimsRewardAddress);
    }
    function changeQuotationDataAddress(address quotationDataAddress) onlyInternal
    {
        // quotationDataAddress=_add;
        qd=quotationData(quotationDataAddress);
    }
    function changePoolDataAddress(address poolDataAddress) onlyInternal
    {
        // poolDataAddress = _add;
        pd=poolData(poolDataAddress);
    }
    /// @dev Adds Status master for a claim.
    function addStatusInClaims()  onlyOwner
    {
        // c1=claims(claimsAddress);
        c1.pushStatus("Pending-Claim Assessor Vote");
        c1.pushStatus("Pending-Claim Assessor Vote Denied, pending RM Escalation");
        c1.pushStatus("Pending-Claim Assessor Vote Denied, Pending Member Vote");
        c1.pushStatus("Pending-CA Vote Threshold not Reached Accept, Pending Member Vote");
        c1.pushStatus("Pending-CA Vote Threshold not Reached Deny, Pending Member Vote");
        c1.pushStatus("Pending-CA Consensus not reached Accept, Pending Member Vote");
        c1.pushStatus("Pending-CA Consensus not reached Deny, Pending Member Vote");
        c1.pushStatus("Final-Claim Assessor Vote Denied");
        c1.pushStatus("Final-Claim Assessor Vote Accepted");
        c1.pushStatus("Final-Member Vote Accepted");
        c1.pushStatus("Final-Member Vote Denied");
        c1.pushStatus("Final-Claim Assessor Vote Denied, MV Threshold not reached");
        c1.pushStatus("Final-Claim Assessor Vote Denied, MV Accepted");
        c1.pushStatus("Final-Claim Assessor Vote Denied, MV Denied");
        c1.pushStatus("Final-Claim Assessor Vote Accept, MV Nodecision");
        c1.pushStatus("Final-Claim Assessor Vote Denied, MV Nodecision");
        c1.pushStatus("Claim Accepted Payout Pending");
        c1.pushStatus("Claim Accepted No Payout ");
        c1.pushStatus("Claim Accepted Payout Done");
    }
    /// @dev Adds  statuses and categories master for a proposal.
    function changeStatusAndCAtegory() onlyOwner
    {
        // g1=governance(governanceAddress);

        //0
        g1.addCategory("Uncategorised",0,0);
        //1
        g1.addCategory("Implement run-off and close new business",1,80);
        //2
        g1.addCategory("Burn fraudulent claim assessor tokens",0,80);
        //3
        g1.addCategory("Pause Claim Assessors ability to assess claims for 3 days.Can only be done once a month",0,60);
        //4
        g1.addCategory("Changes to Capital Model",1,60);
        //5
        g1.addCategory("Changes to Pricing",1,60);
        //6
        g1.addCategory("Engage in external services up to the greater of $50,000USD or 2% of MCR",0,80);
        //7
        g1.addCategory("Engage in external services over the greater of $50,000USD or 2% of MCR",1,60);
        //8
        g1.addCategory("Changes to remuneration and/or membership of Advisory Board",1,60);
        //9
        g1.addCategory("Filter member proposals as necessary(which are put to a member vote)",0,60);
        //10
        g1.addCategory("Release new smart contract code as necessary to fix bugs/weaknesses or deliver enhancements/new products",1,60);
        //11
        g1.addCategory("Any change to authorities",1,80);
        //12
        g1.addCategory("Start/Stop Emergency Pause",1,80);
        //13
        g1.addCategory("Changes to Investment Model",1,60);
        //14
        g1.addCategory("Change 0x Relayer Address",1,60);
        //15
        g1.addCategory("Any other item specifically described",1,80);

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
    function changeTimes(uint32 _mintime,uint32 _maxtime,uint32 escaltime,uint32 payouttime) onlyOwner
    {
        uint64 timeLeft;
        // p1=pool(poolAddress);
        // cr=claimsReward(claimsRewardAddress);
        // c1=claims(claimsAddress);
        c1.setTimes(_mintime,_maxtime,escaltime,payouttime);
        // cd=claimsData(claimsDataAddress);
        uint nowTime = now;
        uint pendingClaim_start=cd.pendingClaim_start();
        uint actualClaimLength=cd.actualClaimLength();
        for(uint i=pendingClaim_start;i<actualClaimLength;i++)
        {
            uint stat;
            (,stat)=cd.getClaimStatusNumber(i);
            uint date_upd=cd.getClaimDateUpd(i);
            if(stat==1 && (SafeMaths.add(date_upd, escaltime) <= nowTime))
            {
                cr.changeClaimStatus(i);
            }
            else if(stat==1 && (SafeMaths.add(date_upd, escaltime) >nowTime))
            {
                timeLeft = uint64(SafeMaths.sub(SafeMaths.add(date_upd, escaltime), nowTime));
                p1.closeClaimsOraclise(i,timeLeft);
            }

            if((stat==0 || (stat>=2 && stat<=6)) && (SafeMaths.add(date_upd, _mintime) <= nowTime) )
            {
                cr.changeClaimStatus(i);
            }
            else if( (stat==0 || (stat>=2 && stat<=6)) && (SafeMaths.add(date_upd, _mintime) > nowTime))
            {
                timeLeft =uint64( SafeMaths.sub(SafeMaths.add(date_upd , _mintime), nowTime));
                p1.closeClaimsOraclise(i,timeLeft);
            }

            if((stat==0 || (stat>=2 && stat<=6)) && (SafeMaths.add(date_upd, _maxtime) <= nowTime) )
            {
                cr.changeClaimStatus(i);
            }
            else if( (stat==0 || (stat>=2 && stat<=6)) && (SafeMaths.add(date_upd, _maxtime) > nowTime))
            {
                timeLeft =uint64( SafeMaths.sub(SafeMaths.add(date_upd, _maxtime), nowTime));
                p1.closeClaimsOraclise(i,timeLeft);
            }

            if(stat==16 &&  (SafeMaths.add(date_upd , payouttime) <= nowTime))
            {
                cr.changeClaimStatus(i);
            }
            else if(stat==16 &&  (SafeMaths.add(date_upd , payouttime) > nowTime))
            {
                timeLeft = uint64(SafeMaths.sub(SafeMaths.add(date_upd, payouttime), nowTime));
                p1.closeClaimsOraclise(i,timeLeft);
            }
        }       
    }
    /// @dev Adds currency master 
    function addMCRCurr() onlyOwner
    {
        // m1=MCR(MCRAddress);
        m1.addCurrency("ETH");
        m1.addCurrency("DAI");
        // m1.addCurrency("USD");
        // m1.addCurrency("EUR");
        // m1.addCurrency("GBP");
    }
    /// @dev Add quotation and cover status.
    function addCoverStatus() onlyOwner
    {
        // qd=quotationData(quotationDataAddress);
        qd.pushCoverStatus("Active");
        qd.pushCoverStatus("Claim Accepted");
        qd.pushCoverStatus("Claim Denied");
        qd.pushCoverStatus("Cover Expired");
        qd.pushCoverStatus("Claim Submitted");
        qd.pushCoverStatus("Requested");
    }
    /// @dev Add currency asset data to pool. 
    function addCurrencyAssetsVarBase() internal
    {
        // pd = poolData1(poolDataAddress);
        pd.pushCurrencyAssetsVarBase("ETH",6); //original 64 baseMin
        pd.pushCurrencyAssetsVarBase("DAI",7);
        // pd.pushCurrencyAssetsDetails("USD",100);  // original 25000
        // pd.pushCurrencyAssetsDetails("EUR",16272);
        // pd.pushCurrencyAssetsDetails("GBP",19231);
    }
    /// @dev Add investment asset details to pool.
    function addInvestmentAssetsDetails() internal
    {
        // pd = poolData1(poolDataAddress);
        // uint8 decimals;
        //DGD
        // tok=SupplyToken(0xeee3870657e4716670f185df08652dd848fe8f7e);
        // decimals=tok.decimals();
        pd.pushInvestmentAssetsDetails("DGD",0xeee3870657e4716670f185df08652dd848fe8f7e,1,500,4000,18);
        //ICN
        // tok=SupplyToken(0x21e6b27b23241a35d216f8641c72cfed33085fe9);
        // decimals=tok.decimals();
        pd.pushInvestmentAssetsDetails("ICN",0x21e6b27b23241a35d216f8641c72cfed33085fe9,1,1000,3000,18);
        //ZRX
        // tok=SupplyToken(0x6ff6c0ff1d68b964901f986d4c9fa3ac68346570);
        // decimals=tok.decimals();
        pd.pushInvestmentAssetsDetails("ZRX",0x6ff6c0ff1d68b964901f986d4c9fa3ac68346570,1,500,2500,18);
        //MKR
        // tok=SupplyToken(0x1dad4783cf3fe3085c1426157ab175a6119a04ba);
        // decimals=tok.decimals();
        pd.pushInvestmentAssetsDetails("MKR",0x1dad4783cf3fe3085c1426157ab175a6119a04ba,1,500,2000,18); 
        //GNT
        // tok=SupplyToken(0xef7fff64389b814a946f3e92105513705ca6b990);
        // decimals=tok.decimals();
        pd.pushInvestmentAssetsDetails("GNT",0xef7fff64389b814a946f3e92105513705ca6b990,1,500,2000,18); 
        //MLN
        // tok=SupplyToken(0x323b5d4c32345ced77393b3530b1eed0f346429d);
        // decimals=tok.decimals();
        pd.pushInvestmentAssetsDetails("MLN",0x323b5d4c32345ced77393b3530b1eed0f346429d,1,500,2000,18); 
    }
    /// @dev Add investment assets names to pool.
    function addInvestmentCurrencies() internal
    {
        // pd = poolData1(poolDataAddress);
        pd.addInvestmentCurrency("DGD");
        pd.addInvestmentCurrency("ICN");
        pd.addInvestmentCurrency("ZRX");
        pd.addInvestmentCurrency("MKR");
        pd.addInvestmentCurrency("GNT");
        pd.addInvestmentCurrency("MLN");
    }

    /// @dev Initialize asset data required by pool.
    function callPoolDataMethods() onlyOwner
    {
        addCurrencyAssetsVarBase();
        // addCurrencyAssetsDetails();
        addInvestmentAssetsDetails();
        addInvestmentCurrencies();

        addAllCurrencies();
    }

    /// @dev Add investment asset details to pool.
    function addCurrencyAssetsDetails() internal
    {
        // pd = poolData1(poolDataAddress);
        // uint8 decimals;
        // DGD
        // tok=SupplyToken(0xeee3870657e4716670f185df08652dd848fe8f7e);
        // decimals=tok.decimals();
        pd.pushCurrencyAssetsDetails("ETH",0x00,1,50,400,18);
        // ICN
        // tok=SupplyToken(0x21e6b27b23241a35d216f8641c72cfed33085fe9);
        // decimals=tok.decimals();
        pd.pushCurrencyAssetsDetails("DAI",0xf7c3e9e4a7bb8ca2c1c640f03d76d1ac12887bce,1,50,300,18);
        
    }
    /// @dev Add investment assets names to pool.
    function addAllCurrencies() internal
    {
        pd.addAllCurrencies("ETH");
        pd.addAllCurrencies("DAI");
    }
}
