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
    

pragma solidity ^0.4.8;

import "./claims.sol";
import "./governance.sol";
import "./master.sol";
import "./pool.sol";
import "./claims_Reward.sol";
import "./claimsData.sol";
import "./MCR.sol";
contract masters2 {
    
     struct insurance{

        string name;
        uint id;
    }


    address  claimsAddress;
    address  governanceAddress;
    address claims_RewardAddress;
    uint public product_length;
    address poolAddress;
    governance g1;
    claims c1;
    master ms1;
    pool p1;
    claimsData cd1;
    claims_Reward cr1;
    address masterAddress;
    address claimsDataAddress;
    address MCRAddress;
    MCR m1;
    insurance[]  public productType;

    function masters2()
    {
        productType.push(insurance("Earthquake Cover",0));
        
        product_length=1;
    }
    function addProduct(string _name , uint _id) onlyOwner
    {
        productType.push(insurance(_name,_id));
        product_length++;
    }
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
    /// @dev Adds statuses and categories master for a proposal.
    function changeStatusAndCAtegory() onlyOwner
    {
        g1=governance(governanceAddress);

            g1.addCategory("Uncategorised",0,0);
            g1.addCategory("Implement run-off and close new business",1,80);
            g1.addCategory("Burn fraudulent claim assessor tokens",0,80);
            g1.addCategory("Pause Claim Assessors ability to assess claims for 3 days.Can only be done once a month",0,60);
            g1.addCategory("Changes to Capital Model",1,60);
            g1.addCategory("Changes to Pricing",1,60);
            g1.addCategory("Engage in external services up to the greater of $50,000USD or 2% of MCR",0,80);
            g1.addCategory("Engage in external services over the greater of $50,000USD or 2% of MCR",1,60);
            g1.addCategory("Changes to remuneration and/or membership of Advisory Board",1,60);
            g1.addCategory("Filter member proposals as necessary(which are put to a member vote)",0,60);
            g1.addCategory("Release new smart contract code as necessary to fix bugs/weaknesses or deliver enhancements/new products",1,60);
            g1.addCategory("Any change to authorities",1,80);
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
     
    /// @dev Changes the minimum, maximum claims assessment voting, escalation, payout retry times 
    /// @param _mintime Minimum time (in seconds) for which claim assessment voting is open
    /// @param _maxtime Maximum time (in seconds) for which claim assessment voting is open
    /// @param escaltime Time (in seconds) in which, after a denial by claims assessor, a person can escalate claim for member voting
    /// @param payouttime Time (in seconds) after which a payout is retried(in case a claim is accepted and payout fails)
    function changeTimes(uint _mintime,uint _maxtime,uint escaltime,uint payouttime) onlyOwner
    {
        uint timeLeft;
        p1=pool(poolAddress);
        cr1=claims_Reward(claims_RewardAddress);
        c1=claims(claimsAddress);
        c1.setTimes(_mintime,_maxtime,escaltime,payouttime);
        cd1=claimsData(claimsDataAddress);
        for(uint i=cd1.pendingClaim_start();i<cd1.actualClaimLength();i++)
        {
            uint stat=cd1.getClaimStatus(i);
            uint date_upd=c1.getClaimUpdate(i);
            if(stat==1 && (date_upd + escaltime <= now))
            {
                cr1.changeClaimStatus(i);
            }
            else if(stat==1 && (date_upd + escaltime > now))
            {
                timeLeft = date_upd + escaltime - now;
                p1.closeClaimsOraclise(i,timeLeft);
            }

            if((stat==0 || (stat>=2 && stat<=6)) && (date_upd + _mintime <= now) )
            {
                cr1.changeClaimStatus(i);
            }
            else if( (stat==0 || (stat>=2 && stat<=6)) && (date_upd + _mintime > now))
            {
                timeLeft = date_upd + _mintime - now;
                p1.closeClaimsOraclise(i,timeLeft);
            }

            if((stat==0 || (stat>=2 && stat<=6)) && (date_upd + _maxtime <= now) )
            {
                cr1.changeClaimStatus(i);
            }
            else if( (stat==0 || (stat>=2 && stat<=6)) && (date_upd + _maxtime > now))
            {
                timeLeft = date_upd + _maxtime - now;
                p1.closeClaimsOraclise(i,timeLeft);
            }

            if(stat==16 &&  (date_upd + payouttime <= now))
            {
                    cr1.changeClaimStatus(i);
            }
            else if(stat==16 &&  (date_upd + payouttime > now))
            {
                timeLeft = date_upd + payouttime -now;
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
    
  

    
}