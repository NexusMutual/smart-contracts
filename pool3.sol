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

import "./poolData1.sol";
import "./master.sol";
import "./pool.sol";
import "./fiatFaucet.sol";
import "./SafeMaths.sol";
import "./USD.sol";
import "./pool2.sol";
import "./MCRData.sol";
import "./Exchange.sol";

contract pool3
{
    using SafeMaths for uint;
    poolData1 pd;
    master ms;
    pool p1;
    fiatFaucet f1;
    SupplyToken tok;
    pool2 p2;
    Exchange exchange;
    MCRData md;
    address poolDataAddress;
    address masterAddress;
    address fiatFaucetAddress;
    address poolAddress;
    address pool2Address;
    address exchangeContractAddress;
    address MCRDataAddress;
    event Liquidity(bytes16 type_of,bytes16 function_name);
    event CheckLiquidity(bytes16 type_of,uint balance);
    event ZeroExOrders(bytes16 func,address makerAddr,address takerAddr,uint makerAmt,uint takerAmt,uint expirationTimeInMilliSec,bytes32 orderHash);
    function changeMasterAddress(address _add)
    {
        if(masterAddress == 0x000)
            masterAddress = _add;
        else
        {
            ms=master(masterAddress);
            if(ms.isInternal(msg.sender) == 1)
                masterAddress = _add;
            else
                throw;
        }
    }
    function changePoolDataAddress(address _add) onlyInternal
    {
        poolDataAddress = _add;
        // pd = poolData1(poolDataAddress);
    }
    function changeFiatFaucetAddress(address _to) onlyInternal
    {
        fiatFaucetAddress = _to;
    }

    function changePoolAddress(address _to) onlyInternal
    {
        poolAddress = _to;
    }
    function changeExchangeContractAddress(address _add) onlyInternal
    {
        exchangeContractAddress=_add; //0x
    }
    function getExchangeContractAddress() constant returns(address _add)
    {
        return exchangeContractAddress;
    }
    function changePool2Address(address _to)onlyInternal
    {
        pool2Address=_to;
    }
    function changeMCRDataAddress(address _add) onlyInternal
    {
        MCRDataAddress = _add;
    }
    function changeWETHAddress(address _add) onlyOwner
    {
        pd=poolData1(poolDataAddress);
        pd.changeWETHAddress(_add);
    }
    function getWETHAddress() constant returns(address WETHAddr)
    {
        pd=poolData1(poolDataAddress);
        return pd.getWETHAddress();
    }
    modifier onlyInternal {
        ms=master(masterAddress);
        require(ms.isInternal(msg.sender) == 1);
        _; 
    }
    modifier onlyOwner{
        ms=master(masterAddress);
        require(ms.isOwner(msg.sender) == 1);
        _; 
    }
    modifier checkPause
    {
        ms=master(masterAddress);
        require(ms.isPause()==0);
        _;
    }
      /// @dev Sets a given investment asset as active for trading.
    function activeInvestmentAsset(bytes16 curr)  onlyInternal
    {
        pd=poolData1(poolDataAddress);
        pd.changeInvestmentAssetStatus(curr,1);
    }  
     /// @dev Sets a given investment asset as inactive for trading.
    function inactiveInvestmentAsset(bytes16 curr) onlyInternal
    {
        pd=poolData1(poolDataAddress);
        pd.changeInvestmentAssetStatus(curr,0);
    }
    /// @dev Saves a given investment asset details.
    /// @param curr array of Investment asset name.
    /// @param rate array of investment asset exchange rate.
    /// @param date current date in yyyymmdd.
    function saveIADetails(bytes16[] curr,uint64[] rate,uint64 date) checkPause
    {
        pd = poolData1(poolDataAddress);
        p1=pool(poolAddress);
        md=MCRData(MCRDataAddress);
        p2=pool2(pool2Address);
        bytes16 MAXCurr;
        bytes16 MINCurr;
        uint64 MAXRate;
        uint64 MINRate;
        uint totalRiskPoolBal;uint IABalance;
        //ONLY NOTARZIE ADDRESS CAN POST
        if(md.isnotarise(msg.sender)==0) throw;

        (totalRiskPoolBal,IABalance)=p2.totalRiskPoolBalance(curr,rate);
        pd.setTotalBalance(totalRiskPoolBal,IABalance);
        (MAXCurr,MAXRate,MINCurr,MINRate)=p2.calculateIARank(curr,rate);
        pd.saveIARankDetails(MAXCurr,MAXRate,MINCurr,MINRate,date);
        pd.updatelastDate(date);
        // Rebalancing Trade : only once per day
        p2.rebalancingTrading0xOrders(curr,rate,date);
        p1.saveIADetailsOracalise(pd.getIARatesTime());
        uint8 check;
        uint CABalance;

        //Excess Liquidity Trade : atleast once per day
        for(uint16 i=0;i<md.getCurrLength();i++)
        {
            (check,CABalance)=checkLiquidity(md.getCurrencyByIndex(i));
            if(check==1)
            {
               if(CABalance>0)
                 ExcessLiquidityTrading(md.getCurrencyByIndex(i),CABalance);
            }
        }
        
    }
    /// @dev Checks the order fill status for a given order id of given currency.
    function check0xOrderStatus(bytes4 curr,uint orderid) onlyInternal
    {
        p1=pool(poolAddress);
        pd=poolData1(poolDataAddress);
        f1=fiatFaucet(fiatFaucetAddress);
        md=MCRData(MCRDataAddress);
        bytes32 orderHash=pd.getCurrOrderHash(curr,orderid);
        
        exchange=Exchange(exchangeContractAddress);
        uint filledAmt=exchange.getUnavailableTakerTokenAmount(orderHash); //amount that is filled till now.(TakerToken)
        bytes4 makerCurr;bytes4 takerCurr;uint makerAmt;uint takerAmt;bytes16 orderHashType;
        address makerTokenAddr;address takerTokenAddr;
       (makerCurr,makerAmt,takerCurr,takerAmt,orderHashType,)=pd.getOrderDetailsByHash(orderHash);
       if(orderHashType=="ELT")
       {
           if(makerCurr=="ETH")
                makerTokenAddr=getWETHAddress();
           else 
                makerTokenAddr=f1.getCurrAddress(makerCurr);
           takerTokenAddr=pd.getInvestmentAssetAddress(takerCurr);
       }
       else if(orderHashType=="ILT")
       {
            makerTokenAddr=pd.getInvestmentAssetAddress(makerCurr);
            if(takerCurr=="ETH")
                takerTokenAddr=getWETHAddress();
            else    
                takerTokenAddr=f1.getCurrAddress(takerCurr);
       } 

       else if(orderHashType=="RBT")
       {
            makerTokenAddr=pd.getInvestmentAssetAddress(makerCurr);
            takerTokenAddr=getWETHAddress();
       }

        if(filledAmt>0)
        {           
            if(filledAmt==takerAmt) // order filled completely, transfer only takerAmt from signerAddress to poolAddress 
            {
                p1.transferToPool(takerTokenAddr,filledAmt);
            }
            else // order filled partially,transfer takerAmt and calculate remaining makerAmt that needs to take back from signerAddress 
            {
                p1.transferToPool(takerTokenAddr,filledAmt);
                if(takerAmt>filledAmt)
                {
                    makerAmt=SafeMaths.div(SafeMaths.mul(makerAmt , SafeMaths.sub(takerAmt,filledAmt)),takerAmt);
                    p1.transferToPool(makerTokenAddr,makerAmt);
                }
            }
        }
        else // order is not filled completely,transfer makerAmt as it is from signerAddress to poolAddr  
        {
            p1.transferToPool(makerTokenAddr,makerAmt);
        }
        pd.updateLiquidityOrderStatus(curr,orderHashType,0);  //order closed successfully for this currency
        if(md.isnotarise(msg.sender)==1) // called from notarize address
        {
            pd.updateZeroExOrderStatus(orderHash,0); //order is not signed
        }
        else //called from oraclize api
        {
            pd.updateZeroExOrderStatus(orderHash,2); //order expired successfully
        }
    } 
    /// @dev Signs a 0x order hash.
    function sign0xOrder(uint orderId,bytes32 orderHash)checkPause
    { 
         pd = poolData1(poolDataAddress);
         p1=pool(poolAddress);
         
         require(msg.sender==pd.get0xMakerAddress() && pd.getZeroExOrderStatus(orderHash)==0); // not signed already         
         
         bytes16 orderType;       
         address makerTokenAddr;
         uint makerAmt;uint takerAmt;
         bytes4 makerToken;bytes4 takerToken;
         uint validTime;
         (makerToken,makerAmt,takerToken,takerAmt,orderType,validTime,)=pd.getOrderDetailsByHash(orderHash);
         address _0xMakerAddress=pd.get0xMakerAddress();
         uint expireTime; 
         if(validTime>now) 
            expireTime=SafeMaths.sub(validTime,now); 
         if(orderType=="ELT")
         {
           f1=fiatFaucet(fiatFaucetAddress);
           makerTokenAddr=f1.getCurrAddress(makerToken);
           // transfer selling amount to the makerAddress
           f1.payoutTransferFromPool(_0xMakerAddress,makerToken,makerAmt);    
           p1.close0xOrders(makerToken,orderId,expireTime);  
         }
         else if(orderType=="ILT")
         {
            makerTokenAddr=pd.getInvestmentAssetAddress(makerToken);
            // transfer selling amount to the makerAddress from pool contract
            p1.transferFromPool(_0xMakerAddress,makerTokenAddr,makerAmt);
            p1.close0xOrders(takerToken,orderId,expireTime);  //orderId is the index of Currency Asset at which hash is saved.

         }
         else if(orderType=="RBT")
         {
            makerTokenAddr=pd.getInvestmentAssetAddress(makerToken);

            // transfer selling amount to the makerAddress from pool contract
            p1.transferFromPool(_0xMakerAddress,makerTokenAddr,makerAmt);
            p1.close0xOrders(makerToken,orderId,expireTime);  // orderId is the index of allRebalancingOrderHash.
         }
         pd.updateZeroExOrderStatus(orderHash,1);
    }

   
    /// @dev Checks Excess or insufficient liquidity trade conditions for a given currency.
    function checkLiquidity(bytes4 curr) onlyInternal returns(uint8 check,uint CABalance)
    {
        ms=master(masterAddress);
        md=MCRData(MCRDataAddress);
        if(ms.isInternal(msg.sender)==1 || md.isnotarise(msg.sender)==1){
            pd = poolData1(poolDataAddress);
            uint64 baseMin;
            uint64 varMin;
            (,baseMin,varMin)=pd.getCurrencyAssetDetails(curr);
            CABalance=SafeMaths.div(getCurrencyAssetsBalance(curr),(10**18));
            //Excess liquidity trade
            if(CABalance>SafeMaths.mul(2,(SafeMaths.add(baseMin,varMin))))
            {   
                CheckLiquidity("ELT",CABalance);
                return (1,CABalance);
            }   
            //Insufficient Liquidity trade
            else if(CABalance<(SafeMaths.add(baseMin,varMin)))
            {  
                CheckLiquidity("ILT",CABalance);
                return (2,CABalance);
            }
        }
   }
   /// @dev Creates Excess liquidity trading order for a given currency and a given balance.
    function ExcessLiquidityTrading(bytes4 curr,uint CABalance) onlyInternal
    { 
        ms=master(masterAddress);
        md=MCRData(MCRDataAddress);
        if(ms.isInternal(msg.sender)==1 || md.isnotarise(msg.sender)==1){
            pd = poolData1(poolDataAddress);
            if(pd.getLiquidityOrderStatus(curr,"ELT")==0)
            {
                uint64 baseMin;
                uint64 varMin; 
                bytes16 MINIACurr;
                uint64 minIARate;
                uint makerAmt;uint takerAmt;
                (,baseMin,varMin)=pd.getCurrencyAssetDetails(curr);
                (,,MINIACurr,minIARate)=pd.getIARankDetailsByDate(pd.getLastDate());
                //  amount of assest to sell currency asset
                if(CABalance>=SafeMaths.mul(3,SafeMaths.div(((SafeMaths.add(baseMin,varMin))),2)))
                {
                    md=MCRData(MCRDataAddress);
                    makerAmt=(SafeMaths.sub(CABalance, SafeMaths.mul(3,SafeMaths.div(((SafeMaths.add(baseMin,varMin))),2))));//*10**18;
                    // amount of asset to buy investment asset
                    if(md.getCurr3DaysAvg(curr)>0){
                        takerAmt=SafeMaths.div(( SafeMaths.mul(SafeMaths.mul(minIARate,makerAmt), 10**pd.getInvestmentAssetDecimals(MINIACurr) )),(md.getCurr3DaysAvg(curr))) ;      
                        zeroExOrders(curr,makerAmt,takerAmt,"ELT",0); 
                        Liquidity("ELT","0x");
                    }
                }
                else
                {
                    Liquidity("ELT","Insufficient");
                }      
            }
        }
    }
    /// @dev Creates/cancels insufficient liquidity trading order for a given currency and a given balance.
    function InsufficientLiquidityTrading(bytes4 curr,uint CABalance,uint8 cancel) onlyInternal
    {
        pd = poolData1(poolDataAddress);
        uint64 baseMin;
        uint64 varMin; 
        bytes16 MAXIACurr;
        uint64 maxIARate;
        uint makerAmt;uint takerAmt;
        (,baseMin,varMin)=pd.getCurrencyAssetDetails(curr);
        (MAXIACurr,maxIARate,,)=pd.getIARankDetailsByDate(pd.getLastDate());
        // amount of asset to buy currency asset
        takerAmt=SafeMaths.sub(SafeMaths.mul(3,SafeMaths.div(SafeMaths.add(baseMin,varMin),2)),CABalance);//*10**18; // multiply with decimals
        // amount of assest to sell investment assest
      
       if(pd.getLiquidityOrderStatus(curr,"ILT")==0)
       {   
            p1=pool(poolAddress);
            md=MCRData(MCRDataAddress);
            makerAmt=SafeMaths.div((SafeMaths.mul(SafeMaths.mul(maxIARate,takerAmt), 10**pd.getInvestmentAssetDecimals(MAXIACurr))),( md.getCurr3DaysAvg(curr)));  //  divide by decimals of makerToken;      
            if(makerAmt<=p1.getBalanceofInvestmentAsset(MAXIACurr))
            {
                zeroExOrders(curr,makerAmt,takerAmt,"ILT",cancel); 
                Liquidity("ILT","0x");
            }  
            else
            {
                Liquidity("ILT","Not0x");
            }
        }
        else
        {
           cancelLastInsufficientTradingOrder(curr,takerAmt);
        }
    }
    /// @dev Cancels insufficient liquidity trading order and creates a new order for a new taker amount for a given currency.
    function cancelLastInsufficientTradingOrder(bytes4 curr,uint newTakerAmt) onlyInternal
    {
        pd = poolData1(poolDataAddress);
        uint index=SafeMaths.sub(pd.getCurrAllOrderHashLength(curr),1);
        bytes32 lastCurrHash=pd.getCurrOrderHash(curr,index);
        //get last 0xOrderhash taker amount (currency asset amount)
        uint lastTakerAmt;
        (,,,lastTakerAmt,,,)=pd.getOrderDetailsByHash(lastCurrHash);
        lastTakerAmt=SafeMaths.div(lastTakerAmt,(10**18));
        if(lastTakerAmt<newTakerAmt)
        {
            check0xOrderStatus(curr,index);// transfer previous order amount
            // generate new 0x order if it is still insufficient
            uint check;uint CABalance;
            (check,CABalance)=checkLiquidity(curr);
            if(check==1)
            {
                InsufficientLiquidityTrading(curr,CABalance,1);

            }
            // cancel old order(off chain while signing the new order)
            
        }
    }
    /// @dev Initiates all 0x trading orders.
    function zeroExOrders(bytes4 curr,uint makerAmt,uint takerAmt,bytes16 _type,uint8 cancel) internal
    {
       bytes16 MINIACurr;
       uint expirationTimeInMilliSec;
       bytes16 MAXIACurr;
       address takerTokenAddr;
       pd = poolData1(poolDataAddress);
       exchange=Exchange(exchangeContractAddress);
       f1=fiatFaucet(fiatFaucetAddress);
       bytes32 orderHash;
       (MAXIACurr,,MINIACurr,)=pd.getIARankDetailsByDate(pd.getLastDate());
       address makerTokenAddr;
       if(curr=="ETH")
       {
            if(_type=="ELT")
                makerTokenAddr=pd.getWETHAddress();
            else if(_type=="ILT")
                takerTokenAddr=pd.getWETHAddress(); 
       }
       else
       {
            if(_type=="ELT")
                makerTokenAddr=f1.getCurrAddress(bytes16(curr));
            else if(_type=="ILT")
                takerTokenAddr=f1.getCurrAddress(bytes16(curr)); 
       }
       if(_type=="ELT")
       {
            takerTokenAddr=pd.getInvestmentAssetAddress(MINIACurr);
            expirationTimeInMilliSec=SafeMaths.add(now,pd.getOrderExpirationTime(_type));   //12 hours in milliseconds
            orderHash=exchange.getOrderHash([pd.get0xMakerAddress(),pd.get0xTakerAddress(),makerTokenAddr,takerTokenAddr,pd.get0xFeeRecipient()],[SafeMaths.mul(makerAmt,10**18),takerAmt,pd.get0xMakerFee(),pd.get0xTakerFee(),expirationTimeInMilliSec,pd.getOrderSalt()]);
            pd.setCurrOrderHash(curr,orderHash);
            pd.updateLiquidityOrderStatus(curr,_type,1);
            pd.pushOrderDetails(orderHash,curr,SafeMaths.mul(makerAmt,10**18),bytes4(MINIACurr),takerAmt,_type,expirationTimeInMilliSec);
            //event
            ZeroExOrders("Call0x",makerTokenAddr,takerTokenAddr,SafeMaths.mul(makerAmt,10**18),takerAmt,expirationTimeInMilliSec,orderHash);
        }
                 
        else if(_type=="ILT")
        {
            makerTokenAddr=pd.getInvestmentAssetAddress(MAXIACurr); 
            expirationTimeInMilliSec=SafeMaths.add(now,pd.getOrderExpirationTime(_type));
            orderHash=exchange.getOrderHash([pd.get0xMakerAddress(),pd.get0xTakerAddress(),makerTokenAddr,takerTokenAddr,pd.get0xFeeRecipient()],[makerAmt,SafeMaths.mul(takerAmt,10**18),pd.get0xMakerFee(),pd.get0xTakerFee(),expirationTimeInMilliSec,pd.getOrderSalt()]);
            pd.setCurrOrderHash(curr,orderHash);  
            pd.updateLiquidityOrderStatus(curr,_type,1);
            pd.pushOrderDetails(orderHash,bytes4(MAXIACurr),makerAmt,curr,SafeMaths.mul(takerAmt,10**18),_type,expirationTimeInMilliSec);
            if(cancel==1)
            {
           
                // saving last orderHash
                setOrderCancelHashValue(curr,orderHash);
            }
                //event
                ZeroExOrders("Call0x",makerTokenAddr,takerTokenAddr,makerAmt,SafeMaths.mul(takerAmt,10**18),expirationTimeInMilliSec,orderHash);
            }  
    }

    function setOrderCancelHashValue(bytes4 curr,bytes32 orderHash) internal
    {
        pd = poolData1(poolDataAddress);
        uint lastIndex=SafeMaths.sub(pd.getCurrAllOrderHashLength(curr),1);
        bytes32 lastCurrHash=pd.getCurrOrderHash(curr,lastIndex);
        pd.setOrderCancelHashValue(orderHash,lastCurrHash);
    }
    /// @dev Get Investment asset balance and active status for a given asset name.
    function getInvestmentAssetBalAndStatus(bytes16 curr_name)constant returns(bytes16 curr,uint balance,uint8 status,uint64 _minHoldingPercX100,uint64 _maxHoldingPercX100,uint64 decimals)
    {
        pd = poolData1(poolDataAddress);
        p1=pool(poolAddress);
      
        balance=p1.getBalanceofInvestmentAsset(curr_name);
        (curr,,status,_minHoldingPercX100,_maxHoldingPercX100,decimals)=pd.getInvestmentAssetDetails(curr_name);
    }
   
     /// @dev Get currency asset balance for a given currency name.
    function getCurrencyAssetsBalance(bytes4 curr) constant returns(uint CABalance)
    {
        f1=fiatFaucet(fiatFaucetAddress);   
        p1=pool(poolAddress);
        if(curr=="ETH")
        {
            CABalance=p1.getEtherPoolBalance();
        }
        else
        {          
            CABalance=f1.getBalance(poolAddress,bytes16(curr)); 
        } 
       
    }
    /// @dev Get currency asset details for a given currency name.
    /// @return CABalance currency asset balance
    /// @return CARateX100 currency asset balance*100.
    /// @return baseMin minimum base amount required in pool.
    /// @return varMin  minimum variable amount required in pool.
    function getCurrencyAssetDetails(bytes4 curr) constant returns(uint CABalance,uint CARateX100,uint baseMin,uint varMin)
    {
        md=MCRData(MCRDataAddress);
        pd=poolData1(poolDataAddress);
        CABalance=getCurrencyAssetsBalance(curr);
        (,baseMin,varMin)=pd.getCurrencyAssetDetails(curr);
        // uint lastIndex=SafeMaths.sub(md.getMCRDataLength(),1);
        CARateX100=md.allCurr3DaysAvg(curr);
    }
    // update investment asset  min and max holding percentages.
    function updateInvestmentAssetHoldingPerc(bytes16 _curr,uint64 _minPercX100,uint64 _maxPercX100) onlyInternal
    {
        pd=poolData1(poolDataAddress);
        pd.changeInvestmentAssetHoldingPerc(_curr,_minPercX100,_maxPercX100);
    }
    // update currency asset base min and var min
    function updateCurrencyAssetDetails(bytes4 _curr,uint64 _baseMin)onlyInternal
    {
        pd=poolData1(poolDataAddress);
        pd.changeCurrencyAssetBaseMin(_curr,_baseMin);
    }
     // add new investment asset currency.
    function addInvestmentAssetsDetails(bytes16 curr_name,address curr,uint64 _minHoldingPercX100,uint64 _maxHoldingPercX100) onlyInternal
    {
        pd = poolData1(poolDataAddress);
        uint8 decimals;
        tok=SupplyToken(curr);
        decimals=tok.decimals();
        pd.addInvestmentCurrency(curr_name);
        pd.pushInvestmentAssetsDetails(curr_name,curr,1,_minHoldingPercX100,_maxHoldingPercX100,decimals);
     }
}
