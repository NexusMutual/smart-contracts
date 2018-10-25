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

pragma solidity ^0.4.24;

import "./imports/openzeppelin-solidity/math/SafeMaths.sol";
import "./imports/govblocks-protocol/Governed.sol";
import "./Iupgradable.sol";
import "./NXMaster.sol";


contract TokenFunctions is Iupgradable, Governed {
    using SafeMaths for uint256;

    NXMaster public ms;

    modifier onlyInternal {
        require(ms.isInternal(msg.sender) == true);
        _;
    }

    modifier onlyOwner {
        require(ms.isOwner(msg.sender) == true);
        _;
    }

    /**
     * @dev Used to set and update master address
     * @param _add address of master contract
     */
    function changeMasterAddress(address _add) {
        if (address(ms) != address(0)) {
            require(ms.isInternal(msg.sender) == true);
        }
        ms = NXMaster(_add);
    }

    /**
    * @dev Just for interface
    */
    function changeDependentContractAddress() public {

    }

    // Founders are Now given an inital supply to distribute. 
    // The inital supply can be sent to a multi sig wallet.
    // /// @dev Allocates tokens to Founder Members.
    // /// Updates the number of tokens that have been allocated already by the creator till date.
    // /// @param _to Member address.
    // /// @param tokens Number of tokens.
    // function allocateFounderTokens(address _to, uint tokens) public onlyOwner {
    //     if (SafeMaths.add(td.getCurrentFounderTokens(), tokens) <= td.getInitialFounderTokens()) {
    //         td.changeCurrentFounderTokens(SafeMaths.add(td.currentFounderTokens(), tokens));
    //         td.addInAllocatedFounderTokens(_to, tokens);
    //         tc2.rewardToken(_to, tokens);
    //     }
    // }

    
}