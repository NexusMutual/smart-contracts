// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IYieldTokenIncidents.sol";

contract YieldTokenIncidentsGeneric is IYieldTokenIncidents {

  Incident[] public incidents;

  Configuration public config;

  function getIncidentsCount() external pure returns (uint) {
    revert("Unsupported");
  }

  function submitIncident(uint24, uint96, uint32, uint, string calldata) external virtual {
    revert("Unsupported");
  }

  function redeemPayout(
    uint104,
    uint32,
    uint,
    uint,
    address payable,
    bytes calldata
  ) external pure returns (uint, uint8) {
    revert("Unsupported");
  }

  function updateUintParameters(UintParams[] calldata, uint[] calldata) external pure {
    revert("Unsupported");
  }

}
