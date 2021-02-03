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

pragma solidity ^0.5.0;

interface LegacyPool1 {
  function sendClaimPayout(uint coverid, uint claimid, uint sumAssured, address payable coverHolder, bytes4 coverCurr) external returns (bool succ);
  function triggerExternalLiquidityTrade() external;
  function closeEmergencyPause(uint time) external;
  function closeClaimsOraclise(uint id, uint time) external;
  function closeCoverOraclise(uint id, uint64 time) external;
  function mcrOraclise(uint time) external;
  function mcrOracliseFail(uint id, uint time) external;
  function saveIADetailsOracalise(uint time) external;
  function upgradeCapitalPool(address payable newPoolAddress) external;
  function changeDependentContractAddress() external;
  function sendEther() external payable;
  function transferCurrencyAsset(bytes4 curr, uint amount) external returns (bool);
  function __callback(bytes32 myid, string calldata result) external;
  function makeCoverBegin(address smartCAdd, bytes4 coverCurr, uint[] calldata coverDetails, uint16 coverPeriod, uint8 _v, bytes32 _r, bytes32 _s) external payable;
  function makeCoverUsingCA(address smartCAdd, bytes4 coverCurr, uint[] calldata coverDetails, uint16 coverPeriod, uint8 _v, bytes32 _r, bytes32 _s) external;
  function buyToken() external payable returns (bool success);
  function transferEther(uint amount, address payable _add) external returns (bool succ);
  function sellNXMTokens(uint _amount) external returns (bool success);
  function getInvestmentAssetBalance() external view returns (uint balance);
  function getWei(uint amount) external view returns (uint weiToPay);
  function getToken(uint weiPaid) external view returns (uint tokenToGet);
}
