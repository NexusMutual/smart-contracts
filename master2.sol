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
import "./claims_Reward.sol";
import "./claimsData.sol";
import "./MCR.sol";
import "./quotationData.sol";
import "./poolData1.sol";
import "./USD.sol";
import "./SafeMaths.sol";
contract masters2 {
    using SafeMaths for uint;
    
    //  struct insurance{

    //     string name;
    //     uint id;
    // }

    address  claimsAddress;
    address  governanceAddress;
    address claims_RewardAddress;
    // uint public product_length;
    address poolAddress;
    address quotationDataAddress;
    address poolDataAddress;
    governance g1;
    claims c1;
    master ms1;
    pool p1;
    claimsData cd1;
    claims_Reward cr1;
    quotationData qd1;
    poolData1 pd1;
    address masterAddress;
    address claimsDataAddress;
    address MCRAddress;
    MCR m1;
    SupplyToken tok;
    // insurance[]  public productType;

    // function masters2()
    // {
    //     productType.push(insurance("Earthquake Cover",0));
    //     productType.push(insurance("Smart Contract Cover",1));
        
    //     product_length=2;
    // }
    ///@dev Add insurance product.
    // function addProduct(string _name , uint _id) onlyOwner
    // {
    //     productType.push(insurance(_name,_id));
    //     product_length=SafeMaths.add(product_length,1);
    // }
    function changeMasterAddress(address _add)
    {
        if(masterAddress == 0x000)
            masterAddress = _add;
        else
        {
            ms1=master(masterAddress);
            if(ms1.isInternal(msg.sender) == 1)
                masterAddress = _add;
            else
                throw;
        }
    }
    modifier onlyInternal {
        ms1=master(masterAddress);
        require(ms1.isInternal(msg.sender) == 1);
        _; 
    }
     modifier onlyOwner{
        ms1=master(masterAddress);
        require(ms1.isOwner(msg.sender) == 1);
        _; 
    }
    function changeClaimDataAddress(address _add) onlyInternal
    {
        claimsDataAddress = _add;
    }

    function changePoolAddress(address _to) onlyInternal
    {
        poolAddress = _to;
    }
     function changeClaimsAddress(address _to) onlyInternal
    {
        claimsAddress = _to;
    }
    function changeMCRAddress(address _to) onlyInternal
    {
        MCRAddress = _to;
    }
    function changeGovernanceAddress(address _to) onlyInternal
    {
        governanceAddress = _to;
    }

    function changeClaimRewardAddress(address _to) onlyInternal
    {
        claims_RewardAddress = _to;
    }
    function changeQuotationDataAddress(address _to) onlyInternal
    {
        quotationDataAddress=_to;
    }
    function changePoolDataAddress(address _add) onlyInternal
    {
        poolDataAddress = _add;
    }
    /// @dev Adds Status master for a claim.
    function addStatusInClaims()  onlyOwner
    {
        c1=claims(claimsAddress);
        
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
        g1=governance(governanceAddress);

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
        p1=pool(poolAddress);
        cr1=claims_Reward(claims_RewardAddress);
        c1=claims(claimsAddress);
        c1.setTimes(_mintime,_maxtime,escaltime,payouttime);
        cd1=claimsData(claimsDataAddress);
        for(uint i=cd1.pendingClaim_start();i<cd1.actualClaimLength();i++)
        {
            uint stat=cd1.getClaimStatus(i);
            uint date_upd=cd1.getClaimUpdate(i);
            if(stat==1 && (SafeMaths.add(date_upd , escaltime) <= uint64(now)))
            {
                cr1.changeClaimStatus(i);
            }
            else if(stat==1 && (SafeMaths.add(date_upd , escaltime) >uint64(now)))
            {
                timeLeft = uint64(SafeMaths.sub(SafeMaths.add(date_upd , escaltime) , now));
                p1.closeClaimsOraclise(i,timeLeft);
            }

            if((stat==0 || (stat>=2 && stat<=6)) && (SafeMaths.add(date_upd , _mintime) <=uint64( now)) )
            {
                cr1.changeClaimStatus(i);
            }
            else if( (stat==0 || (stat>=2 && stat<=6)) && (SafeMaths.add(date_upd , _mintime) > now))
            {
                timeLeft =uint64( SafeMaths.sub(SafeMaths.add(date_upd , _mintime) , now));
                p1.closeClaimsOraclise(i,timeLeft);
            }

            if((stat==0 || (stat>=2 && stat<=6)) && (SafeMaths.add(date_upd , _maxtime) <=uint64( now)) )
            {
                cr1.changeClaimStatus(i);
            }
            else if( (stat==0 || (stat>=2 && stat<=6)) && (SafeMaths.add(date_upd , _maxtime) >uint64( now)))
            {
                timeLeft =uint64( SafeMaths.sub(SafeMaths.add(date_upd , _maxtime) , now));
                p1.closeClaimsOraclise(i,timeLeft);
            }

            if(stat==16 &&  (SafeMaths.add(date_upd , payouttime) <=uint64( now)))
            {
                    cr1.changeClaimStatus(i);
            }
            else if(stat==16 &&  (SafeMaths.add(date_upd , payouttime) >uint64( now)))
            {
                timeLeft = uint64(SafeMaths.sub(SafeMaths.add(date_upd , payouttime) ,now));
                p1.closeClaimsOraclise(i,timeLeft);
            }
        }       
    }
    /// @dev Adds currency master 
    function addMCRCurr() onlyOwner
    {
        
        m1=MCR(MCRAddress);
        m1.addCurrency("ETH");
        m1.addCurrency("USD");
        m1.addCurrency("EUR");
        m1.addCurrency("GBP");        
    }
    ///@dev Add quotation and cover status.
    function addCoverStatus() onlyOwner
    {
        // qd1=quotationData(quotationDataAddress);
        // qd1.pushQuoteStatus("NEW");
        // qd1.pushQuoteStatus("partiallyFunded");
        // qd1.pushQuoteStatus("coverGenerated");
        // qd1.pushQuoteStatus("Expired");
        
        qd1.pushCoverStatus("active");
        qd1.pushCoverStatus("Claim Accepted");
        qd1.pushCoverStatus("Claim Denied");
        qd1.pushCoverStatus("Cover Expired");
        qd1.pushCoverStatus("Claim Submitted");
        qd1.pushCoverStatus("Requested");
    }
    ///@dev Add currency asset data to pool. 
    function addCurrencyAssetsDetails() internal
    {
        pd1 = poolData1(poolDataAddress);
        pd1.pushCurrencyAssetsDetails("ETH",6); //original 64 baseMin
        pd1.pushCurrencyAssetsDetails("USD",100);  // original 25000
        pd1.pushCurrencyAssetsDetails("EUR",16272);
        pd1.pushCurrencyAssetsDetails("GBP",19231);
    }
    ///@dev Add investment asset details to pool.
    function addInvestmentAssetsDetails() internal
    {
        pd1 = poolData1(poolDataAddress);
        uint8 decimals;
        //DGD
        tok=SupplyToken(0xeee3870657e4716670f185df08652dd848fe8f7e);
        decimals=tok.decimals();
        pd1.pushInvestmentAssetsDetails("DGD",0xeee3870657e4716670f185df08652dd848fe8f7e,1,500,4000,decimals);
        //ICN
        tok=SupplyToken(0x21e6b27b23241a35d216f8641c72cfed33085fe9);
         decimals=tok.decimals();
        pd1.pushInvestmentAssetsDetails("ICN",0x21e6b27b23241a35d216f8641c72cfed33085fe9,1,1000,3000,decimals);
        //ZRX
        tok=SupplyToken(0x6ff6c0ff1d68b964901f986d4c9fa3ac68346570);
         decimals=tok.decimals();
        pd1.pushInvestmentAssetsDetails("ZRX",0x6ff6c0ff1d68b964901f986d4c9fa3ac68346570,1,500,2500,decimals);
        //MKR
        tok=SupplyToken(0x1dad4783cf3fe3085c1426157ab175a6119a04ba);
         decimals=tok.decimals();
        pd1.pushInvestmentAssetsDetails("MKR",0x1dad4783cf3fe3085c1426157ab175a6119a04ba,1,500,2000,decimals); 
        //GNT
        tok=SupplyToken(0xef7fff64389b814a946f3e92105513705ca6b990);
         decimals=tok.decimals();
        pd1.pushInvestmentAssetsDetails("GNT",0xef7fff64389b814a946f3e92105513705ca6b990,1,500,2000,decimals); 
        //MLN
        tok=SupplyToken(0x323b5d4c32345ced77393b3530b1eed0f346429d);
         decimals=tok.decimals();
        pd1.pushInvestmentAssetsDetails("MLN",0x323b5d4c32345ced77393b3530b1eed0f346429d,1,500,2000,decimals); 
    }
    ///@dev Add investment assets names to pool.
    function addInvestmentCurrencies() internal
    {
        pd1 = poolData1(poolDataAddress);
        pd1.addInvestmentCurrency("DGD");
        pd1.addInvestmentCurrency("ICN");
        pd1.addInvestmentCurrency("ZRX");
        pd1.addInvestmentCurrency("MKR");
        pd1.addInvestmentCurrency("GNT");
        pd1.addInvestmentCurrency("MLN");
    }
    ///@dev Initialize asset data required by pool.
    function callPoolDataMethods() onlyOwner
    {
        addCurrencyAssetsDetails();
        addInvestmentAssetsDetails();
        addInvestmentCurrencies();
    }   
}