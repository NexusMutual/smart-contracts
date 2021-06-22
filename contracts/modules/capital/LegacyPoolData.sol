// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

contract LegacyPoolData {
 function minCap() external view returns (uint);
 function notariseMCR() external view returns (address);
 function changeNotariseAddress(address) external;
}

