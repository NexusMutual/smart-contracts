// SPDX-License-Identifier: GPL-3.0

/* Copyright (C) 2021 NexusMutual.io

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

pragma solidity >=0.5.0;

interface ITokenData {

  function walletAddress() external view returns (address payable);
  function lockTokenTimeAfterCoverExp() external view returns (uint);
  function bookTime() external view returns (uint);
  function lockCADays() external view returns (uint);
  function lockMVDays() external view returns (uint);
  function scValidDays() external view returns (uint);
  function joiningFee() external view returns (uint);
  function stakerCommissionPer() external view returns (uint);
  function stakerMaxCommissionPer() external view returns (uint);
  function tokenExponent() external view returns (uint);
  function priceStep() external view returns (uint);

  function depositedCN(uint) external view returns (uint amount, bool isDeposited);

  function lastCompletedStakeCommission(address) external view returns (uint);

  function changeWalletAddress(address payable _address) external;

  function getStakerStakedContractByIndex(
    address _stakerAddress,
    uint _stakerIndex
  )
  external
  view
  returns (address stakedContractAddress);

  function getStakerStakedBurnedByIndex(
    address _stakerAddress,
    uint _stakerIndex
  )
  external
  view
  returns (uint burnedAmount);

  function getStakerStakedUnlockableBeforeLastBurnByIndex(
    address _stakerAddress,
    uint _stakerIndex
  )
  external
  view
  returns (uint unlockable);

  function getStakerStakedContractIndex(
    address _stakerAddress,
    uint _stakerIndex
  )
  external
  view
  returns (uint scIndex);

  function getStakedContractStakerIndex(
    address _stakedContractAddress,
    uint _stakedContractIndex
  )
  external
  view
  returns (uint sIndex);

  function getStakerInitialStakedAmountOnContract(
    address _stakerAddress,
    uint _stakerIndex
  )
  external
  view
  returns (uint amount);

  function getStakerStakedContractLength(
    address _stakerAddress
  )
  external
  view
  returns (uint length);

  function getStakerUnlockedStakedTokens(
    address _stakerAddress,
    uint _stakerIndex
  )
  external
  view
  returns (uint amount);

  function pushUnlockedStakedTokens(
    address _stakerAddress,
    uint _stakerIndex,
    uint _amount
  ) external;


  function pushBurnedTokens(
    address _stakerAddress,
    uint _stakerIndex,
    uint _amount
  ) external;

  function pushUnlockableBeforeLastBurnTokens(
    address _stakerAddress,
    uint _stakerIndex,
    uint _amount
  ) external;

  function setUnlockableBeforeLastBurnTokens(
    address _stakerAddress,
    uint _stakerIndex,
    uint _amount
  ) external;

  function pushEarnedStakeCommissions(
    address _stakerAddress,
    address _stakedContractAddress,
    uint _stakedContractIndex,
    uint _commissionAmount
  ) external;

  function pushRedeemedStakeCommissions(
    address _stakerAddress,
    uint _stakerIndex,
    uint _amount
  ) external;

  function getStakerEarnedStakeCommission(
    address _stakerAddress,
    uint _stakerIndex
  )
  external
  view
  returns (uint);

  function getStakerRedeemedStakeCommission(
    address _stakerAddress,
    uint _stakerIndex
  )
  external
  view
  returns (uint);

  function getStakerTotalEarnedStakeCommission(
    address _stakerAddress
  )
  external
  view
  returns (uint totalCommissionEarned);

  function getStakerTotalReedmedStakeCommission(
    address _stakerAddress
  )
  external
  view
  returns (uint totalCommissionRedeemed);

  function setDepositCN(uint coverId, bool flag) external;

  function getStakedContractStakerByIndex(
    address _stakedContractAddress,
    uint _stakedContractIndex
  )
  external
  view
  returns (address stakerAddress);

  function getStakedContractStakersLength(
    address _stakedContractAddress
  ) external view returns (uint length);

  function addStake(
    address _stakerAddress,
    address _stakedContractAddress,
    uint _amount
  ) external returns (uint scIndex);

  function bookCATokens(address _of) external;

  function isCATokensBooked(address _of) external view returns (bool res);

  function setStakedContractCurrentCommissionIndex(
    address _stakedContractAddress,
    uint _index
  ) external;

  function setLastCompletedStakeCommissionIndex(
    address _stakerAddress,
    uint _index
  ) external;


  function setStakedContractCurrentBurnIndex(
    address _stakedContractAddress,
    uint _index
  ) external;

  function setDepositCNAmount(uint coverId, uint amount) external;
}
