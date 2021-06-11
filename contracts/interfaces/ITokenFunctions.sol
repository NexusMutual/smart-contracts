// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface ITokenFunctions {

  function getUserAllLockedCNTokens(address _of) external view returns (uint);

  function changeDependentContractAddress() external;

  function burnCAToken(uint claimid, uint _value, address _of) external;

  function isLockedForMemberVote(address _of) external view returns (bool);
}
