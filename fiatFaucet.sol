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
import "./USD.sol";
import "./quotation2.sol";
import "./NXMToken.sol";
import "./master.sol";
import "./SafeMaths.sol";
contract fiatFaucet
{
    using SafeMaths for uint;
    master ms;
    quotation2 q2;
    NXMToken tc1;
    
    address masterAddress;
    address quotation2Address;
    address tokenAddress;
    
    uint40 private constant _DECIMAL_1e10 = 10000000000;

    mapping(bytes16=>address) contract_add;
    SupplyToken tok;
    uint fiatTokenPricex1e18;
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
    modifier onlyInternal {
        ms=master(masterAddress);
        require(ms.isInternal(msg.sender) == 1);
        _; 
    }
    modifier isMemberAndcheckPause
    {
        ms=master(masterAddress);
        require(ms.isPause()==0 && ms.isMember(msg.sender)==true);
        _;
    }
    function fiatFaucet(){
        fiatTokenPricex1e18 = 1000000000000000;
    }
    /// @dev Gets the token price of fiat
    function getFiatTokenPrice() constant returns(uint price)
    {
        price = fiatTokenPricex1e18;
    }
    /// @dev Transfers the Equivalent ERC20Tokens for a given amount of a given currency.
    /// @param curr Currency's Name.
    function  transferToken(bytes4 curr) isMemberAndcheckPause payable 
    {
        tc1=NXMToken(tokenAddress);
        uint tokens=SafeMaths.mul(msg.value,1000);
        tok=SupplyToken(contract_add[curr]);
        tok.mintToken(msg.sender,tokens);
        // tc1.addToPoolFund(curr , tokens);
        
    }
    function changeTokenAddress(address _add) onlyInternal
    {
        tokenAddress = _add;
    }
    /// @dev Stores the ERC20 TOkens address of different currency.
    function updateCurr(address usd,address eur,address gbp) onlyInternal
    {
        contract_add["USD"] = usd;
        contract_add["EUR"] = eur;
        contract_add["GBP"] = gbp;
     
    }
  
    function changeQuotationAddress(address _to) onlyInternal
    {
        quotation2Address=_to;
    }
    /// @dev Adds a new currency's address.
    /// @param _add Currency's address.
    /// @param currName Currency's name.
    function addCurrency(address _add , bytes16 currName) onlyInternal
    {
        contract_add[currName] = _add;
    }
  
    /// @dev Gets the token's balance of a given currency of a given address.
    function getBalance(address _of,bytes16 curr) constant returns(uint bal)
    {
         tok=SupplyToken(contract_add[curr]);
        return tok.balanceOf(_of);
    }
    /// @dev Transfers the given tokens of a given currency from Pool contract to the given receiver's address.
    /// @param _to Receiver's address.
    /// @param curr Currency's name.
    /// @param tokens Number of tokens.
    function payoutTransferFromPool(address _to , bytes16 curr , uint tokens) onlyInternal
    {
        tok=SupplyToken(contract_add[curr]);
        tok.payoutTransfer(_to,tokens);
    }

    /// @dev Making Cover(s) using ERC20 tokens.
    /// @param coverCurr Currency's Name.
    /// @param cid Cover ID that will get funded.
    function funding(uint8 prodId, uint cid, address from, address smaratCAdd,bytes4 coverCurr,uint[] coverDetails, uint8 _v, bytes32 _r, bytes32 _s) isMemberAndcheckPause
    {
        tok=SupplyToken(contract_add[coverCurr]);
        tok.debitTokensForFunding(coverDetails[3] , msg.sender);
        q2=quotation2(quotation2Address);
        q2.verifyCoverDetails(prodId,msg.sender,smaratCAdd,coverCurr,coverDetails,_v,_r,_s);
    }
    /// @dev Get token address by currency name.
    function getCurrAddress(bytes16 curr) constant returns(address currAddress)
    {
        return (contract_add[curr]);
    }
   
    function transferBackEther(uint256 amount) onlyInternal
    {
        amount = SafeMaths.mul(amount, _DECIMAL_1e10);  
        address _add=msg.sender;
        bool succ = _add.send(amount);   
    }
}
