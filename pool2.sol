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
import "./quotation.sol";
import "./NXMToken.sol";
import "./governance.sol";
import "./claims_Reward.sol";
import "./poolData1.sol";
import "./quotation2.sol";
import "./master.sol";
import "./pool.sol";
import "./claims.sol";
import "./fiatFaucet.sol";


contract pool2 {

    master ms1;
    address masterAddress;
    NXMToken t1;
    address tokenAddress;
    address quoteAddress;
    pool p1;
    claims c1;
    fiatFaucet f1;
    address claimAddress;
    address fiatFaucetAddress;
    address poolAddress;
    address governanceAddress;
    address claimRewardAddress;
    address poolDataAddress;
    address quotation2Address;
    address MCRAddress;
    quotation q1;
    quotation2 q2;
    MCR m1;
    claims_Reward cr1;
    
    governance g1;
    poolData1 pd1;
    function changeClaimAddress(address _add)
    {
        claimAddress = _add;
    }
    function changeFiatFaucetAddress(address _add)
    {
        fiatFaucetAddress = _add;
    }
    function changePoolAddress(address _add)
    {
        poolAddress = _add;
    }
    function changeTokenAddress(address _add)
    {
        tokenAddress  = _add;
    }
    function changeMCRAddress(address _add)
    {
        MCRAddress = _add;   
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
    function changeClaimRewardAddress(address _to) onlyInternal
    {
        claimRewardAddress=_to;
    }
    
    function changeGovernanceAddress(address _to) onlyInternal
    {
        governanceAddress = _to;
    }
    function changePoolDataAddress(address _add) onlyInternal
    {
        poolDataAddress = _add;
        pd1 = poolData1(poolDataAddress);
    }

    
   function changeQuotation2Address(address _add) onlyInternal
    {
        quotation2Address = _add;
    }
    function changeQuoteAddress(address _to) onlyInternal
    {
        quoteAddress = _to;
    }

    /// @dev Handles the Callback of the Oraclize Query. Callback could be of type "quote", "quotation", "cover", "claim" etc.
    /// @param myid Oraclize Query ID identifying the query for which the result is being received
    /// @param res Result fetched by the external oracle.
    function delegateCallBack(bytes32 myid, string res)
    {
         pd1 = poolData1(poolDataAddress);
       
       // If callback is of type "quote", then result contains the risk factor based on which premimum of quotation is calculated.
         if(pd1.getApiIdTypeOf(myid) =="quote")
        {
            q1=quotation(quoteAddress);
            uint id = pd1.getIdOfApiId(myid);  // Quotation id.
            q1.changePremium(id , res);  
            
        }  
        // If callback is of type "quotation", then Quotation id associated with the myid is checked for expiry.
        else if(pd1.getApiIdTypeOf(myid) =="quotation")
        {
            q1=quotation(quoteAddress);
            q1.expireQuotation(pd1.getIdOfApiId(myid)); 

        }
        // If callback is of type "cover", then cover id associated with the myid is checked for expiry.
        else if(pd1.getApiIdTypeOf(myid) =="cover")
        {
            q2=quotation2(quotation2Address);
            q2.expireCover(pd1.getIdOfApiId(myid));
        }
         // If callback is of type "claim", then claim id associated with the myid is checked for vote closure.
        else if(pd1.getApiIdTypeOf(myid) =="claim")
        {
            cr1=claims_Reward(claimRewardAddress);
            cr1.changeClaimStatus(pd1.getIdOfApiId(myid));

        }
        // If callback is of type "proposal", then proposal id associated with the myid is checked for vote closure.
        else if(pd1.getApiIdTypeOf(myid) =="proposal")
        {
            g1=governance(governanceAddress);
            g1.closeProposalVote(pd1.getIdOfApiId(myid));
        }
        else if(pd1.getApiIdTypeOf(myid) =="MCR")
        {
            
        }
        else if(pd1.getApiIdTypeOf(myid) =="MCRFailed")
        {
            m1=MCR(MCRAddress);
            m1.addLastMCRData(pd1.getIdOfApiId(myid));
        }
    }
    /// @dev Transfers back the given amount to the owner.
    function transferBackEther(uint256 amount) onlyOwner  
    {
        amount = amount * 10000000000;  
        address own=msg.sender;
        p1=pool(poolAddress);
        bool succ = p1.transferEther(amount , msg.sender);   
        t1=NXMToken(tokenAddress);
        /// Subtracts the transferred amount from the Pool Fund.
        t1.removeFromPoolFund("ETH",amount);
       
    }
    /// @dev Allocates the Equivalent Currency Tokens for a given amount of Ethers.
    /// @param valueETH Tokens Purchasing Amount in ETH. 
    /// @param curr Currency Name.
    function getCurrTokensFromFaucet(uint valueETH , bytes16 curr) 
    {
        g1 = governance(governanceAddress);
        uint valueWEI = valueETH*1000000000000000000;
        if(g1.isAB(msg.sender) != 1 || (valueWEI > this.balance)) throw;
        t1.removeFromPoolFund("ETH",valueWEI);
        p1=pool(poolAddress);
        p1.getCurrencyTokensFromFaucet(valueWEI,curr);
    }

    ///  @dev Pays out the sum assured in case a claim is accepted
    /// @param coverid Cover Id.
    /// @param claimid Claim Id.
    /// @return succ true if payout is successful, false otherwise.
    function sendClaimPayout(uint coverid , uint claimid) onlyInternal  returns(bool succ)
    {
        q1=quotation(quoteAddress);
        q2=quotation2(quotation2Address);
        t1=NXMToken(tokenAddress);
        c1=claims(claimAddress);
        p1=pool(poolAddress);
        address _to=q1.getMemberAddress(coverid);
        uint sumAssured = q1.getSumAssured(coverid);
        bytes16 curr = q1.getCurrencyOfCover(coverid);
        uint balance;
        uint quoteid;
        //Payout in Ethers in case currency of quotation is ETH
        if(curr=="ETH")
        {
            sumAssured = sumAssured*1000000000000000000; 
            balance = p1.getEtherPoolBalance();
            //Check if pool has enough ETH balance
            if(balance >= sumAssured)
            {
                succ = p1.transferEther(sumAssured ,_to);   
                t1.removeFromPoolFund(curr,sumAssured);
                quoteid = q1.getQuoteId(coverid);
                q2.changeCSAAfterPayoutOrExpire(quoteid);
                p1.callPayoutEvent(_to,"Payout",coverid,sumAssured);
            }
            else
            {
                c1.setClaimStatus(claimid , 16);
                succ=false;
            }
        }
        //Payout from the corresponding fiat faucet, in case currency of quotation is in fiat crypto
        else
        {
            f1=fiatFaucet(fiatFaucetAddress);
            sumAssured = sumAssured * 1000000000000000000;
            balance = f1.getBalance(poolAddress , curr);
            //Check if pool has enough fiat crypto balance
            if(balance >= sumAssured)
            {
                f1.payoutTransferFromPool(_to , curr , sumAssured);
                t1.removeFromPoolFund(curr,sumAssured);
                quoteid = q1.getQuoteId(coverid);
                q2.changeCSAAfterPayoutOrExpire(quoteid);
                p1.callPayoutEvent(_to,"Payout",coverid,sumAssured);
                succ=true;
            }
            else
            {
                c1.setClaimStatus(claimid , 16);
                succ=false;
            }

        }
    }

}