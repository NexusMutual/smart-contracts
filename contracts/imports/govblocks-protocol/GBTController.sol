/* Copyright (C) 2017 GovBlocks.io

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

pragma solidity ^0.4.24;

import "./VotingType.sol";
import "./Governance.sol";
import "./ProposalCategory.sol";
import "./GBTStandardToken.sol";
import "./GovBlocksMaster.sol";
import "./GovernanceData.sol";
import "./Master.sol";

contract GBTController {
    // using SafeMath for uint;
    // address public GBMAddress;
    // address public owner;
    // address M1Address;
    // address GBTStandardTokenAddress;
    // GovernanceData GD;
    // Master MS;
    // GovBlocksMaster GBM;
    // GBTStandardToken GBTS;
    // VotingType VT;
    // Governance G1;
    // ProposalCategory PC;
    // uint public tokenPrice;
    // uint public actual_amount;

    // modifier onlyGBM
    // {
    //     require(msg.sender == GBMAddress);
    //     _;
    // }

    // function GBTController(address _GBMAddress) 
    // {
    //     owner = msg.sender;
    //     tokenPrice = 1*10**15;
    //     GBMAddress = _GBMAddress;
    // }

    // function changeGBTtokenAddress(address _Address) onlyGBM
    // {
    //     GBTStandardTokenAddress = _Address;
    // }

    // function changeGBMAddress(address _GBMAddress) onlyGBM
    // {
    //     GBMAddress = _GBMAddress;
    // }

    // function transferGBT(address _to, uint256 _value,string _description) 
    // {
    //     GBTS=GBTStandardToken(GBTStandardTokenAddress);

    //     require(_value <= GBTS.balanceOf(address(this)));
    //     GBTS.addInBalance(_to,_value);
    //     GBTS.subFromBalance(address(this),_value);
    //     GBTS.callTransferGBTEvent(address(this), _to, _value, _description);
    // }

    // // function receiveGBT(address _from,uint _value, string _description) 
    // // {
    // //     GBTS=GBTStandardToken(GBTStandardTokenAddress);

    // //     require(_value <= GBTS.balanceOf(_from));
    // //     GBTS.addInBalance(address(this),_value);
    // //     GBTS.subFromBalance(_from,_value);
    // //     GBTS.callTransferGBTEvent(_from, address(this), _value, _description);
    // // }  

    //  function receiveGBT(uint _value, string _description) internal
    // {
    //     GBTS=GBTStandardToken(GBTStandardTokenAddress);

    //     require(_value <= GBTS.balanceOf(msg.sender));
    //     GBTS.addInBalance(address(this),_value);
    //     GBTS.subFromBalance(msg.sender,_value);
    //     GBTS.callTransferGBTEvent(msg.sender, address(this), _value, _description);
    // }  

    // function buyTokenGBT(address _to) payable 
    // {
    //     GBTS=GBTStandardToken(GBTStandardTokenAddress);
    //     actual_amount = SafeMath.mul(SafeMath.div(msg.value,tokenPrice),10**GBTS.decimals());         
    //     rewardToken(_to,actual_amount);
    // }

    // function rewardToken(address _to,uint _amount) internal  
    // {
    //     GBTS=GBTStandardToken(GBTStandardTokenAddress);
    //     GBTS.addInBalance(_to,_amount);
    //     GBTS.addInTotalSupply(_amount);
    //     GBTS.callTransferGBTEvent(GBTStandardTokenAddress, _to, _amount, "GBT Purchased");
    // }

    // function changeTokenPrice(uint _price)
    // {
    //     uint _tokenPrice = _price;
    //     tokenPrice = _tokenPrice;
    // }

    // function getTokenPrice() constant returns(uint)
    // {
    //     return tokenPrice;
    // }

    // function setTokenHoldingTime(uint _newValidity)
    // {
    //     tokenHoldingTime = _newValidity;
    // }
}