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

interface IIncidents {

  function underlyingToken(address) external view returns (address);

  function coveredToken(address) external view returns (address);

  function claimPayout(uint) external view returns (uint);

  function incidentCount() external view returns (uint);

  function addIncident(
    address productId,
    uint incidentDate,
    uint priceBefore
  ) external;

  function redeemPayoutForMember(
    uint coverId,
    uint incidentId,
    uint coveredTokenAmount,
    address member
  ) external returns (uint claimId, uint payoutAmount, address payoutToken);

  function redeemPayout(
    uint coverId,
    uint incidentId,
    uint coveredTokenAmount
  ) external returns (uint claimId, uint payoutAmount, address payoutToken);

  function pushBurns(address productId, uint maxIterations) external;

  function withdrawAsset(address asset, address destination, uint amount) external;
}
