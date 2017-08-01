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
import "./USD.sol";
import "./quotation.sol";
import "./NXMToken.sol";
import "./master.sol";

contract fiatFaucet
{
    master ms1;
    address masterAddress;
    quotation q1;
    NXMToken t1;
    address quotationAddress;
    address tokenAddress;
    mapping(bytes16=>address) contract_add;
    SupplyToken tok;
    uint fiatTokenPricex1e18;
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
    function fiatFaucet(){
        fiatTokenPricex1e18 = 10000000000000000;
    }
    function getFiatTokenPrice() constant returns(uint price)
    {
        price = fiatTokenPricex1e18;
    }
    function  transferToken(bytes16 curr) payable
    {
        t1=NXMToken(tokenAddress);
        uint tokens=msg.value*100;
        tok=SupplyToken(contract_add[curr]);
        tok.mintToken(msg.sender,tokens);
        t1.addToPoolFund(curr , tokens);
        
    }
    function changeTokenAddress(address _add) onlyInternal
    {
        tokenAddress = _add;
    }
    function updateCurr(address usd,address eur,address gbp) onlyInternal
    {
        contract_add["USD"] = usd;
        contract_add["EUR"] = eur;
        contract_add["GBP"] = gbp;
     
    }
    function changeQuotationAddress(address _to) onlyInternal
    {
        quotationAddress=_to;
    }
    function addCurrency(address _add , bytes16 currName) onlyInternal
    {
        contract_add[currName] = _add;
    }
    
    function getBalance(address _of,bytes16 curr) constant returns(uint bal)
    {
         tok=SupplyToken(contract_add[curr]);
        return tok.balanceOf(_of);
    }
    function payoutTransferFromPool(address _to , bytes16 curr , uint tokens) onlyInternal
    {
        tok=SupplyToken(contract_add[curr]);
        tok.payoutTransfer(_to,tokens);
    }

    function funding(uint amount , bytes16 curr, uint[] fundArr , uint[] fundIndexArr)
    {
        tok=SupplyToken(contract_add[curr]);
        tok.debitTokensForFunding(amount , msg.sender);
        q1=quotation(quotationAddress);
        q1.fundQuote(fundArr , fundIndexArr , msg.sender);
    }

    
}



