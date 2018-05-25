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

import "./nxmToken.sol";
import "./nxmToken2.sol";
import "./governance.sol";
import "./claimsReward.sol";
import "./poolData.sol";
import "./quotation2.sol";
import "./quotationData.sol";
import "./master.sol";
import "./pool.sol";
import "./claims.sol";
// import "./fiatFaucet.sol";
import "./SafeMaths.sol";
// import "./usd.sol";
import "./BasicToken.sol";
import "./mcrData.sol";
import "./mcr.sol";
import "./pool3.sol";
import "github.com/0xProject/contracts/contracts/Exchange.sol";

contract pool2 
{
 using SafeMaths for uint;
    master ms;
    address masterAddress;
    nxmToken tc1;
    nxmToken2 tc2;
    pool p1;
    claims c1;
    // fiatFaucet f1;
    Exchange exchange1;
    quotation2 q2;
    mcr m1;
    mcrData md;
    claimsReward cr;
    governance g1;
    poolData pd;
    // SupplyToken tok;
    BasicToken btok;
    pool3 p3;
    quotationData qd;
    
    // address nxmtokenAddress;
    // address nxmtoken2Address;
    // address claimAddress;
    // address fiatFaucetAddress;
    address poolAddress;
    // address governanceAddress;
    // address claim_RewardAddress;
    // address poolDataAddress;
    // address quotation2Address;
    // address mcrAddress;
    // address pool3Address;
    // address quotationDataAddress;
    // address mcrDataAddress;
    
    address exchangeContractAddress;
    
    uint64 private constant _DECIMAL_1e18 = 1000000000000000000;

    event Payout(address indexed to, bytes16 eventName , uint coverId ,uint tokens );
    event Liquidity(bytes16 type_of,bytes16 function_name);
    event ZeroExOrders(bytes16 func,address makerAddr,address takerAddr,uint makerAmt,uint takerAmt,uint expirationTimeInMilliSec,bytes32 orderHash);
    event Rebalancing(bytes16 name,uint16 param);
    
    function changeMasterAddress(address _add)
    {
        if(masterAddress == 0x000){
            masterAddress = _add;
            ms=master(masterAddress);
        }
        else
        {
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
    modifier checkPause
    {
        // ms=master(masterAddress);
        require(ms.isPause()==false);
        _;
    }
    function changeClaimRewardAddress(address claimRewardAddress) onlyInternal
    {
        // claim_RewardAddress=_add;
        cr=claimsReward(claimRewardAddress);
    }
    
    function changeGovernanceAddress(address governanceAddress) onlyInternal
    {
        // governanceAddress = _add;
        g1=governance(governanceAddress);
    }
    function changePoolDataAddress(address poolDataAddress) onlyInternal
    {
        // poolDataAddress = _add;
        pd = poolData(poolDataAddress);
        // p3=pool3(pool3Address);
        // p3.changePoolDataAddress(poolDataAddress);
    }
   
    function changeQuotation2Address(address quotation2Address) onlyInternal
    {
        // quotation2Address = _add;
        q2=quotation2(quotation2Address);
    }
    function changeQuotationDataAddress(address quotationDataAddress) onlyInternal
    {
        // quotationDataAddress = _add;
        qd=quotationData(quotationDataAddress);
    }
    function changeExchangeContractAddress(address _add) onlyOwner
    {
        exchangeContractAddress=_add; //0x
        // p3=pool3(pool3Address);
        p3.changeExchangeContractAddress(exchangeContractAddress);
    }
    function changeMCRDataAddress(address mcrDataAddress) onlyInternal
    {
        // mcrDataAddress = _add;
        md=mcrData(mcrDataAddress);
    }
    function changePool3Address(address pool3Address) onlyInternal
    {
        // pool3Address=_add;
        p3=pool3(pool3Address);
    }
    function changeClaimAddress(address claimAddress) onlyInternal
    {
        // claimAddress = _add;
        c1=claims(claimAddress);
    }
    // function changeFiatFaucetAddress(address fiatFaucetAddress) onlyInternal
    // {
    //     // fiatFaucetAddress = _add;
    //     f1=fiatFaucet(fiatFaucetAddress);
    //     // p3=pool3(pool3Address);
    //     // p3.changePoolDataAddress(fiatFaucetAddress);
    // }
    function changePoolAddress(address _add) onlyInternal
    {
        poolAddress = _add;
        p1=pool(poolAddress);
        // p3=pool3(pool3Address);
        // p3.changePoolAddress(poolAddress);
    }
    function changeTokenAddress(address nxmTokenAddress) onlyInternal
    {
        // nxmTokenAddress  = _add;
        tc1=nxmToken(nxmTokenAddress);
    }
    function changeToken2Address(address nxmToken2Address) onlyInternal
    {
        // nxmToken2Address  = _add;
        tc2=nxmToken2(nxmToken2Address);
    }
    function changeMCRAddress(address mcrAddress) onlyInternal
    {
        // mcrAddress = _add;
        m1=mcr(mcrAddress);
    }
    /// @dev Handles the Callback of the Oraclize Query. Callback could be of type "quote", "quotation", "cover", "claim" etc.
    /// @param myid Oraclize Query ID identifying the query for which the result is being received
    /// @param res Result fetched by the external oracle.
    function delegateCallBack(bytes32 myid, string res) onlyInternal
    {
        // pd = poolData1(poolDataAddress);
        // ms=master(masterAddress);
        if (ms.isPause()==false) // system is not in emergency pause
        {
            // If callback is of type "cover", then cover id associated with the myid is checked for expiry.
            if(pd.getApiIdTypeOf(myid) =="COV")
            {
                pd.updateDateUpdOfAPI(myid);
                // q2=quotation2(quotation2Address);
                q2.expireCover(pd.getIdOfApiId(myid));
            }
            // If callback is of type "claim", then claim id associated with the myid is checked for vote closure.
            else if(pd.getApiIdTypeOf(myid) =="CLA")
            {
                pd.updateDateUpdOfAPI(myid);
                // cr=claimsReward(claimRewardAddress);
                cr.changeClaimStatus(pd.getIdOfApiId(myid));

            }
            else if(pd.getApiIdTypeOf(myid) =="MCR")
            {
                pd.updateDateUpdOfAPI(myid);
            }
            else if(pd.getApiIdTypeOf(myid) =="MCRF")
            {
                pd.updateDateUpdOfAPI(myid);
                // m1=MCR(MCRAddress);
                m1.addLastMCRData(uint64(pd.getIdOfApiId(myid)));
            }
            else if(pd.getApiIdTypeOf(myid)=="SUB")
            {
                 pd.updateDateUpdOfAPI(myid);
            }
            else if(pd.getApiIdTypeOf(myid)=="0X")
            {
                pd.updateDateUpdOfAPI(myid);
            }
            else if(pd.getApiIdTypeOf(myid)=="Close0x")
            {
                pd.updateDateUpdOfAPI(myid);
                // p3=pool3(pool3Address);
                p3.check0xOrderStatus(pd.getCurrOfApiId(myid),pd.getIdOfApiId(myid));
            }
        }
      
        // even when system is in emergency pause.
        // If callback is of type "proposal", then proposal id associated with the myid is checked for vote closure.
        if(pd.getApiIdTypeOf(myid) =="PRO")
        {
            pd.updateDateUpdOfAPI(myid);
            // g1=governance(governanceAddress);
            g1.closeProposalVote(pd.getIdOfApiId(myid));
        }
        if(pd.getApiIdTypeOf(myid) =="Pause")
        {
            pd.updateDateUpdOfAPI(myid);
            bytes4 by;
            (,,by) = ms.getLastEmergencyPause();
            if(by=="AB")
                ms.addEmergencyPause(false,"AUT"); //set pause to false
        }
    }
    /// @dev Calls the payout event incase of claims payout.
    function callPayoutEvent(address _add,bytes16 type1,uint id,uint sa) onlyInternal
    {
        Payout(_add,type1,id,sa);
    }
    /// @dev Pays out the sum assured in case a claim is accepted
    /// @param coverid Cover Id.
    /// @param claimid Claim Id.
    /// @return succ true if payout is successful, false otherwise.
    function sendClaimPayout(uint coverid , uint claimid) onlyInternal  returns(bool succ)
    {
        // q2=quotation2(quotation2Address);
        // qd=quotationData(quotationDataAddress);
        // tc1=NXMToken(NXMTokenAddress);
        // tc2=NXMToken2(NXMToken2Address);
        // c1=claims(claimAddress);
        // p1=pool(poolAddress);
        // pd=poolData1(poolDataAddress);
        address _to=qd.getCoverMemberAddress(coverid);
        uint sumAssured = qd.getCoverSumAssured(coverid);
        uint sumAssured_1e18=SafeMaths.mul(sumAssured,_DECIMAL_1e18);
        bytes4 curr = qd.getCurrencyOfCover(coverid);
        uint balance;
        // uint quoteid=q2.getQuoteId(coverid);
        //Payout in Ethers in case currency of quotation is ETH
        if(curr=="ETH")
        {
            balance = p1.getEtherPoolBalance();
            //Check if pool has enough ETH balance
            if(balance >= sumAssured_1e18)
            {
                succ = p1.transferEther(sumAssured_1e18 ,_to);   
                if(succ==true)
                {
                    // tc1.removeFromPoolFund(curr,sumAssured);
                    q2.removeSAFromCSA(coverid,sumAssured);
                    // p1.subtractQuotationOracalise(coverid);
                    // date:10/11/2017/
                    pd.changeCurrencyAssetVarMin(curr,uint64(SafeMaths.sub(pd.getCurrencyAssetVarMin(curr),sumAssured)));
                    c1.checkLiquidity(curr);
                    callPayoutEvent(_to,"Payout",coverid,sumAssured_1e18);
                }
                else
                {
                    c1.setClaimStatus(claimid , 16);
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
            // f1=fiatFaucet(fiatFaucetAddress);
            btok=BasicToken(pd.getCurrencyAssetAddress(curr));
            balance = btok.balanceOf(poolAddress);
            //Check if pool has enough fiat crypto balance
            if(balance >= sumAssured_1e18)
            {
                // f1.payoutTransferFromPool(_to , curr , sumAssured_1e18);
                p1.transferPayout(_to,curr,sumAssured_1e18);
                // tc1.removeFromPoolFund(curr,sumAssured);
                // p1.subtractQuotationOracalise(coverid);
                q2.removeSAFromCSA(coverid,sumAssured);
                // date:10/11/2017/
                pd.changeCurrencyAssetVarMin(curr,uint64(SafeMaths.sub(pd.getCurrencyAssetVarMin(curr),sumAssured)));
                c1.checkLiquidity(curr);
                callPayoutEvent(_to,"Payout",coverid,sumAssured_1e18);
                succ=true;
            }
            else
            {
                c1.setClaimStatus(claimid , 16);
                succ=false;
            }
        }
        if(qd.getProductNameOfCover(coverid)=="SCC")
            tc2.burnStakerLockedToken(coverid,curr,sumAssured);
    }
    /// @dev Gets the investment asset rank.
   function getIARank(bytes8 curr,uint64 rateX100)  constant returns(int RHS) //internal function
    {
        // pd = poolData1(poolDataAddress);
        // p1=pool(poolAddress);
        uint currentIAmaxHolding;
        uint currentIAminHolding;

        uint IABalance=SafeMaths.div(p1.getBalanceofInvestmentAsset(curr),(_DECIMAL_1e18));
        (currentIAminHolding,currentIAmaxHolding)=pd.getInvestmentAssetHoldingPerc(curr);
        uint holdingPercDiff=(SafeMaths.sub(SafeMaths.div(currentIAmaxHolding,100) , SafeMaths.div(currentIAminHolding,100)));
        if(holdingPercDiff>0 && rateX100>0)
            RHS=int(SafeMaths.div(SafeMaths.mul(SafeMaths.mul(IABalance,100),100000),(SafeMaths.mul(holdingPercDiff,rateX100))));
    }
    /// @dev Gets the equivalent investment asset pool  balance in ether. 
    /// @param IACurr array of Investment asset name.
    /// @param IARate array of investment asset exchange rate.
    function totalRiskPoolBalance(bytes8[] IACurr,uint64[] IARate)  constant returns (uint balance,uint IABalance)
    {
        // m1=MCR(MCRAddress);
        // p1=pool(poolAddress);
        uint currBalance;
        (currBalance,)=m1.calVtpAndMCRtp();
      
        for(uint i=0;i<IACurr.length;i++)
        {
            if(IARate[i]>0)
                IABalance=SafeMaths.add(IABalance,SafeMaths.div(SafeMaths.mul(p1.getBalanceofInvestmentAsset(IACurr[i]),100),IARate[i]));
        }
        balance=SafeMaths.add(currBalance,IABalance);
    }
    /// @dev Triggers pool rebalancing trading orders.
    function rebalancingTrading0xOrders(bytes8[] IACurr,uint64[] IARate,uint64 date)checkPause returns(uint16 result)
    {  
        // pd = poolData1(poolDataAddress);
        // p1=pool(poolAddress);
        // md=MCRData(MCRDataAddress);
        // p3=pool3(pool3Address);
        bytes8 MAXIACurr;uint64 MAXRate;
        (MAXIACurr,MAXRate,,)= pd.getIARankDetailsByDate(date);
        // require(pd.getLiquidityOrderStatus(bytes4(MAXIACurr),"RBT")==0);
        if(pd.getLiquidityOrderStatus(MAXIACurr,"RBT")==0){

            uint totalRiskBal=SafeMaths.div(( SafeMaths.mul(pd.getTotalRiskPoolBalance(),100000 )),(_DECIMAL_1e18));
            if(totalRiskBal>0 && IARate.length>0)  //if v=0 OR there is no IA, don't trade
            {
                for(uint i=0;i<IARate.length;i++)
                {
                     if(pd.getInvestmentAssetStatus(IACurr[i])==1) // if IA is active 
                     {
                        if(checkTradeConditions(IACurr[i],IARate[i])==1)
                        {
                            // ORDER 1 (max RHS IA to ETH)
                            // amount of asset to sell
                            uint makerAmt=(SafeMaths.div((SafeMaths.mul(SafeMaths.mul(SafeMaths.mul(2,pd.getVariationPercX100()),totalRiskBal),MAXRate)),(SafeMaths.mul(SafeMaths.mul(100,100),100000)))); //*100);// ( 10**pd.getInvestmentAssetDecimals(MAXIACurr)); //MULTIPLY WITH DECIMALS 
                            // amount of ETH to buy
                            uint InvestmentAssetDecimals=pd.getInvestmentAssetDecimals(MAXIACurr);
                            uint takerAmt=((SafeMaths.mul(md.getCurr3DaysAvg("ETH"),makerAmt))/MAXRate); //*10**18);    //  ( 10**pd.getInvestmentAssetDecimals(MAXIACurr)); 
                            uint expirationTimeInMilliSec=SafeMaths.add(now,pd.getOrderExpirationTime("RBT"));
                            makerAmt=SafeMaths.div((SafeMaths.mul(makerAmt,10**InvestmentAssetDecimals)),100);
                            takerAmt=SafeMaths.div(SafeMaths.mul(takerAmt,_DECIMAL_1e18),(100));
                            if(makerAmt<=p1.getBalanceofInvestmentAsset(MAXIACurr))
                            {
                                exchange1=Exchange(exchangeContractAddress);
                                bytes32 orderHash=exchange1.getOrderHash([pd.get0xMakerAddress(),pd.get0xTakerAddress(),pd.getInvestmentAssetAddress(MAXIACurr),p3.getWETHAddress(),pd.get0xFeeRecipient()],[makerAmt,takerAmt,pd.get0xMakerFee(),pd.get0xTakerFee(),expirationTimeInMilliSec,pd.getOrderSalt()]);
                                pd.saveRebalancingOrderHash(orderHash);
                                pd.pushOrderDetails(orderHash,bytes4(MAXIACurr),makerAmt,"ETH",takerAmt,"RBT",expirationTimeInMilliSec);
                                
                                pd.updateLiquidityOrderStatus(bytes4(MAXIACurr),"RBT",1);
                               
                                pd.setCurrOrderHash(bytes4(MAXIACurr),orderHash);  
                                //events
                                ZeroExOrders("RBT",pd.getInvestmentAssetAddress(MAXIACurr),p3.getWETHAddress(),makerAmt,takerAmt,expirationTimeInMilliSec,orderHash);
                                Rebalancing("OrderGen",1);
                                return 1; // rebalancing order generated
                            }      
                            else
                            {   //events
                                ZeroExOrders("RBT",pd.getInvestmentAssetAddress(MAXIACurr),p3.getWETHAddress(),makerAmt,takerAmt,expirationTimeInMilliSec,"insufficient");
                                Rebalancing("OrderGen",2);
                                return 2; // not enough makerAmt;
                                
                            }                      
                        }
                     }
                }
                Rebalancing("OrderGen",0);
                return 0; // when V!=0 but rebalancing is not required
            }
        }
        Rebalancing("OrderGen",3);
        return 4; // when V=0 or no IA is present       
    }
    /// @dev Checks whether trading is require for a given investment asset at a given exchange rate.
    function checkTradeConditions(bytes8 curr,uint64 IARate) constant returns(int check)
    {
        if(IARate>0){
            // pd = poolData1(poolDataAddress);
            // p1=pool(poolAddress);
            uint InvestmentAssetDecimals=pd.getInvestmentAssetDecimals(curr);
            uint IABalance=SafeMaths.div(p1.getBalanceofInvestmentAsset(curr),(10**InvestmentAssetDecimals));
            uint totalRiskBal=SafeMaths.div(SafeMaths.mul(pd.getTotalRiskPoolBalance(),100000),(_DECIMAL_1e18));
            if(IABalance>0 && totalRiskBal>0)
            {
                uint IAMax;uint IAMin;uint checkNumber;uint z;
                (IAMin,IAMax)=pd.getInvestmentAssetHoldingPerc(curr);
                z=pd.getVariationPercX100();
                checkNumber=SafeMaths.div((SafeMaths.mul(SafeMaths.mul(IABalance,100),100000)),(SafeMaths.mul(IARate,totalRiskBal)));
                if( (checkNumber> SafeMaths.mul(SafeMaths.div(SafeMaths.mul(SafeMaths.add(IAMax,z),totalRiskBal),100 ),100000))|| (checkNumber < SafeMaths.mul(SafeMaths.div(SafeMaths.mul(SafeMaths.sub(IAMin,z),totalRiskBal),100),100000)) )    //a) # of IAx x fx(IAx) / V > MaxIA%x + z% ;  or b) # of IAx x fx(IAx) / V < MinIA%x - z%
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
        else
            return -2;
    }
    
    /// @dev Calculates the investment asset rank.
    function calculateIARank(bytes8[] curr,uint64[] rate)  constant returns(bytes8 MAXCurr,uint64 MAXRate,bytes8 MINCurr,uint64 MINRate)
    {
        // pd = poolData1(poolDataAddress);
        uint currentIAmaxHolding;
        uint currentIAminHolding;
        int MAX=0;int MIN=-1;
        int RHS;
        for(uint i=0;i<curr.length;i++)
        {
            RHS=0;
            if(pd.getInvestmentAssetStatus(curr[i])==1) 
            {
                (currentIAminHolding,currentIAmaxHolding)=pd.getInvestmentAssetHoldingPerc(curr[i]);
                RHS=getIARank(curr[i],rate[i]);
                if(RHS>MAX)
                {
                    MAX=RHS;
                    MAXCurr =curr[i] ;  
                    MAXRate=rate[i];
                }
                else if(RHS==MAX) //tie for the highest RHSx  
                {
                    if(currentIAmaxHolding>pd.getInvestmentAssetMaxHoldingPerc(MAXCurr))  //Highest MaxIA%
                    {
                        MAX=RHS;
                        MAXCurr =curr[i];
                        MAXRate=rate[i];  
                    }
                    else if(currentIAmaxHolding==pd.getInvestmentAssetMaxHoldingPerc(MAXCurr)) //tie in MaxIA%
                    {
                         if(currentIAminHolding>pd.getInvestmentAssetMinHoldingPerc(MAXCurr)) //   Highest MinIA%
                        {
                            MAX=RHS;
                            MAXCurr =curr[i];  
                            MAXRate=rate[i];
                        }
                        else if(currentIAminHolding==pd.getInvestmentAssetMinHoldingPerc(MAXCurr)) //tie in MinIA%
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
                    if(currentIAmaxHolding>pd.getInvestmentAssetMaxHoldingPerc(MINCurr))  //Highest MaxIA%
                    {
                        MIN=RHS;
                        MINCurr =curr[i];
                        MINRate=rate[i];  
                    }
                    else if(currentIAmaxHolding==pd.getInvestmentAssetMaxHoldingPerc(MINCurr)) //tie
                    {
                        if(currentIAminHolding>pd.getInvestmentAssetMinHoldingPerc(MINCurr)) //   Highest MinIA%
                        {
                            MIN=RHS;
                            MINCurr =curr[i];  
                            MINRate=rate[i];  
                        }
                        else if(currentIAminHolding==pd.getInvestmentAssetMinHoldingPerc(MINCurr)) //tie
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
                else if(RHS<MIN || RHS==0 || MIN==-1 ) 
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
       
    function bytes16ToString(bytes16 x)  internal constant returns (string) 
    {
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
    
    /// @dev Unwraps ether.
    function convertWETHintoETH(bytes8[] curr,uint64[] rate,uint64 date)checkPause payable
    {
        // pd = poolData1(poolDataAddress);
        // p3=pool3(pool3Address);
        btok=BasicToken(pd.getWETHAddress());
        bool success= btok.transfer(msg.sender,msg.value);
        if(success==true)
            p3.saveIADetails(curr,rate,date);
    }
}
