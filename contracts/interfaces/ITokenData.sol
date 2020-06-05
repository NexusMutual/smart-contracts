/* Copyright (C) 2020 NexusMutual.io

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

pragma solidity ^0.5.17;

interface ITokenData {

    function members(uint _memberRoleId) external view returns(uint, address[] memory memberArray);

    function getStakerStakedContractLength(
        address _stakerAddress
    )
    external
    view
    returns (uint length);

    function getStakerStakedContractByIndex(
        address _stakerAddress,
        uint _stakerIndex
    )
    external
    view
    returns (address stakedContractAddress);

    function getStakerStakedContractIndex(
        address _stakerAddress,
        uint _stakerIndex
    )
    external
    view
    returns (uint scIndex);

    function pushBurnedTokens(
        address _stakerAddress,
        uint _stakerIndex,
        uint _amount
    ) external;

    struct Stake {
        address stakedContractAddress;
        uint stakedContractIndex;
        uint dateAdd;
        uint stakeAmount;
        uint unlockedAmount;
        uint burnedAmount;
        uint unLockableBeforeLastBurn;
    }

    function scValidDays() external view returns (uint);
    function stakerStakedContracts(
        address staker,
        uint index)
    external
    view
    returns (address,uint256,uint256,uint256, uint256,uint256,uint256);

    /**
     * @dev to get the staker's unlocked tokens which were staked
     * @param _stakerAddress is the address of the staker
     * @param _stakerIndex is the index of staker
     * @return amount
     */
    function getStakerUnlockedStakedTokens(
        address _stakerAddress,
        uint _stakerIndex
    )
    external
    view
    returns (uint amount);
}
