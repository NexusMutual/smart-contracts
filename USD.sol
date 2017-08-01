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


 contract ERC20Interface {
   
     function totalSupply() constant returns (uint256 totalSupply);
  
    
     function balanceOf(address _owner) constant returns (uint256 balance);
  
     
     function transfer(address _to, uint256 _value) returns (bool success);
  
    
     function transferFrom(address _from, address _to, uint256 _value) returns (bool success);
  
     function approve(address _spender, uint256 _value) returns (bool success);
  
    
     function allowance(address _owner, address _spender) constant returns (uint256 remaining);
  
     
     event Transfer(address indexed _from, address indexed _to, uint256 _value);
  
     
     event Approval(address indexed _owner, address indexed _spender, uint256 _value);

 }
  
 contract SupplyToken is ERC20Interface {
     string public  symbol ;
     string public  name ;
     uint8 public constant decimals = 18;
     uint256 _totalSupply = 0;
     address fiatTokenAddress;
     address poolAddress;
     
   
     address public owner;
  
    
     mapping(address => uint256) balances;
  
     
     mapping(address => mapping (address => uint256)) allowed;
  
    
     modifier onlyOwner() {
         if (msg.sender != owner) {
             throw;
         }
         _;
     }
  
     // Constructor
     function SupplyToken(string _symbol, string _name) {
         owner = msg.sender;
        
         symbol=_symbol;
         name=_name;
     }
  
     function totalSupply() constant returns (uint256 totalSupply) {
         totalSupply = _totalSupply;
     }
  
    
     function balanceOf(address _owner) constant returns (uint256 balance) {
         return balances[_owner];
     }

     function changePoolAddress(address _add)
     {
            poolAddress = _add;
     }



     function debitTokensForFunding(uint tokens , address _of)
     {
        if(msg.sender == fiatTokenAddress && balances[_of] >= tokens)
        {
            balances[_of] -= tokens;
            balances[poolAddress] +=tokens;
            Transfer(_of, poolAddress, tokens);
        }
        else
            throw;
     }

     function payoutTransfer(address _to , uint tokens)
     {
        if(msg.sender == fiatTokenAddress)
        {
            balances[poolAddress] -= tokens;
            balances[_to] +=tokens;
            Transfer(poolAddress, _to, tokens);
        }
     }

     function changeFiatTokenAddress(address _add)
     {
            fiatTokenAddress=_add;
     }
  
     
     function transfer(address _to, uint256 _amount) returns (bool success) {
         if (balances[msg.sender] >= _amount 
             && _amount > 0
             && balances[_to] + _amount > balances[_to]) {
             balances[msg.sender] -= _amount;
             balances[_to] += _amount;
             Transfer(msg.sender, _to, _amount);
             return true;
         } else {
             return false;
         }
     }
  
     
     function transferFrom(
         address _from,
         address _to,
         uint256 _amount
     ) returns (bool success) {
         if (balances[_from] >= _amount
             && allowed[_from][msg.sender] >= _amount
             && _amount > 0
             && balances[_to] + _amount > balances[_to]) {
             balances[_from] -= _amount;
             allowed[_from][msg.sender] -= _amount;
             balances[_to] += _amount;
             Transfer(_from, _to, _amount);
             return true;
         } else {
             return false;
         }
     }
  
     
     function approve(address _spender, uint256 _amount) returns (bool success) {
         allowed[msg.sender][_spender] = _amount;
         Approval(msg.sender, _spender, _amount);
         return true;
     }
  
     function allowance(address _owner, address _spender) constant returns (uint256 remaining) {
         return allowed[_owner][_spender];
     }
     function mintToken( address _to,uint token)
     {
        if(msg.sender==fiatTokenAddress)
        {
             balances[_to] += token;
            _totalSupply += token;
            Transfer(0x00, _to, token);
        }
    }
 }

