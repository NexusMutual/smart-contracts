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
import "./SafeMaths.sol";

 contract ERC20Interface {
    using SafeMaths for uint;
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
  
    /// @dev Constructor
    function SupplyToken(string _symbol, string _name) {
        owner = msg.sender;
        symbol=_symbol;
        name=_name;
    }
    /// @dev Returns the total number of token supplied till date.
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

    /// @dev Uses tokens for giving fund amount. Debits tokens(given as funding) from token's balance of member.Credits tokens in Pool fund's balance.
    /// @param tokens Number of tokens.
    /// @param _of Member's address.
    function debitTokensForFunding(uint tokens , address _of)
    {
       if(msg.sender == fiatTokenAddress && balances[_of] >= tokens)
       {
           balances[_of] = SafeMaths.sub(balances[_of],tokens);
           balances[poolAddress] =SafeMaths.add(balances[poolAddress],tokens);
           Transfer(_of, poolAddress, tokens);
       }
       else
           throw;
    }
    /// @dev Credits tokens in Member's balance and debits tokens from Pool Fund's balance.
    /// @param _to Member's address.
    /// @param tokens Number of tokens.
    function payoutTransfer(address _to , uint tokens)
    {
        if(msg.sender == fiatTokenAddress)
        {
            balances[poolAddress] =SafeMaths.sub(balances[poolAddress], tokens);
            balances[_to] =SafeMaths.add(balances[_to],tokens);
            Transfer(poolAddress, _to, tokens);
        }
    }

    function changeFiatTokenAddress(address _add)
    {
        fiatTokenAddress=_add;
    }
  
    /// @dev Transfers the Tokens to the given Receiver's account.
    /// @param _to Receiver's Address.
    /// @param _amount Number of tokens.
    /// @return success true if transfer is a success, false if transfer is a failure.
    function transfer(address _to, uint256 _amount) returns (bool success) {
        if (balances[msg.sender] >= _amount 
            && _amount > 0
            && SafeMaths.add(balances[_to] , _amount) > balances[_to]) {
            balances[msg.sender] =SafeMaths.sub(balances[msg.sender], _amount);
            balances[_to] =SafeMaths.add(balances[_to], _amount);
            Transfer(msg.sender, _to, _amount);
            return true;
        } 
        else {
            return false;
        }
    }
  
    /// @dev Transfers the Tokens from a given sender's Address to a given receiver's address.
    /// @param _from Sender's address.
    /// @param _to Receiver's address.
    /// @param _amount Transfer tokens.
    /// @return success true if transfer is a success, false if transfer is a failure.
    function transferFrom(
        address _from,
        address _to,
        uint256 _amount
    ) returns (bool success) {
        if (balances[_from] >= _amount
            && allowed[_from][msg.sender] >= _amount
            && _amount > 0
            && SafeMaths.add(balances[_to] , _amount) > balances[_to]) {
            balances[_from] =SafeMaths.sub(balances[_from], _amount);
            allowed[_from][msg.sender] = SafeMaths.sub(allowed[_from][msg.sender], _amount);
            balances[_to] = SafeMaths.add(balances[_to],_amount);
            Transfer(_from, _to, _amount);
            return true;
        } 
        else {
            return false;
        }
    }
  
    /// @dev Allows a given address (Spender) to spend a given amount of the money on behalf of the other user.
    /// @param _spender Spender's address.
    /// @param _amount Amount upto which Spender is allowed to transfer.
    function approve(address _spender, uint256 _amount) returns (bool success) {
        allowed[msg.sender][_spender] = _amount;
        Approval(msg.sender, _spender, _amount);
        return true;
    }

    /// @dev Gets number of tokens that are allowed to spend by Spender on behalf of the allower.
    /// @param _owner Allower's address.
    /// @param _spender Spender's address.
    /// @return remaining Number of tokens.
    function allowance(address _owner, address _spender) constant returns (uint256 remaining) {
        return allowed[_owner][_spender];
    }

    function mintToken( address _to,uint token)
    {
        if(msg.sender==fiatTokenAddress)
        {
            balances[_to] = SafeMaths.add(balances[_to],token);
            _totalSupply = SafeMaths.add(_totalSupply,token);
            Transfer(0x00, _to, token);
        }
    }
 }

