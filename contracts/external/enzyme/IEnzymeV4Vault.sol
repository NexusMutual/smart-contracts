// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IEnzymeV4Vault {

  function getAccessor() external view returns (address);

  function getOwner() external view returns (address);

  function mintShares(address, uint256) external;

}
