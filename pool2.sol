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
    

pragma solidity 0.4.11;

import "./NXMToken.sol";
import "./governance.sol";
import "./claims_Reward.sol";
import "./poolData1.sol";
import "./quotation2.sol";
import "./master.sol";
import "./pool.sol";
import "./claims.sol";
import "./fiatFaucet.sol";
import "./SafeMaths.sol";
import "./USD.sol";
import "./MCRData.sol";
import "./pool3.sol";
import "github.com/0xProject/contracts/contracts/Exchange.sol";

contract pool2 
{
 using SafeMaths for uint;
    master ms1;
    address masterAddress;
    NXMToken t1;
    address tokenAddress;
    pool p1;
    claims c1;
    fiatFaucet f1;
    Exchange exchange1;
    address claimAddress;
    address fiatFaucetAddress;
    address poolAddress;
    address governanceAddress;
    address claimRewardAddress;
    address poolDataAddress;
    address quotation2Address;
    address MCRAddress;
    address pool3Address;
    quotation2 q2;
    MCR m1;
    MCRData md1;
    claims_Reward cr1;
    address exchangeContractAddress;
    address MCRDataAddress;
    governance g1;
    poolData1 pd1;
    SupplyToken tok;
    pool3 p3;
    event Payout(address indexed to, bytes16 eventName , uint coverId ,uint tokens );
    event Liquidity(bytes16 type_of,bytes16 function_name);
    event ZeroExOrders(bytes16 func,address makerAddr,address takerAddr,uint makerAmt,uint takerAmt,uint expirationTimeInMilliSec,bytes32 orderHash);
    event Rebalancing(bytes16 name,uint16 param);
    function changeClaimAddress(address _add) onlyInternal
    {
        claimAddress = _add;
    }
    function changeFiatFaucetAddress(address _add) onlyInternal
    {
        fiatFaucetAddress = _add;
        p3=pool3(pool3Address);
        p3.changePoolDataAddress(fiatFaucetAddress);
    }
    function changePoolAddress(address _add) onlyInternal
    {
        poolAddress = _add;
        p3=pool3(pool3Address);
        p3.changePoolAddress(poolAddress);
    }
    function changeTokenAddress(address _add) onlyInternal
    {
        tokenAddress  = _add;
    }
    function changeMCRAddress(address _add) onlyInternal
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
    modifier checkPause
    {
        ms1=master(masterAddress);
        require(ms1.isPause()==0);
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
        p3=pool3(pool3Address);
        p3.changePoolDataAddress(poolDataAddress);
    }
   
    function changeQuotation2Address(address _add) onlyInternal
    {
        quotation2Address = _add;
    }
     function changeExchangeContractAddress(address _add) onlyOwner
    {
        exchangeContractAddress=_add; //0x
        p3=pool3(pool3Address);
        p3.changeExchangeContractAddress(exchangeContractAddress);
    }
    function changeMCRDataAddress(address _add) onlyInternal
    {
        MCRDataAddress = _add;
    }
    function changePool3Address(address _add) onlyInternal
    {
        pool3Address=_add;
    }
    /// @dev Handles the Callback of the Oraclize Query. Callback could be of type "quote", "quotation", "cover", "claim" etc.
    /// @param myid Oraclize Query ID identifying the query for which the result is being received
    /// @param res Result fetched by the external oracle.
     function delegateCallBack(bytes32 myid, string res)
    {
         pd1 = poolData1(poolDataAddress);
        ms1=master(masterAddress);
        if (ms1.isPause()==0) // system is not in emergency pause
        {
             // If callback is of type "quote", then result contains the risk factor based on which premimum of quotation is calculated.
             if(pd1.getApiIdTypeOf(myid) =="PRE")
            {
                pd1.updateDateUpdOfAPI(myid);
                q2=quotation2(quotation2Address);
                uint id = pd1.getIdOfApiId(myid);  // Quotation id.
                q2.changePremium(id , res);  
                
            }  
            // If callback is of type "quotation", then Quotation id associated with the myid is checked for expiry.
            else if(pd1.getApiIdTypeOf(myid) =="QUO")
            {
                pd1.updateDateUpdOfAPI(myid);
                q2=quotation2(quotation2Address);
                q2.expireQuotation(pd1.getIdOfApiId(myid)); 

            }
            // If callback is of type "cover", then cover id associated with the myid is checked for expiry.
            else if(pd1.getApiIdTypeOf(myid) =="COV")
            {
                pd1.updateDateUpdOfAPI(myid);
                q2=quotation2(quotation2Address);
                q2.expireCover(pd1.getIdOfApiId(myid));
            }
             // If callback is of type "claim", then claim id associated with the myid is checked for vote closure.
            else if(pd1.getApiIdTypeOf(myid) =="CLA")
            {
                pd1.updateDateUpdOfAPI(myid);
                cr1=claims_Reward(claimRewardAddress);
                cr1.changeClaimStatus(pd1.getIdOfApiId(myid));

            }
              else if(pd1.getApiIdTypeOf(myid) =="MCR")
            {
                pd1.updateDateUpdOfAPI(myid);
            }
            else if(pd1.getApiIdTypeOf(myid) =="MCRF")
            {
                pd1.updateDateUpdOfAPI(myid);
                m1=MCR(MCRAddress);
                m1.addLastMCRData(pd1.getIdOfApiId(myid));
            }
            else if(pd1.getApiIdTypeOf(myid)=="SUB")
            {
                 pd1.updateDateUpdOfAPI(myid);
            }
            else if(pd1.getApiIdTypeOf(myid)=="0X")
            {
                pd1.updateDateUpdOfAPI(myid);
            }
            else if(pd1.getApiIdTypeOf(myid)=="Close0x")
            {
                pd1.updateDateUpdOfAPI(myid);
                p3=pool3(pool3Address);
                p3.check0xOrderStatus(pd1.getCurrOfApiId(myid),pd1.getIdOfApiId(myid));
            }
        }
      
        // even when system is in emergency pause.
        // If callback is of type "proposal", then proposal id associated with the myid is checked for vote closure.
        if(pd1.getApiIdTypeOf(myid) =="PRO")
        {
            pd1.updateDateUpdOfAPI(myid);
            g1=governance(governanceAddress);
            g1.closeProposalVote(pd1.getIdOfApiId(myid));
        }
        if(pd1.getApiIdTypeOf(myid) =="Pause")
        {
            pd1.updateDateUpdOfAPI(myid);
            bytes4 by;
            (,,by) = ms1.getLastEmergencyPause();
            if(by=="AB")
                ms1.addEmergencyPause(false,"AUT"); //set pause to false
        }
    }
    
    function callPayoutEvent(address _add,bytes16 type1,uint id,uint sa)
    {
        Payout(_add,type1,id,sa);
    }
    /// @dev Pays out the sum assured in case a claim is accepted
    /// @param coverid Cover Id.
    /// @param claimid Claim Id.
    /// @return succ true if payout is successful, false otherwise.
    function sendClaimPayout(uint coverid , uint claimid) onlyInternal  returns(bool succ)
    {
        q2=quotation2(quotation2Address);
        t1=NXMToken(tokenAddress);
        c1=claims(claimAddress);
        p1=pool(poolAddress);
        pd1=poolData1(poolDataAddress);
        address _to=q2.getMemberAddress(coverid);
        uint sumAssured1 = q2.getSumAssured(coverid);
        bytes4 curr = q2.getCurrencyOfCover(coverid);
        uint balance;
        uint quoteid;
        //Payout in Ethers in case currency of quotation is ETH
        if(curr=="ETH")
        {
            //sumAssured = sumAssured*1000000000000000000; 
           uint sumAssured=SafeMaths.mul(sumAssured1,1000000000000000000);
            balance = p1.getEtherPoolBalance();
            //Check if pool has enough ETH balance
            if(balance >= sumAssured)
            {
                succ = p1.transferEther(sumAssured ,_to);   
                if(succ==true)
                {
                    t1.removeFromPoolFund(curr,sumAssured);
                    quoteid = q2.getQuoteId(coverid);
                    q2.removeSAFromAreaCSA(quoteid,sumAssured);
                    p1.subtractQuotationOracalise(quoteid);
                    // date:10/11/2017/
                    pd1.changeCurrencyAssetVarMin(curr,uint64(SafeMaths.sub(pd1.getCurrencyAssetVarMin(curr),sumAssured1)));
                     c1.checkLiquidity(curr);
                    callPayoutEvent(_to,"Payout",coverid,sumAssured);
                }
                else
                {
                    c1.setClaimStatus(claimid , 16);
                    //succ=false;
                }
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
            //sumAssured = sumAssured * 1000000000000000000;
            sumAssured=SafeMaths.mul(sumAssured1,1000000000000000000);
            balance = f1.getBalance(poolAddress , curr);
            //Check if pool has enough fiat crypto balance
            if(balance >= sumAssured)
            {
                f1.payoutTransferFromPool(_to , curr , sumAssured);
                t1.removeFromPoolFund(curr,sumAssured);
                quoteid = q2.getQuoteId(coverid);
                p1.subtractQuotationOracalise(quoteid);
                q2.removeSAFromAreaCSA(quoteid,sumAssured);
                // date:10/11/2017/
                pd1.changeCurrencyAssetVarMin(curr,uint64(SafeMaths.sub(pd1.getCurrencyAssetVarMin(curr),sumAssured1)));
                 c1.checkLiquidity(curr);
                callPayoutEvent(_to,"Payout",coverid,sumAssured);
                succ=true;
            }
            else
            {
                c1.setClaimStatus(claimid , 16);
                succ=false;
            }

        }
    }
    
   function getIARank(bytes16 curr,uint64 rateX100)  constant returns(int RHS) //internal function
    {
        pd1 = poolData1(poolDataAddress);
       p1=pool(poolAddress);
        uint currentIAmaxHolding;
        uint currentIAminHolding;

        uint IABalance=getBalanceofInvestmentAsset(curr)/(10**18);
        (currentIAminHolding,currentIAmaxHolding)=pd1.getInvestmentAssetHoldingPerc(curr);
        uint holdingPercDiff=(currentIAmaxHolding/100 - currentIAminHolding/100);
        RHS=int(IABalance*100/(holdingPercDiff*rateX100));
        
    }
    function totalRiskPoolBalance(bytes16[] IACurr,uint64[] IARate)  constant returns (uint balance,uint IABalance)
    {
        m1=MCR(MCRAddress);
        p1=pool(poolAddress);
        uint currBalance;
        (currBalance,)=m1.calVtpAndMCRtp();
      
        for(uint i=0;i<IACurr.length;i++)
        {
            if(IARate[i]>0)
                IABalance+=(getBalanceofInvestmentAsset(IACurr[i])*100)/IARate[i];
        }

        balance=currBalance+IABalance;
        
    }
        //Triggerred on daily basis
     function rebalancingTrading0xOrders(bytes16[] IACurr,uint64[] IARate,uint64 date)checkPause returns(uint16 result)
    {  
        pd1 = poolData1(poolDataAddress);
        p1=pool(poolAddress);
        m1=MCR(MCRAddress);
        p3=pool3(pool3Address);
        bytes16 MAXIACurr;uint64 MAXRate;
        ( MAXIACurr,MAXRate,,)= pd1.getIARankDetailsByDate(date);
        require(pd1.getLiquidityOrderStatus(bytes4(MAXIACurr),"RBT")==0);
        uint len=IARate.length;
        uint totalRiskBal=( pd1.getTotalRiskPoolBalance()*100000 )/(10**18);
        if(totalRiskBal>0 && len>0)  //if v=0 OR there is no IA, don't trade
        {
            for(uint i=0;i<len;i++)
            {
                 
                 if(pd1.getInvestmentAssetStatus(IACurr[i])==1) // if IA is active 
                 {
                    int check=checkTradeConditions(IACurr[i],IARate[i]);
                    if(check==1)
                    {
                        // ORDER 1 (max RHS IA to ETH)
                   
                        // amount of asset to sell
                        uint makerAmt=((2*pd1.getVariationPercX100()*totalRiskBal*MAXRate)/(100*100 *100000) ); //*100);// ( 10**pd1.getInvestmentAssetDecimals(MAXIACurr)); //MULTIPLY WITH DECIMALS 
                        // amount of ETH to buy
                        uint takerAmt=((m1.getCurrency3DaysAvg("ETH")*makerAmt)/MAXRate); //*10**18);    //  ( 10**pd1.getInvestmentAssetDecimals(MAXIACurr)); 
                        uint expirationTimeInMilliSec=now+pd1.getOrderExpirationTime("RBT");
                        makerAmt=(makerAmt*10**pd1.getInvestmentAssetDecimals(MAXIACurr) )/100;
                        takerAmt=takerAmt*10**18/(100);
                        if(makerAmt<=getBalanceofInvestmentAsset(MAXIACurr))
                        {
                           
                            exchange1=Exchange(exchangeContractAddress);
                            bytes32 orderHash=exchange1.getOrderHash([pd1.get0xMakerAddress(),pd1.get0xTakerAddress(),pd1.getInvestmentAssetAddress(MAXIACurr),p3.getWETHAddress(),pd1.get0xFeeRecipient()],[makerAmt,takerAmt,pd1.get0xMakerFee(),pd1.get0xTakerFee(),expirationTimeInMilliSec,pd1.getOrderSalt()]);
                            pd1.saveRebalancingOrderHash(orderHash);
                            pd1.pushOrderDetails(orderHash,bytes4(MAXIACurr),makerAmt,"ETH",takerAmt,"RBT",expirationTimeInMilliSec);
                            
                            pd1.updateLiquidityOrderStatus(bytes4(MAXIACurr),"RBT",1);
                           
                            pd1.setCurrOrderHash(bytes4(MAXIACurr),orderHash);  
                            //events
                            ZeroExOrders("RBT",pd1.getInvestmentAssetAddress(MAXIACurr),p3.getWETHAddress(),makerAmt,takerAmt,expirationTimeInMilliSec,orderHash);
                            Rebalancing("OrderGen",1);
                            return 1; // rebalancing order generated
                        }      
                        else
                        {   //events
                            ZeroExOrders("RBT",pd1.getInvestmentAssetAddress(MAXIACurr),p3.getWETHAddress(),makerAmt,takerAmt,expirationTimeInMilliSec,"insufficient");
                            Rebalancing("OrderGen",2);
                            return 2; // not enough makerAmt;
                            
                        }                      
                    }
                 }
            }
            
             Rebalancing("OrderGen",0);
             return 0; // when V!=0 but rebalancing is not required
        }  
         Rebalancing("OrderGen",3);
         return 4; // when V=0 or no IA is present      
    }
     function checkTradeConditions(bytes16 curr,uint64 IARate) internal returns(int check)
    {
        pd1 = poolData1(poolDataAddress);
        //p2=pool2(pool2Address);

        uint IABalance=getBalanceofInvestmentAsset(curr)/(10**pd1.getInvestmentAssetDecimals(curr));
     
        uint totalRiskBal=pd1.getTotalRiskPoolBalance()*100000/(10**18);
        if(IABalance>0 && totalRiskBal>0)
        {
            uint IAMax;uint IAMin;uint checkNumber;uint z;
            (IAMin,IAMax)=pd1.getInvestmentAssetHoldingPerc(curr);
            z=pd1.getVariationPercX100();
            checkNumber=(IABalance*100 *100000)/(IARate*totalRiskBal);
            if( (checkNumber> ((IAMax+z)*totalRiskBal)/100*100000 )|| (checkNumber < ( (IAMin-z)*totalRiskBal)/100*100000 ) )     //a) # of IAx x fx(IAx) / V > MaxIA%x + z% ;  or b) # of IAx x fx(IAx) / V < MinIA%x - z%
            {
                return 1;    //eligibleIA
            }
            else
            {
                return -1; //not eligibleIA
            }
        }
        return 0; // balance of IA is 0
    }
    // 28/11/2017
      function getBalanceofInvestmentAsset(bytes16 _curr) constant returns(uint balance)
    {
         pd1 = poolData1(poolDataAddress);
         address currAddress=pd1.getInvestmentAssetAddress(_curr);
         tok=SupplyToken(currAddress);
         return tok.balanceOf(poolAddress);
    }
  
    // called by the API
    function saveIADetails(bytes16[] curr,uint64[] rate,uint64 date) checkPause
    {
        pd1 = poolData1(poolDataAddress);
        p1=pool(poolAddress);
        md1=MCRData(MCRDataAddress);
        p3=pool3(pool3Address);
        bytes16 MAXCurr;
        bytes16 MINCurr;
        uint64 MAXRate;
        uint64 MINRate;
        uint totalRiskPoolBal;uint IABalance;
        //ONLY NOTARZIE ADDRESS CAN POST
        if(md1.isnotarise(msg.sender)==0) throw;

        (totalRiskPoolBal,IABalance)=totalRiskPoolBalance(curr,rate);
        pd1.setTotalBalance(totalRiskPoolBal,IABalance);
        (MAXCurr,MAXRate,MINCurr,MINRate)=calculateIARank(curr,rate);
        pd1.saveIARankDetails(MAXCurr,MAXRate,MINCurr,MINRate,date);
        pd1.updatelastDate(date);
        // Rebalancing Trade : only once per day
        rebalancingTrading0xOrders(curr,rate,date);
        p1.saveIADetailsOracalise(pd1.getIARatesTime());
        uint8 check;
        uint CABalance;

        //Excess Liquidity Trade : atleast once per day
        for(uint16 i=0;i<md1.getCurrLength();i++)
        {
            (check,CABalance)=p3.checkLiquidity(md1.getCurrency_Index(i));
            if(check==1)
            {
               if(CABalance>0)
                 p3.ExcessLiquidityTrading(md1.getCurrency_Index(i),CABalance);
            }
        }
        
    }
   function calculateIARank(bytes16[] curr,uint64[] rate)  constant returns(bytes16 MAXCurr,uint64 MAXRate,bytes16 MINCurr,uint64 MINRate)
    {
        pd1 = poolData1(poolDataAddress);
        //p2=pool2(pool2Address);
        uint currentIAmaxHolding;
        uint currentIAminHolding;
        int MAX=0;int MIN=-1;
        int RHS;
        for(uint i=0;i<curr.length;i++)
        {
            RHS=0;
            if(pd1.getInvestmentAssetStatus(curr[i])==1) 
            {
               (currentIAminHolding,currentIAmaxHolding)=pd1.getInvestmentAssetHoldingPerc(curr[i]);
                RHS=getIARank(curr[i],rate[i]);
                if(RHS>MAX)
                {
                    MAX=RHS;
                    MAXCurr =curr[i] ;  
                    MAXRate=rate[i];

                }

                else if(RHS==MAX) //tie for the highest RHSx  
                {
                    if(currentIAmaxHolding>pd1.getInvestmentAssetMaxHoldingPerc(MAXCurr))  //Highest MaxIA%
                    {
                        MAX=RHS;
                        MAXCurr =curr[i];
                        MAXRate=rate[i];  

                    }
                    else if(currentIAmaxHolding==pd1.getInvestmentAssetMaxHoldingPerc(MAXCurr)) //tie in MaxIA%
                    {
                         if(currentIAminHolding>pd1.getInvestmentAssetMinHoldingPerc(MAXCurr)) //   Highest MinIA%
                        {
                            MAX=RHS;
                            MAXCurr =curr[i];  
                            MAXRate=rate[i];

                        }
                        else if(currentIAminHolding==pd1.getInvestmentAssetMinHoldingPerc(MAXCurr)) //tie in MinIA%
                        {
                            if(strCompare(bytes16ToString(curr[i]),bytes16ToString(MAXCurr))==1) //Alphabetical order of ERC20 name.
                            {
                                MAX=RHS;
                                MAXCurr =curr[i];
                                MAXRate=rate[i];  
   
                            }   
                        }
                    }
                }

                else if(RHS==MIN) //a tie for the lowest RHSx 
                {
                    if(currentIAmaxHolding>pd1.getInvestmentAssetMaxHoldingPerc(MINCurr))  //Highest MaxIA%
                    {
                        MIN=RHS;
                        MINCurr =curr[i];
                        MINRate=rate[i];  

                    }
                    else if(currentIAmaxHolding==pd1.getInvestmentAssetMaxHoldingPerc(MINCurr)) //tie
                    {
                         if(currentIAminHolding>pd1.getInvestmentAssetMinHoldingPerc(MINCurr)) //   Highest MinIA%
                        {
                            MIN=RHS;
                            MINCurr =curr[i];  
                            MINRate=rate[i];  
 
                        }
                        else if(currentIAminHolding==pd1.getInvestmentAssetMinHoldingPerc(MINCurr)) //tie
                        {
                            if(strCompare(bytes16ToString(curr[i]),bytes16ToString(MINCurr))==1) //Alphabetical order of ERC20 name.
                            {
                                 MIN=RHS;
                                MINCurr =curr[i];
                                MINRate=rate[i];    

                            }   
                        }
                    }
                }

                else if(RHS<MIN || RHS==0) 
                {
                    MIN=RHS;
                    MINCurr=curr[i];
                    MINRate=rate[i];  

                }  
            }
           
        }    
    }
      function strCompare(string _a, string _b) internal returns (int) {
        bytes memory a = bytes(_a);
        bytes memory b = bytes(_b);
        uint minLength = a.length;
        if (b.length < minLength) minLength = b.length;
        for (uint i = 0; i < minLength; i ++)
            if (a[i] < b[i])
                return -1;
            else if (a[i] > b[i])
                return 1;
        if (a.length < b.length)
            return -1;
        else if (a.length > b.length)
            return 1;
        else
            return 0;
    }
       
     function bytes16ToString(bytes16 x)  internal constant returns (string) {
        bytes memory bytesString = new bytes(32);
        uint charCount = 0;
        for (uint j = 0; j < 32; j++) {
            byte char = byte(bytes16(uint(x) * 2 ** (8 * j)));
            if (char != 0) {
                bytesString[charCount] = char;
                charCount++;
            }
        }
        bytes memory bytesStringTrimmed = new bytes(charCount);
        for (j = 0; j < charCount; j++) {
            bytesStringTrimmed[j] = bytesString[j];
        }
        return string(bytesStringTrimmed);
    }
     

}
